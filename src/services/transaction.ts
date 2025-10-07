import { ethers } from "ethers";
import { ConfiguredAgent } from "../agent/setup.js";
import { env } from "../config/env.js";
import { DataSource } from "typeorm";
import { User } from "../models/user.js";
import { MultisigWallet } from "../models/multisig-wallet.js";
import { KeyManagerService } from "./key-manager.js";
import { logger } from "../utils/logger.js";
import axios from "axios";

export interface TransactionRequest {
  to: string;
  amount: string; // ETH amount as string
  gasLimit?: string;
  gasPrice?: string;
  overrideSignerPrivateKey?: string; // optional one-off signer override for Safe proposal
}

export interface TransactionResult {
  hash: string;
  from: string;
  to: string;
  amount: string;
  gasUsed?: string;
  status: "pending" | "confirmed" | "failed";
  blockNumber?: number;
  confirmations?: number;
}

export class TransactionService {
  private agent: ConfiguredAgent;
  private provider: ethers.JsonRpcProvider;
  private userRepository: any;
  private keyManager: KeyManagerService;

  constructor(agent: ConfiguredAgent, dbConnection: DataSource) {
    this.agent = agent;
    this.provider = new ethers.JsonRpcProvider(
      `https://${env.ETH_NETWORK}.infura.io/v3/${env.INFURA_PROJECT_ID}`
    );
    this.userRepository = dbConnection.getRepository(User);
    this.keyManager = new KeyManagerService(agent, dbConnection);
    try {
      const secretFp = ethers
        .keccak256(ethers.toUtf8Bytes(env.SECRET_KEY || ""))
        .slice(0, 10);
      logger.debug(`Signer env fingerprint: ${secretFp}`);
    } catch {}
  }

  /**
   * Get user's effective Ethereum address for sending (EOA for multisig users)
   */
  async getUserEthereumAddress(userId: string): Promise<string> {
    // Delegate to key manager which already implements multisig-aware logic
    return await this.keyManager.getUserEthereumAddress(userId);
  }

  /**
   * Get user's ETH balance
   */
  async getUserBalance(userId: string): Promise<string> {
    const address = await this.getUserEthereumAddress(userId);
    const balance = await this.provider.getBalance(address);
    return ethers.formatEther(balance);
  }

  /**
   * Validate transaction parameters
   */
  private validateTransaction(request: TransactionRequest): void {
    // Validate Ethereum address
    if (!ethers.isAddress(request.to)) {
      throw new Error("Invalid destination address");
    }

    // Validate amount
    try {
      const amount = ethers.parseEther(request.amount);
      if (amount <= 0) {
        throw new Error("Amount must be greater than 0");
      }
    } catch (error) {
      throw new Error("Invalid amount format");
    }
  }

