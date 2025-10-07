import { Request, Response } from "express";
import { body, param, validationResult } from "express-validator";
import { DataSource } from "typeorm";
import { OrganizationService } from "../services/organization.js";
import { HierarchicalCredentialService } from "../services/hierarchical-credential.js";
import { AuthorizationService } from "../services/authorization.js";
import {
  OrganizationType,
  OrganizationStatus,
} from "../models/organization.js";
import { CredentialType } from "../models/credential-record.js";
import { UserRole } from "../models/user.js";
import { ConfiguredAgent } from "../agent/setup.js";
import { AuthenticatedRequest } from "../middleware/auth.js";
import { logger } from "../utils/logger.js";

// Helper function to handle errors consistently
const getErrorMessage = (error: unknown): string => {
  return error instanceof Error ? error.message : "Unknown error";
};

export class HierarchyController {
  private organizationService: OrganizationService;
  private credentialService: HierarchicalCredentialService;
  private authorizationService: AuthorizationService;
  private agent: ConfiguredAgent;
  private dataSource: DataSource;

  constructor(agent: ConfiguredAgent, dataSource: DataSource) {
    this.agent = agent;
    this.dataSource = dataSource;
    this.organizationService = new OrganizationService(agent, dataSource);
    this.credentialService = new HierarchicalCredentialService(
      agent,
      dataSource
    );
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
   * Issue a credential
   */
  async issueCredential(
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

      const { issuerDid, subjectDid, credentialType, claims, expiresAt } =
        req.body;

      // Get the issuer organization from DID
      const issuerOrg = await this.organizationService.getOrganizationByDid(
        issuerDid
      );
      if (!issuerOrg) {
        res.status(400).json({
          success: false,
          error: "Issuer organization not found",
        });
        return;
      }

      // Check authorization
      const canIssue = await this.authorizationService.canIssueCredential(
        req.user.id,
        issuerOrg.id
      );

      if (!canIssue) {
        res.status(403).json({
          success: false,
          error:
            "You are not authorized to issue credentials on behalf of this organization",
        });
        return;
      }

      const credential = await this.credentialService.issueCredential(
        {
          issuerDid,
          subjectDid,
          credentialType: credentialType as CredentialType,
          claims,
          expiresAt: expiresAt ? new Date(expiresAt) : undefined,
        },
        req.user.id
      );

      res.status(201).json({
        success: true,
        data: credential,
        message: "Credential issued successfully",
      });
    } catch (error) {
      logger.error("Error issuing credential:", error);
      res.status(500).json({
        success: false,
        error: getErrorMessage(error),
      });
    }
  }

