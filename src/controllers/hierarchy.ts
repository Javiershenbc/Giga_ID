import { Request, Response } from "express";
import { body, param, validationResult } from "express-validator";
import { DataSource } from "typeorm";
import { OrganizationService } from "../services/organization.js";
import { AuthorizationService } from "../services/authorization.js";
import {
  OrganizationType,
  OrganizationStatus,
} from "../models/organization.js";
import { UserRole } from "../models/user.js";
import { AuthenticatedRequest } from "../middleware/auth.js";
import { logger } from "../utils/logger.js";

// Helper function to handle errors consistently
const getErrorMessage = (error: unknown): string => {
  return error instanceof Error ? error.message : "Unknown error";
};

export class HierarchyController {
  private organizationService: OrganizationService;
  private authorizationService: AuthorizationService;
  private dataSource: DataSource;

  constructor(dataSource: DataSource) {
    this.dataSource = dataSource;
    this.organizationService = new OrganizationService(dataSource);
    this.authorizationService = new AuthorizationService(dataSource);
  }

  /**
   * Create a new organization
   */
  async createOrganization(
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({ errors: errors.array() });
        return;
      }

      // User is already authenticated by middleware
      if (!req.user?.id) {
        res.status(401).json({
          success: false,
          error: "Authentication required",
        });
        return;
      }

      const {
        name,
        type,
        description,
        country,
        region,
        contactEmail,
        parentId,
      } = req.body;

      // Check authorization
      const canCreate = await this.authorizationService.canCreateOrganization(
        req.user.id,
        type as OrganizationType,
        parentId
      );

      if (!canCreate) {
        res.status(403).json({
          success: false,
          error: "You are not authorized to create this type of organization",
        });
        return;
      }

      const organization = await this.organizationService.createOrganization({
        name,
        type: type as OrganizationType,
        description,
        country,
        region,
        contactEmail,
        parentId,
      });

      // Only associate user with Giga organizations they create
      // For other organization types, the user should remain associated with their parent organization
      if (type === OrganizationType.GIGA) {
        await this.authorizationService.associateUserWithOrganization(
          req.user.id,
          organization.id,
          UserRole.ADMIN
        );
      }

