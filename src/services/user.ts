import { DataSource, Repository } from "typeorm";
import { User, AuthMethod } from "../models/user.js";
import { ConfiguredAgent } from "../agent/setup.js";
import {
  WebAuthnService,
  WebAuthnCredential,
  RegistrationInfo,
} from "./webauthn.js";
import { VerifiedRegistrationResponse } from "@simplewebauthn/server";
import { isoBase64URL } from "@simplewebauthn/server/helpers";
import { CredentialStorageService } from "./credential-storage.js";
import { BlockchainService } from "./blockchain.js";
import type { PublicKeyCredentialCreationOptionsJSON } from "@simplewebauthn/types";
import { ethers } from "ethers";
import bcrypt from "bcryptjs";
import { logger } from "../utils/logger.js";

export class UserService {
  private userRepository: Repository<User>;
  private agent: ConfiguredAgent;
  private webAuthnService: WebAuthnService;
  private credentialStorage: CredentialStorageService;
  private blockchainService: BlockchainService;

  constructor(dbConnection: DataSource, agent: ConfiguredAgent) {
    this.userRepository = dbConnection.getRepository(User);
    this.agent = agent;
    this.webAuthnService = new WebAuthnService();
    this.credentialStorage = new CredentialStorageService();
    this.blockchainService = new BlockchainService();
  }

  async registerUser(data: {
    username: string;
    email: string;
    displayName: string;
  }): Promise<{
    user: User;
    registrationOptions: PublicKeyCredentialCreationOptionsJSON;
  }> {
    // Check if user already exists by email or username
    const existingUserByEmail = await this.userRepository.findOne({
      where: { email: data.email },
    });

    const existingUserByUsername = await this.userRepository.findOne({
      where: { username: data.username },
    });

    if (existingUserByEmail) {
      logger.debug(`User with email ${data.email} already exists`);
      throw new Error("Email already exists");
    }

    if (existingUserByUsername) {
      logger.debug(`User with username ${data.username} already exists`);
      throw new Error("Username already exists");
    }

    // Create new user
    const user = this.userRepository.create({
      username: data.username,
      email: data.email,
      displayName: data.displayName,
      credentials: JSON.stringify([]), // Initialize as empty JSON array string
    });

    // Generate registration options
    const registrationOptions =
      await this.webAuthnService.generateRegistrationOptions(
        data.username,
        data.displayName
      );

    // Ensure challenge is stored as a string - this is critical for proper WebAuthn operation
    // SimpleWebAuthn already returns the challenge as a base64url-encoded string
    // but let's make sure it's properly encoded
    user.currentChallenge = registrationOptions.challenge;

    // Save user
    const savedUser = await this.userRepository.save(user);
    logger.info(
      `Created new user ${savedUser.username} with ID ${savedUser.id}`
    );

    return {
      user: savedUser,
      registrationOptions,
    };
  }

  async registerUserViaAPI(data: {
    username: string;
    email: string;
    displayName: string;
    password: string;
    timestamp: number;
  }): Promise<User> {
    try {
      // Use the new password registration method
      return await this.registerUserWithPassword({
        username: data.username,
        email: data.email,
        displayName: data.displayName,
        password: data.password,
        authMethod: AuthMethod.PASSWORD,
      });
    } catch (error) {
      logger.error("API registration error:", error);
      throw error;
    }
  }

  async getUserByEmail(email: string): Promise<User | null> {
    return await this.userRepository.findOne({
      where: { email },
    });
  }

  async generateDidPreview(
    username: string
  ): Promise<{ did: string; ethereumAddress: string }> {
    // Generate a temporary DID to get the Ethereum address
    const identifier = await this.agent.didManagerCreate({
      alias: `${username}_preview_${Date.now()}`, // Temporary alias
      provider: "did:ethr",
    });

    const did = identifier.did;
    const ethereumAddress = did.replace("did:ethr:", "");

    logger.debug(`Generated preview DID: ${did}`);
    logger.debug(`Preview Ethereum address: ${ethereumAddress}`);

    return { did, ethereumAddress };
  }

