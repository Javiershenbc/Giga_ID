import { Request, Response, NextFunction } from "express";
import { JWTService, JWTPayload } from "../services/jwt.js";

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    username: string;
    displayName: string;
    did: string;
    authMethod: string;
  };
  authType?: "session" | "jwt";
}

/**
 * Middleware to check if user is authenticated via session or JWT
 */
export const requireAuth = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  // First, try JWT authentication
  const authHeader = req.headers.authorization;
  const token = JWTService.extractTokenFromHeader(authHeader);

  if (token) {
    try {
      const payload: JWTPayload = JWTService.verifyToken(token);
      req.user = {
        id: payload.userId,
        username: payload.username,
        displayName: payload.username, // Could be enhanced to store displayName in JWT
        did: "", // Would be populated from database if needed
        authMethod: payload.authMethod,
      };
      req.authType = "jwt";
      return next();
    } catch (error) {
      return res.status(401).json({
        success: false,
        error: "Invalid or expired token",
        message:
          error instanceof Error ? error.message : "Authentication failed",
      });
    }
  }

  // Fallback to session authentication
  if (!req.session.isLoggedIn || !req.session.userId) {
    return res.status(401).json({
      success: false,
      error: "Authentication required",
      message:
        "Please log in to access this resource or provide a valid JWT token",
    });
  }

  // Add user info to request for use in controllers
  req.user = {
    id: req.session.userId,
    username: req.session.username || "",
    displayName: req.session.username || "",
    did: "", // This would be populated from the database if needed
    authMethod: "webauthn", // Session-based is typically WebAuthn
  };
  req.authType = "session";

  next();
};

/**
 * Middleware to check if user is authenticated (optional)
 * Adds user info to request if available but doesn't block access
 */
export const optionalAuth = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  // Try JWT first
  const authHeader = req.headers.authorization;
  const token = JWTService.extractTokenFromHeader(authHeader);

  if (token) {
    try {
      const payload: JWTPayload = JWTService.verifyToken(token);
      req.user = {
        id: payload.userId,
        username: payload.username,
        displayName: payload.username,
        did: "",
        authMethod: payload.authMethod,
      };
      req.authType = "jwt";
      return next();
    } catch (error) {
      // JWT failed, continue to session check
    }
  }

  // Fallback to session
  if (req.session.isLoggedIn && req.session.userId) {
    req.user = {
      id: req.session.userId,
      username: req.session.username || "",
      displayName: req.session.username || "",
      did: "",
      authMethod: "webauthn",
    };
    req.authType = "session";
  }

  next();
};
