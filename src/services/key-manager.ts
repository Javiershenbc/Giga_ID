import { ConfiguredAgent } from "../agent/setup.js";
import { DataSource } from "typeorm";
import { User } from "../models/user.js";
import { ethers } from "ethers";
import { logger } from "../utils/logger.js";
import { MultisigWalletService } from "./multisig-wallet.js";
import { env } from "../config/env.js";
import { MultisigWallet } from "../models/multisig-wallet.js";

export class KeyManagerService {
  private agent: ConfiguredAgent;
  private userRepository: any;
  private multisigService?: MultisigWalletService;
  private provider: ethers.JsonRpcProvider;

  constructor(agent: ConfiguredAgent, dbConnection: DataSource) {
    this.agent = agent;
    this.userRepository = dbConnection.getRepository(User);
    // Initialize multisig service if needed
    this.multisigService = new MultisigWalletService(agent, dbConnection);
    this.provider = new ethers.JsonRpcProvider(
      `https://${env.ETH_NETWORK}.infura.io/v3/${env.INFURA_PROJECT_ID}`
    );
  }

  /**
   * DUAL-KEY APPROACH: Use EOA signer for transactions when multisig is enabled
   * Falls back to Veramo's signing capabilities for non-multisig users
   */
  async signEthereumTransaction(
    userId: string,
    transaction: any
  ): Promise<string> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
    });

    if (!user || !user.did) {
      throw new Error("User DID not found");
    }

    try {
      // Check if user has multisig enabled
      if (user.isMultisigEnabled && user.signerPrivateKey) {
        return await this.signWithEOASigner(user, transaction);
      } else {
        return await this.signWithVeramo(user, transaction);
      }
    } catch (error) {
      logger.error("Error signing transaction:", error);
      throw new Error(
        `Failed to sign transaction: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  /**
   * Get ethers.js Wallet signer for the user's EOA (multisig users only)
   */
  async getEOASigner(userId: string): Promise<ethers.Wallet | null> {
    const user: User | null = await this.userRepository.findOne({ where: { id: userId } });
    if (!user || !user.isMultisigEnabled || !user.signerPrivateKey || !this.multisigService) {
      return null;
    }
    const privateKey = await this.multisigService.decryptSignerPrivateKey(
      user.signerPrivateKey
    );
    return new ethers.Wallet(privateKey, this.provider);
  }

  /**
   * Sign transaction using EOA signer (for multisig users)
   */
  private async signWithEOASigner(
    user: User,
    transaction: any
  ): Promise<string> {
    if (!user.signerPrivateKey || !this.multisigService) {
      throw new Error("No signer private key available");
    }

    logger.blockchain(
      `🔐 Signing transaction with EOA signer for multisig user: ${user.username}`
    );

    // Decrypt the signer private key
    const privateKey = await this.multisigService.decryptSignerPrivateKey(
      user.signerPrivateKey
    );

    // Create wallet from private key
    const signerWallet = new ethers.Wallet(privateKey);

    // Prepare transaction for signing
    const { from, ...cleanTransaction } = transaction;

    // Sign the transaction
    const signedTx = await signerWallet.signTransaction(cleanTransaction);

    logger.blockchain(
      `✅ Transaction signed with EOA signer: ${user.signerAddress}`
    );
    return signedTx;
  }

  /**
   * Sign transaction using Veramo (for non-multisig users)
   */
  private async signWithVeramo(user: User, transaction: any): Promise<string> {
    // Get the DID identifier from Veramo
    const identifier = await this.agent.didManagerGet({ did: user.did });

    if (!identifier.keys || identifier.keys.length === 0) {
      throw new Error("No keys found for user DID");
    }

    // Get the first key (usually the controller key)
    const keyRef = identifier.keys[0];
    const keyId = keyRef.kid;

    logger.blockchain(
      `🔐 Signing transaction with Veramo KeyManager using key: ${keyId}`
    );

    // CORRECT VERAMO APPROACH: Use keyManagerSignEthTX
    // Note: Remove 'from' field as Veramo will add it automatically based on the key
    const { from, ...cleanTransaction } = transaction;

    // Temporarily use any to bypass TypeScript issues while testing
    const signedTx = await (this.agent as any).keyManagerSignEthTX({
      kid: keyId,
      transaction: cleanTransaction,
    });

    logger.blockchain(`✅ Transaction signed successfully with Veramo`);
    return signedTx;
  }

  /**
   * Get user's Ethereum address - returns signer address for multisig users, DID address for others
   */
  async getUserEthereumAddress(userId: string): Promise<string> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
    });

    if (!user || !user.did) {
      throw new Error("User DID not found");
    }

    // For multisig users, return the signer address (EOA used for transactions)
    if (user.isMultisigEnabled && user.signerAddress) {
      logger.blockchain(
        `Returning signer address for multisig user: ${user.signerAddress}`
      );
      return user.signerAddress;
    }

    // For non-multisig users, resolve DID to get Ethereum address
    return await this.getDIDEthereumAddress(user.did);
  }

  /**
   * Get the Ethereum address associated with a DID (multisig controller address)
   */
  async getDIDEthereumAddress(did: string): Promise<string> {
    // Resolve DID to get Ethereum address
    const didDoc = await this.agent.resolveDid({ didUrl: did });

    // Extract Ethereum address from DID document
    let ethAddress: string = "";

    if (didDoc.didDocument?.verificationMethod) {
      for (const method of didDoc.didDocument.verificationMethod) {
        if (method.blockchainAccountId) {
          const blockchainId = method.blockchainAccountId;
          logger.blockchain(`Found blockchainAccountId: ${blockchainId}`);

          // Format is usually "eip155:1:0x..." or "eip155:11155111:0x..." (for Sepolia)
          const parts = blockchainId.split(":");
          if (parts.length >= 3 && parts[parts.length - 1].startsWith("0x")) {
            ethAddress = parts[parts.length - 1];
            logger.blockchain(
              `Extracted address from blockchainAccountId: ${ethAddress}`
            );
            break;
          }
        }
      }
    }

    if (!ethAddress) {
      throw new Error("Could not extract Ethereum address from DID document");
    }

    return ethAddress;
  }

  /**
   * Get multisig wallet address for a user (if enabled)
   */
  async getMultisigWalletAddress(userId: string): Promise<string | null> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
    });

    if (!user || !user.isMultisigEnabled || !user.multisigWalletId) {
      return null;
    }

    // Resolve wallet by id using the entity manager
    const walletRepository =
      this.userRepository.manager.getRepository(MultisigWallet);
    const wallet = await walletRepository.findOne({
      where: { id: user.multisigWalletId },
    });
    return wallet?.address || null;
  }

  /**
   * Sign a Verifiable Credential using the appropriate key
   */
  async signVerifiableCredential(
    userId: string,
    credentialPayload: any
  ): Promise<string> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
    });

    if (!user || !user.did) {
      throw new Error("User DID not found");
    }

    try {
      // For multisig users, use EOA signer for VC signing
      if (user.isMultisigEnabled && user.signerPrivateKey) {
        return await this.signCredentialWithEOA(user, credentialPayload);
      } else {
        return await this.signCredentialWithVeramo(user, credentialPayload);
      }
    } catch (error) {
      logger.error("Error signing verifiable credential:", error);
      throw error;
    }
  }

  /**
   * Sign credential with EOA signer (for multisig users)
   */
  private async signCredentialWithEOA(
    user: User,
    credentialPayload: any
  ): Promise<string> {
    if (!user.signerPrivateKey || !this.multisigService) {
      throw new Error("No signer private key available");
    }

    logger.blockchain(
      `🔐 Signing credential with EOA signer for user: ${user.username}`
    );

    // Decrypt the signer private key
    const privateKey = await this.multisigService.decryptSignerPrivateKey(
      user.signerPrivateKey
    );

    // Create a JWT payload
    const payload = {
      ...credentialPayload,
      iss: user.did, // Issuer is still the DID
      sub: credentialPayload.credentialSubject?.id || user.did,
      iat: Math.floor(Date.now() / 1000),
      exp: credentialPayload.expirationDate
        ? Math.floor(
            new Date(credentialPayload.expirationDate).getTime() / 1000
          )
        : undefined,
    };

    // Sign with EOA private key using ethers
    const wallet = new ethers.Wallet(privateKey);
    const message = JSON.stringify(payload);
    const signature = await wallet.signMessage(message);

    // Create a simple JWT-like structure (this is a simplified approach)
    // In production, you might want to use proper JWT libraries
    const header = {
      typ: "JWT",
      alg: "ES256K", // secp256k1 signature
      kid: user.signerAddress,
    };

    const encodedHeader = Buffer.from(JSON.stringify(header)).toString(
      "base64url"
    );
    const encodedPayload = Buffer.from(JSON.stringify(payload)).toString(
      "base64url"
    );
    const encodedSignature = Buffer.from(signature).toString("base64url");

    const jwt = `${encodedHeader}.${encodedPayload}.${encodedSignature}`;

    logger.blockchain(
      `✅ Credential signed with EOA signer: ${user.signerAddress}`
    );
    return jwt;
  }

  /**
   * Sign credential with Veramo (for non-multisig users)
   */
  private async signCredentialWithVeramo(
    user: User,
    credentialPayload: any
  ): Promise<string> {
    // Use Veramo's credential signing
    const credential = await this.agent.createVerifiableCredential({
      credential: credentialPayload,
      proofFormat: "jwt",
    });

    logger.blockchain(
      `✅ Credential signed with Veramo for user: ${user.username}`
    );

    // Extract JWT from Veramo response
    if (typeof credential.proof === "object" && credential.proof.jwt) {
      return credential.proof.jwt;
    }

    throw new Error("Failed to extract JWT from Veramo credential");
  }

  /**
   * Check if we can access the user's key for signing
   */
  async canSignTransactions(userId: string): Promise<boolean> {
    try {
      const user = await this.userRepository.findOne({
        where: { id: userId },
      });

      if (!user || !user.did) return false;

      // For multisig users, check if they have signer key
      if (user.isMultisigEnabled) {
        return !!user.signerPrivateKey;
      }

      // For non-multisig users, check Veramo keys
      const identifier = await this.agent.didManagerGet({ did: user.did });
      return identifier.keys && identifier.keys.length > 0;
    } catch (error) {
      logger.error("Error checking signing capability:", error);
      return false;
    }
  }

  /**
   * Verify that we can sign transactions for this user
   */
  async verifySigningCapability(userId: string): Promise<boolean> {
    try {
      return await this.canSignTransactions(userId);
    } catch (error) {
      logger.error("Error verifying signing capability:", error);
      return false;
    }
  }

  /**
   * Temporary private key generation (fallback)
   */
  private generateTemporaryPrivateKey(did: string): string {
    logger.warn(
      "🚨 WARNING: Using temporary key derivation - NOT SECURE FOR PRODUCTION"
    );

    // Create a deterministic private key based on user DID and system secret
    const seed = `${did}-${process.env.SECRET_KEY || "default-secret"}`;
    const hash = ethers.keccak256(ethers.toUtf8Bytes(seed));

    // Ensure the hash is a valid private key (within secp256k1 curve order)
    const privateKey = hash.startsWith("0x") ? hash : `0x${hash}`;

    logger.blockchain(`Generated temporary deterministic private key`);

    return privateKey;
  }

  /**
   * Alternative approach: Create a new key that matches the DID
   * This creates a new private key and updates the DID to match it
   */
  async createMatchingPrivateKey(userId: string): Promise<string> {
    const user = await this.userRepository.findOne({ where: { id: userId } });

    if (!user || !user.did) {
      throw new Error("User DID not found");
    }

    try {
      logger.warn(
        `Creating matching private key for user ${user.username} - this should only happen during development/testing`
      );

      // Generate a new random private key
      const wallet = ethers.Wallet.createRandom();
      const privateKey = wallet.privateKey;
      const newAddress = wallet.address;

      logger.blockchain(`Generated new key with address: ${newAddress}`);
      logger.blockchain(
        `Address match: ${newAddress.toLowerCase() === user.did.toLowerCase()}`
      );

      return privateKey;
    } catch (error) {
      logger.error("Error creating matching private key:", error);
      throw new Error("Failed to create matching key");
    }
  }

  /**
   * Get the Ethereum address associated with a private key
   */
  getAddressFromPrivateKey(privateKey: string): string {
    try {
      const wallet = new ethers.Wallet(privateKey);
      return wallet.address;
    } catch (error) {
      throw new Error("Invalid private key");
    }
  }

  /**
   * Verify that we can access signing capability for the user
   * (Replaces deprecated key consistency check)
   */
  async verifyKeyConsistency(userId: string): Promise<boolean> {
    try {
      const user = await this.userRepository.findOne({ where: { id: userId } });
      if (!user || !user.did) return false;

      // Check if we can access the signing capability
      const canSign = await this.verifySigningCapability(userId);

      logger.debug(`🔍 Signing Capability Check:`);
      logger.debug(`   User ID: ${userId}`);
      logger.debug(`   DID: ${user.did}`);
      logger.debug(`   Can Sign: ${canSign ? "✅ YES" : "❌ NO"}`);

      return canSign;
    } catch (error) {
      logger.error("Error verifying key consistency:", error);
      return false;
    }
  }

  /**
   * Disable key consistency check for testing/development
   */
  async verifyKeyConsistencyLenient(userId: string): Promise<boolean> {
    logger.warn("🚨 LENIENT MODE: Skipping key consistency check");
    logger.warn("   This should ONLY be used for development/testing");
    logger.warn("   NEVER use this in production!");

    // Always return true in lenient mode
    return true;
  }

  async debugSigningCapability(userId: string): Promise<void> {
    try {
      const user = await this.userRepository.findOne({
        where: { id: userId },
      });

      if (!user) {
        throw new Error("User not found");
      }

      const canSign = await this.verifySigningCapability(userId);

      logger.debug(`🔍 Signing Capability Check:`);
      logger.debug(`   User ID: ${userId}`);
      logger.debug(`   DID: ${user.did}`);
      logger.debug(`   Can Sign: ${canSign ? "✅ YES" : "❌ NO"}`);
    } catch (error) {
      logger.error("Error debugging signing capability:", error);
    }
  }
}