  /**
   * Send ETH transaction - NOW USING PROPER VERAMO INTEGRATION
   */
  async sendTransaction(
    userId: string,
    request: TransactionRequest
  ): Promise<TransactionResult> {
    // Validate input
    this.validateTransaction(request);

    // Get user's address and check balance
    let fromAddress = await this.getUserEthereumAddress(userId);
    const balance = await this.getUserBalance(userId);

    const requestedAmount = ethers.parseEther(request.amount);
    const currentBalance = ethers.parseEther(balance);

    if (requestedAmount >= currentBalance) {
      throw new Error(
        "Insufficient balance (remember to account for gas fees)"
      );
    }

    // Check if we can sign transactions for this user
    const canSign = await this.keyManager.verifySigningCapability(userId);
    if (!canSign) {
      throw new Error(
        "Cannot sign transactions for this user - no valid keys found"
      );
    }

    try {
      // Get current gas price
      const feeData = await this.provider.getFeeData();

      // Estimate gas limit
      const gasLimit = request.gasLimit
        ? BigInt(request.gasLimit)
        : await this.provider.estimateGas({
            to: request.to,
            value: requestedAmount,
            from: fromAddress,
          });

      // Calculate total cost including gas
      const gasCost =
        gasLimit * (feeData.maxFeePerGas || feeData.gasPrice || BigInt(0));
      const totalCost = requestedAmount + gasCost;

      if (totalCost > currentBalance) {
        throw new Error(
          `Insufficient balance. Need ${ethers.formatEther(
            totalCost
          )} ETH, have ${balance} ETH`
        );
      }

      // Create transaction object for Veramo signing
      const transaction = {
        to: request.to,
        value: requestedAmount.toString(),
        gasLimit: gasLimit.toString(),
        maxFeePerGas: feeData.maxFeePerGas?.toString(),
        maxPriorityFeePerGas: feeData.maxPriorityFeePerGas?.toString(),
        nonce: await this.provider.getTransactionCount(fromAddress, "pending"),
        chainId: this.getChainId(),
        type: 2, // EIP-1559 transaction type
      };

      logger.blockchain(
        `🔐 Signing transaction with Veramo KeyManager: ${JSON.stringify(
          transaction
        )}`
      );

      // PROPER APPROACH: Use Veramo's signing capability
      const signedTx = await this.keyManager.signEthereumTransaction(
        userId,
        transaction
      );

      logger.blockchain(`✅ Transaction signed by Veramo KeyManager`);

      // Send the signed transaction to the network
      const txResponse = await this.provider.broadcastTransaction(signedTx);

      logger.blockchain(
        `✅ Transaction submitted to network: ${txResponse.hash}`
      );

      return {
        hash: txResponse.hash,
        from: fromAddress,
        to: request.to,
        amount: request.amount,
        status: "pending",
      };
    } catch (error) {
      logger.error("Transaction failed:", error);
      throw new Error(
        `Transaction failed: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  /**
   * Propose an ETH transfer via Safe (Gnosis) for multisig-enabled users
   */
  async proposeSafeTransaction(
    userId: string,
    request: TransactionRequest
  ): Promise<{ safeTxHash: string; safeAddress: string }> {
    // Validate input
    this.validateTransaction(request);

    // Ensure user is multisig-enabled and retrieve Safe address and EOA signer
    const user: User | null = await this.userRepository.findOne({
      where: { id: userId },
    });
    if (!user) throw new Error("User not found");
    if (!user.isMultisigEnabled || !user.multisigWalletId) {
      throw new Error("User is not configured for multisig");
    }

    // Load multisig wallet record to get Safe address
    const walletRepo =
      this.userRepository.manager.getRepository(MultisigWallet);
    const wallet = await walletRepo.findOne({
      where: { id: user.multisigWalletId },
    });
    if (!wallet || !wallet.address) {
      throw new Error("Multisig wallet not found for user");
    }

    let fromAddress: string;
    let signer: ethers.Wallet | null = null;

    if (
      request.overrideSignerPrivateKey &&
      request.overrideSignerPrivateKey.length > 0
    ) {
      const pk = request.overrideSignerPrivateKey.startsWith("0x")
        ? request.overrideSignerPrivateKey
        : `0x${request.overrideSignerPrivateKey}`;
      if (!/^0x[0-9a-fA-F]{64}$/.test(pk)) {
        throw new Error("Invalid overrideSignerPrivateKey format");
      }
      signer = new ethers.Wallet(pk, this.provider);
      fromAddress = await signer.getAddress();
    } else {
      const canSign = await this.keyManager.verifySigningCapability(userId);
      if (!canSign) throw new Error("No signer available for this user");
      fromAddress = await this.getUserEthereumAddress(userId);
      signer = await (this.keyManager as any).getEOASigner?.(userId);
      if (!signer)
        throw new Error("EOA signer not available for multisig user");
      const signerAddrLower = (await signer.getAddress()).toLowerCase();
      const fromAddrLower = fromAddress.toLowerCase();
      if (signerAddrLower !== fromAddrLower) {
        logger.error(
          `EOA address mismatch: signer.getAddress()=${signerAddrLower} vs stored=${fromAddrLower}. Using signer address.`
        );
        fromAddress = await signer.getAddress();
      }
    }

    // Ensure the signer address matches our stored EOA address
    const signerAddrLower = (await signer.getAddress()).toLowerCase();
    const fromAddrLower = fromAddress.toLowerCase();
    if (signerAddrLower !== fromAddrLower) {
      logger.error(
        `EOA address mismatch: signer.getAddress()=${signerAddrLower} vs stored=${fromAddrLower}. Using signer address.`
      );
      // reassign local variable
      fromAddress = await signer.getAddress();
    }

    // Select Safe Transaction Service URL (per-network endpoints)
    let txServiceUrl = "";
    if (env.ETH_NETWORK === "sepolia")
      txServiceUrl = "https://safe-transaction-sepolia.safe.global";
    else if (env.ETH_NETWORK === "mainnet")
      txServiceUrl = "https://safe-transaction-mainnet.safe.global";
    else if (env.ETH_NETWORK === "base-sepolia")
      txServiceUrl = "https://safe-transaction-base-sepolia.safe.global";
    else if (env.ETH_NETWORK === "base")
      txServiceUrl = "https://safe-transaction-base.safe.global";
    else txServiceUrl = "https://safe-transaction-sepolia.safe.global";

    // Resolve chainId
    const chainId: number = (() => {
      switch (env.ETH_NETWORK) {
        case "mainnet":
          return 1;
        case "sepolia":
          return 11155111;
        case "base":
          return 8453;
        case "base-sepolia":
          return 84532;
        default:
          return 11155111;
      }
    })();

    const checksummedSafe = ethers.getAddress(wallet.address);

    // Get current Safe info (nonce, owners)
    const infoResp = await axios.get(
      `${txServiceUrl}/api/v1/safes/${checksummedSafe}`
    );
    const safeInfo = infoResp.data as { nonce: number; owners?: string[] };
    const nonce: number = Number(safeInfo?.nonce ?? 0);

    // Ensure signer is an owner of the Safe
    if (
      Array.isArray((safeInfo as any).owners) &&
      !(safeInfo as any).owners.some(
        (o: string) => o.toLowerCase() === fromAddress.toLowerCase()
      )
    ) {
      throw new Error(
        `EOA ${fromAddress} is not an owner of Safe ${wallet.address} on ${env.ETH_NETWORK}`
      );
    }

    // Build Safe tx data manually and compute hash via contract
    const toChecksummed = ethers.getAddress(request.to);
    const valueWei = ethers.parseEther(request.amount).toString();
    const ZERO_ADDR = "0x0000000000000000000000000000000000000000";
    const safeTx = {
      to: toChecksummed,
      value: valueWei,
      data: "0x",
      operation: 0,
      safeTxGas: 0,
      baseGas: 0,
      gasPrice: 0,
      gasToken: ZERO_ADDR,
      refundReceiver: ZERO_ADDR,
      nonce,
    };
    const SAFE_ABI = [
      "function getTransactionHash(address to,uint256 value,bytes data,uint8 operation,uint256 safeTxGas,uint256 baseGas,uint256 gasPrice,address gasToken,address refundReceiver,uint256 _nonce) public view returns (bytes32)",
    ];
    const contract = new ethers.Contract(
      checksummedSafe,
      SAFE_ABI,
      signer.provider
    );
    const safeTxHash: string = await contract.getTransactionHash(
      safeTx.to,
      safeTx.value,
      safeTx.data,
      safeTx.operation,
      safeTx.safeTxGas,
      safeTx.baseGas,
      safeTx.gasPrice,
      safeTx.gasToken,
      safeTx.refundReceiver,
      safeTx.nonce
    );
    const senderSignature = await signer.signMessage(
      ethers.getBytes(safeTxHash)
    );

    // Adjust signature for Safe eth_sign semantics on Ethereum networks (v = v + 4)
    let signatureToSend = senderSignature;
    try {
      const isEthereumLike =
        env.ETH_NETWORK === "sepolia" || env.ETH_NETWORK === "mainnet";
      if (isEthereumLike) {
        const sigBytes = ethers.getBytes(senderSignature);
        const v = sigBytes[64];
        if (v === 27 || v === 28) {
          sigBytes[64] = v + 4; // 31 or 32 marks eth_sign for Safe
          signatureToSend = ethers.hexlify(sigBytes);
        }
      }
    } catch {}

    // LOCAL VERIFICATION: recover signer from the signature and compare
    try {
      const recovered = ethers.verifyMessage(
        ethers.getBytes(safeTxHash),
        senderSignature
      );
      logger.debug(
        `Safe proposal debug → fromAddress=${fromAddress}, recoveredSigner=${recovered}`
      );
      if (recovered.toLowerCase() !== fromAddress.toLowerCase()) {
        throw new Error(
          `Recovered signer ${recovered} does not match sender ${fromAddress}`
        );
      }
    } catch (e) {
      logger.error(
        `Local signer recovery failed: ${e instanceof Error ? e.message : e}`
      );
      throw new Error(
        `Local signer recovery failed: ${
          e instanceof Error ? e.message : String(e)
        }`
      );
    }

    try {
      const proposePayload = {
        ...safeTx,
        contractTransactionHash: safeTxHash,
        sender: ethers.getAddress(fromAddress),
        signature: signatureToSend,
        origin: "GigaID",
      } as any;
      const url = `${txServiceUrl}/api/v1/safes/${checksummedSafe}/multisig-transactions/`;
      logger.debug(`Propose URL: ${url}`);
      logger.debug(
        `Propose payload (short): { to: ${proposePayload.to}, value: ${proposePayload.value}, nonce: ${proposePayload.nonce} }`
      );
      await axios.post(url, proposePayload);
    } catch (e: any) {
      const details = e?.response?.data || e?.message || e;
      logger.error(`Safe proposal rejected: ${JSON.stringify(details)}`);
      throw new Error(
        `Safe proposal failed: ${
          typeof details === "string" ? details : JSON.stringify(details)
        }`
      );
    }

    logger.blockchain(`✅ Proposed Safe transaction: ${safeTxHash}`);
    return { safeTxHash: safeTxHash, safeAddress: checksummedSafe };
  }

  /**
   * Get transaction status
   */
  async getTransactionStatus(
    txHash: string
  ): Promise<TransactionResult | null> {
    try {
      const tx = await this.provider.getTransaction(txHash);
      const receipt = await this.provider.getTransactionReceipt(txHash);

      if (!tx) return null;

      return {
        hash: tx.hash,
        from: tx.from,
        to: tx.to || "",
        amount: ethers.formatEther(tx.value),
        gasUsed: receipt?.gasUsed.toString(),
        status: receipt
          ? receipt.status === 1
            ? "confirmed"
            : "failed"
          : "pending",
        blockNumber: receipt?.blockNumber,
        confirmations: receipt
          ? (await this.provider.getBlockNumber()) - receipt.blockNumber
          : 0,
      };
    } catch (error) {
      logger.error("Error getting transaction status:", error);
      return null;
    }
  }

  /**
   * Propose Safe transaction as delegate (not as owner)
   * This function allows delegates to propose transactions to the Safe
   */
  async proposeSafeTransactionAsDelegate(
    userId: string,
    request: TransactionRequest
  ): Promise<{
    safeTxHash: string;
    safeAddress: string;
    delegateAddress: string;
  }> {
    // Get user details
    const user = await this.userRepository.findOne({
      where: { id: userId },
    });

    if (!user) {
      throw new Error("User not found");
    }

    // For delegate transactions, we need a Safe address to propose to
    // This can come from user's multisig configuration or be provided
    let safeAddress: string;

    if (user.isMultisigEnabled && user.multisigWalletId) {
      // User has multisig - get the Safe address
      const walletRepository =
        this.userRepository.manager.getRepository("MultisigWallet");
      const wallet = await walletRepository.findOne({
        where: { id: user.multisigWalletId },
      });

      if (!wallet) {
        throw new Error("Multisig wallet not found for user");
      }
      safeAddress = wallet.address;
    } else {
      throw new Error(
        "User must have multisig configuration to propose as delegate"
      );
    }

    // Determine the delegate address (signer)
    let delegateAddress: string;
    let signer: ethers.Wallet;

    if (
      request.overrideSignerPrivateKey &&
      request.overrideSignerPrivateKey.length > 0
    ) {
      // Use provided private key
      const pk = request.overrideSignerPrivateKey.startsWith("0x")
        ? request.overrideSignerPrivateKey
        : `0x${request.overrideSignerPrivateKey}`;

      if (!/^0x[0-9a-fA-F]{64}$/.test(pk)) {
        throw new Error("Invalid overrideSignerPrivateKey format");
      }

      signer = new ethers.Wallet(pk, this.provider);
      delegateAddress = await signer.getAddress();
    } else if (user.signerPrivateKey) {
      // Use user's stored EOA signer - need to decrypt it
      try {
        // Import MultisigWalletService for decryption
        const { MultisigWalletService } = await import("./multisig-wallet.js");
        // We need a dummy agent, but we only need the decryption method
        const dataSource = this.userRepository.manager.connection;
        const dummyAgent = {} as any; // We're only using decryption, so this is safe
        const multisigService = new MultisigWalletService(
          dummyAgent,
          dataSource as any
        );

        const decryptedKey = await multisigService.decryptSignerPrivateKey(
          user.signerPrivateKey
        );
        signer = new ethers.Wallet(decryptedKey, this.provider);
        delegateAddress = await signer.getAddress();

        logger.info(`Using decrypted user EOA as delegate: ${delegateAddress}`);
      } catch (decryptError) {
        logger.error(
          "Failed to decrypt user signer private key:",
          decryptError
        );
        throw new Error("Failed to decrypt user's signer private key");
      }
    } else {
      throw new Error(
        "No signer private key available for delegate transaction"
      );
    }

    logger.info(
      `Proposing Safe transaction as delegate: ${delegateAddress} -> Safe: ${safeAddress}`
    );

    // Get Safe info from Safe Transaction Service
    const serviceUrl = this.getSafeTransactionServiceUrl();
    const checksummedSafe = ethers.getAddress(safeAddress);

    const infoResp = await axios.get(
      `${serviceUrl}/api/v1/safes/${checksummedSafe}`
    );
    const safeInfo = infoResp.data as { nonce: number; threshold: number };
    const nonce: number = Number(safeInfo?.nonce ?? 0);

    // Build Safe transaction data
    const toChecksummed = ethers.getAddress(request.to);
    const valueWei = ethers.parseEther(request.amount).toString();

    const safeTx = {
      to: toChecksummed,
      value: valueWei,
      data: "0x",
      operation: 0, // CALL operation
      safeTxGas: 0,
      baseGas: 0,
      gasPrice: 0,
      gasToken: "0x0000000000000000000000000000000000000000",
      refundReceiver: "0x0000000000000000000000000000000000000000",
      nonce,
    };

    // Calculate Safe transaction hash (for delegate signature)
    const domain = {
      chainId: this.getChainId(),
      verifyingContract: checksummedSafe,
    };

    const types = {
      SafeTx: [
        { name: "to", type: "address" },
        { name: "value", type: "uint256" },
        { name: "data", type: "bytes" },
        { name: "operation", type: "uint8" },
        { name: "safeTxGas", type: "uint256" },
        { name: "baseGas", type: "uint256" },
        { name: "gasPrice", type: "uint256" },
        { name: "gasToken", type: "address" },
        { name: "refundReceiver", type: "address" },
        { name: "nonce", type: "uint256" },
      ],
    };

    // Sign the transaction as delegate
    const signature = await signer.signTypedData(domain, types, safeTx);

    // Prepare payload for Safe Transaction Service
    const payload = {
      to: safeTx.to,
      value: safeTx.value,
      data: safeTx.data,
      operation: safeTx.operation,
      safeTxGas: safeTx.safeTxGas,
      baseGas: safeTx.baseGas,
      gasPrice: safeTx.gasPrice,
      gasToken: safeTx.gasToken,
      refundReceiver: safeTx.refundReceiver,
      nonce: safeTx.nonce,
      contractTransactionHash: ethers.TypedDataEncoder.hash(
        domain,
        types,
        safeTx
      ),
      sender: delegateAddress,
      signature,
      origin: "GigaID-Delegate",
    };

    // Submit to Safe Transaction Service
    const response = await axios.post(
      `${serviceUrl}/api/v1/safes/${checksummedSafe}/multisig-transactions/`,
      payload,
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    const safeTxHash =
      response.data.safeTxHash || payload.contractTransactionHash;

    logger.info(
      `Safe transaction proposed as delegate successfully. Hash: ${safeTxHash}`
    );

    return {
      safeTxHash,
      safeAddress: checksummedSafe,
      delegateAddress,
    };
  }

  /**
   * Helper function to get Safe Transaction Service URL
   */
  private getSafeTransactionServiceUrl(): string {
    switch (env.ETH_NETWORK) {
      case "mainnet":
        return "https://safe-transaction-mainnet.safe.global";
      case "sepolia":
        return "https://safe-transaction-sepolia.safe.global";
      case "base":
        return "https://safe-transaction-base.safe.global";
      case "base-sepolia":
        return "https://safe-transaction-base-sepolia.safe.global";
      default:
        return "https://safe-transaction-sepolia.safe.global";
    }
  }

  /**
   * Helper function to get chain ID
   */
  private getChainId(): number {
    switch (env.ETH_NETWORK) {
      case "mainnet":
        return 1;
      case "sepolia":
        return 11155111;
      case "base":
        return 8453;
      case "base-sepolia":
        return 84532;
      default:
        return 11155111;
    }
  }
}
