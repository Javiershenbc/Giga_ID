import { createDatabase } from "../src/config/database.js";
import { User } from "../src/models/user.js";
import * as fs from "fs";
import * as path from "path";

async function resetDatabase() {
  try {
    // Remove existing database file if it exists
    const dbPath = path.resolve(process.cwd(), "database.sqlite");

    if (fs.existsSync(dbPath)) {
      console.log(`Removing existing database at ${dbPath}`);
      fs.unlinkSync(dbPath);
    }

    console.log("Creating new database...");
    const dbConnection = await createDatabase("database.sqlite");
    console.log("Database created successfully");

    // Verify the database is empty
    const userRepository = dbConnection.getRepository(User);
    const userCount = await userRepository.count();

    console.log(`User count after reset: ${userCount}`);

    // Close connection
    await dbConnection.destroy();
    console.log("Database connection closed");

    console.log(
      "\nDatabase has been reset successfully! Start the application again."
    );
  } catch (error) {
    console.error("Error resetting database:", error);
  }
}

resetDatabase();