  async completeRegistration(
    userId: string,
    registrationResponse: any
  ): Promise<User> {
    try {
      // Find the user by ID
      const user = await this.userRepository.findOne({
        where: { id: userId },
      });

      if (!user) {
        throw new Error(`User not found with ID: ${userId}`);
      }

      if (!user.currentChallenge) {
        throw new Error("Registration challenge not found");
      }

      logger.info(
        `Processing registration for user: ${user.username} (${userId})`
      );

      // Verify WebAuthn registration
      const verification = await this.webAuthnService.verifyRegistration(
        registrationResponse,
        user.currentChallenge
      );

      if (!verification.verified || !verification.registrationInfo) {
        throw new Error("Registration verification failed");
      }

      // Create credential object
      const credential: WebAuthnCredential = {
        id: registrationResponse.id,
        publicKey: isoBase64URL.fromBuffer(
          verification.registrationInfo.credentialPublicKey
        ),
        counter: verification.registrationInfo.counter,
      };

      logger.info(`Created credential: ${JSON.stringify(credential)}`);

      // Encrypt the credential
      const encryptedCredential =
        this.credentialStorage.encryptCredential(credential);
      logger.info(
        `Encrypted credential of length: ${encryptedCredential.length}`
      );

      // Store the credential in a JSON array
      user.credentials = JSON.stringify([encryptedCredential]);
      logger.info(`Updated credentials on user: ${user.credentials}`);

      // Create DID for the user (if not already created)
      if (!user.did) {
        const identifier = await this.agent.didManagerCreate({
          alias: user.username,
          provider: "did:ethr",
        });
        user.did = identifier.did;
        logger.info(`Created DID for user: ${user.did}`);
      }

      // Clear the challenge
      user.currentChallenge = undefined;

      // Save the user with the new credential and DID
      logger.info("Saving user with credential and DID...");
      const savedUser = await this.userRepository.save(user);

      // Verify the save by reloading
      const verifiedUser = await this.userRepository.findOne({
        where: { id: userId },
      });

      if (
        !verifiedUser ||
        !verifiedUser.credentials ||
        verifiedUser.credentials === "[]"
      ) {
        logger.error("CRITICAL ERROR: User was not saved correctly!");
        logger.error(
          `User data: ${JSON.stringify({
            id: verifiedUser?.id,
            username: verifiedUser?.username,
            hasCredentials: verifiedUser?.credentials ? "Yes" : "No",
            credentials: verifiedUser?.credentials,
          })}`
        );
        throw new Error("Failed to save user credentials");
      }

      logger.info(
        `Successfully saved user ${user.username} with credentials and DID`
      );
      logger.info(`Verified saved credentials: ${verifiedUser.credentials}`);

      return savedUser;
    } catch (error) {
      logger.error("Error completing registration:", error);
      throw error;
    }
  }

  async getUserByUsername(username: string): Promise<User | null> {
    try {
      logger.info(`Looking up user by username: ${username}`);
      const user = await this.userRepository.findOne({
        where: { username },
        select: [
          "id",
          "username",
          "email",
          "displayName",
          "did",
          "authMethod",
          "passwordHash",
          "credentials",
          "multisigWalletId",
          "signerAddress",
          "isMultisigEnabled",
        ],
      });

      if (user) {
        logger.info(`Found user ${username} with ID: ${user.id}`);
        // Log credential information
        if (user.credentials) {
          try {
            const credentialsArray = JSON.parse(user.credentials);
            logger.info(
              `User ${username} has ${credentialsArray.length} credentials`
            );
          } catch (e) {
            logger.error(`Error parsing credentials for user ${username}:`, e);
          }
        } else {
          logger.info(`User ${username} has no credentials`);
        }
      } else {
        logger.info(`No user found with username: ${username}`);
      }

      return user;
    } catch (error) {
      logger.error("Error getting user:", error);
      throw error;
    }
  }

  async updateUserDid(userId: string, did: string): Promise<User> {
    try {
      const user = await this.userRepository.findOne({
        where: { id: userId },
      });

      if (!user) {
        throw new Error("User not found");
      }

      user.did = did;
      return await this.userRepository.save(user);
    } catch (error) {
      logger.error("Error updating user DID:", error);
      throw error;
    }
  }

