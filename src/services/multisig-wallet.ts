import { Repository, DataSource } from "typeorm";
import { ethers } from "ethers";
import {
  MultisigWallet,
  MultisigTransaction,
  MultisigType,
  MultisigTransactionStatus,
  MultisigTransactionType,
} from "../models/multisig-wallet.js";
import { User } from "../models/user.js";
// Veramo agent removed in Azure migration
import { logger } from "../utils/logger.js";
import { env } from "../config/env.js";

// Re-export types for use by other modules
export {
  MultisigType,
  MultisigTransactionStatus,
  MultisigTransactionType,
} from "../models/multisig-wallet.js";

export interface CreateMultisigWalletParams {
  address: string;
  type: MultisigType;
  owners: string[];
  threshold: number;
  network?: string;
  metadata?: Record<string, any>;
}

export interface AssociateMultisigParams {
  userId: string;
  multisigWalletId: string;
  signerPrivateKey?: string; // Optional: provide custom signer key
  generateSigner?: boolean; // Generate new EOA signer if not provided
}

export interface MultisigTransactionParams {
  multisigWalletId: string;
  initiatorUserId?: string;
  transactionType: MultisigTransactionType;
  transactionData: Record<string, any>;
}

export interface SignerKeyPair {
  privateKey: string;
  address: string;
}

export class MultisigWalletService {
  private multisigRepository: Repository<MultisigWallet>;
  private transactionRepository: Repository<MultisigTransaction>;
  private userRepository: Repository<User>;
  private agent: any;
  private provider: ethers.JsonRpcProvider;
  private dataSource: DataSource;

  constructor(agent: any, dataSource: DataSource) {
    this.agent = agent;
    this.dataSource = dataSource;
    this.multisigRepository = dataSource.getRepository(MultisigWallet);
    this.transactionRepository = dataSource.getRepository(MultisigTransaction);
    this.userRepository = dataSource.getRepository(User);
    this.provider = new ethers.JsonRpcProvider(
      `https://${env.ETH_NETWORK}.infura.io/v3/${env.INFURA_PROJECT_ID}`
    );
  }

  /**
   * Create a new multisig wallet record
   */
  async createMultisigWallet(
    params: CreateMultisigWalletParams
  ): Promise<MultisigWallet> {
    try {
      // Validate Ethereum address
      if (!ethers.isAddress(params.address)) {
        throw new Error("Invalid multisig wallet address");
      }

      // Validate owners are valid addresses
      for (const owner of params.owners) {
        if (!ethers.isAddress(owner)) {
          throw new Error(`Invalid owner address: ${owner}`);
        }
      }

      // Validate threshold
      if (params.threshold <= 0 || params.threshold > params.owners.length) {
        throw new Error(
          "Threshold must be greater than 0 and not exceed number of owners"
        );
      }

      // Check if wallet already exists
      const existingWallet = await this.multisigRepository.findOne({
        where: { address: params.address },
      });

      if (existingWallet) {
        throw new Error("Multisig wallet already exists");
      }

      // Create wallet record
      const wallet = this.multisigRepository.create({
        address: params.address,
        type: params.type,
        owners: JSON.stringify(params.owners),
        threshold: params.threshold,
        network: params.network || env.ETH_NETWORK,
        metadata: params.metadata ? JSON.stringify(params.metadata) : undefined,
      });

      const savedWallet = await this.multisigRepository.save(wallet);

      logger.info(
        `Created multisig wallet: ${savedWallet.address} (${savedWallet.type})`
      );

      return savedWallet;
    } catch (error) {
      logger.error("Error creating multisig wallet:", error);
      throw error;
    }
  }

