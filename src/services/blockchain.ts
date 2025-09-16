import { ethers } from "ethers";
import { env } from "../config/env.js";

export class BlockchainService {
  private provider: ethers.JsonRpcProvider;

  constructor() {
    // Initialize provider with Infura
    this.provider = new ethers.JsonRpcProvider(
      `https://${env.ETH_NETWORK}.infura.io/v3/${env.INFURA_PROJECT_ID}`
    );
  }

  /**
   * Get the balance of an Ethereum address
   */
  async getBalance(address: string): Promise<string> {
    const balance = await this.provider.getBalance(address);
    return ethers.formatEther(balance);
  }

  /**
   * Send a transaction from the DID controller address
   */
  async sendTransaction(
    fromPrivateKey: string,
    toAddress: string,
    amount: string
  ): Promise<ethers.TransactionResponse> {
    const wallet = new ethers.Wallet(fromPrivateKey, this.provider);
    const tx = await wallet.sendTransaction({
      to: toAddress,
      value: ethers.parseEther(amount),
    });
    return tx;
  }

  /**
   * Check if a DID is registered on the blockchain
   */
  async isDIDRegistered(didAddress: string): Promise<boolean> {
    try {
      // For a DID:ethr, we need to check the registry contract, not the address itself
      // A simple non-empty balance indicates the address exists on the blockchain
      const balance = await this.provider.getBalance(didAddress);

      // If the address has a non-zero balance, consider it registered
      if (balance > 0n) {
        console.log(
          `Address ${didAddress} has balance ${ethers.formatEther(balance)} ETH`
        );
        return true;
      }

      // If no balance, just do a quick check if the address has any transactions
      // instead of scanning multiple blocks which can be slow
      const code = await this.provider.getCode(didAddress);
      if (code !== "0x") {
        console.log(`Address ${didAddress} has contract code`);
        return true;
      }

      // For efficiency, just return false if no balance or code
      // instead of searching through transaction history
      console.log(
        `Address ${didAddress} has no balance or code, considering not registered`
      );
      return false;
    } catch (error) {
      console.error("Error checking DID registration:", error);
      // If we can't determine, default to considering it not registered
      return false;
    }
  }

  /**
   * Check if an address has any transaction history
   */
  private async hasTransactionHistory(address: string): Promise<boolean> {
    try {
      const blockNumber = await this.provider.getBlockNumber();
      // Check the last 10 blocks for transactions
      for (let i = 0; i < 10; i++) {
        if (blockNumber - i < 0) break;
        const block = await this.provider.getBlock(blockNumber - i);
        if (block && block.transactions && block.transactions.length > 0) {
          for (const txHash of block.transactions) {
            const tx = await this.provider.getTransaction(txHash);
            if (tx && (tx.from === address || tx.to === address)) {
              return true;
            }
          }
        }
      }
      return false;
    } catch (error) {
      console.error("Error checking transaction history:", error);
      return false;
    }
  }

  /**
   * Get transaction history for an address
   */
  async getTransactionHistory(
    address: string,
    limit: number = 10
  ): Promise<any[]> {
    try {
      console.log(
        `Getting transaction history for address: ${address}, limit: ${limit}`
      );

      // Set a reasonable timeout limit
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(
          () => reject(new Error("Transaction lookup timed out")),
          2000 // Shorter timeout of 2 seconds
        );
      });

      // Create the transaction search promise
      const searchPromise = (async () => {
        const history = [];
        const blockNumber = await this.provider.getBlockNumber();
        console.log(`Current block number: ${blockNumber}`);

        // Only look at the most recent 3 blocks maximum to avoid long search times
        const blocksToSearch = Math.min(3, limit);

        for (let i = 0; i < blocksToSearch; i++) {
          if (blockNumber - i < 0) break;

          // Get block with transactions
          const block = await this.provider.getBlock(blockNumber - i);
          if (
            !block ||
            !block.transactions ||
            block.transactions.length === 0
          ) {
            continue;
          }

          console.log(
            `Checking block ${blockNumber - i} with ${
              block.transactions.length
            } transactions`
          );

          // We need to look up each transaction to get the details
          for (const txHash of block.transactions) {
            if (history.length >= limit) break;

            try {
              const tx = await this.provider.getTransaction(txHash);
              if (tx && (tx.from === address || tx.to === address)) {
                console.log(
                  `Found transaction ${tx.hash} for address ${address}`
                );
                history.push(tx);
              }
            } catch (err) {
              console.error(`Error getting transaction details: ${err}`);
            }
          }

          if (history.length >= limit) {
            break;
          }
        }

        return history;
      })();

      // Race the transaction search against the timeout
      return (await Promise.race([searchPromise, timeoutPromise])) as any[];
    } catch (error) {
      console.error(`Error getting transaction history: ${error}`);
      return [];
    }
  }
}