  async addCredential(
    userId: string,
    credential: WebAuthnCredential
  ): Promise<User> {
    try {
      const user = await this.userRepository.findOne({
        where: { id: userId },
      });

      if (!user) {
        throw new Error("User not found");
      }

      // Encrypt the credential
      const encryptedCredential =
        this.credentialStorage.encryptCredential(credential);

      // Parse existing credentials or initialize as empty array
      let credentialsArray: string[] = [];
      if (user.credentials) {
        try {
          credentialsArray = JSON.parse(user.credentials);
          if (!Array.isArray(credentialsArray)) {
            credentialsArray = [];
          }
        } catch (e) {
          logger.error("Error parsing credentials:", e);
          credentialsArray = [];
        }
      }

      // Add the new credential
      credentialsArray.push(encryptedCredential);

      // Store as JSON string
      user.credentials = JSON.stringify(credentialsArray);

      return await this.userRepository.save(user);
    } catch (error) {
      logger.error("Error adding credential:", error);
      throw error;
    }
  }

  async getDecryptedCredentials(userId: string): Promise<WebAuthnCredential[]> {
    try {
      logger.info(`Getting credentials for user ID: ${userId}`);

      // Find the user
      const user = await this.userRepository.findOne({
        where: { id: userId },
      });

      if (!user) {
        logger.error(`User with ID ${userId} not found`);
        return [];
      }

      logger.info(
        `Found user ${user.username} with credentials: ${
          user.credentials || "none"
        }`
      );

      // Check if credentials exist
      if (!user.credentials || user.credentials === "[]") {
        logger.warn(`User ${user.username} has no credentials`);
        return [];
      }

      // Parse credentials
      let credentialsArray: string[] = [];
      try {
        credentialsArray = JSON.parse(user.credentials);

        if (!Array.isArray(credentialsArray)) {
          logger.error(
            `Invalid credentials format - not an array: ${typeof credentialsArray}`
          );
          return [];
        }

        if (credentialsArray.length === 0) {
          logger.warn(`User ${user.username} has empty credentials array`);
          return [];
        }

        logger.info(
          `Parsed ${credentialsArray.length} credential(s) for user ${user.username}`
        );
      } catch (error) {
        logger.error(`Failed to parse credentials JSON: ${error}`);
        return [];
      }

      // Decrypt each credential
      const decryptedCredentials: WebAuthnCredential[] = [];

      for (const encryptedCred of credentialsArray) {
        try {
          logger.info(
            `Decrypting credential of length ${encryptedCred.length}`
          );
          const decrypted =
            this.credentialStorage.decryptCredential(encryptedCred);
          logger.info(
            `Successfully decrypted credential with ID: ${decrypted.id}`
          );
          decryptedCredentials.push(decrypted);
        } catch (error) {
          logger.error(`Failed to decrypt credential: ${error}`);
        }
      }

      logger.info(
        `Successfully decrypted ${decryptedCredentials.length} credential(s)`
      );
      return decryptedCredentials;
    } catch (error) {
      logger.error(`Error in getDecryptedCredentials: ${error}`);
      return [];
    }
  }

  async saveUser(user: User): Promise<User> {
    return await this.userRepository.save(user);
  }

  async getAllUsers(): Promise<User[]> {
    try {
      logger.info("Getting all users");
      const users = await this.userRepository.find();
      logger.info(`Found ${users.length} users`);
      return users;
    } catch (error) {
      logger.error("Error getting all users:", error);
      return [];
    }
  }

  async getUserById(id: string): Promise<User | null> {
    try {
      return await this.userRepository.findOne({
        where: { id },
        select: [
          "id",
          "username",
          "email",
          "displayName",
          "did",
          "authMethod",
          "multisigWalletId",
          "signerAddress",
          "isMultisigEnabled",
        ],
      });
    } catch (error) {
      logger.error("Error getting user by ID:", error);
      throw error;
    }
  }

