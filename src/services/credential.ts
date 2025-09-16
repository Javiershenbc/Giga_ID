import { ConfiguredAgent } from "../agent/setup.js";
import {
  ICreateVerifiableCredentialArgs,
  VerifiableCredential,
  IVerifyCredentialArgs,
  IVerifyResult,
} from "@veramo/core";
import { KeyManagerService } from "./key-manager.js";
import { DataSource } from "typeorm";

export class CredentialService {
  private agent: ConfiguredAgent;
  private keyManager?: KeyManagerService;

  constructor(agent: ConfiguredAgent, dataSource?: DataSource) {
    this.agent = agent;
    if (dataSource) {
      this.keyManager = new KeyManagerService(agent, dataSource);
    }
  }

  /**
   * Issue a Verifiable Credential (JWT)
   * Supports both direct credential object and parameterized input
   * Now supports multisig users with EOA signing
   */
  async issueCredential(params: {
    credential?: {
      "@context": string[];
      type: string[];
      issuer: string | { id: string };
      credentialSubject: { id: string; [key: string]: any };
    };
    issuerDid?: string;
    subjectDid?: string;
    type?: string[];
    context?: string[];
    claims?: Record<string, any>;
    issuerUserId?: string; // User ID for multisig signing
  }): Promise<VerifiableCredential> {
    try {
      let credential: ICreateVerifiableCredentialArgs["credential"];
      if (params.credential) {
        credential = {
          "@context": [
            "https://www.w3.org/2018/credentials/v1",
            ...params.credential["@context"],
          ],
          type: ["VerifiableCredential", ...params.credential.type],
          issuer: params.credential.issuer,
          credentialSubject: params.credential.credentialSubject,
        };
      } else if (
        params.issuerDid &&
        params.subjectDid &&
        params.type &&
        params.context &&
        params.claims
      ) {
        credential = {
          "@context": params.context,
          type: params.type,
          issuer: { id: params.issuerDid },
          issuanceDate: new Date().toISOString(),
          credentialSubject: {
            id: params.subjectDid,
            ...params.claims,
          },
        };
      } else {
        throw new Error("Invalid parameters for issuing credential");
      }

      // If issuerUserId is provided and we have keyManager, use multisig-aware signing
      if (params.issuerUserId && this.keyManager) {
        const jwt = await this.keyManager.signVerifiableCredential(
          params.issuerUserId,
          credential
        );

        // Return credential with JWT proof
        return {
          ...credential,
          proof: {
            type: "JwtProof2020",
            jwt: jwt,
          },
        } as VerifiableCredential;
      }

      // Fallback to standard Veramo signing
      const args: ICreateVerifiableCredentialArgs = {
        credential,
        proofFormat: "jwt",
      };
      return await this.agent.createVerifiableCredential(args);
    } catch (error) {
      console.error("Error issuing credential:", error);
      throw error;
    }
  }

  async verifyCredential(
    verifiableCredential: VerifiableCredential
  ): Promise<IVerifyResult> {
    try {
      const args: IVerifyCredentialArgs = {
        credential: verifiableCredential,
      };
      const result = await this.agent.verifyCredential(args);
      return result;
    } catch (error) {
      console.error("Error verifying credential:", error);
      throw error;
    }
  }
}
