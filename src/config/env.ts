import dotenv from "dotenv";
import { cleanEnv, str, port, num, bool } from "envalid";

// Load environment variables from .env file
dotenv.config();

export const env = cleanEnv(process.env, {
  // Server
  PORT: port({ default: 3000 }),
  NODE_ENV: str({
    choices: ["development", "test", "production"],
    default: "development",
  }),

  // Azure AD
  AZURE_AD_TENANT_ID: str(),
  AZURE_AD_CLIENT_ID: str(),
  AZURE_AD_CLIENT_SECRET: str({ default: "" }),
  AZURE_AD_AUTHORITY: str({ default: "https://login.microsoftonline.com" }),
  AZURE_AD_REDIRECT_URI: str({
    default: "http://localhost:3000/api/auth/callback",
  }),
  AZURE_AD_SCOPES: str({ default: "openid profile email offline_access" }),
  // Signing secret (backwards compatibility)
  SECRET_KEY: str({ default: "" }),
  CORS_ORIGIN: str({ default: "http://localhost:3000" }),

  // Database
  DB_NAME: str({ default: "database.sqlite" }),

  // Ethereum
  INFURA_PROJECT_ID: str({ default: "" }),
  ETH_NETWORK: str({ default: "sepolia" }),
  RPC_URL: str({ default: "" }),

  // Rate Limiting - More secure defaults
  RATE_LIMIT_WINDOW: str({ default: "1m" }),
  RATE_LIMIT_MAX_REQUESTS: num({
    default: process.env.NODE_ENV === "production" ? 100 : 1000, // Lower limit for production
  }),

  DATABASE_PATH: str({ default: "gigaid.sqlite" }),
  PRIVATE_KEY: str({ default: "" }),
  RP_NAME: str({ default: "GigaID" }),
  RP_ID: str({ default: "localhost" }),
  ENABLE_BLOCKCHAIN: bool({ default: false }),
});
