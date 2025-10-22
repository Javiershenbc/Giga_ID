import express from "express";
import type { Request, Response } from "express";
import { DataSource } from "typeorm";
import { UserService } from "../services/user.js";
import { TransactionService } from "../services/transaction.js";
import { createDatabase } from "../config/database.js";
import { env } from "../config/env.js";
import { corsOptions, rateLimiter } from "../config/middleware.js";
// Removed legacy validation imports
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import passport from "passport";
import { AuthController } from "../controllers/auth.js";
import { createHierarchyRoutes } from "./hierarchy-routes.js";
import { AzureOAuthService } from "../services/azure-oauth.js";
import fs from "fs";
import { apiKeyAuthMiddleware } from "../middleware/apiKeyAuth.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = env.PORT;

// Middleware
app.use(cors(corsOptions));
app.use(express.json());
app.use(rateLimiter);

// Initialize passport (Azure AD)
app.use(passport.initialize());

// Serve static files
const publicPath = path.join(__dirname, "..", "public");
console.log("Static files directory:", publicPath);
console.log("Directory contents:", fs.readdirSync(publicPath));
app.use(express.static(publicPath));

// Initialize services
let userService: UserService;
let transactionService: TransactionService;
let authController: AuthController;
let azureOAuth: AzureOAuthService;

async function initializeServices() {
  try {
    // Initialize database
    const dbConnection = await createDatabase(env.DB_NAME);
    console.log("Database initialized successfully");

    // Initialize services
    userService = new UserService(dbConnection);
    transactionService = new TransactionService(undefined as any, dbConnection);
    authController = new AuthController(
      userService,
      undefined,
      transactionService
    );
    azureOAuth = new AzureOAuthService();
    console.log("Services initialized successfully");

    // Set up routes after services are initialized
    setupRoutes(dbConnection);
  } catch (error) {
    console.error("Failed to initialize services:", error);
    process.exit(1);
  }
}

function setupRoutes(dbConnection: DataSource) {
  // API registration endpoint for third-party integration
  // Removed legacy API register endpoint

  // Removed DID preview endpoint

  // Transaction routes
  app.get("/api/balance", authController.getUserBalance);
  app.post("/api/send-transaction", authController.sendTransaction);
  app.post("/api/propose-transaction", authController.proposeSafeTransaction);
  app.post(
    "/api/propose-transaction-delegate",
    authController.proposeSafeTransactionAsDelegate
  );
  app.get("/api/transaction/:txHash", authController.getTransactionStatus);

  // Azure AD based auth endpoints (profile only)
  app.get("/api/auth/config", (_req: Request, res: Response) => {
    res.json({
      success: true,
      clientId: env.AZURE_AD_CLIENT_ID,
      authority: env.AZURE_AD_AUTHORITY.replace(/\/+$/g, ""),
      scopes: env.AZURE_AD_SCOPES.split(/\s+/g).filter(Boolean),
      redirectUri: env.AZURE_AD_REDIRECT_URI,
    });
  });

  app.get("/api/auth/login", async (_req: Request, res: Response) => {
    try {
      const url = await azureOAuth.getLoginUrlAsync();
      res.redirect(url);
    } catch (e) {
      res.status(500).json({ error: "Failed to build login URL" });
    }
  });

  app.get("/api/auth/callback", async (req: Request, res: Response) => {
    try {
      const code = (req.query.code as string) || "";
      if (!code) return res.status(400).json({ error: "Missing code" });
      const tokenResult = await azureOAuth.exchangeCodeForToken(code);

      // For GET requests (redirect flow), redirect back to admin page with token in URL hash
      const token = tokenResult?.accessToken || tokenResult?.idToken;
      if (token) {
        res.redirect(`/admin.html#token=${encodeURIComponent(token)}`);
      } else {
        res.redirect("/admin.html#error=No token received");
      }
    } catch (e) {
      res.redirect(
        `/admin.html#error=${encodeURIComponent((e as Error).message)}`
      );
    }
  });

  app.post("/api/auth/callback", async (req: Request, res: Response) => {
    try {
      const { code } = req.body;
      if (!code) return res.status(400).json({ error: "Missing code" });
      const tokenResult = await azureOAuth.exchangeCodeForToken(code);

      // For POST requests (popup flow), return JSON
      res.json({
        success: true,
        auth: {
          accessToken: tokenResult?.accessToken,
          idToken: tokenResult?.idToken,
          expiresOn: tokenResult?.expiresOn,
        },
        user: {
          // Extract user info from token if available
          name: tokenResult?.account?.name,
          username: tokenResult?.account?.username,
        },
      });
    } catch (e) {
      res
        .status(500)
        .json({ error: "OAuth callback error", message: (e as Error).message });
    }
  });
  app.get("/api/auth/profile", (req: Request, res: Response) => {
    const user = (req as any).user;
    if (!user)
      return res.status(401).json({ success: false, error: "Unauthorized" });
    res.json({ success: true, user });
  });

  // Removed legacy /auth/status endpoint (session-based)

  // Hierarchy routes
  app.use("/api/hierarchy", createHierarchyRoutes(undefined, dbConnection));

  // Multisig wallet routes
  // Removed multisig routes (dependían de Veramo)

  // API Key middleware (for all /api/credentials routes)
  app.use("/api/credentials", apiKeyAuthMiddleware(dbConnection));

  // All credential endpoints removed

  // Removed legacy WebAuthn demo pages (/test, /hierarchy-test)

  // Root route
  app.get("/", (_req, res) => {
    res.json({ ok: true });
  });

  // Health check endpoint
  app.get("/health", (_req: Request, res: Response) => {
    res.json({
      status: "ok",
      environment: env.NODE_ENV,
      services: {},
    });
  });
}

// Removed legacy VerifyRequest/RegisterRequest

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
