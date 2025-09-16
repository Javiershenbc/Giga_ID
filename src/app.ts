import express from "express";
import cors from "cors";
import session from "express-session";
import path from "path";
import { fileURLToPath } from "url";
import { env } from "./config/env.js";
import { AuthController } from "./controllers/auth.js";
import { UserService } from "./services/user.js";
import { ConfiguredAgent } from "./agent/setup.js";
import { AppDataSource } from "./data-source.js";
import fs from "fs";
import { logger } from "./utils/logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function createApp(agent: ConfiguredAgent) {
  const app = express();

  // Simple request logging middleware (development only)
  app.use((req, res, next) => {
    logger.debug(`${req.method} ${req.url}`);
    next();
  });

  // Middleware
  app.use(express.json());
  app.use(
    cors({
      origin:
        env.NODE_ENV === "production"
          ? "https://gigaid.unicef.org"
          : `http://localhost:${env.PORT}`,
      credentials: true,
    })
  );

  // Session configuration
  app.use(
    session({
      secret: env.SESSION_SECRET!,
      resave: false,
      saveUninitialized: false,
      cookie: {
        secure: env.NODE_ENV === "production",
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
      },
    })
  );

  // Initialize services
  const userService = new UserService(AppDataSource, agent);
  const authController = new AuthController(userService);

  // Serve static files
  const publicPath = path.join(process.cwd(), "src", "public");
  logger.debug("Static files directory:", publicPath);
  if (env.NODE_ENV === "development" && fs.existsSync(publicPath)) {
    logger.debug("Directory contents:", fs.readdirSync(publicPath));
  }
  app.use("/public", express.static(publicPath));

  // Routes
  app.post("/auth/register/start", authController.startRegistration);
  app.post("/auth/register/complete", authController.completeRegistration);
  app.post("/auth/login/start", authController.startAuthentication);
  app.post("/auth/login/complete", authController.completeAuthentication);
  app.post("/auth/logout", authController.logout);
  app.get("/auth/blockchain-status", authController.getBlockchainStatus);

  // Test route - serve the password auth test page
  app.get("/test", (req, res) => {
    try {
      const testPagePath = path.join(
        process.cwd(),
        "src",
        "public",
        "password-auth-test.html"
      );

      logger.debug("Serving test page from:", testPagePath);
      logger.debug("File exists:", fs.existsSync(testPagePath));

      if (fs.existsSync(testPagePath)) {
        res.sendFile(testPagePath);
      } else {
        res.status(404).send("Test page not found");
      }
    } catch (error) {
      logger.error("Error serving test page:", error);
      res.status(500).send("Internal server error");
    }
  });

  // Serve password authentication test page directly
  app.get("/password-auth-test.html", (req, res) => {
    try {
      const passwordAuthPagePath = path.join(
        process.cwd(),
        "src",
        "public",
        "password-auth-test.html"
      );

      logger.debug("Serving password auth page from:", passwordAuthPagePath);
      logger.debug("File exists:", fs.existsSync(passwordAuthPagePath));

      if (fs.existsSync(passwordAuthPagePath)) {
        res.sendFile(passwordAuthPagePath);
      } else {
        res.status(404).send("Password auth test page not found");
      }
    } catch (error) {
      logger.error("Error serving password auth page:", error);
      res.status(500).send("Internal server error");
    }
  });

  // Root route - redirect to password auth test page
  app.get("/", (req, res) => {
    res.redirect("/password-auth-test.html");
  });

  // Health check route
  app.get("/health", (req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // Global error handler
  app.use((err: any, req: any, res: any, next: any) => {
    logger.error("Error:", err);
    res.status(500).json({ error: "Internal server error" });
  });

  return app;
}
