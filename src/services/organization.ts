import { DataSource, Repository } from "typeorm";
import {
  Organization,
  OrganizationType,
  OrganizationStatus,
} from "../models/organization.js";
import { AppDataSource } from "../data-source.js";
import { logger } from "../utils/logger.js";

export interface CreateOrganizationParams {
  name: string;
  type: OrganizationType;
  description?: string;
  country?: string;
  region?: string;
  contactEmail?: string;
  parentId?: string;
}

export interface OrganizationHierarchy {
  organization: Organization;
  children: OrganizationHierarchy[];
  depth: number;
}

export class OrganizationService {
  private organizationRepository: Repository<Organization>;

  constructor(dataSource?: DataSource) {
    // Use provided dataSource or fall back to AppDataSource for backward compatibility
    if (dataSource) {
      this.organizationRepository = dataSource.getRepository(Organization);
    } else {
      this.organizationRepository = AppDataSource.getRepository(Organization);
    }
  }

  /**
   * Create a new organization with a DID
   */
  async createOrganization(
    params: CreateOrganizationParams
  ): Promise<Organization> {
    try {
      // Validate hierarchy rules
      await this.validateHierarchy(params.type, params.parentId);

      // Create organization record
      const organization = this.organizationRepository.create({
        name: params.name,
        type: params.type,
        description: params.description,
        country: params.country,
        region: params.region,
        contactEmail: params.contactEmail,
        parentId: params.parentId,
        status:
          params.type === OrganizationType.GIGA
            ? OrganizationStatus.VERIFIED
            : OrganizationStatus.PENDING,
      });

      logger.info(
        `Creating organization: ${params.name} (${params.type}) with parent: ${params.parentId}`
      );

      const savedOrganization = await this.organizationRepository.save(
        organization
      );

      logger.info(
        `Created organization: ${savedOrganization.name} (${savedOrganization.type})`
      );
      return savedOrganization;
    } catch (error) {
      logger.error("Error creating organization:", error);
      throw error;
    }
  }

  /**
   * Validate hierarchy rules
   */
  private async validateHierarchy(
    type: OrganizationType,
    parentId?: string
  ): Promise<void> {
    if (type === OrganizationType.GIGA) {
      if (parentId) {
        throw new Error("Giga organization cannot have a parent");
      }
      // Check if Giga already exists
      const existingGiga = await this.organizationRepository.findOne({
        where: { type: OrganizationType.GIGA },
      });
      if (existingGiga) {
        throw new Error("Giga organization already exists");
      }
    } else if (type === OrganizationType.COUNTRY_OFFICE) {
      if (!parentId) {
        throw new Error("Country Office must have Giga as parent");
      }
      const parent = await this.organizationRepository.findOne({
        where: { id: parentId },
      });
      if (!parent || parent.type !== OrganizationType.GIGA) {
        throw new Error("Country Office parent must be Giga organization");
      }
    } else if (type === OrganizationType.GOVERNMENT) {
      if (!parentId) {
        throw new Error("Government must have Country Office as parent");
      }
      const parent = await this.organizationRepository.findOne({
        where: { id: parentId },
      });
      if (!parent || parent.type !== OrganizationType.COUNTRY_OFFICE) {
        throw new Error(
          "Government parent must be Country Office organization"
        );
      }
    } else if (type === OrganizationType.SCHOOL) {
      if (!parentId) {
        throw new Error("School must have a Government as parent");
      }
      const parent = await this.organizationRepository.findOne({
        where: { id: parentId },
      });
      if (!parent || parent.type !== OrganizationType.GOVERNMENT) {
        throw new Error("School parent must be Government organization");
      }
    }
  }

  /**
   * Get organization by ID with minimal data
   */
  async getOrganizationById(id: string): Promise<Organization | null> {
    return await this.organizationRepository.findOne({
      where: { id },
      select: [
        "id",
        "name",
        "type",
        "status",
        "country",
        "region",
        "parentId",
        "description",
        "contactEmail",
      ],
    });
  }

  // getOrganizationByDid removed in Azure AD migration

  /**
   * Get all organizations of a specific type with minimal data
   */
  async getOrganizationsByType(
    type: OrganizationType
  ): Promise<Organization[]> {
    return await this.organizationRepository.find({
      where: { type },
      select: ["id", "name", "type", "status", "country", "region", "parentId"],
      order: { createdAt: "ASC" },
    });
  }

  /**
   * Get organization hierarchy starting from a specific organization
   */
  async getOrganizationHierarchy(
    organizationId: string
  ): Promise<OrganizationHierarchy | null> {
    const organization = await this.getOrganizationById(organizationId);
    if (!organization) return null;

    return await this.buildHierarchy(organization, 0);
  }

  /**
   * Build hierarchy tree recursively
   */
  private async buildHierarchy(
    organization: Organization,
    depth: number
  ): Promise<OrganizationHierarchy> {
    const children = await this.organizationRepository.find({
      where: { parentId: organization.id },
      relations: ["children"],
    });

    const childHierarchies: OrganizationHierarchy[] = [];
    for (const child of children) {
      const childHierarchy = await this.buildHierarchy(child, depth + 1);
      childHierarchies.push(childHierarchy);
    }

    return {
      organization,
      children: childHierarchies,
      depth,
    };
  }

