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
  userRegistrationSchema,
  apiRegistrationSchema,
  credentialIssuanceSchema,
} from "../validation/schemas.js";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import session from "express-session";
import { AuthController } from "../controllers/auth.js";
import { createHierarchyRoutes } from "./hierarchy-routes.js";
import { createMultisigRoutes } from "./multisig-routes.js";
import fs from "fs";
import { VerifierService } from "../services/verifier.js";
import { HierarchicalCredentialService } from "../services/hierarchical-credential.js";
import { apiKeyAuthMiddleware } from "../middleware/apiKeyAuth.js";
import { CredentialType } from "../models/credential-record.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = env.PORT;

// Middleware
app.use(cors(corsOptions));
app.use(express.json());
app.use(rateLimiter);

// Session configuration
app.use(
  session({
    secret: env.SESSION_SECRET || "your-secret-key",
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: env.NODE_ENV === "production",
      httpOnly: true,
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

  // Removed legacy WebAuthn registration endpoint

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

  // Removed legacy /auth/status endpoint (session-based)

  // Hierarchical credential routes
  app.use("/api/hierarchy", createHierarchyRoutes(agent, dbConnection));

  // Multisig wallet routes
  app.use("/api/multisig", createMultisigRoutes(agent, dbConnection));

  // API Key middleware (for all /api/credentials routes)
  app.use("/api/credentials", apiKeyAuthMiddleware(dbConnection));

  // Credential issuance endpoint (hybrid auth)
  app.post(
    "/api/credentials/issue",
    validateRequest(credentialIssuanceSchema),
    async (req: Request, res: Response) => {
      try {
        // Hybrid auth: session or API key
        const user = req.session.userId
          ? await userService.getUserById(req.session.userId)
          : null;
        const apiKey = (req as any).apiKey;
        const { issuerDid, subjectDid, type, claims, expiresAt } = req.body;

        // Authorization: session user or API key must have permission
        let canIssue = false;
        let issuer = null;
        if (user) {
          // TODO: Add user role/permission checks here
          canIssue = true;
          issuer = user.did;
        } else if (apiKey) {
          // Check scopes
          if (apiKey.scopes.some((s: string) => s.startsWith("issue:"))) {
            canIssue = true;
            issuer = issuerDid; // API key must provide issuerDid
          }
        }
        if (!canIssue) {
          return res
            .status(403)
            .json({ error: "Not authorized to issue credentials" });
        }

        // Map type to CredentialType
        let credentialType: CredentialType | undefined;
        if (Array.isArray(type)) {
          // Accept either enum value or class name (e.g., "government_authorization" or "GovernmentAuthorizationCredential")
          credentialType = Object.values(CredentialType).find(
            (ct) =>
              ct === type[type.length - 1] ||
              type[type.length - 1]
                .replace("Credential", "")
                .replace(/([A-Z])/g, "_$1")
                .toLowerCase()
                .replace(/^_/, "") === ct
          ) as CredentialType | undefined;
        }
        if (!credentialType) {
          return res
            .status(400)
            .json({ error: "Invalid or missing credential type" });
        }

        // Issue credential using hierarchical service
        const hierarchicalCredentialService = new HierarchicalCredentialService(
          agent,
          dbConnection
        );
        const credential = await hierarchicalCredentialService.issueCredential({
          issuerDid: issuer,
          subjectDid,
          credentialType,
          claims,
          expiresAt: expiresAt ? new Date(expiresAt) : undefined,
        });
        res.json({ success: true, credential });
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

  // Credential query and revocation endpoints
  const hierarchicalCredentialService = new HierarchicalCredentialService(
    agent,
    dbConnection
  );

  // Get credentials issued by a DID
  app.get("/api/credentials/issued/:did", async (req, res) => {
    try {
      const { did } = req.params;
      const credentials =
        await hierarchicalCredentialService.getIssuedCredentials(did);
      res.json({ success: true, data: credentials });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  // Get credentials received by a DID
  app.get("/api/credentials/received/:did", async (req, res) => {
    try {
      const { did } = req.params;
      const credentials =
        await hierarchicalCredentialService.getReceivedCredentials(did);
      res.json({ success: true, data: credentials });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  // Revoke a credential (issuer or admin)
  app.post("/api/credentials/revoke", async (req, res) => {
    try {
      const { credentialId, reason, revokerDid, adminUserId } = req.body;
      if (!credentialId || !reason) {
        return res.status(400).json({
          success: false,
          error: "credentialId and reason are required",
        });
      }

      if (revokerDid) {
        await hierarchicalCredentialService.revokeCredential(
          credentialId,
          revokerDid,
          reason
        );
        return res.json({
          success: true,
          message: "Credential revoked by issuer",
        });
      }

      if (adminUserId) {
        await hierarchicalCredentialService.revokeCredentialByAdmin(
          credentialId,
          adminUserId,
          reason
        );
        return res.json({
          success: true,
          message: "Credential revoked by admin",
        });
      }

      return res.status(400).json({
        success: false,
        error: "revokerDid or adminUserId required",
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  // Get roles for a DID (based on credentials)
  app.get("/api/role/:did", async (req, res) => {
    try {
      const { did } = req.params;
      const credentials =
        await hierarchicalCredentialService.getReceivedCredentials(did);
      const roles = new Set<string>();

      for (const cred of credentials) {
        try {
          const data = JSON.parse(cred.credentialData);
          if (data.type && Array.isArray(data.type)) {
            for (const t of data.type) {
              if (t.endsWith("Credential") && t !== "VerifiableCredential") {
                roles.add(t.replace("Credential", "").toLowerCase());
              }
            }
          }
        } catch {}
      }

      res.json({ success: true, roles: Array.from(roles) });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  // Check permission for a DID to perform an action
  app.post("/api/permissions/check", async (req, res) => {
    try {
      const { did, action } = req.body;
      if (!did || !action) {
        return res
          .status(400)
          .json({ success: false, error: "did and action are required" });
      }

      const credentials =
        await hierarchicalCredentialService.getReceivedCredentials(did);
      const roles = new Set<string>();

      for (const cred of credentials) {
        try {
          const data = JSON.parse(cred.credentialData);
          if (data.type && Array.isArray(data.type)) {
            for (const t of data.type) {
              if (t.endsWith("Credential") && t !== "VerifiableCredential") {
                roles.add(t.replace("Credential", "").toLowerCase());
              }
            }
          }
        } catch {}
      }

      let allowed = false;
      let reason = "";
      if (action === "issue:school" && roles.has("government")) {
        allowed = true;
      } else if (action === "issue:government" && roles.has("countryoffice")) {
        allowed = true;
      } else {
        reason = `Role(s) [${Array.from(roles).join(
          ", "
        )}] not allowed for action ${action}`;
      }

      res.json({ success: true, allowed, reason });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  // Removed legacy WebAuthn demo pages (/test, /hierarchy-test)

  // Serve password-based hierarchy test page
  app.get("/hierarchy-test-password", (req, res) => {
    const hierarchyTestPath = path.join(
      publicPath,
      "hierarchy-test-password.html"
    );
    console.log(
      "Serving password hierarchy test page from:",
      hierarchyTestPath
    );
    console.log("File exists:", fs.existsSync(hierarchyTestPath));
    res.sendFile(hierarchyTestPath);
  });

  // Serve password authentication test page
  app.get("/password-auth-test", (req, res) => {
    const passwordAuthTestPath = path.join(
      publicPath,
      "password-auth-test.html"
    );
    console.log("Serving password auth test page from:", passwordAuthTestPath);
    console.log("File exists:", fs.existsSync(passwordAuthTestPath));
    res.sendFile(passwordAuthTestPath);
  });

  // Root route → modern password auth test page
  app.get("/", (req, res) => {
    res.redirect("/password-auth-test");
  });

  // Health check endpoint
  app.get("/health", (_req: Request, res: Response) => {
    res.json({
      status: "ok",
      environment: env.NODE_ENV,
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

interface RegisterRequest extends Request {
  body: {
    username: string;
    email: string;
    displayName: string;
  };
}

// Initialize services before starting server
initializeServices().catch(console.error);

// Start server
const server = app.listen(port, () => {
  console.log(
    `Server running in ${env.NODE_ENV} mode at http://localhost:${port}`
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