  /**
   * Associate a user with a multisig wallet
   */
  async associateUserWithMultisig(
    params: AssociateMultisigParams
  ): Promise<User> {
    try {
      // Find user
      const user = await this.userRepository.findOne({
        where: { id: params.userId },
      });

      if (!user) {
        throw new Error("User not found");
      }

      // Find multisig wallet
      const wallet = await this.multisigRepository.findOne({
        where: { id: params.multisigWalletId },
      });

      if (!wallet) {
        throw new Error("Multisig wallet not found");
      }

      // Decide signer behavior: provide, generate, reuse existing, or none
      let newEncryptedSignerKey: string | undefined;
      let newSignerAddress: string | undefined;
      let willUpdateSigner = false;

      if (params.signerPrivateKey) {
        // Use provided signer key
        const signerKeyPair = this.validateSignerKey(params.signerPrivateKey);
        newEncryptedSignerKey = await this.encryptSignerPrivateKey(
          signerKeyPair.privateKey
        );
        newSignerAddress = signerKeyPair.address;
        willUpdateSigner = true;
      } else if (params.generateSigner) {
        // Generate new signer key
        const signerKeyPair = this.generateSignerKeyPair();
        newEncryptedSignerKey = await this.encryptSignerPrivateKey(
          signerKeyPair.privateKey
        );
        newSignerAddress = signerKeyPair.address;
        willUpdateSigner = true;
      } else if (user.signerPrivateKey && user.signerAddress) {
        // Reuse existing signer (no changes needed)
        willUpdateSigner = false;
      } else {
        // No signer provided/requested and none stored -> proceed without signer
        willUpdateSigner = false;
      }

      // Update user with multisig association (and signer only if changed)
      user.multisigWalletId = wallet.id;
      user.isMultisigEnabled = true;
      if (willUpdateSigner) {
        user.signerPrivateKey = newEncryptedSignerKey;
        user.signerAddress = newSignerAddress;
      }

      const updatedUser = await this.userRepository.save(user);

      logger.info(
        `Associated user ${user.username} with multisig wallet ${wallet.address}`
      );
      if (willUpdateSigner && newSignerAddress) {
        logger.info(`Using signer address: ${newSignerAddress}`);
      }

      return updatedUser;
    } catch (error) {
      logger.error("Error associating user with multisig:", error);
      throw error;
    }
  }

  /**
   * Update DID to use multisig as controller
   */
  async updateDIDController(
    userId: string,
    multisigAddress: string
  ): Promise<void> {
    try {
      const user = await this.userRepository.findOne({
        where: { id: userId },
      });

      if (!user) {
        throw new Error("User not found");
      }

      // DID no longer required

      if (!user.isMultisigEnabled) {
        throw new Error("User is not configured for multisig");
      }

      // Create a multisig transaction to update DID controller
      const transactionData = {
        didToUpdate: null,
        newController: multisigAddress,
        previousController: null,
        timestamp: Date.now(),
      };

      await this.createMultisigTransaction({
        multisigWalletId: user.multisigWalletId!,
        initiatorUserId: userId,
        transactionType: MultisigTransactionType.DID_CONTROLLER_CHANGE,
        transactionData,
      });

      logger.info(
        `Created multisig controller update transaction -> ${multisigAddress}`
      );
    } catch (error) {
      logger.error("Error updating DID controller:", error);
      throw error;
    }
  }

  /**
   * Create a multisig transaction
   */
  async createMultisigTransaction(
    params: MultisigTransactionParams
  ): Promise<MultisigTransaction> {
    try {
      const wallet = await this.multisigRepository.findOne({
        where: { id: params.multisigWalletId },
      });

      if (!wallet) {
        throw new Error("Multisig wallet not found");
      }

      const transaction = this.transactionRepository.create({
        multisigWalletId: params.multisigWalletId,
        initiatorUserId: params.initiatorUserId,
        transactionType: params.transactionType,
        transactionData: JSON.stringify(params.transactionData),
        requiredSignatures: wallet.threshold,
        status: MultisigTransactionStatus.PENDING,
      });

      const savedTransaction = await this.transactionRepository.save(
        transaction
      );

      logger.info(
        `Created multisig transaction: ${savedTransaction.id} (${params.transactionType})`
      );

      return savedTransaction;
    } catch (error) {
      logger.error("Error creating multisig transaction:", error);
      throw error;
    }
  }

  /**
   * Get multisig wallet by address
   */
  async getMultisigWalletByAddress(
    address: string
  ): Promise<MultisigWallet | null> {
    return await this.multisigRepository.findOne({
      where: { address },
    });
  }