      res.status(201).json({
        success: true,
        data: organization,
        message: `Organization ${organization.name} created successfully`,
      });
    } catch (error) {
      logger.error("Error creating organization:", error);
      res.status(500).json({
        success: false,
        error: "Failed to create organization",
        details: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  /**
   * Get organization by ID
   */
  async getOrganization(
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> {
    try {
      const { id } = req.params;
      const organization = await this.organizationService.getOrganizationById(
        id
      );

      if (!organization) {
        res.status(404).json({
          success: false,
          error: "Organization not found",
        });
        return;
      }

      res.json({
        success: true,
        data: organization,
      });
    } catch (error) {
      logger.error("Error getting organization:", error);
      res.status(500).json({
        success: false,
        error: "Failed to get organization",
        details: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  /**
   * Get organizations by type
   */
  async getOrganizationsByType(
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> {
    try {
      const { type } = req.params;
      const organizations =
        await this.organizationService.getOrganizationsByType(
          type as OrganizationType
        );

      res.json({
        success: true,
        data: organizations,
      });
    } catch (error) {
      logger.error("Error getting organizations by type:", error);
      res.status(500).json({
        success: false,
        error: getErrorMessage(error),
      });
    }
  }

  /**
   * Get complete hierarchy
   */
  async getHierarchy(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const hierarchy = await this.organizationService.getCompleteHierarchy();

      if (!hierarchy) {
        res.status(404).json({
          success: false,
          error: "No hierarchy found - Giga organization not created",
        });
        return;
      }

      res.json({
        success: true,
        data: hierarchy,
      });
    } catch (error) {
      logger.error("Error getting hierarchy:", error);
      res.status(500).json({
        success: false,
        error: getErrorMessage(error),
      });
    }
  }

  /**
   * Update organization status
   */
  async updateOrganizationStatus(
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          error: errors
            .array()
            .map((err) => err.msg)
            .join(", "),
        });
        return;
      }

      // User is already authenticated by middleware
      if (!req.user?.id) {
        res.status(401).json({
          success: false,
          error: "Authentication required",
        });
        return;
      }

      const { id } = req.params;
      const { status } = req.body;

      // Check authorization
      const canUpdate =
        await this.authorizationService.canUpdateOrganizationStatus(
          req.user.id,
          id
        );

      if (!canUpdate) {
        res.status(403).json({
          success: false,
          error: "You are not authorized to update this organization's status",
        });
        return;
      }

      try {
        const organization =
          await this.organizationService.updateOrganizationStatus(
            id,
            status as OrganizationStatus
          );

        res.json({
          success: true,
          data: organization,
          message: `Organization status updated to ${status}`,
        });
      } catch (error) {
        // Handle specific validation errors from the service
        res.status(400).json({
          success: false,
          error:
            error instanceof Error
              ? error.message
              : "Failed to update organization status",
        });
      }
    } catch (error) {
      logger.error("Error updating organization status:", error);
      res.status(500).json({
        success: false,
        error: getErrorMessage(error),
      });
    }
  }

  /**
   * Get organizations that the current user can manage
   */
  async getUserManagedOrganizations(
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> {
    try {
      // User is already authenticated by middleware
      if (!req.user?.id) {
        res.status(401).json({
          success: false,
          error: "Authentication required",
        });
        return;
      }

      const organizations =
        await this.authorizationService.getUserManagedOrganizations(
          req.user.id
        );

      res.json({
        success: true,
        data: organizations,
      });
    } catch (error) {
      logger.error("Error getting user managed organizations:", error);
      res.status(500).json({
        success: false,
        error: getErrorMessage(error),
      });
    }
  }

  /**
   * Get authorized issuers for a target organization type
   */
  async getAuthorizedIssuers(
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> {
    try {
      const { targetType } = req.params;
      const issuers = await this.organizationService.getAuthorizedIssuers(
        targetType as OrganizationType
      );

      res.json({
        success: true,
        data: issuers,
      });
    } catch (error) {
      logger.error("Error getting authorized issuers:", error);
      res.status(500).json({
        success: false,
        error: getErrorMessage(error),
      });
    }
  }

  /**
   * Associate a user with an organization
   */
  async associateUserWithOrganization(
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({ errors: errors.array() });
        return;
      }

      // User is already authenticated by middleware
      if (!req.user?.id) {
        res.status(401).json({
          success: false,
          error: "Authentication required",
        });
        return;
      }

      const { organizationId } = req.params;
      const { username, role } = req.body;

      // Check if current user can associate users with this organization
      const canAssociate = await this.authorizationService.canAssociateUsers(
        req.user.id,
        organizationId
      );

      if (!canAssociate) {
        res.status(403).json({
          success: false,
          error:
            "You are not authorized to associate users with this organization (requires ADMIN role)",
        });
        return;
      }

      const user = await this.authorizationService.associateUserByUsername(
        username,
        organizationId,
        role as UserRole
      );

      res.json({
        success: true,
        data: user,
        message: `User ${username} associated with organization successfully`,
      });
    } catch (error) {
      logger.error("Error associating user with organization:", error);
      res.status(500).json({
        success: false,
        error: getErrorMessage(error),
      });
    }
  }

  /**
   * Get available users that can be associated with organizations
   */
  async getAvailableUsers(
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> {
    try {
      // User is already authenticated by middleware
      if (!req.user?.id) {
        res.status(401).json({
          success: false,
          error: "Authentication required",
        });
        return;
      }

      const users = await this.authorizationService.getAvailableUsers();

      res.json({
        success: true,
        data: users,
      });
    } catch (error) {
      logger.error("Error getting available users:", error);
      res.status(500).json({
        success: false,
        error: getErrorMessage(error),
      });
    }
  }

  /**
   * Get organizations with their associated users (only for organizations the current user can access)
   */
  async getOrganizationsWithUsers(
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> {
    try {
      logger.debug("[DEBUG] getOrganizationsWithUsers called");

      // User is already authenticated by middleware
      if (!req.user?.id) {
        logger.debug("[DEBUG] User not authenticated");
        res.status(401).json({
          success: false,
          error: "Authentication required",
        });
        return;
      }

      logger.debug(`[DEBUG] User ID: ${req.user.id}`);

      const organizationsWithUsers =
        await this.authorizationService.getOrganizationsWithUsers(req.user.id);

      logger.debug(
        `[DEBUG] Found ${organizationsWithUsers.length} organizations with users`
      );

      res.json({
        success: true,
        data: organizationsWithUsers,
      });
    } catch (error) {
      logger.error("Error getting organizations with users:", error);
      res.status(500).json({
        success: false,
        error: getErrorMessage(error),
      });
    }
  }

  /**
   * Get a summary of all organizations, users, and associations
   */
  async getSystemSummary(
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> {
    try {
      // Get all organizations with parent/children
      const organizations = await this.organizationService[
        "organizationRepository"
      ].find({
        relations: ["parent", "children"],
        order: { type: "ASC", name: "ASC" },
      });

      // Get all users with minimal data (no need for full organization data)
      const userRepository = this.authorizationService["userRepository"];
      const users = await userRepository.find({
        select: [
          "id",
          "username",
          "displayName",
          "organizationId",
          "organizationRole",
        ],
        order: { username: "ASC" },
      });

      // Organization type counts
      const typeCounts: { [key: string]: number } = {};
      organizations.forEach((org) => {
        const type = String(org.type);
        typeCounts[type] = (typeCounts[type] || 0) + 1;
      });

      // Government orgs
      const governmentOrgs = organizations.filter(
        (org) => org.type === "government"
      );
      // School orgs
      const schoolOrgs = organizations.filter((org) => org.type === "school");
      // Users not associated with any org
      const unassociatedUsers = users.filter((user) => !user.organizationId);

      res.json({
        success: true,
        data: {
          organizations,
          users,
          typeCounts,
          governmentOrgs,
          schoolOrgs,
          unassociatedUsers,
        },
      });
    } catch (error) {
      logger.error("Error getting system summary:", error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  // All credential-related methods removed in Azure AD migration
}

// Validation middleware
export const createOrganizationValidation = [
  body("name").notEmpty().withMessage("Organization name is required"),
  body("type")
    .isIn(Object.values(OrganizationType))
    .withMessage("Invalid organization type"),
  body("parentId")
    .optional()
    .isUUID()
    .withMessage("Parent ID must be a valid UUID"),
  body("contactEmail").optional().isEmail().withMessage("Invalid email format"),
];

export const updateOrganizationStatusValidation = [
  param("id").isUUID().withMessage("Organization ID must be a valid UUID"),
  body("status")
    .isIn(Object.values(OrganizationStatus))
    .withMessage("Invalid organization status"),
];

// Credential-related validators removed in Azure migration
// DID parameter validation removed

export const organizationIdValidation = [
  param("id").isUUID().withMessage("Organization ID must be a valid UUID"),
];

export const organizationTypeValidation = [
  param("type")
    .isIn(Object.values(OrganizationType))
    .withMessage("Invalid organization type"),
];

export const targetTypeValidation = [
  param("targetType")
    .isIn(Object.values(OrganizationType))
    .withMessage("Invalid target organization type"),
];

export const associateUserValidation = [
  param("organizationId")
    .isUUID()
    .withMessage("Organization ID must be a valid UUID"),
  body("username").notEmpty().withMessage("Username is required"),
  body("role").isIn(Object.values(UserRole)).withMessage("Invalid user role"),
];
