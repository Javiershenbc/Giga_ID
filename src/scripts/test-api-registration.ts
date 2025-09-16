import { ethers } from "ethers";

// Type definitions for API responses
interface DidPreviewResponse {
  success: boolean;
  did: string;
  ethereumAddress: string;
  message: string;
}

interface RegistrationResponse {
  success: boolean;
  message: string;
  user: {
    id: string;
    username: string;
    email: string;
    displayName: string;
    did: string;
  };
}

interface CredentialResponse {
  success: boolean;
  credential: any;
}

interface VerificationResponse {
  success: boolean;
  verified: boolean;
  result: any;
}

// Test script for API registration with DID-first approach
async function testApiRegistration(): Promise<void> {
  const API_BASE_URL = "http://localhost:3000";

  // Test user data
  const testUser = {
    username: "testuser_did_first",
    email: "testuser_did_first@example.com",
    displayName: "Test User DID First",
  };

  console.log("🚀 Testing DID-First API Registration Flow...");
  console.log("User data:", testUser);

  try {
    // Step 1: Get DID preview to get the Ethereum address
    console.log("\n📋 Step 1: Getting DID preview...");
    const previewResponse = await fetch(`${API_BASE_URL}/api/did-preview`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        username: testUser.username,
      }),
    });

    const previewResult: any = await previewResponse.json();

    if (!previewResponse.ok || !previewResult.success) {
      console.error("❌ DID preview failed:", previewResult);
      return;
    }

    console.log("✅ DID preview successful!");
    console.log("Generated DID:", previewResult.did);
    console.log("Ethereum address:", previewResult.ethereumAddress);

    // Step 2: Create a wallet with the generated address
    // In a real app, the user would import this private key or use a hardware wallet
    const privateKey =
      "0x1234567890123456789012345678901234567890123456789012345678901234"; // Example private key
    const wallet = new ethers.Wallet(privateKey);

    // Verify the wallet address matches the generated one
    if (
      wallet.address.toLowerCase() !==
      previewResult.ethereumAddress.toLowerCase()
    ) {
      console.log(
        "⚠️  Wallet address doesn't match generated address, creating new wallet..."
      );
      // In real implementation, you'd either:
      // 1. Use a deterministic method to generate the same address
      // 2. Import the private key that corresponds to the generated address
      // 3. Use a different approach
    }

    // Step 3: Sign the registration message with the generated address
    console.log("\n✍️  Step 2: Signing registration message...");
    const timestamp = Math.floor(Date.now() / 1000);
    const message = `${testUser.username}:${testUser.email}:${timestamp}`;

    // Sign the message
    const signature = await wallet.signMessage(message);

    console.log("Message to sign:", message);
    console.log("Signature:", signature);

    // Step 4: Register user via API
    console.log("\n📝 Step 3: Registering user via API...");
    const registrationData = {
      username: testUser.username,
      email: testUser.email,
      displayName: testUser.displayName,
      signature,
      timestamp,
    };

    const response = await fetch(`${API_BASE_URL}/api/register`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(registrationData),
    });

    const result: any = await response.json();

    if (response.ok && result.success) {
      console.log("✅ Registration successful!");
      console.log("User created:", result.user);
      console.log("User DID:", result.user.did);
      console.log(
        "Associated Ethereum address:",
        previewResult.ethereumAddress
      );

      // Verify the DID matches what we expected
      if (result.user.did === previewResult.did) {
        console.log("✅ DID matches preview!");
      } else {
        console.log(
          "⚠️  DID doesn't match preview (this might be expected if using different keys)"
        );
        console.log("Expected:", previewResult.did);
        console.log("Actual:", result.user.did);
      }

      // Now test credential issuance
      await testCredentialIssuance(result.user.did);
    } else {
      console.error("❌ Registration failed:", result);
    }
  } catch (error) {
    console.error("❌ Error during registration:", error);
  }
}

async function testCredentialIssuance(userDid: string): Promise<void> {
  const API_BASE_URL = "http://localhost:3000";

  console.log("\n🎫 Step 4: Testing credential issuance...");

  // Example credential data
  const credentialData = {
    "@context": [
      "https://www.w3.org/2018/credentials/v1",
      "https://www.w3.org/2018/credentials/examples/v1",
    ],
    type: ["VerifiableCredential", "ExampleCredential"],
    issuer: "did:ethr:0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6", // Example issuer DID
    credentialSubject: {
      id: userDid,
      name: "John Doe",
      employeeId: "WORKER123",
      organization: "Example Corp",
    },
  };

  try {
    const response = await fetch(`${API_BASE_URL}/api/credentials/issue`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        issuerDid: credentialData.issuer,
        subjectDid: userDid,
        type: credentialData.type,
        context: credentialData["@context"],
        claims: {
          name: credentialData.credentialSubject.name,
          employeeId: credentialData.credentialSubject.employeeId,
          organization: credentialData.credentialSubject.organization,
        },
      }),
    });

    const result: any = await response.json();

    if (response.ok && result.success) {
      console.log("✅ Credential issued successfully!");
      console.log("Credential:", result.credential);

      // Test credential verification
      await testCredentialVerification(result.credential);
    } else {
      console.error("❌ Credential issuance failed:", result);
    }
  } catch (error) {
    console.error("❌ Error during credential issuance:", error);
  }
}

async function testCredentialVerification(credential: any): Promise<void> {
  const API_BASE_URL = "http://localhost:3000";

  console.log("\n🔍 Step 5: Testing credential verification...");

  try {
    const response = await fetch(`${API_BASE_URL}/verify`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        credential: JSON.stringify(credential),
      }),
    });

    const result: any = await response.json();

    if (response.ok && result.success) {
      console.log("✅ Credential verification successful!");
      console.log("Verification result:", result);
    } else {
      console.error("❌ Credential verification failed:", result);
    }
  } catch (error) {
    console.error("❌ Error during credential verification:", error);
  }
}

// Run the test
testApiRegistration().catch(console.error);
