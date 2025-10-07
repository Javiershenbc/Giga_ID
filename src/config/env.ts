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

  // Security
  SECRET_KEY: str({
    desc: "Secret key for encryption",
    default:
      process.env.NODE_ENV === "production"
        ? undefined // Force explicit setting in production
        : "dev-secret-key-change-in-production",
  }),
  SESSION_SECRET: str({
    default:
      process.env.NODE_ENV === "production"
        ? undefined // Force explicit setting in production
        : "dev-session-secret-change-in-production",
  }),
  CORS_ORIGIN: str({ default: "http://localhost:3000" }),

  // Database
  DB_NAME: str({ default: "database.sqlite" }),

  // Ethereum
  INFURA_PROJECT_ID: str({
    desc: "Infura project ID for Ethereum network access",
    default: "",
  }),
  ETH_NETWORK: str({
    choices: ["mainnet", "goerli", "sepolia", "base", "base-sepolia"],
    default: "base-sepolia",
  }),
  // Optional explicit RPC URL override (required for Base networks)
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
  JWT_SECRET: str({
    default:
      process.env.NODE_ENV === "production"
        ? undefined // Force explicit setting in production
        : "dev-jwt-secret-change-in-production",
  }),
});
