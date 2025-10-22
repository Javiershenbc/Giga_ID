import * as msal from "@azure/msal-node";
import { env } from "../config/env.js";

export class AzureOAuthService {
  private confidentialClient: msal.ConfidentialClientApplication;
  private scopes: string[];

  constructor() {
    const authority = env.AZURE_AD_AUTHORITY.replace(/\/+$/g, "");
    this.confidentialClient = new msal.ConfidentialClientApplication({
      auth: {
        clientId: env.AZURE_AD_CLIENT_ID,
        clientSecret: env.AZURE_AD_CLIENT_SECRET,
        authority,
      },
      system: { loggerOptions: { logLevel: msal.LogLevel.Info } },
    });
    this.scopes = env.AZURE_AD_SCOPES.split(/\s+/g).filter(Boolean);
  }

  getLoginUrl(state?: string): string {
    const url = this.confidentialClient.getAuthCodeUrl({
      scopes: this.scopes,
      redirectUri: env.AZURE_AD_REDIRECT_URI,
      responseMode: "query",
      state,
    });
    // getAuthCodeUrl returns a Promise<string>
    // To keep interface simple, throw if used sync; callers should use async version below
    throw new Error("Use getLoginUrlAsync() instead");
  }

  async getLoginUrlAsync(state?: string): Promise<string> {
    try {
      console.log("Azure OAuth config:", {
        clientId: env.AZURE_AD_CLIENT_ID,
        tenantId: env.AZURE_AD_TENANT_ID,
        authority: env.AZURE_AD_AUTHORITY.replace(/\/+$/g, ""),
        redirectUri: env.AZURE_AD_REDIRECT_URI,
        scopes: this.scopes,
      });

      return await this.confidentialClient.getAuthCodeUrl({
        scopes: this.scopes,
        redirectUri: env.AZURE_AD_REDIRECT_URI,
        responseMode: "query",
        state,
      });
    } catch (error) {
      console.error("Error in getLoginUrlAsync:", error);
      throw error;
    }
  }

  async exchangeCodeForToken(code: string) {
    const result = await this.confidentialClient.acquireTokenByCode({
      code,
      scopes: this.scopes,
      redirectUri: env.AZURE_AD_REDIRECT_URI,
    });
    return result; // contains idTokenClaims, accessToken, expiresOn, account
  }
}
