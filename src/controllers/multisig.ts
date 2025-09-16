import { Request, Response } from "express";
import { DataSource } from "typeorm";
import { ConfiguredAgent } from "../agent/setup.js";
import {
  MultisigWalletService,
  MultisigType,
} from "../services/multisig-wallet.js";
import { UserService } from "../services/user.js";
import { JWTService } from "../services/jwt.js";
import { z } from "zod";
import { logger } from "../utils/logger.js";
import axios from "axios";
import { env } from "../config/env.js";
import { ethers } from "ethers";
import {
  ethereumAddressSchema,
  ethereumPrivateKeySchema,
  isValidEthereumAddress,
} from "../validation/validators.js";

// Validation schemas
const createMultisigWalletSchema = z.object({
  address: z
    .string()
    .length(42)
    .regex(/^0x[a-fA-F0-9]{40}$/),
  type: z.enum(["gnosis_safe", "custom", "ethereum_multisig"]).optional(),
  owners: z
    .array(
      z
        .string()
        .length(42)
        .regex(/^0x[a-fA-F0-9]{40}$/)
    )
    .min(1),
  threshold: z.number().min(1),
  network: z.string().optional(),
  metadata: z.record(z.any()).optional(),
});

const associateUserSchema = z.object({
  multisigWalletAddress: z
    .string()
    .length(42)
    .regex(/^0x[a-fA-F0-9]{40}$/),
  generateSigner: z.boolean().optional().default(true),
  signerPrivateKey: z.string().optional(),
});

const updateDIDControllerSchema = z.object({
  multisigWalletAddress: z
    .string()
    .length(42)
    .regex(/^0x[a-fA-F0-9]{40}$/),
});

export class MultisigController {
  private multisigService: MultisigWalletService;
  private userService: UserService;
  private dataSource: DataSource;

  constructor(agent: ConfiguredAgent, dataSource: DataSource) {
    this.multisigService = new MultisigWalletService(agent, dataSource);
    this.userService = new UserService(dataSource, agent);
    this.dataSource = dataSource;
  }

