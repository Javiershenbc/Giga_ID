import { Request, Response } from "express";
import { UserService } from "../services/user.js";
import { WebAuthnService } from "../services/webauthn.js";
import {
  TransactionService,
  TransactionRequest,
} from "../services/transaction.js";
import { JWTService } from "../services/jwt.js";
import { AuthMethod } from "../models/user.js";
import { z } from "zod";
import session from "express-session";
// Removed hierarchy imports
import { isoBase64URL } from "@simplewebauthn/server/helpers";
import { logger } from "../utils/logger.js";
import { env } from "../config/env.js";
import {
  ethereumAddressSchema,
  ethereumPrivateKeySchema,
  ethAmountSchema,
  gasLimitSchema,
  gasPriceSchema,
  usernameSchema,
  emailSchema,
  displayNameSchema,
  passwordSchema,
} from "../validation/validators.js";

// Extend Express Request type to include session
declare module "express-session" {
  interface SessionData {
    registrationChallenge?: string;
    userId?: string;
    authenticationChallenge?: string;
    authenticated?: boolean;
    challenge?: string;
    challengeUserId?: string;
    username?: string;
    isLoggedIn?: boolean;
  }
}

// Validation schemas
const startRegistrationSchema = z.object({
  username: usernameSchema,
  email: emailSchema,
  displayName: displayNameSchema,
});

const completeRegistrationSchema = z.object({
  userId: z.string().uuid(),
  registrationResponse: z.object({
    id: z.string(),
    rawId: z.string(),
    response: z.object({
      clientDataJSON: z.string(),
      attestationObject: z.string(),
    }),
    type: z.literal("public-key"),
    clientExtensionResults: z.record(z.unknown()),
  }),
});

const startAuthenticationSchema = z.object({
  username: usernameSchema,
});

const completeAuthenticationSchema = z.object({
  userId: z.string().uuid(),
  authenticationResponse: z.object({
    id: z.string(),
    rawId: z.string(),
    response: z.object({
      clientDataJSON: z.string(),
      authenticatorData: z.string(),
      signature: z.string(),
      userHandle: z.string().optional(),
    }),
    type: z.literal("public-key"),
    clientExtensionResults: z.record(z.unknown()),
  }),
});

const sendTransactionSchema = z.object({
  to: ethereumAddressSchema,
  amount: ethAmountSchema,
  gasLimit: gasLimitSchema,
  gasPrice: gasPriceSchema,
});

// Propose Safe transaction schema (allows optional one-off signer override)
const proposeTransactionSchema = z.object({
  to: ethereumAddressSchema,
  amount: ethAmountSchema,
  gasLimit: gasLimitSchema,
  gasPrice: gasPriceSchema,
  overrideSignerPrivateKey: ethereumPrivateKeySchema.optional(),
  useServerSecretAsSigner: z.boolean().optional(),
});

// API registration schema for third-party integration
const apiRegistrationSchema = z.object({
  username: usernameSchema,
  email: emailSchema,
  displayName: displayNameSchema,
  password: passwordSchema,
  timestamp: z.number().int().positive(),
});

// Unified auth schemas
const unifiedRegistrationSchema = z.object({
  username: usernameSchema,
  email: emailSchema,
  displayName: displayNameSchema,
  method: z.enum(["webauthn", "password", "hybrid"]),
  password: passwordSchema.optional(),
});

const unifiedLoginSchema = z.object({
  username: usernameSchema,
  method: z.enum(["webauthn", "password"]),
  password: passwordSchema.optional(),
  authenticationResponse: z.any().optional(), // WebAuthn response
});

export class AuthController {
  private userService: UserService;
  private webAuthnService: WebAuthnService;
  private transactionService?: TransactionService;
  private jwtService: JWTService;

  constructor(
    userService: UserService,
    jwtService: JWTService = new JWTService(),
    transactionService?: TransactionService
  ) {
    this.userService = userService;
    this.webAuthnService = new WebAuthnService();
    this.transactionService = transactionService;
    this.jwtService = jwtService;
  }

