import { User } from "../models/user.js";
import { WebAuthnCredential } from "./webauthn.js";
import { CredentialStorageService } from "./credential-storage.js";
import { ethers } from "ethers";
import crypto from "crypto";

export interface BackupData {
  encryptedCredentials: string;
  recoveryKey: string;
  salt: string;
  iv: string;
}

export class BackupService {
  private credentialStorage: CredentialStorageService;

  constructor() {
    this.credentialStorage = new CredentialStorageService();
  }

  /**
   * Generate a recovery key and encrypt credentials for backup
   */
  async createBackup(credential: WebAuthnCredential): Promise<BackupData> {
    // Generate a random recovery key
    const recoveryKey = crypto.randomBytes(32).toString("hex");

    // Generate salt and IV for encryption
    const salt = crypto.randomBytes(16).toString("hex");
    const iv = crypto.randomBytes(16);

    // Derive encryption key from recovery key
    const encryptionKey = crypto.pbkdf2Sync(
      recoveryKey,
      salt,
      100000,
      32,
      "sha256"
    );

    // Encrypt the credential
    const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey, iv);
    const credentialString = JSON.stringify(credential);
    const encryptedData = Buffer.concat([
      cipher.update(credentialString, "utf8"),
      cipher.final(),
    ]);

    // Get the auth tag
    const authTag = cipher.getAuthTag();

    // Combine encrypted data and auth tag
    const encryptedCredentials = Buffer.concat([
      encryptedData,
      authTag,
    ]).toString("base64");

    return {
      encryptedCredentials,
      recoveryKey,
      salt,
      iv: iv.toString("hex"),
    };
  }

  /**
   * Recover credentials using a recovery key
   */
  async recoverCredentials(
    backupData: BackupData
  ): Promise<WebAuthnCredential> {
    try {
      // Derive encryption key from recovery key
      const encryptionKey = crypto.pbkdf2Sync(
        backupData.recoveryKey,
        backupData.salt,
        100000,
        32,
        "sha256"
      );

      // Convert base64 encrypted data back to buffer
      const encryptedBuffer = Buffer.from(
        backupData.encryptedCredentials,
        "base64"
      );

      // Split the auth tag from the encrypted data
      const authTag = encryptedBuffer.slice(-16);
      const encryptedData = encryptedBuffer.slice(0, -16);

      // Create decipher
      const decipher = crypto.createDecipheriv(
        "aes-256-gcm",
        encryptionKey,
        Buffer.from(backupData.iv, "hex")
      );

      // Set auth tag
      decipher.setAuthTag(authTag);

      // Decrypt
      const decrypted = Buffer.concat([
        decipher.update(encryptedData),
        decipher.final(),
      ]);

      // Parse the decrypted credential
      const credential = JSON.parse(decrypted.toString("utf8"));

      return credential;
    } catch (error) {
      console.error("Error recovering credentials:", error);
      throw new Error("Invalid recovery key or corrupted backup data");
    }
  }

  /**
   * Generate a QR code for the recovery key
   */
  generateRecoveryQR(backupData: BackupData): string {
    // Create a JSON string with all necessary recovery data
    const recoveryData = {
      type: "GigaID-Recovery",
      version: "1",
      recoveryKey: backupData.recoveryKey,
      salt: backupData.salt,
      iv: backupData.iv,
      encryptedCredentials: backupData.encryptedCredentials,
    };

    // Return as a JSON string (in practice, you'd convert this to a QR code)
    return JSON.stringify(recoveryData);
  }
}
