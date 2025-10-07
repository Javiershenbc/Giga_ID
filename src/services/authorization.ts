import { Repository, DataSource, IsNull } from "typeorm";
import { User, UserRole } from "../models/user.js";
import {
  Organization,
  OrganizationType,
  OrganizationStatus,
} from "../models/organization.js";
import { AppDataSource } from "../data-source.js";
import { logger } from "../utils/logger.js";

export interface AuthorizationContext {
  userId: string;
  organizationId?: string;
  role?: UserRole;
}

export class AuthorizationService {
  private userRepository: Repository<User>;
  private organizationRepository: Repository<Organization>;

  constructor(dataSource?: DataSource) {
    if (dataSource) {
      this.userRepository = dataSource.getRepository(User);
      this.organizationRepository = dataSource.getRepository(Organization);
    } else {
      this.userRepository = AppDataSource.getRepository(User);
      this.organizationRepository = AppDataSource.getRepository(Organization);
    }
  }

  /**
   * Get user's authorization context
   */
  async getUserAuthContext(
    userId: string
  ): Promise<AuthorizationContext | null> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      select: ["id", "organizationId", "organizationRole"],
    });

    if (!user) return null;

    return {
      userId: user.id,
      organizationId: user.organizationId,
      role: user.organizationRole,
    };
  }

  /**
   * Check if user is a Giga admin (has super-admin privileges)
   */
  async isGigaAdmin(userId: string): Promise<boolean> {
    const authContext = await this.getUserAuthContext(userId);
    if (!authContext || !authContext.organizationId) return false;

    // Check if user is associated with Giga organization and has admin role
    if (authContext.role !== UserRole.ADMIN) return false;

    const organization = await this.organizationRepository.findOne({
      where: { id: authContext.organizationId },
      select: ["id", "type"],
    });

    return organization?.type === OrganizationType.GIGA;
  }

  /**
   * Associate a user with an organization
   */
  async associateUserWithOrganization(
    userId: string,
    organizationId: string,
    role: UserRole = UserRole.ADMIN
  ): Promise<User> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new Error("User not found");
    }

    const organization = await this.organizationRepository.findOne({
      where: { id: organizationId },
    });
    if (!organization) {
      throw new Error("Organization not found");
    }

    user.organizationId = organizationId;
    user.organizationRole = role;

    return await this.userRepository.save(user);
  }

  /**
   * Check if user can create organizations of a specific type
   */
  async canCreateOrganization(
    userId: string,
    organizationType: OrganizationType,
    parentId?: string
  ): Promise<boolean> {
    // Check if user is Giga admin first (super-admin privileges)
    if (await this.isGigaAdmin(userId)) {
      console.log(
        `[AUTH DEBUG] Giga admin can create any organization type: ${organizationType}`
      );
      return true; // Giga admins can create any organization anywhere
    }

    const authContext = await this.getUserAuthContext(userId);

    console.log(`[AUTH DEBUG] canCreateOrganization:`, {
      userId,
      organizationType,
      parentId,
      authContext,
    });

    // Giga organization can only be created if no other Giga exists (handled in validation)
    if (organizationType === OrganizationType.GIGA) {
      console.log(`[AUTH DEBUG] Creating Giga organization`);
      return true; // Allow creation of root organization
    }

    // If user is not associated with any organization, they can still create if they will be the admin
    // This allows the flow: Giga user creates Country Office → Country Office user creates Government → etc.
    if (!authContext || !authContext.organizationId) {
      console.log(
        `[AUTH DEBUG] User not associated with any org, checking parent org`
      );
      // Check if the parent organization exists and is verified
      const parentOrg = await this.organizationRepository.findOne({
        where: { id: parentId },
      });

      console.log(`[AUTH DEBUG] Parent org:`, parentOrg);

      if (!parentOrg || parentOrg.status !== OrganizationStatus.VERIFIED) {
        console.log(`[AUTH DEBUG] Parent org not found or not verified`);
        return false;
      }

      // Allow creation if the parent type matches the hierarchy rules
      if (organizationType === OrganizationType.COUNTRY_OFFICE) {
        const canCreate = parentOrg.type === OrganizationType.GIGA;
        console.log(
          `[AUTH DEBUG] Country Office creation (unassociated user): ${canCreate}`
        );
        return canCreate;
      }

      if (organizationType === OrganizationType.GOVERNMENT) {
        const canCreate = parentOrg.type === OrganizationType.COUNTRY_OFFICE;
        console.log(
          `[AUTH DEBUG] Government creation (unassociated user): ${canCreate}`
        );
        return canCreate;
      }

      if (organizationType === OrganizationType.SCHOOL) {
        const canCreate = parentOrg.type === OrganizationType.GOVERNMENT;
        console.log(
          `[AUTH DEBUG] School creation (unassociated user): ${canCreate}`
        );
        return canCreate;
      }

      return false;
    }

    // If user is associated with an organization, check if it's the parent AND user has appropriate role
    const userOrg = await this.organizationRepository.findOne({
      where: { id: authContext.organizationId },
    });

    console.log(`[AUTH DEBUG] User org:`, userOrg);

    if (!userOrg) {
      console.log(`[AUTH DEBUG] User org not found`);
      return false;
    }

    // Only ADMIN users can create child organizations
    // Exception: Country Office STAFF can also create Government organizations
    const hasRequiredRole =
      authContext.role === UserRole.ADMIN ||
      (userOrg.type === OrganizationType.COUNTRY_OFFICE &&
        authContext.role === UserRole.STAFF &&
        organizationType === OrganizationType.GOVERNMENT);

    if (!hasRequiredRole) {
      console.log(
        `[AUTH DEBUG] User role ${authContext.role} insufficient for creating organizations`
      );
      return false;
    }

    // User's organization must be verified
    if (userOrg.status !== OrganizationStatus.VERIFIED) {
      console.log(`[AUTH DEBUG] User org not verified`);
      return false;
    }

    // Check if user's organization can be parent of the target organization type
    if (organizationType === OrganizationType.COUNTRY_OFFICE) {
      const canCreate = userOrg.type === OrganizationType.GIGA;
      console.log(`[AUTH DEBUG] Country Office creation: ${canCreate}`);
      return canCreate && authContext.organizationId === parentId;
    }

    if (organizationType === OrganizationType.GOVERNMENT) {
      const canCreate = userOrg.type === OrganizationType.COUNTRY_OFFICE;
      console.log(`[AUTH DEBUG] Government creation: ${canCreate}`);
      return canCreate && authContext.organizationId === parentId;
    }

    if (organizationType === OrganizationType.SCHOOL) {
      const canCreate = userOrg.type === OrganizationType.GOVERNMENT;
      console.log(`[AUTH DEBUG] School creation: ${canCreate}`);
      return canCreate && authContext.organizationId === parentId;
    }

    return false;
  }

  /**
   * Check if user can update organization status
   */
  async canUpdateOrganizationStatus(
    userId: string,
    targetOrganizationId: string
  ): Promise<boolean> {
    // Check if user is Giga admin first (super-admin privileges)
    if (await this.isGigaAdmin(userId)) {
      console.log(`[AUTH DEBUG] Giga admin can update any organization status`);
      return true; // Giga admins can update any organization status
    }

    const authContext = await this.getUserAuthContext(userId);
    if (!authContext || !authContext.organizationId) return false;

    // Only ADMIN users can update organization status
    if (authContext.role !== UserRole.ADMIN) {
      return false;
    }

    const userOrg = await this.organizationRepository.findOne({
      where: { id: authContext.organizationId },
    });

    const targetOrg = await this.organizationRepository.findOne({
      where: { id: targetOrganizationId },
    });

    if (!userOrg || !targetOrg) return false;

    // Only verified organizations can update status of their children
    if (userOrg.status !== OrganizationStatus.VERIFIED) return false;

    // Check if target organization is a direct child
    return targetOrg.parentId === userOrg.id;
  }

  /**
   * Check if user can issue credentials on behalf of an organization
   */
  async canIssueCredential(
    userId: string,
    issuerOrganizationId: string
  ): Promise<boolean> {
    // Check if user is Giga admin first (super-admin privileges)
    if (await this.isGigaAdmin(userId)) {
      console.log(
        `[AUTH DEBUG] Giga admin can issue credentials for any organization`
      );
      return true; // Giga admins can issue credentials for any organization
    }

    const authContext = await this.getUserAuthContext(userId);
    if (!authContext) return false;

    // User must be associated with the issuer organization
    if (authContext.organizationId !== issuerOrganizationId) return false;

    // User must have admin role to issue credentials
    // Exception: Country Office STAFF can also issue credentials
    const organization = await this.organizationRepository.findOne({
      where: { id: issuerOrganizationId },
    });

    if (!organization) return false;

    const hasRequiredRole =
      authContext.role === UserRole.ADMIN ||
      (organization.type === OrganizationType.COUNTRY_OFFICE &&
        authContext.role === UserRole.STAFF);

    if (!hasRequiredRole) return false;

    // Organization must be verified
    return organization.status === OrganizationStatus.VERIFIED;
  }

  /**
   * Get organizations that a user can manage
   */
  async getUserManagedOrganizations(userId: string): Promise<Organization[]> {
    // Check if user is Giga admin first (super-admin privileges)
    if (await this.isGigaAdmin(userId)) {
      console.log(`[AUTH DEBUG] Giga admin can manage all organizations`);
      // Return ALL organizations for Giga admins
      return await this.organizationRepository.find({
        relations: ["children"],
      });
    }

    const authContext = await this.getUserAuthContext(userId);
    if (!authContext || !authContext.organizationId) return [];

    const userOrg = await this.organizationRepository.findOne({
      where: { id: authContext.organizationId },
      relations: ["children"],
    });

    if (!userOrg) return [];

    // Return user's organization and its children
    return [userOrg, ...userOrg.children];
  }

  /**
   * Check if user can view/manage a specific organization
   */
  async canAccessOrganization(
    userId: string,
    organizationId: string
  ): Promise<boolean> {
    const managedOrgs = await this.getUserManagedOrganizations(userId);
    return managedOrgs.some((org) => org.id === organizationId);
  }

  /**
   * Check if user can associate other users with an organization
   */
  async canAssociateUsers(
    userId: string,
    organizationId: string
  ): Promise<boolean> {
    // Check if user is Giga admin first (super-admin privileges)
    if (await this.isGigaAdmin(userId)) {
      console.log(
        `[AUTH DEBUG] Giga admin can associate users with any organization`
      );
      return true; // Giga admins can associate users with any organization
    }

    const authContext = await this.getUserAuthContext(userId);
    if (!authContext) return false;

    // Only ADMIN users can associate other users
    if (authContext.role !== UserRole.ADMIN) {
      return false;
    }

    return await this.canAccessOrganization(userId, organizationId);
  }

  /**
   * Associate a user with an organization by username
   * This allows existing users to be linked to newly created organizations
   */
  async associateUserByUsername(
    username: string,
    organizationId: string,
    role: UserRole = UserRole.ADMIN
  ): Promise<User> {
    const user = await this.userRepository.findOne({ where: { username } });
    if (!user) {
      throw new Error("User not found");
    }

    const organization = await this.organizationRepository.findOne({
      where: { id: organizationId },
    });
    if (!organization) {
      throw new Error("Organization not found");
    }

    // Check if user is already associated with another organization
    if (user.organizationId && user.organizationId !== organizationId) {
      throw new Error("User is already associated with another organization");
    }

    user.organizationId = organizationId;
    user.organizationRole = role;

    return await this.userRepository.save(user);
  }

  /**
   * Get users that can be associated with an organization
   */
  async getAvailableUsers(): Promise<User[]> {
    return await this.userRepository.find({
      where: { organizationId: IsNull() },
      select: ["id", "username", "displayName"],
    });
  }

  /**
   * Get user's DID by username
   */
  async getUserDidByUsername(username: string): Promise<string | null> {
    const user = await this.userRepository.findOne({
      where: { username },
      select: ["did"],
    });
    return user?.did || null;
  }

  /**
   * Get user by DID
   */
  async getUserByDid(did: string): Promise<User | null> {
    return await this.userRepository.findOne({
      where: { did },
      select: ["id", "username", "displayName", "did"],
    });
  }

  /**
   * Get organizations with their associated users (only for organizations the current user can access)
   */
  async getOrganizationsWithUsers(userId: string): Promise<
    Array<{
      organization: Organization;
      users: Array<{
        id: string;
        username: string;
        displayName: string;
        role: UserRole;
      }>;
    }>
  > {
    // Get organizations the user can manage
    const managedOrganizations = await this.getUserManagedOrganizations(userId);

    const result = [];

    for (const org of managedOrganizations) {
      // Get users associated with this organization
      const users = await this.userRepository.find({
        where: { organizationId: org.id },
        select: ["id", "username", "displayName", "organizationRole"],
      });

      result.push({
        organization: org,
        users: users.map((user) => ({
          id: user.id,
          username: user.username,
          displayName: user.displayName,
          role: user.organizationRole || UserRole.MEMBER,
        })),
      });
    }

    return result;
  }

  /**
   * Get user by username
   */
  async getUserByUsername(username: string): Promise<User | null> {
    return await this.userRepository.findOne({
      where: { username },
    });
  }

  /**
   * Get user by ID
   */
  async getUserById(userId: string): Promise<User | null> {
    return await this.userRepository.findOne({
      where: { id: userId },
    });
  }
}