  async startRegistration(req: Request, res: Response): Promise<void> {
    try {
      const { username, email, displayName } = startRegistrationSchema.parse(
        req.body
      );

      const { user, registrationOptions } = await this.userService.registerUser(
        {
          username,
          email,
          displayName,
        }
      );

      // Store the user ID in the session
      req.session.userId = user.id;

      logger.debug("Challenge type:", typeof registrationOptions.challenge);
      logger.debug("Challenge value:", registrationOptions.challenge);

      res.json({
        user: {
          id: user.id,
          username: user.username,
          displayName: user.displayName,
        },
        registrationOptions,
      });
    } catch (error) {
      logger.error("Error starting registration:", error);
      if (error instanceof z.ZodError) {
        res.status(400).json({
          error: "Invalid input",
          details: error.errors,
        });
        return;
      }

      if (
        error instanceof Error &&
        error.message === "Username already exists"
      ) {
        res.status(409).json({
          error: "Username already exists",
        });
        return;
      }

      res.status(500).json({
        error: "Internal server error",
      });
    }
  }

  async completeRegistration(req: Request, res: Response): Promise<void> {
    try {
      // The request body now contains the WebAuthn response directly
      const registrationResponse = req.body;

      // Get the user ID from the session
      const userId = req.session.userId;

      if (!userId) {
        res.status(400).json({
          error: "No user ID found in session",
        });
        return;
      }

      logger.debug("Completing registration for user:", userId);
      logger.debug(
        "Registration response keys:",
        Object.keys(registrationResponse)
      );

      const user = await this.userService.completeRegistration(
        userId,
        registrationResponse
      );

      res.json({
        user: {
          id: user.id,
          username: user.username,
          displayName: user.displayName,
          did: user.did,
        },
      });
    } catch (error) {
      logger.error("Complete registration error:", error);
      res.status(500).json({
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  startAuthentication = async (req: Request, res: Response) => {
    try {
      const { username } = req.body;

      if (!username) {
        return res.status(400).json({
          error: "Missing username",
          message: "Username is required",
        });
      }

      // Get the user by username
      const user = await this.userService.getUserByUsername(username);
      if (!user) {
        return res.status(404).json({
          error: "User not found",
          message: "No user with this username exists",
        });
      }

      logger.debug(
        `Starting authentication for user: ${username} (${user.id})`
      );

      // Get credentials for this user
      const credentials = await this.userService.getDecryptedCredentials(
        user.id
      );

      if (credentials.length === 0) {
        logger.error(
          `No credentials found for user ${user.username} (${user.id})`
        );
        logger.error(`Raw credentials data: ${user.credentials}`);

        // Check if another user with same username exists (potential duplicate)
        const allUsers = await this.userService.getAllUsers();
        const sameUsernameUsers = allUsers.filter(
          (u) => u.username === username
        );

        if (sameUsernameUsers.length > 1) {
          logger.error(
            `DUPLICATE USERS FOUND: ${sameUsernameUsers.length} users with username ${username}`
          );
          sameUsernameUsers.forEach((u) => {
            logger.error(
              `  User ID: ${u.id}, Has credentials: ${
                u.credentials ? "Yes" : "No"
              }`
            );
          });

          // Try to use the user with credentials
          const userWithCredentials = sameUsernameUsers.find(
            (u) =>
              u.credentials &&
              u.credentials !== "[]" &&
              u.credentials.length > 2
          );

          if (userWithCredentials) {
            logger.debug(
              `Found alternative user record with credentials: ${userWithCredentials.id}`
            );
            const alternativeCredentials =
              await this.userService.getDecryptedCredentials(
                userWithCredentials.id
              );

            if (alternativeCredentials.length > 0) {
              logger.debug(
                `Using ${alternativeCredentials.length} credentials from alternative user record`
              );

              // Generate authentication options with these credentials
              const authenticationOptions =
                await this.webAuthnService.generateAuthenticationOptions(
                  alternativeCredentials
                );

              // Store the challenge in the session
              req.session.challenge = authenticationOptions.challenge;
              req.session.challengeUserId = userWithCredentials.id;

              await new Promise<void>((resolve, reject) => {
                req.session.save((err) => {
                  if (err) {
                    logger.error("Error saving session:", err);
                    reject(err);
                  } else {
                    resolve();
                  }
                });
              });

              logger.debug(
                `Created challenge for authentication using alternative user record`
              );

              return res.json({
                success: true,
                authenticationOptions,
              });
            }
          }
        }

        return res.status(400).json({
          error: "No credentials",
          message: "No credentials found for this user. Please register again.",
        });
      }

      logger.debug(
        `Found ${credentials.length} credentials for user ${user.username}`
      );
      logger.debug(
        `Credential IDs: ${credentials.map((c) => c.id).join(", ")}`
      );

      // Generate authentication options
      const authenticationOptions =
        await this.webAuthnService.generateAuthenticationOptions(credentials);

      // Store the challenge in the session
      req.session.challenge = authenticationOptions.challenge;
      req.session.challengeUserId = user.id;

      // Save the session explicitly
      await new Promise<void>((resolve, reject) => {
        req.session.save((err) => {
          if (err) {
            logger.error("Error saving session:", err);
            reject(err);
          } else {
            resolve();
          }
        });
      });

      logger.debug(
        `Created challenge for authentication: ${authenticationOptions.challenge}`
      );
      logger.debug(
        `Session data: ${JSON.stringify({
          challenge: req.session.challenge,
          challengeUserId: req.session.challengeUserId,
        })}`
      );

      // Send authentication options to the client
      res.json({
        success: true,
        authenticationOptions,
      });
    } catch (error) {
      logger.error("Start authentication error:", error);
      res.status(500).json({
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  completeAuthentication = async (req: Request, res: Response) => {
    try {
      if (!req.body || typeof req.body !== "object") {
        return res.status(400).json({
          error: "Invalid input",
          message: "Request body is required",
        });
      }

      // Get the user ID from the challenge session
      const userId = req.session.challengeUserId;
      const user = userId ? await this.userService.getUserById(userId) : null;

      if (!userId || !user) {
        return res.status(401).json({
          error: "Authentication failed",
          message: "User session not found or expired",
        });
      }

      logger.debug(`Completing authentication for user ID: ${userId}`);
      logger.debug(
        "Authentication response:",
        JSON.stringify(req.body, null, 2)
      );

      // Get the user's credentials
      const credentials = await this.userService.getDecryptedCredentials(
        userId
      );
      logger.debug(
        `Found ${credentials.length} credentials for user ${user.username}`
      );

      if (credentials.length === 0) {
        return res.status(401).json({
          error: "Authentication failed",
          message: "No credentials found for this user",
        });
      }

      // Find the matching credential
      const credential = credentials.find((cred) => cred.id === req.body.id);

      if (!credential) {
        logger.error(
          `Credential with ID ${req.body.id} not found in user's credentials`
        );
        return res.status(401).json({
          error: "Authentication failed",
          message: "Credential not found",
        });
      }

      // Verify the authentication response
      const verification = await this.webAuthnService.verifyAuthentication(
        req.body,
        req.session.challenge || "",
        credential
      );

      // If verification fails, send an error
      if (!verification.verified) {
        return res.status(401).json({
          error: "Authentication failed",
          message: "WebAuthn verification failed",
        });
      }

      // On successful authentication, update the session with the user ID
      req.session.userId = user.id;
      req.session.username = user.username;
      req.session.isLoggedIn = true;

      // Clear the challenge data
      req.session.challenge = undefined;
      req.session.challengeUserId = undefined;

      // Save the session explicitly
      await new Promise<void>((resolve, reject) => {
        req.session.save((err) => {
          if (err) {
            logger.error("Error saving session:", err);
            reject(err);
          } else {
            resolve();
          }
        });
      });

      logger.debug(
        `User ${user.username} (${user.id}) authenticated successfully`
      );
      logger.debug(
        `Session data: ${JSON.stringify({
          userId: req.session.userId,
          username: req.session.username,
          isLoggedIn: req.session.isLoggedIn,
        })}`
      );

      res.json({
        success: true,
        username: user.username,
        displayName: user.displayName,
      });
    } catch (error) {
      logger.error("Error in login completion:", error);
      res.status(500).json({
        error: "Authentication error",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  logout = async (req: Request, res: Response) => {
    try {
      req.session.destroy((err) => {
        if (err) {
          logger.error("Error destroying session:", err);
          res.status(500).json({
            error: "Error logging out",
          });
          return;
        }

        res.json({
          message: "Logged out successfully",
        });
      });
    } catch (error) {
      logger.error("Error logging out:", error);
      res.status(500).json({
        error: "Internal server error",
      });
    }
  };

  /**
   * Get blockchain status
   */
  getBlockchainStatus = async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId;

      if (!userId) {
        return res
          .status(401)
          .json({ error: "Unauthorized", message: "User not logged in" });
      }

      logger.debug(`Getting blockchain status for user ID: ${userId}`);

      // Get user to check if they have a DID
      const user = await this.userService.getUserById(userId);

      if (!user) {
        logger.error(`User not found with ID: ${userId}`);
        return res.status(404).json({
          error: "User not found",
          message: "Cannot find user record",
        });
      }

      if (!user.did) {
        logger.error(`User ${user.username} (${userId}) has no DID`);
        return res.status(400).json({
          error: "No DID available",
          message: "User does not have a DID yet",
        });
      }

      // User has a DID, try to get blockchain details
      const blockchainDetails = await this.userService.getBlockchainDetails(
        userId
      );

      res.json({
        success: true,
        data: blockchainDetails,
      });
    } catch (error) {
      logger.error("Error getting blockchain status:", error);
      res.status(500).json({
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  /**
   * Get user's ETH balance
   */
  getUserBalance = async (req: Request, res: Response) => {
    try {
      // Check for JWT authentication first
      let userId: string | undefined;
      const authHeader = req.headers.authorization;
      const token = JWTService.extractTokenFromHeader(authHeader);

      if (token) {
        try {
          const payload = JWTService.verifyToken(token);
          userId = payload.userId;
        } catch (error) {
          return res.status(401).json({
            error: "Invalid or expired token",
            message:
              error instanceof Error ? error.message : "Authentication failed",
          });
        }
      } else {
        // Fallback to session authentication
        userId = req.session.userId;
      }

      if (!userId) {
        return res.status(401).json({
          error: "Unauthorized",
          message: "User not logged in or valid token required",
        });
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

  /**
   * Send ETH transaction
   */
  sendTransaction = async (req: Request, res: Response) => {
    try {
      // Check for JWT authentication first
      let userId: string | undefined;
      const authHeader = req.headers.authorization;
      const token = JWTService.extractTokenFromHeader(authHeader);

      if (token) {
        try {
          const payload = JWTService.verifyToken(token);
          userId = payload.userId;
        } catch (error) {
          return res.status(401).json({
            error: "Invalid or expired token",
            message:
              error instanceof Error ? error.message : "Authentication failed",
          });
        }
      } else {
        // Fallback to session authentication
        userId = req.session.userId;
      }

      if (!userId) {
        return res.status(401).json({
          error: "Unauthorized",
          message: "User not logged in or valid token required",
        });
      }

      if (!this.transactionService) {
        return res.status(503).json({
          error: "Service unavailable",
          message: "Transaction service not initialized",
        });
      }

      // Removed hierarchy-based permission checks; rely on authentication only

      // Validate request body
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

      // If requested, use server SECRET_KEY as signer private key
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

      // Additional security check - require re-authentication for large amounts
      const amount = parseFloat(transactionRequest.amount);
      if (amount > 0.1) {
        // More than 0.1 ETH
        // In a production system, you might want to require additional authentication
        logger.warn(`Large transaction attempted: ${amount} ETH`);
      }

      const result = await this.transactionService.sendTransaction(
        userId,
        transactionRequest
      );

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      logger.error("Error sending transaction:", error);
      res.status(500).json({
        error: "Transaction failed",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  /**
   * Propose Safe (Gnosis) ETH transaction for multisig-enabled users
   */
  proposeSafeTransaction = async (req: Request, res: Response) => {
    try {
      // Check for JWT authentication first
      let userId: string | undefined;
      const authHeader = req.headers.authorization;
      const token = JWTService.extractTokenFromHeader(authHeader);

      if (token) {
        try {
          const payload = JWTService.verifyToken(token);
          userId = payload.userId;
        } catch (error) {
          return res.status(401).json({
            error: "Invalid or expired token",
            message:
              error instanceof Error ? error.message : "Authentication failed",
          });
        }
      } else {
        userId = req.session.userId;
      }

      if (!userId) {
        return res.status(401).json({
          error: "Unauthorized",
          message: "User not logged in or valid token required",
        });
      }

      if (!this.transactionService) {
        return res.status(503).json({
          error: "Service unavailable",
          message: "Transaction service not initialized",
        });
      }

      // Validate request body (propose-specific schema)
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

      return res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      logger.error("Error proposing Safe transaction:", error);
      return res.status(500).json({
        error: "Safe transaction proposal failed",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  /**
   * Propose Safe transaction as delegate (not as owner)
   */
  proposeSafeTransactionAsDelegate = async (req: Request, res: Response) => {
    try {
      // Check for JWT authentication first
      let userId: string | undefined;
      const authHeader = req.headers.authorization;
      const token = JWTService.extractTokenFromHeader(authHeader);

      if (token) {
        try {
          const payload = JWTService.verifyToken(token);
          userId = payload.userId;
        } catch (error) {
          return res.status(401).json({
            error: "Invalid or expired token",
            message:
              error instanceof Error ? error.message : "Authentication failed",
          });
        }
      } else {
        userId = req.session.userId;
      }

      if (!userId) {
        return res.status(401).json({
          error: "Unauthorized",
          message: "User not logged in or valid token required",
        });
      }

      if (!this.transactionService) {
        return res.status(503).json({
          error: "Service unavailable",
          message: "Transaction service not initialized",
        });
      }

      // Validate request body
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

  /**
   * Get transaction status
   */
  getTransactionStatus = async (req: Request, res: Response) => {
    try {
      // Check for JWT authentication first
      let userId: string | undefined;
      const authHeader = req.headers.authorization;
      const token = JWTService.extractTokenFromHeader(authHeader);

      if (token) {
        try {
          const payload = JWTService.verifyToken(token);
          userId = payload.userId;
        } catch (error) {
          return res.status(401).json({
            error: "Invalid or expired token",
            message:
              error instanceof Error ? error.message : "Authentication failed",
          });
        }
      } else {
        // Fallback to session authentication
        userId = req.session.userId;
      }

      const { txHash } = req.params;

      if (!userId) {
        return res.status(401).json({
          error: "Unauthorized",
          message: "User not logged in or valid token required",
        });
      }

      if (!this.transactionService) {
        return res.status(503).json({
          error: "Service unavailable",
          message: "Transaction service not initialized",
        });
      }

      if (!txHash) {
        return res.status(400).json({
          error: "Missing transaction hash",
        });
      }

      logger.debug(`Getting transaction status for hash: ${txHash}`);

      const status = await this.transactionService.getTransactionStatus(txHash);

      if (!status) {
        return res.status(404).json({
          error: "Transaction not found",
        });
      }

      res.json({
        success: true,
        data: status,
      });
    } catch (error) {
      logger.error("Error getting transaction status:", error);
      res.status(500).json({
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  // New API registration method for third-party integration
  registerUserViaAPI = async (req: Request, res: Response) => {
    try {
      const registrationData = apiRegistrationSchema.parse(req.body);

      const user = await this.userService.registerUserViaAPI(registrationData);

      res.status(201).json({
        success: true,
        message: "User registered successfully via API",
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          displayName: user.displayName,
          did: user.did,
        },
      });
    } catch (error) {
      logger.error("API registration error:", error);

      if (error instanceof z.ZodError) {
        res.status(400).json({
          error: "Invalid input",
          details: error.errors,
        });
        return;
      }

      if (error instanceof Error) {
        if (error.message === "Email already exists") {
          res.status(409).json({
            error: "Email already exists",
          });
          return;
        }

        if (error.message === "Username already exists") {
          res.status(409).json({
            error: "Username already exists",
          });
          return;
        }

        if (error.message === "User with this email already exists") {
          res.status(409).json({
            error: "User with this email already exists",
          });
          return;
        }
      }

      res.status(500).json({
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  // Generate DID preview for third-party integration
  generateDidPreview = async (req: Request, res: Response) => {
    try {
      const { username } = req.body;

      if (!username) {
        return res.status(400).json({
          error: "Username is required",
        });
      }

      const preview = await this.userService.generateDidPreview(username);

      res.json({
        success: true,
        did: preview.did,
        ethereumAddress: preview.ethereumAddress,
        message: "Use this Ethereum address to sign your registration message",
      });
    } catch (error) {
      logger.error("DID preview generation error:", error);
      res.status(500).json({
        error: "Failed to generate DID preview",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  // ===== UNIFIED AUTH ENDPOINTS =====

  /**
   * Unified registration endpoint - supports password authentication
   * Creates DID via Veramo and Ethereum address
   */
  unifiedRegister = async (req: Request, res: Response) => {
    try {
      const { username, email, displayName, password, multisigWalletAddress } =
        req.body;

      // Validate required fields
      if (!username || !email || !displayName || !password) {
        return res.status(400).json({
          error: "Missing required fields",
          message: "username, email, displayName, and password are required",
        });
      }

      // Validate password strength
      if (password.length < 8) {
        return res.status(400).json({
          error: "Password too weak",
          message: "Password must be at least 8 characters long",
        });
      }

      // Validate multisig address if provided
      if (multisigWalletAddress) {
        const addressValidation = ethereumAddressSchema.safeParse(
          multisigWalletAddress
        );
        if (!addressValidation.success) {
          return res.status(400).json({
            error: "Invalid multisig address",
            message: "Multisig wallet address must be a valid Ethereum address",
          });
        }
      }

      // Register user with password authentication (and optional multisig)
      const user = await this.userService.registerUserWithPassword({
        username,
        email,
        displayName,
        password,
        authMethod: AuthMethod.PASSWORD,
        multisigWalletAddress, // Pass multisig address if provided
      });

      // Generate JWT tokens
      const token = JWTService.generateToken({
        userId: user.id,
        username: user.username,
        email: user.email,
        authMethod: user.authMethod,
      });

      const refreshToken = JWTService.generateRefreshToken({
        userId: user.id,
        username: user.username,
        email: user.email,
        authMethod: user.authMethod,
      });

      res.status(201).json({
        success: true,
        message: "User registered successfully",
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          displayName: user.displayName,
          did: user.did,
          authMethod: user.authMethod,
        },
        auth: {
          token,
          refreshToken,
          tokenType: "Bearer",
          expiresIn: "24h",
        },
      });
    } catch (error) {
      logger.error("Unified registration error:", error);
      res.status(500).json({
        error: "Registration failed",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  /**
   * Unified login endpoint - supports password authentication
   */
  unifiedLogin = async (req: Request, res: Response) => {
    try {
      const { username, password } = req.body;

      if (!username || !password) {
        return res.status(400).json({
          error: "Missing credentials",
          message: "Username and password are required",
        });
      }

      // Authenticate with password
      const user = await this.userService.authenticateWithPassword(
        username,
        password
      );

      if (!user) {
        return res.status(401).json({
          error: "Authentication failed",
          message: "Invalid username or password",
        });
      }

      // Generate JWT tokens
      const token = JWTService.generateToken({
        userId: user.id,
        username: user.username,
        email: user.email,
        authMethod: user.authMethod,
      });

      const refreshToken = JWTService.generateRefreshToken({
        userId: user.id,
        username: user.username,
        email: user.email,
        authMethod: user.authMethod,
      });

      res.json({
        success: true,
        message: "Login successful",
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          displayName: user.displayName,
          did: user.did,
          authMethod: user.authMethod,
        },
        auth: {
          token,
          refreshToken,
          tokenType: "Bearer",
          expiresIn: "24h",
        },
      });
    } catch (error) {
      logger.error("Unified login error:", error);
      res.status(500).json({
        error: "Login failed",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  /**
   * Refresh JWT token
   */
  refreshToken = async (req: Request, res: Response) => {
    try {
      const authHeader = req.headers.authorization;
      const token = JWTService.extractTokenFromHeader(authHeader);

      if (!token) {
        return res.status(401).json({
          error: "Token required",
          message: "Refresh token is required",
        });
      }

      const payload = JWTService.verifyToken(token);

      // Get fresh user data
      const user = await this.userService.getUserById(payload.userId);
      if (!user) {
        return res.status(404).json({
          error: "User not found",
        });
      }

      // Generate new tokens
      const newToken = JWTService.generateToken({
        userId: user.id,
        username: user.username,
        email: user.email,
        authMethod: user.authMethod,
      });

      const newRefreshToken = JWTService.generateRefreshToken({
        userId: user.id,
        username: user.username,
        email: user.email,
        authMethod: user.authMethod,
      });

      res.json({
        success: true,
        auth: {
          token: newToken,
          refreshToken: newRefreshToken,
          tokenType: "Bearer",
          expiresIn: "24h",
        },
      });
    } catch (error) {
      logger.error("Token refresh error:", error);
      res.status(401).json({
        error: "Token refresh failed",
        message:
          error instanceof Error ? error.message : "Invalid or expired token",
      });
    }
  };

  // ===== HYBRID AUTH ENHANCEMENT ENDPOINTS =====

  /**
   * Add WebAuthn to existing password-only or hybrid user
   */
  addWebAuthn = async (req: Request, res: Response) => {
    try {
      // Check for JWT authentication
      let userId: string | undefined;
      const authHeader = req.headers.authorization;
      const token = JWTService.extractTokenFromHeader(authHeader);

      if (token) {
        try {
          const payload = JWTService.verifyToken(token);
          userId = payload.userId;
        } catch (error) {
          return res.status(401).json({
            error: "Invalid or expired token",
            message:
              error instanceof Error ? error.message : "Authentication failed",
          });
        }
      } else {
        // Fallback to session authentication
        userId = req.session.userId;
      }

      if (!userId) {
        return res.status(401).json({
          error: "Authentication required",
          message: "Must be logged in to add WebAuthn",
        });
      }

      const user = await this.userService.getUserById(userId);
      if (!user) {
        return res.status(404).json({
          error: "User not found",
        });
      }

      // Check if user can add WebAuthn (for future implementation)
      // Currently only password auth is supported

      // Generate WebAuthn registration options
      const registrationOptions =
        await this.webAuthnService.generateRegistrationOptions(
          user.username,
          user.displayName
        );

      // Store challenge in session for completion
      req.session.userId = user.id;
      req.session.registrationChallenge = registrationOptions.challenge;

      res.json({
        success: true,
        message: "WebAuthn registration started",
        registrationOptions,
        requiresCompletion: true,
      });
    } catch (error) {
      logger.error("Add WebAuthn error:", error);
      res.status(500).json({
        error: "Failed to start WebAuthn registration",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  /**
   * Complete WebAuthn addition for hybrid users
   */
  completeWebAuthnAddition = async (req: Request, res: Response) => {
    try {
      const registrationResponse = req.body;
      const userId = req.session.userId;
      const challenge = req.session.registrationChallenge;

      if (!userId || !challenge) {
        return res.status(400).json({
          error: "Invalid session",
          message: "No active WebAuthn registration session found",
        });
      }

      const user = await this.userService.getUserById(userId);
      if (!user) {
        return res.status(404).json({
          error: "User not found",
        });
      }

      // Verify WebAuthn registration
      const verification = await this.webAuthnService.verifyRegistration(
        registrationResponse,
        challenge
      );

      if (!verification.verified || !verification.registrationInfo) {
        return res.status(400).json({
          error: "WebAuthn verification failed",
        });
      }

      // Create and add WebAuthn credential to user
      const credential = {
        id: registrationResponse.id,
        publicKey: isoBase64URL.fromBuffer(
          verification.registrationInfo.credentialPublicKey
        ),
        counter: verification.registrationInfo.counter,
      };

      await this.userService.addCredential(userId, credential);

      // Update user to hybrid mode if they were password-only (for future implementation)
      // Currently only password auth is supported

      // Clear session data
      req.session.registrationChallenge = undefined;

      res.json({
        success: true,
        message: "WebAuthn successfully added",
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          displayName: user.displayName,
          authMethod: user.authMethod,
        },
      });
    } catch (error) {
      logger.error("Complete WebAuthn addition error:", error);
      res.status(500).json({
        error: "Failed to complete WebAuthn addition",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  /**
   * Get user's authentication methods and status
   */
  getAuthMethods = async (req: Request, res: Response) => {
    try {
      // Check for JWT authentication
      let userId: string | undefined;
      const authHeader = req.headers.authorization;
      const token = JWTService.extractTokenFromHeader(authHeader);

      if (token) {
        try {
          const payload = JWTService.verifyToken(token);
          userId = payload.userId;
        } catch (error) {
          return res.status(401).json({
            error: "Invalid or expired token",
            message:
              error instanceof Error ? error.message : "Authentication failed",
          });
        }
      } else {
        // Fallback to session authentication
        userId = req.session.userId;
      }

      if (!userId) {
        return res.status(401).json({
          error: "Authentication required",
        });
      }

      const user = await this.userService.getUserById(userId);
      if (!user) {
        return res.status(404).json({
          error: "User not found",
        });
      }

      // Check WebAuthn credentials
      const webAuthnCredentials =
        await this.userService.getDecryptedCredentials(userId);
      const hasWebAuthn = webAuthnCredentials.length > 0;
      const hasPassword = !!user.passwordHash;

      res.json({
        success: true,
        data: {
          authMethod: user.authMethod,
          hasPassword,
          hasWebAuthn,
          webAuthnCredentialCount: webAuthnCredentials.length,
          canAddWebAuthn: false, // WebAuthn not implemented yet
          canAddPassword: false, // Only password auth supported
        },
      });
    } catch (error) {
      logger.error("Get auth methods error:", error);
      res.status(500).json({
        error: "Failed to get authentication methods",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };
}