  /**
   * Get blockchain details for a user
   */
  async getBlockchainDetails(userId: string) {
    try {
      logger.info(`Getting blockchain details for user ID: ${userId}`);

      const user = await this.userRepository.findOne({
        where: { id: userId },
      });

      if (!user) {
        logger.error(`User not found with ID: ${userId}`);
        throw new Error("User not found");
      }

      if (!user.did) {
        logger.error(`User ${user.username} has no DID`);
        throw new Error("DID not found for user");
      }

      logger.info(`Resolving DID: ${user.did}`);
      const didDoc = await this.agent.resolveDid({ didUrl: user.did });

      logger.info("DID Document:", JSON.stringify(didDoc.didDocument, null, 2));

      // Extract Ethereum address from DID
      let ethAddress: string = "";

      // First try to extract from blockchain account ID in verification methods
      if (didDoc.didDocument?.verificationMethod) {
        for (const method of didDoc.didDocument.verificationMethod) {
          if (method.blockchainAccountId) {
            const blockchainId = method.blockchainAccountId;
            logger.info(`Found blockchainAccountId: ${blockchainId}`);

            // Format is usually "eip155:1:0x..." or "eip155:11155111:0x..." (for Sepolia)
            const parts = blockchainId.split(":");
            if (parts.length >= 3 && parts[parts.length - 1].startsWith("0x")) {
              ethAddress = parts[parts.length - 1];
              logger.info(
                `Extracted address from blockchainAccountId: ${ethAddress}`
              );
              break;
            }
          }
        }
      }

      // If we didn't find an address in blockchainAccountId, we have a problem
      if (!ethAddress) {
        logger.error("Could not extract Ethereum address from DID document");
        logger.error(
          "DID Document verification methods:",
          JSON.stringify(didDoc.didDocument?.verificationMethod, null, 2)
        );
        throw new Error(
          "Ethereum address not found in DID document. The DID may not be properly configured for blockchain operations."
        );
      }

      if (!ethAddress) {
        logger.error("Failed to extract Ethereum address from DID");
        throw new Error("Ethereum address not found");
      }

      logger.info(`Using Ethereum address: ${ethAddress}`);

      // Get blockchain data
      logger.info("Fetching blockchain data...");
      const balance = await this.blockchainService.getBalance(ethAddress);
      logger.info(`Balance: ${balance} ETH`);

      logger.info("Checking if DID is registered...");
      const isRegistered = await this.blockchainService.isDIDRegistered(
        ethAddress
      );
      logger.info(`Is registered: ${isRegistered}`);

      logger.info("Getting transaction history...");
      const transactions = await this.blockchainService.getTransactionHistory(
        ethAddress,
        5
      );
      logger.info(`Found ${transactions.length} transactions`);

      return {
        ethAddress,
        balance,
        isRegistered,
        recentTransactions: transactions,
      };
    } catch (error) {
      logger.error("Error getting blockchain details:", error);
      throw error;
    }
  }

  /**
   * Hash a password using bcrypt
   */
  private async hashPassword(password: string): Promise<string> {
    const saltRounds = 12;
    return await bcrypt.hash(password, saltRounds);
  }

  /**
   * Verify a password against its hash
   */
  private async verifyPassword(
    password: string,
    hash: string
  ): Promise<boolean> {
    return await bcrypt.compare(password, hash);
  }

