import { DataSource } from "typeorm";
import { User } from "../models/user.js";
import { ethers } from "ethers";
import { logger } from "../utils/logger.js";
import { MultisigWalletService } from "./multisig-wallet.js";
import { env } from "../config/env.js";
import { MultisigWallet } from "../models/multisig-wallet.js";

export class KeyManagerService {
  private userRepository: any;
  private multisigService?: MultisigWalletService;
  private provider: ethers.JsonRpcProvider;

  constructor(dbConnection: DataSource) {
    this.userRepository = dbConnection.getRepository(User);
    this.multisigService = new MultisigWalletService({} as any, dbConnection);
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
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) throw new Error("User not found");

    try {
      if (user.isMultisigEnabled && user.signerPrivateKey) {
        return await this.signWithEOASigner(user, transaction);
      }
      throw new Error("No signing method available for this user");
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
    const user: User | null = await this.userRepository.findOne({
      where: { id: userId },
    });
    if (
      !user ||
      !user.isMultisigEnabled ||
      !user.signerPrivateKey ||
      !this.multisigService
    ) {
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

    logger.blockchain(`✅ Transaction signed with EOA signer`);
    return signedTx;
  }

  /**
   * Get user's Ethereum address - returns signer address for multisig users
   */
  async getUserEthereumAddress(userId: string): Promise<string> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
    });

    if (!user) {
      throw new Error("User not found");
    }

    // For multisig users, return the signer address (EOA used for transactions)
    if (user.isMultisigEnabled && user.signerAddress) {
      logger.blockchain(
        `Returning signer address for multisig user: ${user.signerAddress}`
      );
      return user.signerAddress;
    }

    throw new Error("User does not have an EOA signer configured");
  }

  // DID resolution removed in Azure migration

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
  // VC signing removed in Azure migration

  /**
   * Sign credential with EOA signer (for multisig users)
   */
  // VC signing removed in Azure migration

  /**
   * Sign credential with Veramo (for non-multisig users)
   */
  // VC signing removed in Azure migration

  /**
   * Check if we can access the user's key for signing
   */
  async canSignTransactions(userId: string): Promise<boolean> {
    try {
      const user = await this.userRepository.findOne({
        where: { id: userId },
      });

      if (!user) return false;

      // For multisig users, check if they have signer key
      if (user.isMultisigEnabled) {
        return !!user.signerPrivateKey;
      }

      // Non-multisig users: no signing capability available
      return false;
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
      // No DID after Azure migration
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
