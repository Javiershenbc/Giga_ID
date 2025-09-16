import { env } from "../config/env.js";

/**
 * Development logging utilities that only output in development mode
 */
export const logger = {
  /**
   * Log debug information only in development
   */
  debug: (message: any, ...args: any[]) => {
    if (env.NODE_ENV === "development") {
      console.log("[DEBUG]", message, ...args);
    }
  },

  /**
   * Log info messages only in development
   */
  info: (message: any, ...args: any[]) => {
    if (env.NODE_ENV === "development") {
      console.log("[INFO]", message, ...args);
    }
  },

  /**
   * Log warnings (always shown but prefixed in dev)
   */
  warn: (message: any, ...args: any[]) => {
    if (env.NODE_ENV === "development") {
      console.warn("[WARN]", message, ...args);
    } else {
      console.warn(message, ...args);
    }
  },

  /**
   * Log errors (always shown)
   */
  error: (message: any, ...args: any[]) => {
    console.error(message, ...args);
  },

  /**
   * Log transaction/blockchain operations only in development
   */
  blockchain: (message: any, ...args: any[]) => {
    if (env.NODE_ENV === "development") {
      console.log("[BLOCKCHAIN]", message, ...args);
    }
  },

  /**
   * Log auth operations only in development
   */
  auth: (message: any, ...args: any[]) => {
    if (env.NODE_ENV === "development") {
      console.log("[AUTH]", message, ...args);
    }
  },

  /**
   * Log credential operations only in development
   */
  credential: (message: any, ...args: any[]) => {
    if (env.NODE_ENV === "development") {
      console.log("[CREDENTIAL]", message, ...args);
    }
  },
};
