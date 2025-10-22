import { DataSource } from "typeorm";
import { User } from "./models/user.js";
import { Organization } from "./models/organization.js";
import {
  MultisigWallet,
  MultisigTransaction,
} from "./models/multisig-wallet.js";
import { env } from "./config/env.js";

export const AppDataSource = new DataSource({
  type: "sqlite",
  database: env.DB_NAME || "database.sqlite",
  synchronize: env.NODE_ENV !== "production",
  logging: env.NODE_ENV === "development" ? ["error", "schema"] : false,
  entities: [User, Organization, MultisigWallet, MultisigTransaction],
  migrations: [],
  subscribers: [],
});
