import rateLimit from "express-rate-limit";
import cors from "cors";
import { env } from "./env.js";
import ms from "ms";

// Rate limiting configuration
export const rateLimiter = rateLimit({
  windowMs: Number(ms(env.RATE_LIMIT_WINDOW)), // Convert time string to milliseconds
  max: env.RATE_LIMIT_MAX_REQUESTS, // Default: 100 requests per windowMs
  message: "Too many requests from this IP, please try again later.",
  standardHeaders: true,
  legacyHeaders: false,
});

// CORS configuration
export const corsOptions = {
  origin: env.CORS_ORIGIN,
  methods: ["GET", "POST"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true,
  maxAge: 86400, // 24 hours
};
