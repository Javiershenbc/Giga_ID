import express from "express";
import type { Request, Response } from "express";
import { DataSource } from "typeorm";
import { createVeramoAgent, ConfiguredAgent } from "../agent/setup.js";
import { CredentialService } from "../services/credential.js";
import { UserService } from "../services/user.js";
import { TransactionService } from "../services/transaction.js";
import { VerifiableCredential } from "@veramo/core";
import { createDatabase } from "../config/database.js";
import { env } from "../config/env.js";
import { corsOptions, rateLimiter } from "../config/middleware.js";
import { validateRequest } from "../middleware/validation.js";
import {
  verifyRequestSchema,
  apiRegistrationSchema,
  credentialIssuanceSchema,
} from "../validation/schemas.js";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import session from "express-session";
import { AuthController } from "../controllers/auth.js";
import { createMultisigRoutes } from "./multisig-routes.js";
import fs from "fs";
import { VerifierService } from "../services/verifier.js";
import { apiKeyAuthMiddleware } from "../middleware/apiKeyAuth.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = env.PORT;

// Middleware
app.use(cors(corsOptions));
app.use(express.json());
app.use(rateLimiter);

// Session configuration (kept minimal for compatibility with middleware)
// Security: Removed insecure fallback - SESSION_SECRET is mandatory
app.use(
  session({
    secret: env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: env.NODE_ENV === "production", // HTTPS only in production
      httpOnly: true, // Prevent XSS attacks
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    },
  })
);

// Serve static files
const publicPath = path.join(__dirname, "..", "public");
console.log("Static files directory:", publicPath);
console.log("Directory contents:", fs.readdirSync(publicPath));
app.use(express.static(publicPath));

// Initialize services
let credentialService: CredentialService;
let userService: UserService;
let transactionService: TransactionService;
let authController: AuthController;
let verifierService: VerifierService;

async function initializeServices() {
  try {
    // Initialize database
    const dbConnection = await createDatabase(env.DB_NAME);
    console.log("Database initialized successfully");

    // Initialize Veramo agent
    const agent = await createVeramoAgent(dbConnection, env.SECRET_KEY);
    console.log("Veramo agent initialized successfully");

    // Initialize services
    credentialService = new CredentialService(agent, dbConnection);
    userService = new UserService(dbConnection, agent);
    transactionService = new TransactionService(agent, dbConnection);
    authController = new AuthController(
      userService,
      undefined,
      transactionService
    );
    verifierService = new VerifierService(agent);
    console.log("Services initialized successfully");

    // Set up routes after services are initialized
    setupRoutes(agent, dbConnection);
  } catch (error) {
    console.error("Failed to initialize services:", error);
    process.exit(1);
  }
}