  /**
   * Get user's multisig configuration
   */
  async getUserMultisigConfig(userId: string): Promise<{
    user: User;
    wallet: MultisigWallet | null;
    signerAddress: string | null;
    isEnabled: boolean;
  }> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      relations: ["multisigWallet"],
    });

    if (!user) {
      throw new Error("User not found");
    }

    return {
      user,
      wallet: user.multisigWalletId
        ? await this.multisigRepository.findOne({
            where: { id: user.multisigWalletId },
          })
        : null,
      signerAddress: user.signerAddress || null,
      isEnabled: user.isMultisigEnabled,
    };
  }

  /**
   * Get pending multisig transactions for a wallet
   */
  async getPendingTransactions(
    multisigWalletId: string
  ): Promise<MultisigTransaction[]> {
    return await this.transactionRepository.find({
      where: {
        multisigWalletId,
        status: MultisigTransactionStatus.PENDING,
      },
      order: { createdAt: "DESC" },
    });
  }

  /**
   * Generate a new signer key pair
   */
  private generateSignerKeyPair(): SignerKeyPair {
    const wallet = ethers.Wallet.createRandom();
    return {
      privateKey: wallet.privateKey,
      address: wallet.address,
    };
  }

  /**
   * Validate a signer private key
   */
  private validateSignerKey(privateKey: string): SignerKeyPair {
    try {
      const wallet = new ethers.Wallet(privateKey);
      return {
        privateKey: wallet.privateKey,
        address: wallet.address,
      };
    } catch (error) {
      throw new Error("Invalid signer private key");
    }
  }

  /**
   * Encrypt signer private key for storage
   */
  private async encryptSignerPrivateKey(privateKey: string): Promise<string> {
    const crypto = await import("crypto");
    const secretKey = env.SECRET_KEY || "default-secret";

    // AES-256-GCM with random IV and auth tag
    const algorithm = "aes-256-gcm";
    const key = crypto.scryptSync(secretKey, "salt", 32);
    const iv = crypto.randomBytes(12); // 96-bit IV recommended for GCM
    const cipher = crypto.createCipheriv(algorithm, key, iv);

    const encrypted = Buffer.concat([
      cipher.update(Buffer.from(privateKey, "utf8")),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();

    // Return iv:tag:ciphertext as hex
    return [
      iv.toString("hex"),
      authTag.toString("hex"),
      encrypted.toString("hex"),
    ].join(":");
  }

  /**
   * Decrypt signer private key
   */
  async decryptSignerPrivateKey(encryptedKey: string): Promise<string> {
    try {
      const crypto = await import("crypto");
      const secretKey = env.SECRET_KEY || "default-secret";

      const [ivHex, tagHex, encHex] = encryptedKey.split(":");
      const iv = Buffer.from(ivHex, "hex");
      const authTag = Buffer.from(tagHex, "hex");
      const ciphertext = Buffer.from(encHex, "hex");
      const key = crypto.scryptSync(secretKey, "salt", 32);

      const algorithm = "aes-256-gcm";
      const decipher = crypto.createDecipheriv(algorithm, key, iv);
      decipher.setAuthTag(authTag);

      const decrypted = Buffer.concat([
        decipher.update(ciphertext),
        decipher.final(),
      ]);
      return decrypted.toString("utf8");
    } catch (error) {
      throw new Error("Failed to decrypt signer private key");
    }
  }

  /**
   * Get current DID controller
   */
  // DID controller lookup removed in Azure migration
  private async getCurrentDIDController(_did: string): Promise<string | null> {
    return null;
  }

  /**
   * Check if address is part of multisig owners
   */
  async isMultisigOwner(
    multisigWalletId: string,
    address: string
  ): Promise<boolean> {
    const wallet = await this.multisigRepository.findOne({
      where: { id: multisigWalletId },
    });

    if (!wallet) {
      return false;
    }

    const owners: string[] = JSON.parse(wallet.owners);
    return owners.some(
      (owner) => owner.toLowerCase() === address.toLowerCase()
    );
  }

  /**
   * Disable multisig for a user (emergency function)
   */
  async disableMultisigForUser(userId: string): Promise<User> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
    });

    if (!user) {
      throw new Error("User not found");
    }

    user.isMultisigEnabled = false;
    user.multisigWalletId = undefined;
    user.signerPrivateKey = undefined;
    user.signerAddress = undefined;

    const updatedUser = await this.userRepository.save(user);

    logger.info(`Disabled multisig for user ${user.username}`);

    return updatedUser;
  }
}
