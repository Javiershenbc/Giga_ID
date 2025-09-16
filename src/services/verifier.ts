import { ConfiguredAgent } from "../agent/setup.js";

export interface VerificationResult {
  valid: boolean;
  reason?: string;
  payload?: object;
}

export class VerifierService {
  private agent: ConfiguredAgent;

  constructor(agent: ConfiguredAgent) {
    this.agent = agent;
  }

  async verifyCredential(credential: string): Promise<VerificationResult> {
    try {
      const result = await this.agent.verifyCredential({ credential });
      if (result.verified) {
        return { valid: true, payload: result.verifiableCredential }; // include payload
      } else {
        return { valid: false, reason: "Credential not verified" };
      }
    } catch (error: any) {
      return { valid: false, reason: error.message || "Verification failed" };
    }
  }
}
