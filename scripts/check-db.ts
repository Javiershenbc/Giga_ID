import { createDatabase } from "../src/config/database.js";
import { User } from "../src/models/user.js";

async function checkDatabase() {
  try {
    console.log("Connecting to database...");
    const dbConnection = await createDatabase("database.sqlite");
    console.log("Database connected successfully");

    // Get all users
    const userRepository = dbConnection.getRepository(User);
    const users = await userRepository.find();

    console.log(`\nFound ${users.length} users in database:`);

    // Show user details
    users.forEach((user, index) => {
      console.log(`\nUser ${index + 1}:`);
      console.log(`  ID: ${user.id}`);
      console.log(`  Username: ${user.username}`);
      console.log(`  Display Name: ${user.displayName}`);
      console.log(`  DID: ${user.did || "Not set"}`);
      console.log(`  Has Credentials: ${user.credentials ? "Yes" : "No"}`);

      if (user.credentials) {
        try {
          const credentials = JSON.parse(user.credentials);
          if (Array.isArray(credentials)) {
            console.log(`  Credentials Count: ${credentials.length}`);
            console.log(
              `  Credentials Data: ${user.credentials.substring(0, 50)}...`
            );
          } else {
            console.log(`  Credentials: Not an array: ${typeof credentials}`);
          }
        } catch (e) {
          console.log(`  Credentials: Invalid JSON: ${user.credentials}`);
        }
      }
    });

    // Close connection
    await dbConnection.destroy();
    console.log("\nDatabase connection closed");
  } catch (error) {
    console.error("Error checking database:", error);
  }
}

checkDatabase();
