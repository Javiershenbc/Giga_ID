import { BlockchainService } from "../src/services/blockchain.js";

async function testBlockchainService() {
  try {
    console.log("Creating BlockchainService...");
    const blockchainService = new BlockchainService();

    // Test with a valid Ethereum address
    const testAddress = "0x050f7a9716842341edD2E2D4C747Ab8B8b4a8e33";

    console.log(`Testing with address: ${testAddress}`);

    // Get balance
    console.log("Getting balance...");
    const balance = await blockchainService.getBalance(testAddress);
    console.log(`Balance: ${balance} ETH`);

    // Check if registered
    console.log("Checking if registered...");
    const isRegistered = await blockchainService.isDIDRegistered(testAddress);
    console.log(`Is registered: ${isRegistered}`);

    // Get transaction history
    console.log("Getting transaction history...");
    const transactions = await blockchainService.getTransactionHistory(
      testAddress,
      5
    );
    console.log(`Found ${transactions.length} transactions`);

    if (transactions.length > 0) {
      console.log("Transaction details:");
      transactions.forEach((tx, index) => {
        console.log(`Transaction ${index + 1}:`);
        console.log(`  Hash: ${tx.hash}`);
        console.log(`  From: ${tx.from}`);
        console.log(`  To: ${tx.to}`);
        console.log(`  Value: ${tx.value.toString()}`);
      });
    } else {
      console.log("No transactions found");
    }
  } catch (error) {
    console.error("Error testing blockchain service:", error);
  }
}

testBlockchainService();
