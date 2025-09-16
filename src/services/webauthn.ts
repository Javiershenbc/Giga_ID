import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
  VerifiedRegistrationResponse,
  VerifiedAuthenticationResponse,
  GenerateRegistrationOptionsOpts,
  GenerateAuthenticationOptionsOpts,
  VerifyAuthenticationResponseOpts,
} from "@simplewebauthn/server";
import { isoBase64URL, isoUint8Array } from "@simplewebauthn/server/helpers";
import { env } from "../config/env.js";
import type { PublicKeyCredentialCreationOptionsJSON } from "@simplewebauthn/types";

export interface WebAuthnCredential {
  id: string;
  publicKey: string;
  counter: number;
}

export interface RegistrationInfo {
  fmt: string;
  counter: number;
  aaguid: string;
  credentialID: Uint8Array;
  credentialPublicKey: Uint8Array;
  credentialType: string;
  attestationObject: Uint8Array;
  userVerified: boolean;
  credentialDeviceType: string;
  credentialBackedUp: boolean;
  origin: string;
  rpID: string;
}

export class WebAuthnService {
  private rpName: string;
  private rpID: string;
  private origin: string;

  constructor() {
    this.rpName = "GigaID";
    this.rpID =
      env.NODE_ENV === "production" ? "gigaid.unicef.org" : "localhost";
    this.origin =
      env.NODE_ENV === "production"
        ? "https://gigaid.unicef.org"
        : `http://localhost:${env.PORT}`;
  }

  async generateRegistrationOptions(
    username: string,
    displayName: string
  ): Promise<PublicKeyCredentialCreationOptionsJSON> {
    // Generate registration options with SimpleWebAuthn
    // The userID must be properly formatted for WebAuthn (base64url-encoded)
    // Converting username to a proper WebAuthn identifier
    const options = await generateRegistrationOptions({
      rpName: this.rpName,
      rpID: this.rpID,
      userID: isoBase64URL.fromString(username),
      userName: displayName,
      attestationType: "none",
      authenticatorSelection: {
        residentKey: "preferred",
        userVerification: "preferred",
        authenticatorAttachment: "platform",
      },
    });

    // Log the original challenge format for debugging
    console.log("Original challenge type:", typeof options.challenge);
    console.log("Generated options:", JSON.stringify(options, null, 2));

    // Return the options with challenge properly formatted for the browser
    return options;
  }

  async verifyRegistration(
    response: any,
    expectedChallenge: string
  ): Promise<VerifiedRegistrationResponse> {
    try {
      // Log for debugging
      console.log("Verifying registration with challenge:", expectedChallenge);
      console.log("Response:", JSON.stringify(response, null, 2));

      // Convert user ID to correct format if needed
      // SimpleWebAuthn requires the user ID to be in a specific format
      const verification = await verifyRegistrationResponse({
        response,
        expectedChallenge,
        expectedOrigin: this.origin,
        expectedRPID: this.rpID,
        requireUserVerification: true,
      });

      console.log(
        "Verification result:",
        JSON.stringify(verification, null, 2)
      );
      return verification;
    } catch (error) {
      console.error("Error verifying registration:", error);
      if (error instanceof Error) {
        console.error("Error message:", error.message);
        console.error("Error stack:", error.stack);
      }
      throw error;
    }
  }

  async generateAuthenticationOptions(credentials: WebAuthnCredential[]) {
    const options = await generateAuthenticationOptions({
      rpID: this.rpID,
      allowCredentials: credentials.map((cred) => ({
        id: isoBase64URL.toBuffer(cred.id),
        type: "public-key",
        transports: ["internal"],
      })),
      userVerification: "preferred",
    });

    return options;
  }

  async verifyAuthentication(
    response: any,
    expectedChallenge: string,
    credential: WebAuthnCredential
  ): Promise<VerifiedAuthenticationResponse> {
    try {
      console.log(
        "Verifying authentication with challenge:",
        expectedChallenge
      );
      console.log("Response:", JSON.stringify(response, null, 2));
      console.log("Using credential:", credential);

      // Convert credential to proper format for verification
      const verification = await verifyAuthenticationResponse({
        response,
        expectedChallenge,
        expectedOrigin: this.origin,
        expectedRPID: this.rpID,
        authenticator: {
          credentialPublicKey: isoBase64URL.toBuffer(credential.publicKey),
          credentialID: isoBase64URL.toBuffer(credential.id),
          counter: credential.counter,
        },
        requireUserVerification: true,
      });

      console.log(
        "Authentication verification result:",
        JSON.stringify(verification, null, 2)
      );
      return verification;
    } catch (error) {
      console.error("Error verifying authentication:", error);
      if (error instanceof Error) {
        console.error("Error message:", error.message);
        console.error("Error stack:", error.stack);
      }
      throw error;
    }
  }
}
