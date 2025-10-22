import { Request, Response } from "express";
import { z } from "zod";
import { UserService } from "../services/user.js";
import {
  TransactionService,
  TransactionRequest,
} from "../services/transaction.js";
import { logger } from "../utils/logger.js";
import { env } from "../config/env.js";
import { UserRole } from "../models/user.js";
import {
  ethereumAddressSchema,
  ethereumPrivateKeySchema,
  ethAmountSchema,
  gasLimitSchema,
  gasPriceSchema,
} from "../validation/validators.js";

// NOTE: This controller was simplified for Azure AD migration.
// All legacy WebAuthn/JWT/DID/credential endpoints were removed.

const sendTransactionSchema = z.object({
  to: ethereumAddressSchema,
  amount: ethAmountSchema,
  gasLimit: gasLimitSchema,
  gasPrice: gasPriceSchema,
});

const proposeTransactionSchema = z.object({
  to: ethereumAddressSchema,
  amount: ethAmountSchema,
  gasLimit: gasLimitSchema,
  gasPrice: gasPriceSchema,
  overrideSignerPrivateKey: ethereumPrivateKeySchema.optional(),
  useServerSecretAsSigner: z.boolean().optional(),
});

export class AuthController {
  private userService: UserService;
  private transactionService?: TransactionService;

  constructor(
    userService: UserService,
    _jwt?: any,
    transactionService?: TransactionService
  ) {
    this.userService = userService;
    this.transactionService = transactionService;
  }

  // Azure: logout is client-driven. Kept for compatibility.
  logout = async (_req: Request, res: Response) => {
    res.json({ message: "Logged out" });
  };

  getAuthMethods = async (_req: Request, res: Response) => {
    res.json({ success: true, data: { authMethod: "azure-ad" } });
  };

  getUserBalance = async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user?.id as string | undefined;
      if (!userId) {
        return res
          .status(401)
          .json({ error: "Unauthorized", message: "User not logged in" });
      }
      if (!this.transactionService) {
        return res.status(503).json({
          error: "Service unavailable",
          message: "Transaction service not initialized",
        });
      }

      logger.debug(`Getting balance for user ID: ${userId}`);
      const balance = await this.transactionService.getUserBalance(userId);
      const address = await this.transactionService.getUserEthereumAddress(
        userId
      );

      res.json({
        success: true,
        data: {
          balance,
          address,
          network: process.env.ETH_NETWORK || "sepolia",
        },
      });
    } catch (error) {
      logger.error("Error getting user balance:", error);
      res.status(500).json({
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  sendTransaction = async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user?.id as string | undefined;
      if (!userId) {
        return res
          .status(401)
          .json({ error: "Unauthorized", message: "User not logged in" });
      }
      if (!this.transactionService) {
        return res.status(503).json({
          error: "Service unavailable",
          message: "Transaction service not initialized",
        });
      }

      // --- PERMISSION CHECK ---
      const user = await this.userService.getUserById(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      const isAdmin = user.organizationRole === UserRole.ADMIN;
      if (!isAdmin) {
        return res.status(403).json({
          error: "Forbidden",
          message: "Only admin users can send ETH.",
        });
      }
      // --- END PERMISSION CHECK ---

      const validationResult = sendTransactionSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({
          error: "Invalid input",
          details: validationResult.error.errors,
        });
      }

      const parsed = validationResult.data as any;
      let transactionRequest: TransactionRequest = {
        to: parsed.to,
        amount: parsed.amount,
        gasLimit: parsed.gasLimit,
        gasPrice: parsed.gasPrice,
        overrideSignerPrivateKey: parsed.overrideSignerPrivateKey,
      };

      if (parsed.useServerSecretAsSigner === true) {
        const raw = env.SECRET_KEY || process.env.SECRET_KEY || "";
        const pk = raw.startsWith("0x") ? raw : `0x${raw}`;
        if (!/^0x[0-9a-fA-F]{64}$/.test(pk)) {
          return res.status(400).json({
            error: "Invalid server signer configuration",
            message:
              "SECRET_KEY must be a 64-hex private key if useServerSecretAsSigner is true",
          });
        }
        transactionRequest.overrideSignerPrivateKey = pk;
      }

      logger.debug(
        `Processing transaction for user ID: ${userId}`,
        transactionRequest
      );
      const amount = parseFloat(transactionRequest.amount);
      if (amount > 0.1) {
        logger.warn(`Large transaction attempted: ${amount} ETH`);
      }

      const result = await this.transactionService.sendTransaction(
        userId,
        transactionRequest
      );
      res.json({ success: true, data: result });
    } catch (error) {
      logger.error("Error sending transaction:", error);
      res.status(500).json({
        error: "Transaction failed",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  proposeSafeTransaction = async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user?.id as string | undefined;
      if (!userId) {
        return res
          .status(401)
          .json({ error: "Unauthorized", message: "User not logged in" });
      }
      if (!this.transactionService) {
        return res.status(503).json({
          error: "Service unavailable",
          message: "Transaction service not initialized",
        });
      }

      const validationResult = proposeTransactionSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({
          error: "Invalid input",
          details: validationResult.error.errors,
        });
      }

      const transactionRequest: TransactionRequest = validationResult.data;
      const result = await this.transactionService.proposeSafeTransaction(
        userId,
        transactionRequest
      );
      return res.json({ success: true, data: result });
    } catch (error) {
      logger.error("Error proposing Safe transaction:", error);
      return res.status(500).json({
        error: "Safe transaction proposal failed",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  proposeSafeTransactionAsDelegate = async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user?.id as string | undefined;
      if (!userId) {
        return res
          .status(401)
          .json({ error: "Unauthorized", message: "User not logged in" });
      }
      if (!this.transactionService) {
        return res.status(503).json({
          error: "Service unavailable",
          message: "Transaction service not initialized",
        });
      }

      const validationResult = proposeTransactionSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({
          error: "Invalid input",
          details: validationResult.error.errors,
        });
      }

      const transactionRequest: TransactionRequest = validationResult.data;
      const result =
        await this.transactionService.proposeSafeTransactionAsDelegate(
          userId,
          transactionRequest
        );

      return res.json({
        success: true,
        data: result,
        message: "Safe transaction proposed as delegate successfully",
      });
    } catch (error) {
      logger.error("Error proposing Safe transaction as delegate:", error);
      return res.status(500).json({
        error: "Safe transaction proposal failed",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  getTransactionStatus = async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user?.id as string | undefined;
      const { txHash } = req.params;
      if (!userId) {
        return res
          .status(401)
          .json({ error: "Unauthorized", message: "User not logged in" });
      }
      if (!this.transactionService) {
        return res.status(503).json({
          error: "Service unavailable",
          message: "Transaction service not initialized",
        });
      }
      if (!txHash) {
        return res.status(400).json({ error: "Missing transaction hash" });
      }
      logger.debug(`Getting transaction status for hash: ${txHash}`);
      const status = await this.transactionService.getTransactionStatus(txHash);
      if (!status) {
        return res.status(404).json({ error: "Transaction not found" });
      }
      res.json({ success: true, data: status });
    } catch (error) {
      logger.error("Error getting transaction status:", error);
      res.status(500).json({
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };
}
