import { Request, Response, NextFunction } from "express";
import passport from "passport";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { BearerStrategy } = require("passport-azure-ad");
import { azureAdConfig } from "../config/azure-ad.js";
import { AppDataSource } from "../data-source.js";
import { User } from "../models/user.js";

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string; // local DB user id
    username: string; // preferred_username/email
    displayName: string;
    azureAdObjectId: string; // Azure AD oid
    roles: string[];
  };
  authType?: "azure";
}

// Configure Azure AD Bearer strategy
const bearerStrategy = new BearerStrategy(
  {
    identityMetadata: azureAdConfig.identityMetadata,
    clientID: azureAdConfig.clientID,
    validateIssuer: azureAdConfig.validateIssuer,
    loggingLevel: azureAdConfig.loggingLevel,
    audience: azureAdConfig.audience,
    passReqToCallback: false,
  },
  async (token: any, done: Function) => {
    try {
      const userRepository = AppDataSource.getRepository(User);
      const azureAdObjectId: string = token.oid;
      const preferredUsername: string =
        token.preferred_username || token.upn || "";
      const displayName: string =
        token.name || preferredUsername || azureAdObjectId;
      const tenantId: string | undefined = token.tid;
      let user = await userRepository.findOne({ where: { azureAdObjectId } });
      if (!user) {
        user = userRepository.create({
          username: preferredUsername || azureAdObjectId,
          email: preferredUsername || `${azureAdObjectId}@unknown`,
          displayName,
          azureAdObjectId,
          azureAdTenantId: tenantId,
        });
        user = await userRepository.save(user);
      } else {
        // keep display info updated
        user.displayName = displayName;
        user.azureAdTenantId = tenantId;
        await userRepository.save(user);
      }

      return done(null, {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        azureAdObjectId,
        roles: Array.isArray(token.roles) ? token.roles : [],
      });
    } catch (err) {
      return done(err, null);
    }
  }
);

passport.use(bearerStrategy as any);

export const requireAuth = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  return passport.authenticate(
    "oauth-bearer",
    { session: false },
    (err: any, user: any) => {
      if (err || !user) {
        return res
          .status(401)
          .json({ success: false, error: "Authentication required" });
      }
      req.user = user;
      req.authType = "azure";
      return next();
    }
  )(req, res, next);
};

export const optionalAuth = (
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction
) => {
  passport.authenticate(
    "oauth-bearer",
    { session: false },
    (_err: any, user: any) => {
      if (user) {
        req.user = user as any;
        req.authType = "azure";
      }
      return next();
    }
  )(req, _res, next);
};