  /**
   * Register a user with password authentication
   */
  async registerUserWithPassword(data: {
    username: string;
    email: string;
    displayName: string;
    password: string;
    authMethod?: AuthMethod;
    multisigWalletAddress?: string; // Optional: associate with multisig from registration
  }): Promise<User> {
    // Check if user already exists
    const existingUserByEmail = await this.userRepository.findOne({
      where: { email: data.email },
    });

    const existingUserByUsername = await this.userRepository.findOne({
      where: { username: data.username },
    });

    if (existingUserByEmail) {
      throw new Error("Email already exists");
    }

    if (existingUserByUsername) {
      throw new Error("Username already exists");
    }

    // Hash the password
    const passwordHash = await this.hashPassword(data.password);

    // Always generate unique DID for the user (never use multisig address as DID)
    logger.info(`Creating unique DID for user: ${data.username}`);

    const identifier = await this.agent.didManagerCreate({
      alias: data.username,
      provider: "did:ethr",
    });

    logger.info(
      `Generated unique DID: ${identifier.did} for user: ${data.username}`
    );

    // Create new user
    const user = this.userRepository.create({
      username: data.username,
      email: data.email,
      displayName: data.displayName,
      did: identifier.did,
      authMethod: data.authMethod || AuthMethod.PASSWORD,
      passwordHash: passwordHash,
      credentials: JSON.stringify([]), // Initialize as empty for password auth
    });

    // Save user
    const savedUser = await this.userRepository.save(user);
    logger.info(
      `Created new user with password auth: ${savedUser.username} with ID ${savedUser.id} and DID ${savedUser.did}`
    );

    // If multisig address was provided, complete the multisig setup
    if (data.multisigWalletAddress) {
      logger.info(`Completing multisig setup for user ${savedUser.username}`);
      try {
        // Import and use MultisigWalletService
        const { MultisigWalletService, MultisigType } = await import(
          "./multisig-wallet.js"
        );
        const multisigService = new MultisigWalletService(
          this.agent,
          this.userRepository.manager.connection as any
        );

        // Check if multisig wallet exists, if not create it
        let wallet = await multisigService.getMultisigWalletByAddress(
          data.multisigWalletAddress
        );
        if (!wallet) {
          logger.info(
            `Creating multisig wallet entry for ${data.multisigWalletAddress}`
          );
          wallet = await multisigService.createMultisigWallet({
            address: data.multisigWalletAddress,
            type: MultisigType.GNOSIS_SAFE, // Use enum
            owners: [data.multisigWalletAddress], // Default to self as owner
            threshold: 1, // Default threshold
            metadata: { createdBy: savedUser.username },
          });
        }

        // Associate user with multisig and generate EOA signer
        const updatedUser = await multisigService.associateUserWithMultisig({
          userId: savedUser.id,
          multisigWalletId: wallet.id,
          generateSigner: true,
        });

        logger.info(
          `Completed multisig setup for user ${updatedUser.username}`
        );
        return updatedUser;
      } catch (multisigError) {
        logger.error("Error setting up multisig:", multisigError);
        logger.warn("User created successfully but multisig setup failed");
        // Return the user anyway, multisig can be set up later
      }
    }

    return savedUser;
  }

  /**
   * Create a DID with multisig wallet as controller
   */
  private async createDIDWithMultisigController(
    alias: string,
    multisigAddress: string
  ): Promise<any> {
    try {
      // Validate multisig address
      if (!ethers.isAddress(multisigAddress)) {
        throw new Error("Invalid multisig address");
      }

      logger.info(
        `Creating DID directly from multisig address: ${multisigAddress} for alias: ${alias}`
      );

      // Create DID directly using the multisig address
      // This creates did:ethr:<multisigAddress>
      const multisigDID = `did:ethr:${multisigAddress}`;

      // Create a minimal identifier structure
      const identifier = {
        did: multisigDID,
        provider: "did:ethr",
        alias: `${alias}_multisig`,
        controllerKeyId: multisigAddress,
        keys: [], // Empty keys array since multisig controls this
        services: [],
      };

      logger.info(
        `Created DID ${identifier.did} using multisig address directly`
      );

      return identifier;
    } catch (error) {
      logger.error("Error creating DID with multisig address:", error);
      // Try alternative approach with didManagerCreate and specific address
      try {
        logger.info("Trying alternative DID creation method...");
        const identifier = await this.agent.didManagerCreate({
          alias: `${alias}_multisig`,
          provider: "did:ethr",
          options: {
            keyType: "Secp256k1",
            privateKey: `0x${"0".repeat(64)}`, // Dummy key, won't be used for signing
            controller: multisigAddress,
          },
        });

        // Override the DID to use multisig address
        const multisigDID = `did:ethr:${multisigAddress}`;
        identifier.did = multisigDID;

        logger.info(`Created DID ${multisigDID} with multisig as controller`);
        return identifier;
      } catch (altError) {
        logger.error("Alternative DID creation also failed:", altError);
        // Fallback to standard DID creation
        logger.warn("Falling back to standard DID creation");
        return await this.agent.didManagerCreate({
          alias,
          provider: "did:ethr",
        });
      }
    }
  }