  /**
   * Create/Register a new multisig wallet
   */
  createMultisigWallet = async (req: Request, res: Response) => {
    try {
      // Check JWT authentication
      const authHeader = req.headers.authorization;
      const token = JWTService.extractTokenFromHeader(authHeader);

      if (!token) {
        return res.status(401).json({
          error: "Authentication required",
          message: "JWT token is required",
        });
      }

      const payload = JWTService.verifyToken(token);

      // Validate request body
      const validationResult = createMultisigWalletSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({
          error: "Invalid input",
          details: validationResult.error.errors,
        });
      }

      const data = validationResult.data;

      // Create multisig wallet
      const wallet = await this.multisigService.createMultisigWallet({
        address: data.address,
        type: (data.type as MultisigType) || MultisigType.GNOSIS_SAFE,
        owners: data.owners,
        threshold: data.threshold,
        network: data.network,
        metadata: data.metadata,
      });

      res.status(201).json({
        success: true,
        message: "Multisig wallet created successfully",
        data: {
          id: wallet.id,
          address: wallet.address,
          type: wallet.type,
          owners: JSON.parse(wallet.owners),
          threshold: wallet.threshold,
          network: wallet.network,
          isActive: wallet.isActive,
          createdAt: wallet.createdAt,
        },
      });
    } catch (error) {
      logger.error("Error creating multisig wallet:", error);
      res.status(500).json({
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  /**
   * Associate current user with a multisig wallet
   */
  associateWithMultisig = async (req: Request, res: Response) => {
    try {
      // Check JWT authentication
      const authHeader = req.headers.authorization;
      const token = JWTService.extractTokenFromHeader(authHeader);

      if (!token) {
        return res.status(401).json({
          error: "Authentication required",
          message: "JWT token is required",
        });
      }

      const payload = JWTService.verifyToken(token);
      const userId = (payload as any).userId || (payload as any).id;

      // Validate request body
      const validationResult = associateUserSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({
          error: "Invalid input",
          details: validationResult.error.errors,
        });
      }

      const data = validationResult.data;

      // Check if multisig wallet exists
      const wallet = await this.multisigService.getMultisigWalletByAddress(
        data.multisigWalletAddress
      );

      if (!wallet) {
        return res.status(404).json({
          error: "Multisig wallet not found",
          message: "Please register the multisig wallet first",
        });
      }

      // Associate user with multisig
      const updatedUser = await this.multisigService.associateUserWithMultisig({
        userId,
        multisigWalletId: wallet.id,
        generateSigner: data.generateSigner,
        signerPrivateKey: data.signerPrivateKey,
      });

      res.json({
        success: true,
        message: "User associated with multisig wallet successfully",
        data: {
          userId: updatedUser.id,
          username: updatedUser.username,
          multisigWalletAddress: wallet.address,
          signerAddress: updatedUser.signerAddress,
          isMultisigEnabled: updatedUser.isMultisigEnabled,
        },
      });
    } catch (error) {
      logger.error("Error associating user with multisig:", error);
      res.status(500).json({
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  /**
   * Update DID controller to use multisig wallet
   */
  updateDIDController = async (req: Request, res: Response) => {
    try {
      // Check JWT authentication
      const authHeader = req.headers.authorization;
      const token = JWTService.extractTokenFromHeader(authHeader);

      if (!token) {
        return res.status(401).json({
          error: "Authentication required",
          message: "JWT token is required",
        });
      }

      const payload = JWTService.verifyToken(token);
      const userId = payload.userId;

      // Validate request body
      const validationResult = updateDIDControllerSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({
          error: "Invalid input",
          details: validationResult.error.errors,
        });
      }

      const data = validationResult.data;

      // Update DID controller
      await this.multisigService.updateDIDController(
        userId,
        data.multisigWalletAddress
      );

      res.json({
        success: true,
        message: "DID controller update transaction created",
        note: "This operation requires multisig approval to complete",
      });
    } catch (error) {
      logger.error("Error updating DID controller:", error);
      res.status(500).json({
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  /**
   * Get user's multisig configuration
   */
  getUserMultisigConfig = async (req: Request, res: Response) => {
    try {
      // Check JWT authentication
      const authHeader = req.headers.authorization;
      const token = JWTService.extractTokenFromHeader(authHeader);

      if (!token) {
        return res.status(401).json({
          error: "Authentication required",
          message: "JWT token is required",
        });
      }

      const payload = JWTService.verifyToken(token);
      const userId = payload.userId;

      // Get user's multisig configuration
      const config = await this.multisigService.getUserMultisigConfig(userId);

      res.json({
        success: true,
        data: {
          user: {
            id: config.user.id,
            username: config.user.username,
            did: config.user.did,
            isMultisigEnabled: config.isEnabled,
            signerAddress: config.signerAddress,
          },
          multisigWallet: config.wallet
            ? {
                id: config.wallet.id,
                address: config.wallet.address,
                type: config.wallet.type,
                owners: JSON.parse(config.wallet.owners),
                threshold: config.wallet.threshold,
                network: config.wallet.network,
                isActive: config.wallet.isActive,
              }
            : null,
        },
      });
    } catch (error) {
      logger.error("Error getting user multisig config:", error);
      res.status(500).json({
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  /**
   * Get pending multisig transactions for user's wallet
   */
  getPendingTransactions = async (req: Request, res: Response) => {
    try {
      // Check JWT authentication
      const authHeader = req.headers.authorization;
      const token = JWTService.extractTokenFromHeader(authHeader);

      if (!token) {
        return res.status(401).json({
          error: "Authentication required",
          message: "JWT token is required",
        });
      }

      const payload = JWTService.verifyToken(token);
      const userId = payload.userId;

      // Get user's multisig configuration
      const config = await this.multisigService.getUserMultisigConfig(userId);

      if (!config.wallet) {
        return res.status(404).json({
          error: "No multisig wallet found",
          message: "User is not associated with any multisig wallet",
        });
      }

      // Get pending transactions
      const transactions = await this.multisigService.getPendingTransactions(
        config.wallet.id
      );

      res.json({
        success: true,
        data: {
          multisigWalletAddress: config.wallet.address,
          pendingTransactions: await Promise.all(
            transactions.map(async (tx) => {
              // Load initiator if available
              let initiator = null;
              if (tx.initiatorUserId) {
                const initiatorUser = await this.dataSource
                  .getRepository("User")
                  .findOne({
                    where: { id: tx.initiatorUserId },
                  });
                if (initiatorUser) {
                  initiator = {
                    id: (initiatorUser as any).id,
                    username: (initiatorUser as any).username,
                  };
                }
              }

              return {
                id: tx.id,
                transactionType: tx.transactionType,
                transactionData: JSON.parse(tx.transactionData),
                status: tx.status,
                requiredSignatures: tx.requiredSignatures,
                signatures: tx.signatures ? JSON.parse(tx.signatures) : [],
                initiator,
                createdAt: tx.createdAt,
              };
            })
          ),
        },
      });
    } catch (error) {
      logger.error("Error getting pending transactions:", error);
      res.status(500).json({
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  /**
   * Get multisig wallet by address
   */
  getMultisigWallet = async (req: Request, res: Response) => {
    try {
      // Check JWT authentication
      const authHeader = req.headers.authorization;
      const token = JWTService.extractTokenFromHeader(authHeader);

      if (!token) {
        return res.status(401).json({
          error: "Authentication required",
          message: "JWT token is required",
        });
      }

      const { address } = req.params;

      if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
        return res.status(400).json({
          error: "Invalid address",
          message: "Please provide a valid Ethereum address",
        });
      }

      const wallet = await this.multisigService.getMultisigWalletByAddress(
        address
      );

      if (!wallet) {
        return res.status(404).json({
          error: "Multisig wallet not found",
        });
      }

      res.json({
        success: true,
        data: {
          id: wallet.id,
          address: wallet.address,
          type: wallet.type,
          owners: JSON.parse(wallet.owners),
          threshold: wallet.threshold,
          network: wallet.network,
          isActive: wallet.isActive,
          userCount: await this.dataSource.getRepository("User").count({
            where: { multisigWalletId: wallet.id },
          }),
          createdAt: wallet.createdAt,
          updatedAt: wallet.updatedAt,
        },
      });
    } catch (error) {
      logger.error("Error getting multisig wallet:", error);
      res.status(500).json({
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  /**
   * Disable multisig for current user (emergency function)
   */
  disableMultisig = async (req: Request, res: Response) => {
    try {
      // Check JWT authentication
      const authHeader = req.headers.authorization;
      const token = JWTService.extractTokenFromHeader(authHeader);

      if (!token) {
        return res.status(401).json({
          error: "Authentication required",
          message: "JWT token is required",
        });
      }

      const payload = JWTService.verifyToken(token);
      const userId = payload.userId;

      // Disable multisig for user
      const updatedUser = await this.multisigService.disableMultisigForUser(
        userId
      );

      res.json({
        success: true,
        message: "Multisig disabled for user",
        data: {
          userId: updatedUser.id,
          username: updatedUser.username,
          isMultisigEnabled: updatedUser.isMultisigEnabled,
        },
      });
    } catch (error) {
      logger.error("Error disabling multisig:", error);
      res.status(500).json({
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  /**
   * Debug endpoint: verify stored signer vs decrypted signer and Safe owners
   */
  debugSigner = async (req: Request, res: Response) => {
    try {
      const authHeader = req.headers.authorization;
      const token = JWTService.extractTokenFromHeader(authHeader);
      if (!token) {
        return res.status(401).json({ error: "Authentication required" });
      }
      const payload = JWTService.verifyToken(token);
      const userId = payload.userId;

      // Load user minimal fields
      const user = await this.userService.getUserById(userId);
      if (!user) return res.status(404).json({ error: "User not found" });

      // Compute decrypted signer address if possible
      let decryptedSignerAddress: string | null = null;
      if (user.signerPrivateKey) {
        try {
          const priv = await this.multisigService.decryptSignerPrivateKey(
            user.signerPrivateKey
          );
          decryptedSignerAddress = new ethers.Wallet(priv).address;
        } catch {
          decryptedSignerAddress = null;
        }
      }

      // Fetch Safe owners if wallet is linked
      let safeOwners: string[] | null = null;
      let safeAddress: string | null = null;
      if (user.multisigWalletId) {
        const walletRepo = this.dataSource.getRepository("MultisigWallet");
        const wallet: any = await walletRepo.findOne({
          where: { id: user.multisigWalletId },
        });
        if (wallet?.address) {
          safeAddress = wallet.address;
          const txServiceUrl =
            env.ETH_NETWORK === "sepolia"
              ? "https://safe-transaction-sepolia.safe.global"
              : "https://safe-transaction-mainnet.safe.global";
          try {
            const info = await axios.get(
              `${txServiceUrl}/api/v1/safes/${wallet.address}`
            );
            if (info.data?.owners) safeOwners = info.data.owners;
          } catch (e) {
            // ignore fetch issues
          }
        }
      }

      return res.json({
        success: true,
        data: {
          userId: user.id,
          did: user.did,
          storedSignerAddress: user.signerAddress || null,
          decryptedSignerAddress,
          matches:
            !!user.signerAddress &&
            !!decryptedSignerAddress &&
            user.signerAddress.toLowerCase() ===
              decryptedSignerAddress.toLowerCase(),
          safeAddress,
          safeOwners,
        },
      });
    } catch (error) {
      logger.error("Debug signer error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  };
}
