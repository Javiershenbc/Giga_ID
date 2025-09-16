import { randomBytes } from "crypto";
import { DataSource } from "typeorm";
import { APIKey } from "../models/api-key.js";
import { createDatabase } from "../config/database.js";

async function generateApiKey(owner: string, scopes: string[]) {
  const db = await createDatabase();
  const apiKeyRepo = db.getRepository(APIKey);

  // Generate a random 32-byte key
  const key = randomBytes(32).toString("hex");

  const apiKey = apiKeyRepo.create({
    key,
    owner,
    scopes,
    active: true,
  });

  await apiKeyRepo.save(apiKey);
  console.log("Generated API Key:", key);
  console.log("Owner:", owner);
  console.log("Scopes:", scopes);
}

// Example usage: node src/scripts/generate-api-key.ts "Giga" "issue:school,issue:worker"
const [, , owner, scopesStr] = process.argv;
if (!owner || !scopesStr) {
  console.error(
    "Usage: node src/scripts/generate-api-key.ts <owner> <scopes (comma-separated)>"
  );
  process.exit(1);
}
const scopes = scopesStr.split(",").map((s) => s.trim());
generateApiKey(owner, scopes).then(() => process.exit(0));