  /**
   * Update organization status
   */
  async updateOrganizationStatus(
    id: string,
    status: OrganizationStatus
  ): Promise<Organization> {
    const organization = await this.getOrganizationById(id);
    if (!organization) {
      throw new Error("Organization not found");
    }

    // Validate status update based on organization type
    if (organization.type === OrganizationType.GIGA) {
      // Giga can only be VERIFIED or SUSPENDED
      if (
        status !== OrganizationStatus.VERIFIED &&
        status !== OrganizationStatus.SUSPENDED
      ) {
        throw new Error("Giga organization can only be VERIFIED or SUSPENDED");
      }
    } else if (organization.type === OrganizationType.GOVERNMENT) {
      // Government can be PENDING, VERIFIED, or SUSPENDED
      if (status === OrganizationStatus.REVOKED) {
        throw new Error("Government organization cannot be REVOKED");
      }
      // Only Giga can verify a government
      if (
        status === OrganizationStatus.VERIFIED &&
        organization.parent?.type !== OrganizationType.GIGA
      ) {
        throw new Error("Only Giga can verify a government organization");
      }
    } else if (organization.type === OrganizationType.SCHOOL) {
      // School can be PENDING, VERIFIED, or SUSPENDED
      if (status === OrganizationStatus.REVOKED) {
        throw new Error("School organization cannot be REVOKED");
      }
      // Only verified government can verify a school
      if (status === OrganizationStatus.VERIFIED) {
        const parent = await this.getOrganizationById(organization.parentId!);
        if (
          !parent ||
          parent.type !== OrganizationType.GOVERNMENT ||
          parent.status !== OrganizationStatus.VERIFIED
        ) {
          throw new Error(
            "Only verified government can verify a school organization"
          );
        }
      }
    }

    organization.status = status;
    return await this.organizationRepository.save(organization);
  }

  /**
   * Get organizations that can issue credentials to a specific type
   */
  async getAuthorizedIssuers(
    targetType: OrganizationType
  ): Promise<Organization[]> {
    let issuerType: OrganizationType;

    switch (targetType) {
      case OrganizationType.GOVERNMENT:
        issuerType = OrganizationType.GIGA;
        break;
      case OrganizationType.SCHOOL:
        issuerType = OrganizationType.GOVERNMENT;
        break;
      case OrganizationType.STUDENT:
        issuerType = OrganizationType.SCHOOL;
        break;
      default:
        throw new Error(`No authorized issuers for type: ${targetType}`);
    }

    return await this.organizationRepository.find({
      where: {
        type: issuerType,
        status: OrganizationStatus.VERIFIED,
      },
    });
  }

  /**
   * Check if an organization can issue credentials to another
   */
  async canIssueCredential(
    issuerId: string,
    subjectId: string,
    userId?: string
  ): Promise<boolean> {
    const issuer = await this.getOrganizationById(issuerId);
    const subject = await this.getOrganizationById(subjectId);

    if (!issuer || !subject) return false;

    // Check if user is Giga admin first (super-admin privileges)
    if (userId && issuer.type === OrganizationType.GIGA) {
      // Import here to avoid circular dependencies
      const { AuthorizationService } = await import("./authorization.js");
      const dataSource = this.organizationRepository.manager.connection;
      const authService = new AuthorizationService(dataSource as any);

      if (await authService.isGigaAdmin(userId)) {
        console.log(
          `[ORG DEBUG] Giga admin can issue credentials to any organization`
        );
        return true; // Giga admins can issue credentials to any organization
      }
    }

    // Check hierarchy rules
    if (
      issuer.type === OrganizationType.GIGA &&
      subject.type === OrganizationType.COUNTRY_OFFICE
    ) {
      return subject.parentId === issuer.id;
    }
    if (
      issuer.type === OrganizationType.COUNTRY_OFFICE &&
      subject.type === OrganizationType.GOVERNMENT
    ) {
      return subject.parentId === issuer.id;
    }
    if (
      issuer.type === OrganizationType.GOVERNMENT &&
      subject.type === OrganizationType.SCHOOL
    ) {
      return subject.parentId === issuer.id;
    }
    if (
      issuer.type === OrganizationType.SCHOOL &&
      subject.type === OrganizationType.STUDENT
    ) {
      // For students, we'll check if they're enrolled in the school
      return true; // This would be validated through enrollment credentials
    }

    return false;
  }

  /**
   * Get the complete hierarchy tree starting from Giga
   */
  async getCompleteHierarchy(): Promise<OrganizationHierarchy | null> {
    const giga = await this.organizationRepository.findOne({
      where: { type: OrganizationType.GIGA },
    });

    if (!giga) return null;

    return await this.buildHierarchy(giga, 0);
  }
}
