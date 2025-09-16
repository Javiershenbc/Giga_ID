import {
  createHash,
  randomBytes,
  scryptSync,
  createCipheriv,
  createDecipheriv,
} from "crypto";
import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";

/**
 * SecretManager - Secure management of secrets and private keys
 *
 * This service provides a unified interface for secure storage and retrieval
 * of sensitive data like private keys, credentials, and other secrets.
 *
 * Security Features:
 * - AES-256-GCM encryption with authentication
 * - Scrypt key derivation for password-based encryption
 * - Random IV generation for each encryption operation
 * - Secure key storage with environment variable validation
 * - No fallback to insecure defaults in production
 */
export class SecretManager {
  private readonly masterKey: Buffer;
  private readonly algorithm = "aes-256-gcm";
  private readonly keyDerivationSalt = "giga-id-secret-manager-v1"; // Fixed salt for consistency

  constructor() {
    // Validate that SECRET_KEY is properly configured
    if (!env.SECRET_KEY) {
      throw new Error(
        "SECRET_KEY environment variable is required for SecretManager"
      );
    }

    // Ensure SECRET_KEY meets minimum security requirements
    if (env.SECRET_KEY.length < 32) {
      throw new Error(
        "SECRET_KEY must be at least 32 characters long for security"
      );
    }

    // Derive a master key from SECRET_KEY using scrypt
    // This provides additional security and ensures consistent key length
    this.masterKey = scryptSync(env.SECRET_KEY, this.keyDerivationSalt, 32);

    logger.debug("SecretManager initialized with secure key derivation");
  }