  /**
   * Issue a student credential using username
   */
  async issueStudentCredentialByUsername(
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

      const { issuerDid, studentUsername, credentialType, claims, expiresAt } =
        req.body;

      // Get the issuer organization from DID
      const issuerOrg = await this.organizationService.getOrganizationByDid(
        issuerDid
      );
      if (!issuerOrg) {
        res.status(400).json({
          success: false,
          error: "Issuer organization not found",
        });
        return;
      }

      // Check authorization
      const canIssue = await this.authorizationService.canIssueCredential(
        req.user.id,
        issuerOrg.id
      );

      if (!canIssue) {
        res.status(403).json({
          success: false,
          error:
            "You are not authorized to issue credentials on behalf of this organization",
        });
        return;
      }

      const credential =
        await this.credentialService.issueStudentCredentialByUsername({
          issuerDid,
          studentUsername,
          credentialType: credentialType as CredentialType,
          claims,
          expiresAt: expiresAt ? new Date(expiresAt) : undefined,
        });

      res.status(201).json({
        success: true,
        data: credential,
        message: `Student credential issued successfully to ${studentUsername}`,
      });
    } catch (error) {
      logger.error("Error issuing student credential:", error);
      res.status(500).json({
        success: false,
        error: getErrorMessage(error),
      });
    }
  }

  /**
   * Verify a credential
   */
  async verifyCredential(
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> {
    try {
      const { credential } = req.body;

      if (!credential) {
        res.status(400).json({
          success: false,
          error: "Credential is required",
        });
        return;
      }

      const verificationResult = await this.credentialService.verifyCredential(
        credential
      );

      res.json({
        success: true,
        data: verificationResult,
      });
    } catch (error) {
      logger.error("Error verifying credential:", error);
      res.status(500).json({
        success: false,
        error: getErrorMessage(error),
      });
    }
  }

  /**
   * Revoke a credential
   */
  async revokeCredential(
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({ errors: errors.array() });
        return;
      }

      const { credentialId, revokerDid, reason } = req.body;

      await this.credentialService.revokeCredential(
        credentialId,
        revokerDid,
        reason
      );

      res.json({
        success: true,
        message: "Credential revoked successfully",
      });
    } catch (error) {
      logger.error("Error revoking credential:", error);
      res.status(500).json({
        success: false,
        error: getErrorMessage(error),
      });
    }
  }

  /**
   * Revoke a credential by organization admin
   * Allows organization admins to revoke credentials issued by their organization
   */
  async revokeCredentialByAdmin(
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

      const { credentialId, reason } = req.body;

      await this.credentialService.revokeCredentialByAdmin(
        credentialId,
        req.user.id,
        reason
      );

      res.json({
        success: true,
        message: "Credential revoked successfully by admin",
      });
    } catch (error) {
      logger.error("Error revoking credential by admin:", error);
      res.status(500).json({
        success: false,
        error: getErrorMessage(error),
      });
    }
  }

  /**
   * Get issued credentials for an organization
   */
  async getIssuedCredentials(
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> {
    try {
      const { did } = req.params;
      const credentials = await this.credentialService.getIssuedCredentials(
        did
      );

      res.json({
        success: true,
        data: credentials,
      });
    } catch (error) {
      logger.error("Error getting issued credentials:", error);
      res.status(500).json({
        success: false,
        error: getErrorMessage(error),
      });
    }
  }

  /**
   * Get received credentials for an organization
   */
  async getReceivedCredentials(
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> {
    try {
      const { did } = req.params;
      const credentials = await this.credentialService.getReceivedCredentials(
        did
      );

      res.json({
        success: true,
        data: credentials,
      });
    } catch (error) {
      logger.error("Error getting received credentials:", error);
      res.status(500).json({
        success: false,
        error: getErrorMessage(error),
      });
    }
  }

  /**
   * Get credential chain for an organization
   */
  async getCredentialChain(
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> {
    try {
      const { did } = req.params;
      const chain = await this.credentialService.getCredentialChain(did);

      res.json({
        success: true,
        data: chain,
      });
    } catch (error) {
      logger.error("Error getting credential chain:", error);
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
          "did",
          "organizationId",
          "organizationRole",
          "authMethod",
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

  /**
   * Get user permissions by username
   */
  async getUserPermissionsByUsername(
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> {
    try {
      const { username } = req.params;

      if (!username) {
        res.status(400).json({
          success: false,
          error: "Username is required",
        });
        return;
      }

      const user = await this.authorizationService.getUserByUsername(username);
      if (!user) {
        res.status(404).json({
          success: false,
          error: "User not found",
        });
        return;
      }

      const permissions = await this.getUserPermissions(user);

      res.json({
        success: true,
        data: {
          user: {
            id: user.id,
            username: user.username,
            email: user.email,
            displayName: user.displayName,
            did: user.did,
            organizationId: user.organizationId,
            organizationRole: user.organizationRole,
          },
          permissions,
        },
      });
    } catch (error) {
      logger.error("Error getting user permissions by username:", error);
      res.status(500).json({
        success: false,
        error: getErrorMessage(error),
      });
    }
  }

  /**
   * Get user permissions by DID
   */
  async getUserPermissionsByDid(
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> {
    try {
      const { did } = req.params;

      if (!did) {
        res.status(400).json({
          success: false,
          error: "DID is required",
        });
        return;
      }

      const user = await this.authorizationService.getUserByDid(did);
      if (!user) {
        res.status(404).json({
          success: false,
          error: "User not found",
        });
        return;
      }

      const permissions = await this.getUserPermissions(user);

      res.json({
        success: true,
        data: {
          user: {
            id: user.id,
            username: user.username,
            email: user.email,
            displayName: user.displayName,
            did: user.did,
            organizationId: user.organizationId,
            organizationRole: user.organizationRole,
          },
          permissions,
        },
      });
    } catch (error) {
      logger.error("Error getting user permissions by DID:", error);
      res.status(500).json({
        success: false,
        error: getErrorMessage(error),
      });
    }
  }

  /**
   * Get user permissions by ID
   */
  async getUserPermissionsById(
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> {
    try {
      const { userId } = req.params;

      if (!userId) {
        res.status(400).json({
          success: false,
          error: "User ID is required",
        });
        return;
      }

      const user = await this.authorizationService.getUserById(userId);
      if (!user) {
        res.status(404).json({
          success: false,
          error: "User not found",
        });
        return;
      }

      const permissions = await this.getUserPermissions(user);

      res.json({
        success: true,
        data: {
          user: {
            id: user.id,
            username: user.username,
            email: user.email,
            displayName: user.displayName,
            did: user.did,
            organizationId: user.organizationId,
            organizationRole: user.organizationRole,
          },
          permissions,
        },
      });
    } catch (error) {
      logger.error("Error getting user permissions by ID:", error);
      res.status(500).json({
        success: false,
        error: getErrorMessage(error),
      });
    }
  }

  /**
   * Check if user can send transactions
   */
  async canSendTransactions(
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> {
    try {
      if (!req.user?.id) {
        res.status(401).json({
          success: false,
          error: "Authentication required",
        });
        return;
      }

      // Get user's authorization context to check role
      const authContext = await this.authorizationService.getUserAuthContext(
        req.user.id
      );

      if (!authContext) {
        res.json({
          success: true,
          data: {
            canSendTransactions: false,
            balance: "N/A",
            role: "none",
            reason: "User not found or not associated with any organization",
          },
        });
        return;
      }

      // Check if user has admin role
      const isAdmin = authContext.role === UserRole.ADMIN;

      if (!isAdmin) {
        res.json({
          success: true,
          data: {
            canSendTransactions: false,
            balance: "N/A",
            role: authContext.role || "none",
            reason: "Only admin users can send ETH transactions",
          },
        });
        return;
      }

      // User is admin, now check if they have ETH balance and wallet
      try {
        // Import TransactionService dynamically to avoid circular dependencies
        const { TransactionService } = await import(
          "../services/transaction.js"
        );

        // Use class properties for agent and dataSource
        const transactionService = new TransactionService(
          this.agent,
          this.dataSource
        );

        // Try to get user's balance
        const balance = await transactionService.getUserBalance(req.user.id);
        const balanceNumber = parseFloat(balance);

        // Define minimum gas fee for a transaction (approximate)
        const minGasFee = 0.00002; // ~0.00002 ETH for a simple transfer

        // Admin user can send transactions if they have enough balance to cover gas
        const canSend = balanceNumber > minGasFee;

        res.json({
          success: true,
          data: {
            canSendTransactions: canSend,
            balance: balance,
            role: authContext.role,
            minGasRequired: minGasFee.toString(),
            reason: canSend
              ? "Admin user with sufficient ETH balance"
              : balanceNumber === 0
              ? "Admin user but no ETH balance available"
              : "Admin user but insufficient balance to cover gas fees",
          },
        });
      } catch (balanceError) {
        // Admin user but can't get balance (no wallet/DID)
        logger.error("Error getting admin user balance:", balanceError);
        res.json({
          success: true,
          data: {
            canSendTransactions: false,
            balance: "0",
            role: authContext.role,
            minGasRequired: "0.00002",
            reason: "Admin user but no wallet or DID available",
          },
        });
      }
    } catch (error) {
      logger.error("Error checking transaction permissions:", error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  /**
   * Helper method to get comprehensive user permissions
   */
  private async getUserPermissions(user: any): Promise<any> {
    const authContext = await this.authorizationService.getUserAuthContext(
      user.id
    );

    // Get user's organization details
    let organization = null;
    if (user.organizationId) {
      organization = await this.organizationService.getOrganizationById(
        user.organizationId
      );
    }

    // Get managed organizations
    const managedOrganizations =
      await this.authorizationService.getUserManagedOrganizations(user.id);

    // Get hierarchical credentials
    let hierarchicalCredentials = [];
    if (user.hierarchicalCredentials) {
      try {
        hierarchicalCredentials = JSON.parse(user.hierarchicalCredentials);
      } catch (e) {
        logger.warn(
          "Failed to parse hierarchical credentials for user:",
          user.id
        );
      }
    }

    // Get regular credentials
    let credentials = [];
    if (user.credentials) {
      try {
        credentials = JSON.parse(user.credentials);
      } catch (e) {
        logger.warn("Failed to parse credentials for user:", user.id);
      }
    }

    // Check specific permissions
    const permissions = {
      // Organization management
      canCreateOrganizations: {
        giga: await this.authorizationService.canCreateOrganization(
          user.id,
          OrganizationType.GIGA
        ),
        country_office: await this.authorizationService.canCreateOrganization(
          user.id,
          OrganizationType.COUNTRY_OFFICE
        ),
        government: await this.authorizationService.canCreateOrganization(
          user.id,
          OrganizationType.GOVERNMENT
        ),
        school: await this.authorizationService.canCreateOrganization(
          user.id,
          OrganizationType.SCHOOL
        ),
      },

      // Credential management
      canIssueCredentials: user.organizationId
        ? await this.authorizationService.canIssueCredential(
            user.id,
            user.organizationId
          )
        : false,

      // User management
      canAssociateUsers: user.organizationId
        ? await this.authorizationService.canAssociateUsers(
            user.id,
            user.organizationId
          )
        : false,

      // Organization access
      canUpdateOrganizationStatus: user.organizationId
        ? await this.authorizationService.canUpdateOrganizationStatus(
            user.id,
            user.organizationId
          )
        : false,
    };

    return {
      authContext,
      organization,
      managedOrganizations,
      hierarchicalCredentials,
      credentials,
      permissions,
      role: user.organizationRole,
      isAssociated: !!user.organizationId,
    };
  }
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

export const issueCredentialValidation = [
  body("issuerDid").notEmpty().withMessage("Issuer DID is required"),
  body("subjectDid").notEmpty().withMessage("Subject DID is required"),
  body("credentialType")
    .isIn(Object.values(CredentialType))
    .withMessage("Invalid credential type"),
  body("claims").isObject().withMessage("Claims must be an object"),
  body("expiresAt")
    .optional()
    .isISO8601()
    .withMessage("Expiration date must be in ISO 8601 format"),
];

export const issueStudentCredentialByUsernameValidation = [
  body("issuerDid").notEmpty().withMessage("Issuer DID is required"),
  body("studentUsername")
    .notEmpty()
    .withMessage("Student or worker username is required"),
  body("credentialType")
    .isIn([
      CredentialType.STUDENT_ENROLLMENT,
      CredentialType.INFORMATION_WORKER,
      CredentialType.ATTENDANCE_CERTIFICATE,
      CredentialType.GRADUATION_DIPLOMA,
    ])
    .withMessage("Invalid student credential type"),
  body("claims").isObject().withMessage("Claims must be an object"),
  body("expiresAt")
    .optional()
    .isISO8601()
    .withMessage("Expiration date must be in ISO 8601 format"),
];

export const revokeCredentialValidation = [
  body("credentialId").notEmpty().withMessage("Credential ID is required"),
  body("revokerDid").notEmpty().withMessage("Revoker DID is required"),
  body("reason").notEmpty().withMessage("Revocation reason is required"),
];

export const revokeCredentialByAdminValidation = [
  body("credentialId").notEmpty().withMessage("Credential ID is required"),
  body("reason").notEmpty().withMessage("Revocation reason is required"),
];

export const didParamValidation = [
  param("did").notEmpty().withMessage("DID parameter is required"),
];

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
