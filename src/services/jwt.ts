import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

export interface JWTPayload {
  userId: string;
  username: string;
  email: string;
  authMethod: string;
  iat?: number;
  exp?: number;
}

export class JWTService {
  private static readonly SECRET = env.JWT_SECRET;
  private static readonly EXPIRES_IN = "24h"; // Token expires in 24 hours
  private static readonly ALGORITHM = "HS256"; // Secure HMAC SHA-256 algorithm

  /**
   * Generate a JWT token for a user
   * Uses HMAC SHA-256 for secure signing
   */
  static generateToken(payload: Omit<JWTPayload, "iat" | "exp">): string {
    return jwt.sign(payload, this.SECRET, {
      expiresIn: this.EXPIRES_IN,
      algorithm: this.ALGORITHM,
      issuer: "giga-id", // Add issuer claim for additional security
      audience: "giga-id-users", // Add audience claim
    });
  }

  /**
   * Verify and decode a JWT token
   * Validates algorithm, issuer, and audience for additional security
   */
  static verifyToken(token: string): JWTPayload {
    try {
      return jwt.verify(token, this.SECRET, {
        algorithms: [this.ALGORITHM], // Only allow secure algorithm
        issuer: "giga-id", // Verify issuer
        audience: "giga-id-users", // Verify audience
      }) as JWTPayload;
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw new Error("Token has expired");
      }
      if (error instanceof jwt.JsonWebTokenError) {
        throw new Error("Invalid token");
      }
      throw new Error("Token verification failed");
    }
  }

  /**
   * Extract token from Authorization header
   */
  static extractTokenFromHeader(authHeader: string | undefined): string | null {
    if (!authHeader) return null;

    const parts = authHeader.split(" ");
    if (parts.length === 2 && parts[0] === "Bearer") {
      return parts[1];
    }

    return null;
  }

  /**
   * Generate a refresh token (longer expiry)
   * Uses same security parameters as access token
   */
  static generateRefreshToken(
    payload: Omit<JWTPayload, "iat" | "exp">
  ): string {
    return jwt.sign(payload, this.SECRET, {
      expiresIn: "7d", // Refresh token expires in 7 days
      algorithm: this.ALGORITHM,
      issuer: "giga-id",
      audience: "giga-id-users",
    });
  }
}