  /**
   * Store a private key securely
   * @param identifier Unique identifier for the key (e.g., userId, keyId)
   * @param privateKey The private key to encrypt and store
   * @returns Encrypted private key string for database storage
   */
  async storePrivateKey(
    identifier: string,
    privateKey: string
  ): Promise<string> {
    try {
      // Validate private key format (basic validation)
      if (!privateKey || typeof privateKey !== "string") {
        throw new Error("Invalid private key format");
      }

      // For Ethereum private keys, validate hex format
      if (
        privateKey.startsWith("0x") &&
        !/^0x[0-9a-fA-F]{64}$/.test(privateKey)
      ) {
        throw new Error("Invalid Ethereum private key format");
      }

      const encryptedKey = this.encryptData(privateKey, identifier);

      logger.info(`Private key stored securely for identifier: ${identifier}`);
      return encryptedKey;
    } catch (error) {
      logger.error(`Failed to store private key for ${identifier}:`, error);
      throw new Error(
        `Private key storage failed: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  /**
   * Retrieve a private key securely
   * @param identifier Unique identifier for the key
   * @param encryptedPrivateKey The encrypted private key from storage
   * @returns Decrypted private key
   */
  async retrievePrivateKey(
    identifier: string,
    encryptedPrivateKey: string
  ): Promise<string> {
    try {
      if (!encryptedPrivateKey || typeof encryptedPrivateKey !== "string") {
        throw new Error("Invalid encrypted private key format");
      }

      const privateKey = this.decryptData(encryptedPrivateKey, identifier);

      logger.debug(
        `Private key retrieved securely for identifier: ${identifier}`
      );
      return privateKey;
    } catch (error) {
      logger.error(`Failed to retrieve private key for ${identifier}:`, error);
      throw new Error(
        `Private key retrieval failed: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  /**
   * Store any sensitive data securely (generic method)
   * @param identifier Unique identifier for the data
   * @param data The sensitive data to encrypt
   * @returns Encrypted data string for storage
   */
  async storeSecret(identifier: string, data: string): Promise<string> {
    try {
      if (!data || typeof data !== "string") {
        throw new Error("Invalid data format");
      }

      const encryptedData = this.encryptData(data, identifier);

      logger.info(`Secret stored securely for identifier: ${identifier}`);
      return encryptedData;
    } catch (error) {
      logger.error(`Failed to store secret for ${identifier}:`, error);
      throw new Error(
        `Secret storage failed: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  /**
   * Retrieve any sensitive data securely (generic method)
   * @param identifier Unique identifier for the data
   * @param encryptedData The encrypted data from storage
   * @returns Decrypted data
   */
  async retrieveSecret(
    identifier: string,
    encryptedData: string
  ): Promise<string> {
    try {
      if (!encryptedData || typeof encryptedData !== "string") {
        throw new Error("Invalid encrypted data format");
      }

      const data = this.decryptData(encryptedData, identifier);

      logger.debug(`Secret retrieved securely for identifier: ${identifier}`);
      return data;
    } catch (error) {
      logger.error(`Failed to retrieve secret for ${identifier}:`, error);
      throw new Error(
        `Secret retrieval failed: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  /**
   * Generate a cryptographically secure random private key
   * @returns A new random Ethereum private key (0x prefixed hex string)
   */
  generatePrivateKey(): string {
    // Generate 32 random bytes for Ethereum private key
    const privateKeyBytes = randomBytes(32);
    const privateKey = `0x${privateKeyBytes.toString("hex")}`;

    logger.debug("Generated new cryptographically secure private key");
    return privateKey;
  }

  /**
   * Generate a secure random secret of specified length
   * @param length Number of bytes for the secret (default: 32)
   * @returns Random hex string
   */
  generateSecret(length: number = 32): string {
    const secretBytes = randomBytes(length);
    const secret = secretBytes.toString("hex");

    logger.debug(`Generated new secure secret of ${length} bytes`);
    return secret;
  }

  /**
   * Encrypt data using AES-256-GCM with identifier-based key derivation
   * @param data Data to encrypt
   * @param identifier Identifier used for key derivation (adds uniqueness)
   * @returns Encrypted data in format: iv:authTag:ciphertext (hex encoded)
   */
  private encryptData(data: string, identifier: string): string {
    try {
      // Derive a unique encryption key for this identifier
      const identifierHash = createHash("sha256").update(identifier).digest();
      const derivedKey = scryptSync(this.masterKey, identifierHash, 32);

      // Generate random IV (12 bytes recommended for GCM)
      const iv = randomBytes(12);

      // Create cipher
      const cipher = createCipheriv(this.algorithm, derivedKey, iv);

      // Encrypt data
      const encrypted = Buffer.concat([
        cipher.update(Buffer.from(data, "utf8")),
        cipher.final(),
      ]);

      // Get authentication tag
      const authTag = cipher.getAuthTag();

      // Return iv:authTag:ciphertext as hex
      return [
        iv.toString("hex"),
        authTag.toString("hex"),
        encrypted.toString("hex"),
      ].join(":");
    } catch (error) {
      logger.error("Encryption failed:", error);
      throw new Error("Data encryption failed");
    }
  }

  /**
   * Decrypt data using AES-256-GCM with identifier-based key derivation
   * @param encryptedData Encrypted data in format: iv:authTag:ciphertext (hex encoded)
   * @param identifier Identifier used for key derivation
   * @returns Decrypted data as string
   */
  private decryptData(encryptedData: string, identifier: string): string {
    try {
      // Parse encrypted data
      const parts = encryptedData.split(":");
      if (parts.length !== 3) {
        throw new Error("Invalid encrypted data format");
      }

      const [ivHex, authTagHex, ciphertextHex] = parts;
      const iv = Buffer.from(ivHex, "hex");
      const authTag = Buffer.from(authTagHex, "hex");
      const ciphertext = Buffer.from(ciphertextHex, "hex");

      // Derive the same encryption key using identifier
      const identifierHash = createHash("sha256").update(identifier).digest();
      const derivedKey = scryptSync(this.masterKey, identifierHash, 32);

      // Create decipher
      const decipher = createDecipheriv(this.algorithm, derivedKey, iv);
      decipher.setAuthTag(authTag);

      // Decrypt data
      const decrypted = Buffer.concat([
        decipher.update(ciphertext),
        decipher.final(),
      ]);

      return decrypted.toString("utf8");
    } catch (error) {
      logger.error("Decryption failed:", error);
      throw new Error(
        "Data decryption failed - data may be corrupted or key is incorrect"
      );
    }
  }

  /**
   * Validate that a string appears to be an encrypted secret from this service
   * @param encryptedData The data to validate
   * @returns True if format appears valid
   */
  isValidEncryptedFormat(encryptedData: string): boolean {
    if (!encryptedData || typeof encryptedData !== "string") {
      return false;
    }

    const parts = encryptedData.split(":");
    if (parts.length !== 3) {
      return false;
    }

    // Check that all parts are valid hex strings
    const hexRegex = /^[0-9a-fA-F]+$/;
    return parts.every((part) => part.length > 0 && hexRegex.test(part));
  }

  /**
   * Get a hash of the master key for verification purposes (not the key itself)
   * @returns SHA-256 hash of master key (for debugging/verification)
   */
  getMasterKeyHash(): string {
    return createHash("sha256")
      .update(this.masterKey)
      .digest("hex")
      .substring(0, 16);
  }
}

// Export singleton instance
export const secretManager = new SecretManager();
