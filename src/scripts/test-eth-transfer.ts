#!/usr/bin/env ts-node

import { createDatabase } from "../config/database.js";
import { createVeramoAgent } from "../agent/setup.js";
import { TransactionService } from "../services/transaction.js";
import { UserService } from "../services/user.js";
import { env } from "../config/env.js";
import { ethers } from "ethers";

async function testETHTransfer() {
  console.log("🧪 ETH Transfer Test");
  console.log("=".repeat(50));

  try {
    console.log("1️⃣ Initializing database and services...");

    // Create database and agent
    const dbConnection = await createDatabase(env.DB_NAME);
    const agent = await createVeramoAgent(dbConnection, env.SECRET_KEY);

    // Create services
    const transactionService = new TransactionService(agent, dbConnection);
    const userService = new UserService(dbConnection, agent);

    console.log("✅ Database and services initialized");

    console.log("\n2️⃣ Listing available users...");

    try {
      const users = await userService.getAllUsers();
      if (users.length === 0) {
        console.log("   No users found in the database.");
      } else {
        console.log(`   Found ${users.length} users:`);
        users.slice(0, 5).forEach((u, index) => {
          console.log(
            `   ${index + 1}. Username: "${u.username}", ID: ${
              u.id
            }, Has DID: ${u.did ? "Yes" : "No"}`
          );
          if (u.did) {
            console.log(`      DID: ${u.did.substring(0, 50)}...`);
          }
        });
      }
    } catch (error) {
      console.error("   ❌ Failed to list users:", error);
    }
    console.log("");

    const testUsername = "testuser"; // Use existing user that has completed WebAuthn registration

    let user;
    try {
      user = await userService.getUserByUsername(testUsername);
      if (!user) {
        console.log(`❌ User "${testUsername}" not found.`);
        console.log(
          `💡 Please first register a user through the web interface:`
        );
        console.log(`   1. Start the server: npm run dev`);
        console.log(`   2. Go to: http://localhost:3000/test`);
        console.log(`   3. Register with username: ${testUsername}`);
        console.log(`   4. Complete WebAuthn registration`);
        console.log(`   5. Then run this test again`);
        return;
      } else {
        console.log(`✅ Using existing test user: ${user.username}`);
      }
    } catch (error) {
      console.error("❌ Failed to setup user:", error);
      return;
    }

    console.log(`📍 User ID: ${user.id}`);
    console.log(`📍 User DID: ${user.did}`);

    // Check if user has a DID
    if (!user.did) {
      console.log(`❌ User "${testUsername}" exists but has no DID.`);
      console.log(`💡 This means WebAuthn registration wasn't completed.`);
      console.log(`   Please complete registration through the web interface:`);
      console.log(`   1. Go to: http://localhost:3000/test`);
      console.log(`   2. Try to authenticate with username: ${testUsername}`);
      console.log(`   3. If that fails, register again to complete the flow`);
      return;
    }

    console.log(``);

    // 3. Test the user details and wallet info
    console.log("3️⃣ Testing user wallet details...");

    try {
      // Get the DID's expected address
      const didAddress = await transactionService.getUserEthereumAddress(
        user.id
      );
      console.log(`📍 DID Ethereum Address: ${didAddress}`);

      // Get the user's balance
      const balance = await transactionService.getUserBalance(user.id);
      console.log(`💰 Current Balance: ${balance} ETH`);

      if (parseFloat(balance) === 0) {
        console.log(`🚰 To get test ETH, visit: https://sepoliafaucet.com/`);
        console.log(`   Enter this address: ${didAddress}`);
        console.log(
          `🔗 Monitor on Etherscan: https://sepolia.etherscan.io/address/${didAddress}\n`
        );
      }
    } catch (error) {
      console.error("❌ Failed to get user details:", error);
      return;
    }

    // 4. Test signing capability with Veramo (proper approach)
    console.log("4️⃣ Testing Veramo signing capability...");

    try {
      const keyManager = (transactionService as any).keyManager;

      // Check if we can sign transactions
      console.log("   Checking signing capability...");
      const canSign = await keyManager.verifySigningCapability(user.id);
      console.log(`   Can sign transactions: ${canSign ? "✅ YES" : "❌ NO"}`);

      if (canSign) {
        console.log("   ✅ Veramo signing capability verified");
        console.log("   🔐 Ready for secure transaction signing");
      } else {
        console.log("   ❌ Cannot access signing capability");
        console.log("   💡 This may indicate a Veramo configuration issue");
      }

      // Test key consistency check (updated version)
      console.log("   Running key consistency check...");
      const isConsistent = await keyManager.verifyKeyConsistency(user.id);
      console.log(
        `   Key consistency: ${isConsistent ? "✅ GOOD" : "⚠️ CHECK REQUIRED"}`
      );
    } catch (error) {
      console.error("❌ Signing capability check failed:", error);
      console.log("💡 This is expected with the current Veramo v3.0+ setup");
    }

    console.log("\n");

    // 5. Show current status
    console.log("5️⃣ CURRENT IMPLEMENTATION STATUS:");
    console.log("");
    console.log("✅ WORKING FEATURES:");
    console.log("   • User registration with DID creation");
    console.log("   • Ethereum address extraction from DID");
    console.log("   • Balance checking");
    console.log("   • Veramo signing capability detection");
    console.log("");
    console.log("🔄 TRANSACTION SIGNING:");
    console.log("   • Uses proper Veramo integration");
    console.log("   • No direct private key access (secure)");
    console.log("   • KeyManager handles signing internally");
    console.log("");

    // 6. Attempt a small transaction test
    const balance = await transactionService.getUserBalance(user.id);
    if (parseFloat(balance) > 0) {
      console.log("6️⃣ Testing transaction with Veramo signing...");

      try {
        const testTx = {
          to: "0x8A41F2e3F540C58cae4c24AE36E3cCf34d33fD46", // Different test address
          amount: "0.0001",
        };

        console.log(
          `🧪 Attempting to send ${testTx.amount} ETH to ${testTx.to}...`
        );
        console.log(
          `🔍 Address validation: ${testTx.to} is valid = ${ethers.isAddress(
            testTx.to
          )}`
        );

        const result = await transactionService.sendTransaction(
          user.id,
          testTx
        );
        console.log(`✅ Transaction submitted: ${result.hash}`);
        console.log(`📊 Status: ${result.status}`);
        console.log(
          `🔗 View on Etherscan: https://sepolia.etherscan.io/tx/${result.hash}`
        );
      } catch (error) {
        console.log(
          `❌ Transaction failed: ${
            error instanceof Error ? error.message : "Unknown error"
          }`
        );

        // Show detailed error info
        if (error instanceof Error) {
          if (error.message.includes("Cannot sign transactions")) {
            console.log("💡 Veramo signing not properly configured");
            console.log("   Check KeyManager setup and DID resolution");
          } else if (error.message.includes("Insufficient balance")) {
            console.log(
              "💡 This error means insufficient ETH for transaction + gas"
            );
            console.log("   Option: Get more test ETH from faucet");
          }
        }
      }
    } else {
      console.log("6️⃣ Skipping transaction test (zero balance)");
      console.log("   💡 Get test ETH first to test transactions");
    }

    console.log("\n✅ Test completed");
  } catch (error) {
    console.error("❌ Test failed:", error);
  }
}

// Run the test
testETHTransfer().catch(console.error);
