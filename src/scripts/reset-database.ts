import { createDatabase } from "../config/database.js";
import { env } from "../config/env.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function resetDatabase() {
  console.log("🔄 Starting Database Reset Process");
  console.log("=".repeat(50));

  try {
    // Get database file path
    const dbPath = path.resolve(process.cwd(), env.DB_NAME);

    console.log(`📍 Database file: ${dbPath}`);

    // Check if database file exists
    if (fs.existsSync(dbPath)) {
      console.log("🗑️  Removing existing database file...");
      fs.unlinkSync(dbPath);
      console.log("✅ Database file removed successfully");
    } else {
      console.log("ℹ️  No existing database file found");
    }

    // Create fresh database
    console.log("🏗️  Creating fresh database...");
    const dbConnection = await createDatabase(env.DB_NAME);

    console.log("✅ Database created successfully");
    console.log("📊 Database schema synchronized");

    // Close connection
    await dbConnection.destroy();
    console.log("🔌 Database connection closed");

    console.log("\n🎉 Database Reset Complete!");
    console.log("=".repeat(50));
    console.log("✨ You now have a fresh database ready for testing");
    console.log("🚀 You can start the server with: npm run dev");
  } catch (error) {
    console.error("❌ Database reset failed:", error);
    process.exit(1);
  }
}

// Run the reset if this script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  resetDatabase()
    .then(() => {
      console.log("✅ Reset completed successfully");
      process.exit(0);
    })
    .catch((error) => {
      console.error("❌ Reset failed:", error);
      process.exit(1);
    });
}

export { resetDatabase };
