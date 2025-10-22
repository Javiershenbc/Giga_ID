import "reflect-metadata";
import { DataSource } from "typeorm";
// Veramo data-store removed in Azure AD migration
import { User } from "../models/user.js";
import { Organization } from "../models/organization.js";
// CredentialRecord removed
import { APIKey } from "../models/api-key.js";
import {
  MultisigWallet,
  MultisigTransaction,
} from "../models/multisig-wallet.js";
import { env } from "./env.js";
import { logger } from "../utils/logger.js";

let dataSource: DataSource | null = null;

export async function initializeDatabase(): Promise<DataSource> {
  if (dataSource && dataSource.isInitialized) {
    return dataSource;
  }

  const dbName = env.DB_NAME || "database.sqlite";

  dataSource = new DataSource({
    type: "sqlite",
    database: dbName,
    entities: [User, Organization, APIKey, MultisigWallet, MultisigTransaction],
    synchronize: true,
    logging: env.NODE_ENV === "development" ? ["error", "schema"] : false,
    migrations: [],
    migrationsRun: false,
  });

  try {
    await dataSource.initialize();
    logger.info(`Database initialized: ${dbName}`);

    // Synchronize schema
    await dataSource.synchronize();
    logger.info("Database schema synchronized");

    return dataSource;
  } catch (error) {
    logger.error("Database initialization failed:", error);
    throw error;
  }
}

export function getDataSource(): DataSource {
  if (!dataSource || !dataSource.isInitialized) {
    throw new Error(
      "Database not initialized. Call initializeDatabase() first."
    );
  }
  return dataSource;
}

// Legacy export for backwards compatibility
export const createDatabase = async (dbName?: string): Promise<DataSource> => {
  // The dbName parameter is ignored since we now use env.DB_NAME
  return await initializeDatabase();
};
