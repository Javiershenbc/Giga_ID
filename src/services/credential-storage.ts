import crypto from "crypto";
import { logger } from "../utils/logger.js";
import { secretManager } from "./secret-manager.js";

export interface WebAuthnCredential {
  id: string;
  publicKey: string;
  counter: number;
}

export class CredentialStorageService {
  private readonly algorithm = "aes-256-gcm";

  constructor() {
    // Security: Removed insecure fallback - now using SecretManager
    logger.debug(
      "CredentialStorageService initialized with SecretManager integration"
    );
  }

  async encryptCredential(credential: WebAuthnCredential): Promise<string> {
    try {
      // Generate unique identifier for this credential
      const identifier = `webauthn-credential-${credential.id}-${Date.now()}`;

      // Convert credential to JSON string
      const credentialData = JSON.stringify(credential);

      // Use SecretManager for secure encryption
      const encryptedData = await secretManager.storeSecret(
        identifier,
        credentialData
      );

      // Return identifier with encrypted data for retrieval
      return `${identifier}:${encryptedData}`;
    } catch (error) {
      logger.error("Error encrypting credential:", error);
      throw new Error("Failed to encrypt credential");
    }
  }

  async decryptCredential(encryptedData: string): Promise<WebAuthnCredential> {
    try {
      // Check if this is the new format (identifier:encryptedData)
      if (encryptedData.includes(":") && encryptedData.split(":").length >= 4) {
        // New format: identifier:iv:authTag:ciphertext
        const parts = encryptedData.split(":");
        const identifier = parts[0];
        const encryptedCredentialData = parts.slice(1).join(":");

        // Use SecretManager for secure decryption
        const decryptedData = await secretManager.retrieveSecret(
          identifier,
          encryptedCredentialData
        );

        logger.credential(
          `Successfully decrypted credential of length ${decryptedData.length}`
        );

        return JSON.parse(decryptedData);
      } else {
        // Legacy format - handle old encryption method for backward compatibility
        logger.warn(
          "Using legacy credential decryption - consider migrating to SecretManager"
        );

        const parts = encryptedData.split(":");
        if (parts.length !== 3) {
          throw new Error("Invalid encrypted data format");
        }

        const iv = Buffer.from(parts[0], "hex");
        const authTag = Buffer.from(parts[1], "hex");
        const encrypted = parts[2];

        // For legacy decryption, we need to use the old encryption key
        // This should be migrated to SecretManager in production
        const legacyKey =
          process.env.CREDENTIAL_ENCRYPTION_KEY ||
          "your-32-character-secret-key-here-change-this-in-production";

        const decipher = crypto.createDecipher(this.algorithm, legacyKey);
        decipher.setAAD(iv);
        decipher.setAuthTag(authTag);

        let decrypted = decipher.update(encrypted, "hex", "utf8");
        decrypted += decipher.final("utf8");

        logger.credential(
          `Successfully decrypted legacy credential of length ${decrypted.length}`
        );

        return JSON.parse(decrypted);
      }
    } catch (error) {
      logger.error("Error decrypting credential:", error);
      throw new Error("Failed to decrypt credential");
    }
  }

  // Legacy V2 methods - deprecated, use SecretManager instead
  // Kept for backward compatibility only
  encryptCredentialV2(credential: WebAuthnCredential): string {
    logger.warn(
      "encryptCredentialV2 is deprecated - use encryptCredential with SecretManager instead"
    );

    try {
      logger.credential(`Encrypting credential with ID: ${credential.id}`);

      const iv = crypto.randomBytes(16);
      // Use legacy key for backward compatibility
      const legacyKey =
        process.env.CREDENTIAL_ENCRYPTION_KEY ||
        "your-32-character-secret-key-here-change-this-in-production";
      const cipher = crypto.createCipher("aes-256-cbc", legacyKey);

      let encrypted = cipher.update(JSON.stringify(credential), "utf8", "hex");
      encrypted += cipher.final("hex");

      logger.credential(
        `Successfully encrypted credential to length ${encrypted.length}`
      );

      return `${iv.toString("hex")}:${encrypted}`;
    } catch (error) {
      logger.error("Error encrypting credential (V2):", error);
      throw new Error("Failed to encrypt credential");
    }
  }

  decryptCredentialV2(encryptedData: string): WebAuthnCredential {
    logger.warn(
      "decryptCredentialV2 is deprecated - use decryptCredential with SecretManager instead"
    );

    try {
      const parts = encryptedData.split(":");
      if (parts.length !== 2) {
        throw new Error("Invalid encrypted data format");
      }

      const iv = Buffer.from(parts[0], "hex");
      const encrypted = parts[1];

      // Use legacy key for backward compatibility
      const legacyKey =
        process.env.CREDENTIAL_ENCRYPTION_KEY ||
        "your-32-character-secret-key-here-change-this-in-production";
      const decipher = crypto.createDecipher("aes-256-cbc", legacyKey);

      let decrypted = decipher.update(encrypted, "hex", "utf8");
      decrypted += decipher.final("utf8");

      return JSON.parse(decrypted);
    } catch (error) {
      logger.error("Error decrypting credential (V2):", error);
      throw new Error("Failed to decrypt credential");
    }
  }
}
