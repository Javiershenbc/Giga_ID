import { env } from "./env.js";

const normalizeAuthority = (authority: string): string => {
  let a = authority.trim();
  if (!a.startsWith("http")) {
    a = `https://${a}`;
  }
  // remove trailing slashes
  a = a.replace(/\/+$/g, "");
  return a;
};

const authority = normalizeAuthority(env.AZURE_AD_AUTHORITY);
const tenantId = env.AZURE_AD_TENANT_ID.trim();

export const azureAdConfig = {
  identityMetadata: `${authority}/${tenantId}/v2.0/.well-known/openid-configuration`,
  clientID: env.AZURE_AD_CLIENT_ID,
  audience: env.AZURE_AD_CLIENT_ID,
  validateIssuer: true,
  loggingLevel: "info" as const,
};

export type AzureUser = {
  oid: string;
  tid?: string;
  name?: string;
  preferred_username?: string;
  roles?: string[];
  groups?: string[];
};
