import crypto from "crypto";
import { logger } from "../utils/logger.js";

export interface WebAuthnCredential {
  id: string;
  publicKey: string;
  counter: number;
}

export class CredentialStorageService {
  private readonly encryptionKey: string;
  private readonly algorithm = "aes-256-gcm";

  constructor() {
    // Use environment variable or generate a key
    this.encryptionKey =
      process.env.CREDENTIAL_ENCRYPTION_KEY ||
      "your-32-character-secret-key-here-change-this-in-production";
  }

  encryptCredential(credential: WebAuthnCredential): string {
    try {
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipher(this.algorithm, this.encryptionKey);
      cipher.setAAD(iv);

      let encrypted = cipher.update(JSON.stringify(credential), "utf8", "hex");
      encrypted += cipher.final("hex");

      const authTag = cipher.getAuthTag();

      return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted}`;
    } catch (error) {
      logger.error("Error encrypting credential:", error);
      throw new Error("Failed to encrypt credential");
    }
  }

  decryptCredential(encryptedData: string): WebAuthnCredential {
    try {
      const parts = encryptedData.split(":");
      if (parts.length !== 3) {
        throw new Error("Invalid encrypted data format");
      }

      const iv = Buffer.from(parts[0], "hex");
      const authTag = Buffer.from(parts[1], "hex");
      const encrypted = parts[2];

      const decipher = crypto.createDecipher(
        this.algorithm,
        this.encryptionKey
      );
      decipher.setAAD(iv);
      decipher.setAuthTag(authTag);

      let decrypted = decipher.update(encrypted, "hex", "utf8");
      decrypted += decipher.final("utf8");

      logger.credential(
        `Successfully decrypted credential of length ${decrypted.length}`
      );

      return JSON.parse(decrypted);
    } catch (error) {
      logger.error("Error decrypting credential:", error);
      throw new Error("Failed to decrypt credential");
    }
  }

  // Alternative method using the Node.js crypto module directly
  encryptCredentialV2(credential: WebAuthnCredential): string {
    try {
      logger.credential(`Encrypting credential with ID: ${credential.id}`);

      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipher("aes-256-cbc", this.encryptionKey);

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
    try {
      const parts = encryptedData.split(":");
      if (parts.length !== 2) {
        throw new Error("Invalid encrypted data format");
      }

      const iv = Buffer.from(parts[0], "hex");
      const encrypted = parts[1];

      const decipher = crypto.createDecipher("aes-256-cbc", this.encryptionKey);

      let decrypted = decipher.update(encrypted, "hex", "utf8");
      decrypted += decipher.final("utf8");

      return JSON.parse(decrypted);
    } catch (error) {
      logger.error("Error decrypting credential (V2):", error);
      throw new Error("Failed to decrypt credential");
    }
  }
}