  /**
   * Associate existing user with multisig wallet
   */
  async associateUserWithMultisig(
    userId: string,
    multisigWalletAddress: string,
    generateSigner: boolean = true,
    signerPrivateKey?: string
  ): Promise<User> {
    try {
      const { MultisigWalletService } = await import("./multisig-wallet.js");
      const multisigService = new MultisigWalletService(
        this.agent,
        this.userRepository.manager.connection as any
      );

      // Check if multisig wallet exists in our system
      let wallet = await multisigService.getMultisigWalletByAddress(
        multisigWalletAddress
      );

      if (!wallet) {
        throw new Error(
          "Multisig wallet not found. Please register the wallet first."
        );
      }

      // Associate user with multisig
      const updatedUser = await multisigService.associateUserWithMultisig({
        userId,
        multisigWalletId: wallet.id,
        generateSigner,
        signerPrivateKey,
      });

      // Update DID controller to point to multisig
      await multisigService.updateDIDController(userId, multisigWalletAddress);

      logger.info(
        `Successfully associated user ${updatedUser.username} with multisig ${multisigWalletAddress}`
      );

      return updatedUser;
    } catch (error) {
      logger.error("Error associating user with multisig:", error);
      throw error;
    }
  }

  /**
   * Register a multisig wallet
   */
  async registerMultisigWallet(params: {
    address: string;
    owners: string[];
    threshold: number;
    type?: string;
    metadata?: Record<string, any>;
  }): Promise<any> {
    try {
      const { MultisigWalletService, MultisigType } = await import(
        "./multisig-wallet.js"
      );
      const multisigService = new MultisigWalletService(
        this.agent,
        this.userRepository.manager.connection as any
      );

      // Map string type to enum
      let walletType = MultisigType.GNOSIS_SAFE;
      if (params.type) {
        const typeMap = {
          gnosis_safe: MultisigType.GNOSIS_SAFE,
          custom: MultisigType.CUSTOM,
          ethereum_multisig: MultisigType.ETHEREUM_MULTISIG,
        } as const;
        walletType =
          typeMap[params.type as keyof typeof typeMap] ||
          MultisigType.GNOSIS_SAFE;
      }

      const wallet = await multisigService.createMultisigWallet({
        address: params.address,
        type: walletType,
        owners: params.owners,
        threshold: params.threshold,
        metadata: params.metadata,
      });

      logger.info(`Registered multisig wallet: ${wallet.address}`);
      return wallet;
    } catch (error) {
      logger.error("Error registering multisig wallet:", error);
      throw error;
    }
  }

  /**
   * Authenticate user with password
   */
  async authenticateWithPassword(
    username: string,
    password: string
  ): Promise<User | null> {
    try {
      // Find user by username
      const user = await this.userRepository.findOne({
        where: { username },
      });

      if (!user) {
        logger.info(`User not found: ${username}`);
        return null;
      }

      // Check if user supports password authentication
      if (user.authMethod !== AuthMethod.PASSWORD) {
        logger.info(
          `User ${username} does not support password authentication`
        );
        return null;
      }

      // Check if password hash exists
      if (!user.passwordHash) {
        logger.info(`User ${username} has no password hash set`);
        return null;
      }

      // Verify password
      const isValidPassword = await this.verifyPassword(
        password,
        user.passwordHash
      );

      if (!isValidPassword) {
        logger.info(`Invalid password for user: ${username}`);
        return null;
      }

      logger.info(`Successfully authenticated user: ${username}`);
      return user;
    } catch (error) {
      logger.error("Error during password authentication:", error);
      return null;
    }
  }

  /**
   * Update user password
   */
  async updatePassword(userId: string, newPassword: string): Promise<User> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
    });

    if (!user) {
      throw new Error("User not found");
    }

    // Hash the new password
    const passwordHash = await this.hashPassword(newPassword);
    user.passwordHash = passwordHash;

    // Ensure auth method is set to password
    if (!user.authMethod) {
      user.authMethod = AuthMethod.PASSWORD;
    }

    return await this.userRepository.save(user);
  }

  /**
   * Update user password (simplified for password-only auth)
   */
  async enablePasswordAuth(userId: string, password: string): Promise<User> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
    });

    if (!user) {
      throw new Error("User not found");
    }

    // Hash the password
    const passwordHash = await this.hashPassword(password);
    user.passwordHash = passwordHash;
    user.authMethod = AuthMethod.PASSWORD;

    return await this.userRepository.save(user);
  }
}
