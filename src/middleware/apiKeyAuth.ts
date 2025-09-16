import { Request, Response, NextFunction } from "express";
import { DataSource } from "typeorm";
import { APIKey } from "../models/api-key.js";

export function apiKeyAuthMiddleware(db: DataSource) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const apiKeyHeader = req.headers["x-api-key"];
    if (!apiKeyHeader || typeof apiKeyHeader !== "string") {
      return next(); // No API key, allow session-based auth to proceed
    }

    const apiKeyRepo = db.getRepository(APIKey);
    const apiKey = await apiKeyRepo.findOne({
      where: { key: apiKeyHeader, active: true },
    });
    if (!apiKey) {
      return res.status(401).json({ error: "Invalid or inactive API key" });
    }

    // Attach API key info to request
    (req as any).apiKey = apiKey;
    // Optionally update lastUsedAt
    apiKey.lastUsedAt = new Date();
    await apiKeyRepo.save(apiKey);
    next();
  };
}