function setupRoutes(agent: ConfiguredAgent, dbConnection: DataSource) {
  // Verification endpoint with validation
  app.post(
    "/verify",
    validateRequest(verifyRequestSchema),
    async (req: Request, res: Response) => {
      try {
        if (!verifierService) {
          return res.status(503).json({ error: "Service not initialized" });
        }
        const { credential } = req.body;
        const verificationResult = await verifierService.verifyCredential(
          credential
        );
        res.json(verificationResult);
      } catch (error) {
        console.error("Verification error:", error);
        res.status(500).json({
          error: "Verification failed",
          message: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }
  );

  // Removed legacy WebAuthn-only registration endpoint

  // API registration endpoint for third-party integration
  app.post(
    "/api/register",
    validateRequest(apiRegistrationSchema),
    async (req: Request, res: Response) => {
      try {
        if (!authController) {
          return res.status(503).json({ error: "Service not initialized" });
        }

        await authController.registerUserViaAPI(req, res);
      } catch (error) {
        console.error("API registration error:", error);
        res.status(500).json({
          error: "API registration failed",
          message: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }
  );

  // DID preview endpoint for third-party integration
  app.post("/api/did-preview", async (req: Request, res: Response) => {
    try {
      if (!authController) {
        return res.status(503).json({ error: "Service not initialized" });
      }

      await authController.generateDidPreview(req, res);
    } catch (error) {
      console.error("DID preview error:", error);
      res.status(500).json({
        error: "DID preview failed",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  // Transaction routes
  app.get("/api/balance", authController.getUserBalance);
  app.post("/api/send-transaction", authController.sendTransaction);
  app.post("/api/propose-transaction", authController.proposeSafeTransaction);
  app.post(
    "/api/propose-transaction-delegate",
    authController.proposeSafeTransactionAsDelegate
  );
  app.get("/api/transaction/:txHash", authController.getTransactionStatus);

  // Removed legacy WebAuthn session-based routes

  // Unified auth routes (supports both WebAuthn and password with JWT)
  app.post("/api/auth/register", authController.unifiedRegister);
  app.post("/api/auth/login", authController.unifiedLogin);
  app.post("/api/auth/refresh", authController.refreshToken);

  // Hybrid auth enhancement routes
  app.post("/api/auth/add-webauthn", authController.addWebAuthn);
  app.post(
    "/api/auth/complete-webauthn-addition",
    authController.completeWebAuthnAddition
  );
  app.get("/api/auth/methods", authController.getAuthMethods);

  // Removed legacy status endpoint

  // Multisig wallet routes
  app.use("/api/multisig", createMultisigRoutes(agent, dbConnection));

  // API Key middleware (for all /api/credentials routes)
  app.use("/api/credentials", apiKeyAuthMiddleware(dbConnection));

  // Credential issuance endpoint (generic VC)
  app.post(
    "/api/credentials/issue",
    validateRequest(credentialIssuanceSchema),
    async (req: Request, res: Response) => {
      try {
        const sessionUser = req.session.userId
          ? await userService.getUserById(req.session.userId)
          : null;
        const apiKey = (req as any).apiKey;
        const { issuerDid, subjectDid, type, context, claims } = req.body;

        // Authorization: session user or API key with issue:* scope
        const hasIssueScope = apiKey?.scopes?.some((s: string) =>
          s.startsWith("issue:")
        );
        if (!sessionUser && !hasIssueScope) {
          return res
            .status(403)
            .json({ error: "Not authorized to issue credentials" });
        }

        const effectiveIssuerDid = sessionUser?.did || issuerDid;
        if (!effectiveIssuerDid) {
          return res
            .status(400)
            .json({ error: "issuerDid required (or login required)" });
        }

        const vc = await credentialService.issueCredential({
          issuerDid: effectiveIssuerDid,
          subjectDid,
          type,
          context,
          claims,
        });
        res.json({ success: true, credential: vc });
      } catch (error) {
        console.error("Credential issuance error:", error);
        res.status(500).json({
          error: "Credential issuance failed",
          message: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }
  );

  // Credential verification endpoint (open)
  app.post("/api/credentials/verify", async (req: Request, res: Response) => {
    try {
      const { credential } = req.body;
      const result = await credentialService.verifyCredential(credential);
      res.json({ success: result.verified, result });
    } catch (error) {
      console.error("Credential verification error:", error);
      res.status(500).json({
        error: "Credential verification failed",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  // Removed hierarchy-based credential listing endpoints

  // Removed revoke endpoint (hierarchy-specific)

  // Removed role inference endpoint (hierarchy-specific)

  // Removed permissions check endpoint (hierarchy-specific)

  // Serve password authentication test page
  app.get("/test", (req, res) => {
    const passwordAuthPagePath = path.join(
      publicPath,
      "password-auth-test.html"
    );
    console.log("Serving password auth test page from:", passwordAuthPagePath);
    console.log("File exists:", fs.existsSync(passwordAuthPagePath));
    res.sendFile(passwordAuthPagePath);
  });

  // Removed hierarchy demo routes

  // Removed legacy password-auth test page route

  // Serve password authentication test page directly
  app.get("/password-auth-test.html", (req, res) => {
    const passwordAuthPagePath = path.join(
      publicPath,
      "password-auth-test.html"
    );
    res.sendFile(passwordAuthPagePath);
  });

  // Root route - redirect to password auth test page
  app.get("/", (req, res) => {
    res.redirect("/password-auth-test.html");
  });

  // Health check endpoint
  app.get("/health", (_req: Request, res: Response) => {
    res.json({
      status: "ok",
      environment: env.NODE_ENV,
      network: env.ETH_NETWORK,
      services: {
        veramo: credentialService ? "initialized" : "not initialized",
      },
    });
  });
}

interface VerifyRequest extends Request {
  body: {
    credential: VerifiableCredential;
  };
}

// Removed legacy RegisterRequest interface

// Initialize services before starting server
initializeServices().catch(console.error);

// Start server
const server = app.listen(port, () => {
  console.log(
    `Server running in ${env.NODE_ENV} mode at http://localhost:${port}`
  );
  console.log(
    `Blockchain network: ${env.ETH_NETWORK}${
      env.RPC_URL ? " (RPC override set)" : ""
    }`
  );
});

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("SIGTERM signal received: closing HTTP server");
  server.close(() => {
    console.log("HTTP server closed");
    process.exit(0);
  });
});
