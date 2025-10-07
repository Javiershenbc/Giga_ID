#!/usr/bin/env ts-node

import fetch from "node-fetch";

// Configuration
const BASE_URL = "https://gigaidpoc-production.up.railway.app";

class GigaCreationDebugger {
  private accessToken: string | null = null;

  async debug() {
    console.log("🔍 Debugging Giga organization creation...\n");

    try {
      // Step 1: Login to get access token
      await this.login();

      // Step 2: Check if Giga already exists
      await this.checkExistingGiga();

      // Step 3: Try creating Giga with minimal data
      await this.testMinimalGigaCreation();

      // Step 4: Try creating Giga with all required fields
      await this.testCompleteGigaCreation();
    } catch (error) {
      console.error("❌ Debug failed:", error);
    }
  }

  async login() {
    console.log("🔐 Logging in...");

    // You'll need to provide actual credentials
    const loginData = {
      username: "YOUR_USERNAME", // Replace with actual username
      password: "YOUR_PASSWORD", // Replace with actual password
    };

    const response = await fetch(`${BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(loginData),
    });

    const result = await response.json();

    if (response.ok && result.success) {
      this.accessToken = result.data.accessToken;
      console.log("✅ Login successful");
    } else {
      console.error("❌ Login failed:", result);
      throw new Error("Login failed");
    }
  }

  async checkExistingGiga() {
    console.log("\n🏢 Checking for existing Giga organization...");

    try {
      const response = await fetch(
        `${BASE_URL}/api/hierarchy/organizations/type/giga`,
        {
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
            "Content-Type": "application/json",
          },
        }
      );

      const result = await response.json();

      if (response.ok && result.success && result.data.length > 0) {
        console.log("⚠️  Giga organization already exists:");
        console.log(JSON.stringify(result.data[0], null, 2));
        console.log(
          "\n📋 This is why creation fails - only one Giga can exist!"
        );
        return true;
      } else {
        console.log("✅ No existing Giga organization found");
        return false;
      }
    } catch (error) {
      console.log("❌ Error checking existing Giga:", error);
      return false;
    }
  }

  async testMinimalGigaCreation() {
    console.log("\n🧪 Testing minimal Giga creation (name + type only)...");

    const minimalData = {
      name: "Giga Test",
      type: "giga",
    };

    await this.attemptCreation(minimalData, "Minimal");
  }

  async testCompleteGigaCreation() {
    console.log("\n🧪 Testing complete Giga creation (all fields)...");

    const completeData = {
      name: "Giga Global Initiative",
      type: "giga",
      description: "Global connectivity initiative for schools",
      country: "Global",
      region: "Worldwide",
      contactEmail: "admin@giga.global",
    };

    await this.attemptCreation(completeData, "Complete");
  }

  async attemptCreation(orgData: any, testType: string) {
    try {
      console.log(
        `📤 Sending ${testType} request:`,
        JSON.stringify(orgData, null, 2)
      );

      const response = await fetch(`${BASE_URL}/api/hierarchy/organizations`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(orgData),
      });

      const result = await response.text();
      let parsedResult;

      try {
        parsedResult = JSON.parse(result);
      } catch {
        parsedResult = { rawResponse: result };
      }

      console.log(`📊 Response Status: ${response.status}`);
      console.log(
        `📊 Response Headers:`,
        Object.fromEntries(response.headers.entries())
      );
      console.log(`📊 Response Body:`, JSON.stringify(parsedResult, null, 2));

      if (response.status === 400) {
        console.log(`❌ ${testType} creation failed with 400 - Bad Request`);

        if (parsedResult.errors) {
          console.log("🔍 Validation errors:");
          parsedResult.errors.forEach((error: any, index: number) => {
            console.log(
              `   ${index + 1}. Field: ${error.path}, Message: ${error.msg}`
            );
          });
        }

        if (parsedResult.error) {
          console.log(`🔍 Error message: ${parsedResult.error}`);
        }
      } else if (response.status === 201) {
        console.log(`✅ ${testType} creation successful!`);
      } else {
        console.log(
          `⚠️  ${testType} creation returned status ${response.status}`
        );
      }
    } catch (error) {
      console.error(`❌ ${testType} creation request failed:`, error);
    }
  }
}

// Run the debugger
const gigaDebugger = new GigaCreationDebugger();
gigaDebugger.debug().catch(console.error);
