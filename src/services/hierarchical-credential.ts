import { Repository, DataSource } from "typeorm";
import {
  VerifiableCredential,
  ICreateVerifiableCredentialArgs,
  IVerifyCredentialArgs,
  IVerifyResult,
} from "@veramo/core";
import { ConfiguredAgent } from "../agent/setup.js";
import { AppDataSource } from "../data-source.js";
import {
  Organization,
  OrganizationType,
  OrganizationStatus,
} from "../models/organization.js";
import {
  CredentialRecord,
  CredentialType,
  CredentialStatus,
} from "../models/credential-record.js";
import { OrganizationService } from "./organization.js";

export interface IssueCredentialParams {
  issuerDid: string;
  subjectDid: string;
  credentialType: CredentialType;
  claims: Record<string, any>;
  expiresAt?: Date;
}

export interface CredentialTemplate {
  "@context": string[];
  type: string[];
  credentialSubject: Record<string, any>;
}

export interface VerificationResult {
  isValid: boolean;
  isAuthorized: boolean;
  credential: VerifiableCredential;
  issuer: Organization | null;
  subject: Organization | null;
  errors: string[];
}

export class HierarchicalCredentialService {
  private agent: ConfiguredAgent;
  private organizationService: OrganizationService;
  private credentialRepository: Repository<CredentialRecord>;
  private dataSource: DataSource;

  constructor(agent: ConfiguredAgent, dataSource?: DataSource) {
    this.agent = agent;
    if (dataSource) {
      this.dataSource = dataSource;
      this.organizationService = new OrganizationService(agent, dataSource);
      this.credentialRepository = dataSource.getRepository(CredentialRecord);
    } else {
      // Fall back to AppDataSource for backward compatibility
      this.dataSource = AppDataSource;
      this.organizationService = new OrganizationService(agent);
      this.credentialRepository = AppDataSource.getRepository(CredentialRecord);
    }
  }

  /**
   * Issue a credential with hierarchy validation
   */
  async issueCredential(
    params: IssueCredentialParams,
    userId?: string
  ): Promise<VerifiableCredential> {
    try {
      // 1. Validate issuer exists
      const issuer = await this.organizationService.getOrganizationByDid(
        params.issuerDid
      );

      if (!issuer) {
        throw new Error(
          `Issuer organization not found for DID: ${params.issuerDid}`
        );
      }

      // 2. For student credentials, subject is an individual, not an organization
      let subject: Organization | null = null;
      const isStudentCredential = this.isStudentCredential(
        params.credentialType
      );

      if (!isStudentCredential) {
        // For organizational credentials, validate subject organization exists
        subject = await this.organizationService.getOrganizationByDid(
          params.subjectDid
        );
        if (!subject) {
          throw new Error(
            `Subject organization not found for DID: ${params.subjectDid}`
          );
        }
      }

      // 3. Validate issuer is authorized to issue this type of credential
      await this.validateIssuanceAuthorization(
        issuer,
        subject,
        params.credentialType,
        userId
      );

      // 4. Create credential template based on type
      const credentialTemplate = this.createCredentialTemplate(
        params.credentialType,
        params.claims,
        subject || issuer // Use issuer as fallback for student credentials
      );

      // 5. Issue the credential using Veramo
      const credentialArgs: ICreateVerifiableCredentialArgs = {
        credential: {
          "@context": credentialTemplate["@context"],
          type: credentialTemplate.type,
          issuer: params.issuerDid,
          credentialSubject: {
            id: params.subjectDid,
            ...credentialTemplate.credentialSubject,
            ...params.claims,
          },
          ...(params.expiresAt && {
            expirationDate: params.expiresAt.toISOString(),
          }),
        },
        proofFormat: "jwt",
      };

      const verifiableCredential = await this.agent.createVerifiableCredential(
        credentialArgs
      );

      // 6. Store credential record
      if (isStudentCredential) {
        // For student credentials, create a special record structure
        const record = this.credentialRepository.create({
          credentialId: this.extractCredentialId(verifiableCredential),
          credentialType: params.credentialType,
          issuerDid: params.issuerDid,
          subjectDid: params.subjectDid, // This is the student's DID
          issuerId: issuer.id, // School organization ID
          subjectId: undefined, // Students don't have organization IDs
          credentialData: JSON.stringify(verifiableCredential),
          claims: JSON.stringify(verifiableCredential.credentialSubject),
          expiresAt: params.expiresAt,
          status: CredentialStatus.ACTIVE,
        });

        console.log(`[CREDENTIAL DEBUG] Storing student credential record:`);
        console.log(
          `[CREDENTIAL DEBUG] - Credential ID: ${record.credentialId}`
        );
        console.log(`[CREDENTIAL DEBUG] - Type: ${params.credentialType}`);
        console.log(`[CREDENTIAL DEBUG] - Issuer DID: ${params.issuerDid}`);
        console.log(
          `[CREDENTIAL DEBUG] - Subject DID (Student): ${params.subjectDid}`
        );
        console.log(`[CREDENTIAL DEBUG] - Issuer ID (School): ${issuer.id}`);
        console.log(`[CREDENTIAL DEBUG] - Subject ID: undefined (student)`);

        await this.credentialRepository.save(record);
      } else {
        // For organizational credentials, use the existing method
        await this.storeCredentialRecord({
          credential: verifiableCredential,
          issuer,
          subject: subject!,
          credentialType: params.credentialType,
          expiresAt: params.expiresAt,
        });
      }

      // 7. Update subject's authorization credential if applicable (only for organizational credentials)
      if (subject && this.isAuthorizationCredential(params.credentialType)) {
        subject.authorizationCredential = JSON.stringify(verifiableCredential);
        subject.status = OrganizationStatus.VERIFIED;
        await this.dataSource.getRepository(Organization).save(subject);
      }

      const subjectName = subject ? subject.name : params.subjectDid;
      console.log(
        `Issued ${params.credentialType} credential from ${issuer.name} to ${subjectName}`
      );
      return verifiableCredential;
    } catch (error) {
      console.error("Error issuing credential:", error);
      throw error;
    }
  }

  /**
   * Issue a student credential using username instead of DID
   */
  async issueStudentCredentialByUsername(params: {
    issuerDid: string;
    studentUsername: string;
    credentialType: CredentialType;
    claims: Record<string, any>;
    expiresAt?: Date;
  }): Promise<VerifiableCredential> {
    // Validate it's a student credential type
    if (!this.isStudentCredential(params.credentialType)) {
      throw new Error(
        `${params.credentialType} is not a student credential type`
      );
    }

    // Get student's DID by username
    const userRepository = this.dataSource.getRepository("User");
    const student = await userRepository.findOne({
      where: { username: params.studentUsername },
      select: ["did", "username"],
    });

    if (!student || !student.did) {
      throw new Error(
        `Student ${params.studentUsername} not found or has no DID`
      );
    }

    console.log(`[CREDENTIAL DEBUG] Issuing student credential by username:`);
    console.log(
      `[CREDENTIAL DEBUG] - Student username or worker username: ${params.studentUsername}`
    );
    console.log(`[CREDENTIAL DEBUG] - Student DID: ${student.did}`);

    // Issue the credential using the student's DID
    return await this.issueCredential({
      issuerDid: params.issuerDid,
      subjectDid: student.did,
      credentialType: params.credentialType,
      claims: params.claims,
      expiresAt: params.expiresAt,
    });
  }

  /**
   * Verify a credential and check authorization hierarchy
   */
  async verifyCredential(
    credential: VerifiableCredential
  ): Promise<VerificationResult> {
    const result: VerificationResult = {
      isValid: false,
      isAuthorized: false,
      credential,
      issuer: null,
      subject: null,
      errors: [],
    };

    try {
      // 1. Verify credential cryptographically
      const verifyArgs: IVerifyCredentialArgs = { credential };
      const verificationResult: IVerifyResult =
        await this.agent.verifyCredential(verifyArgs);

      result.isValid = verificationResult.verified;
      if (!result.isValid) {
        result.errors.push("Credential cryptographic verification failed");
        if (verificationResult.error) {
          result.errors.push(
            verificationResult.error.message || "Unknown verification error"
          );
        }
      }

      // 2. Get issuer and subject organizations
      const issuerDid =
        typeof credential.issuer === "string"
          ? credential.issuer
          : credential.issuer.id;
      const subjectDid = credential.credentialSubject.id;

      result.issuer = await this.organizationService.getOrganizationByDid(
        issuerDid
      );
      result.subject = await this.organizationService.getOrganizationByDid(
        subjectDid || ""
      );

      if (!result.issuer) {
        result.errors.push(
          `Issuer organization not found for DID: ${issuerDid}`
        );
      }
      if (!result.subject) {
        result.errors.push(
          `Subject organization not found for DID: ${subjectDid}`
        );
      }

      // 3. Check authorization hierarchy
      if (result.issuer && result.subject) {
        result.isAuthorized = await this.organizationService.canIssueCredential(
          result.issuer.id,
          result.subject.id
        );

        if (!result.isAuthorized) {
          result.errors.push(
            `Issuer ${result.issuer.name} is not authorized to issue credentials to ${result.subject.name}`
          );
        }
      }

      // 4. Check if credential is revoked
      const credentialRecord = await this.getCredentialRecord(credential);
      if (
        credentialRecord &&
        credentialRecord.status === CredentialStatus.REVOKED
      ) {
        result.isValid = false;
        result.errors.push("Credential has been revoked");
      }

      // 5. Check expiration
      if (credential.expirationDate) {
        const expirationDate = new Date(credential.expirationDate);
        if (expirationDate < new Date()) {
          result.isValid = false;
          result.errors.push("Credential has expired");
        }
      }
    } catch (error) {
      result.errors.push(
        `Verification error: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }

    return result;
  }

  /**
   * Revoke a credential
   */
  async revokeCredential(
    credentialId: string,
    revokerDid: string,
    reason: string
  ): Promise<void> {
    const credentialRecord = await this.credentialRepository.findOne({
      where: { credentialId },
      relations: ["issuer"],
    });

    if (!credentialRecord) {
      throw new Error("Credential not found");
    }

    // Only issuer can revoke
    if (credentialRecord.issuerDid !== revokerDid) {
      throw new Error("Only the issuer can revoke this credential");
    }

    credentialRecord.status = CredentialStatus.REVOKED;
    credentialRecord.revocationReason = reason;
    credentialRecord.revokedAt = new Date();

    await this.credentialRepository.save(credentialRecord);
    console.log(`Revoked credential ${credentialId}: ${reason}`);
  }

  /**
   * Revoke a credential by organization admin
   * Allows organization admins to revoke credentials issued by their organization
   */
  async revokeCredentialByAdmin(
    credentialId: string,
    adminUserId: string,
    reason: string
  ): Promise<void> {
    const credentialRecord = await this.credentialRepository.findOne({
      where: { credentialId },
      relations: ["issuer"],
    });

    if (!credentialRecord) {
      throw new Error("Credential not found");
    }

    if (!credentialRecord.issuer) {
      throw new Error("Credential issuer organization not found");
    }

    // Check if the admin user has permission to revoke credentials for this organization
    const { AuthorizationService } = await import("../services/authorization");
    const authorizationService = new AuthorizationService(this.dataSource);
    const canRevoke = await authorizationService.canIssueCredential(
      adminUserId,
      credentialRecord.issuer.id
    );

    if (!canRevoke) {
      throw new Error(
        "You are not authorized to revoke credentials for this organization (requires ADMIN role)"
      );
    }

    credentialRecord.status = CredentialStatus.REVOKED;
    credentialRecord.revocationReason = reason;
    credentialRecord.revokedAt = new Date();

    await this.credentialRepository.save(credentialRecord);
    console.log(
      `Admin revoked credential ${credentialId}: ${reason} (Admin: ${adminUserId})`
    );
  }

  /**
   * Get credentials issued by an organization
   */
  async getIssuedCredentials(issuerDid: string): Promise<CredentialRecord[]> {
    console.log(
      `[CREDENTIAL DEBUG] Getting issued credentials for DID: ${issuerDid}`
    );

    const credentials = await this.credentialRepository.find({
      where: { issuerDid },
      relations: ["issuer", "subject"],
      order: { issuedAt: "DESC" },
    });

    console.log(
      `[CREDENTIAL DEBUG] Found ${credentials.length} issued credentials`
    );
    console.log(
      `[CREDENTIAL DEBUG] Credentials:`,
      credentials.map((c) => ({
        id: c.id,
        credentialId: c.credentialId,
        type: c.credentialType,
        issuerDid: c.issuerDid,
        subjectDid: c.subjectDid,
        status: c.status,
      }))
    );

    return credentials;
  }

  /**
   * Get credentials received by an organization
   */
  async getReceivedCredentials(
    subjectDid: string
  ): Promise<CredentialRecord[]> {
    console.log(
      `[CREDENTIAL DEBUG] Getting received credentials for DID: ${subjectDid}`
    );

    const credentials = await this.credentialRepository.find({
      where: { subjectDid },
      relations: ["issuer", "subject"],
      order: { issuedAt: "DESC" },
    });

    console.log(
      `[CREDENTIAL DEBUG] Found ${credentials.length} received credentials`
    );
    console.log(
      `[CREDENTIAL DEBUG] Credentials:`,
      credentials.map((c) => ({
        id: c.id,
        credentialId: c.credentialId,
        type: c.credentialType,
        issuerDid: c.issuerDid,
        subjectDid: c.subjectDid,
        status: c.status,
      }))
    );

    return credentials;
  }

  /**
   * Get credentials issued by a user (by username)
   */
  async getIssuedCredentialsByUsername(
    username: string
  ): Promise<CredentialRecord[]> {
    // First get the user's DID
    const userRepository = this.dataSource.getRepository("User");
    const user = await userRepository.findOne({
      where: { username },
      select: ["did"],
    });

    if (!user || !user.did) {
      throw new Error(`User ${username} not found or has no DID`);
    }

    return await this.getIssuedCredentials(user.did);
  }

  /**
   * Get credentials received by a user (by username)
   */
  async getReceivedCredentialsByUsername(
    username: string
  ): Promise<CredentialRecord[]> {
    // First get the user's DID
    const userRepository = this.dataSource.getRepository("User");
    const user = await userRepository.findOne({
      where: { username },
      select: ["did"],
    });

    if (!user || !user.did) {
      throw new Error(`User ${username} not found or has no DID`);
    }

    return await this.getReceivedCredentials(user.did);
  }

  /**
   * Get credential chain for verification
   */
  async getCredentialChain(
    organizationDid: string
  ): Promise<CredentialRecord[]> {
    const organization = await this.organizationService.getOrganizationByDid(
      organizationDid
    );
    if (!organization) {
      throw new Error("Organization not found");
    }

    const chain: CredentialRecord[] = [];
    let currentOrg = organization;

    // Walk up the hierarchy collecting authorization credentials
    while (currentOrg && currentOrg.type !== OrganizationType.GIGA) {
      const authCredential = await this.credentialRepository.findOne({
        where: {
          subjectDid: currentOrg.did,
          status: CredentialStatus.ACTIVE,
        },
        relations: ["issuer"],
      });

      if (authCredential && authCredential.issuer) {
        chain.push(authCredential);
        currentOrg = authCredential.issuer;
      } else {
        break;
      }
    }

    return chain.reverse(); // Return from root to leaf
  }

  /**
   * Get credential chain for a user (by username)
   */
  async getCredentialChainByUsername(
    username: string
  ): Promise<CredentialRecord[]> {
    // First get the user's DID
    const userRepository = this.dataSource.getRepository("User");
    const user = await userRepository.findOne({
      where: { username },
      select: ["did"],
    });

    if (!user || !user.did) {
      throw new Error(`User ${username} not found or has no DID`);
    }

    return await this.getCredentialChain(user.did);
  }

  /**
   * Check if credential type is for students
   */
  private isStudentCredential(credentialType: CredentialType): boolean {
    return [
      CredentialType.STUDENT_ENROLLMENT,
      CredentialType.INFORMATION_WORKER,
      CredentialType.ATTENDANCE_CERTIFICATE,
      CredentialType.GRADUATION_DIPLOMA,
    ].includes(credentialType);
  }

  /**
   * Validate issuer authorization for credential type
   */
  private async validateIssuanceAuthorization(
    issuer: Organization,
    subject: Organization | null,
    credentialType: CredentialType,
    userId?: string
  ): Promise<void> {
    // Check if user is Giga admin first (super-admin privileges)
    if (userId && issuer.type === OrganizationType.GIGA) {
      // Import here to avoid circular dependencies
      const { AuthorizationService } = await import("./authorization.js");
      const authService = new AuthorizationService(this.dataSource);

      if (await authService.isGigaAdmin(userId)) {
        console.log(
          `[CREDENTIAL DEBUG] Giga admin can issue any credential type: ${credentialType}`
        );
        // Still check if issuer is verified for Giga admins
        if (issuer.status !== OrganizationStatus.VERIFIED) {
          throw new Error(`Issuer ${issuer.name} is not verified`);
        }
        return; // Skip hierarchy rules for Giga admins
      }
    }

    // Check if issuer is verified
    if (issuer.status !== OrganizationStatus.VERIFIED) {
      throw new Error(`Issuer ${issuer.name} is not verified`);
    }

    // Check hierarchy rules based on credential type
    switch (credentialType) {
      case CredentialType.COUNTRY_OFFICE_AUTHORIZATION:
        if (!subject) {
          throw new Error(
            "Subject organization required for country office authorization"
          );
        }
        if (
          issuer.type !== OrganizationType.GIGA ||
          subject.type !== OrganizationType.COUNTRY_OFFICE
        ) {
          throw new Error(
            "Country Office authorization can only be issued by Giga to Country Offices"
          );
        }
        break;

      case CredentialType.GOVERNMENT_AUTHORIZATION:
        if (!subject) {
          throw new Error(
            "Subject organization required for government authorization"
          );
        }
        if (
          issuer.type !== OrganizationType.COUNTRY_OFFICE ||
          subject.type !== OrganizationType.GOVERNMENT
        ) {
          throw new Error(
            "Government authorization can only be issued by Country Offices to Governments"
          );
        }
        break;

      case CredentialType.SCHOOL_AUTHORIZATION:
        if (!subject) {
          throw new Error(
            "Subject organization required for school authorization"
          );
        }
        if (
          issuer.type !== OrganizationType.GOVERNMENT ||
          subject.type !== OrganizationType.SCHOOL
        ) {
          throw new Error(
            "School authorization can only be issued by Governments to Schools"
          );
        }
        break;

      case CredentialType.STUDENT_ENROLLMENT:
      case CredentialType.INFORMATION_WORKER:
      case CredentialType.ATTENDANCE_CERTIFICATE:
      case CredentialType.GRADUATION_DIPLOMA:
        if (issuer.type !== OrganizationType.SCHOOL) {
          throw new Error("Student credentials can only be issued by Schools");
        }
        // For student credentials, subject is an individual, not an organization
        break;

      default:
        throw new Error(`Unknown credential type: ${credentialType}`);
    }

    // Verify parent-child relationship for authorization credentials
    if (this.isAuthorizationCredential(credentialType) && subject) {
      const canIssue = await this.organizationService.canIssueCredential(
        issuer.id,
        subject.id,
        userId
      );
      if (!canIssue) {
        throw new Error(
          `${issuer.name} cannot issue credentials to ${subject.name} - invalid hierarchy`
        );
      }
    }
  }

  /**
   * Create credential template based on type
   */
  private createCredentialTemplate(
    credentialType: CredentialType,
    claims: Record<string, any>,
    subject: Organization
  ): CredentialTemplate {
    const baseContext = [
      "https://www.w3.org/2018/credentials/v1",
      "https://giga.global/credentials/v1",
    ];

    switch (credentialType) {
      case CredentialType.COUNTRY_OFFICE_AUTHORIZATION:
        return {
          "@context": [...baseContext, "https://giga.global/country-office/v1"],
          type: [
            "VerifiableCredential",
            "CountryOfficeAuthorizationCredential",
          ],
          credentialSubject: {
            organizationName: subject.name,
            organizationType: subject.type,
            country: subject.country,
            region: subject.region,
            authorizedToIssue: ["GovernmentAuthorizationCredential"],
            ...claims,
          },
        };

      case CredentialType.GOVERNMENT_AUTHORIZATION:
        return {
          "@context": [...baseContext, "https://giga.global/government/v1"],
          type: ["VerifiableCredential", "GovernmentAuthorizationCredential"],
          credentialSubject: {
            organizationName: subject.name,
            organizationType: subject.type,
            country: subject.country,
            region: subject.region,
            authorizedToIssue: ["SchoolAuthorizationCredential"],
            ...claims,
          },
        };

      case CredentialType.SCHOOL_AUTHORIZATION:
        return {
          "@context": [...baseContext, "https://giga.global/school/v1"],
          type: ["VerifiableCredential", "SchoolAuthorizationCredential"],
          credentialSubject: {
            schoolName: subject.name,
            organizationType: subject.type,
            country: subject.country,
            region: subject.region,
            authorizedToIssue: [
              "StudentEnrollmentCredential",
              "InformationWorkerCredential",
              "AttendanceCertificate",
              "GraduationDiploma",
            ],
            ...claims,
          },
        };

      case CredentialType.STUDENT_ENROLLMENT:
        return {
          "@context": [...baseContext, "https://giga.global/student/v1"],
          type: ["VerifiableCredential", "StudentEnrollmentCredential"],
          credentialSubject: {
            studentName: claims.studentName,
            studentId: claims.studentId,
            schoolName: subject.name,
            enrollmentDate: claims.enrollmentDate || new Date().toISOString(),
            grade: claims.grade,
            academicYear: claims.academicYear,
            ...claims,
          },
        };

      case CredentialType.INFORMATION_WORKER:
        return {
          "@context": [
            ...baseContext,
            "https://giga.global/information-worker/v1",
          ],
          type: ["VerifiableCredential", "InformationWorkerCredential"],
          credentialSubject: {
            workerName: claims.workerName,
            workerId: claims.workerId,
            schoolName: subject.name,
            informationWorkerDate:
              claims.informationWorkerDate || new Date().toISOString(),
            ...claims,
          },
        };

      case CredentialType.ATTENDANCE_CERTIFICATE:
        return {
          "@context": [...baseContext, "https://giga.global/attendance/v1"],
          type: ["VerifiableCredential", "AttendanceCertificate"],
          credentialSubject: {
            studentName: claims.studentName,
            studentId: claims.studentId,
            schoolName: subject.name,
            attendanceDate: claims.attendanceDate || new Date().toISOString(),
            ...claims,
          },
        };

      case CredentialType.GRADUATION_DIPLOMA:
        return {
          "@context": [...baseContext, "https://giga.global/diploma/v1"],
          type: ["VerifiableCredential", "GraduationDiploma"],
          credentialSubject: {
            studentName: claims.studentName,
            studentId: claims.studentId,
            schoolName: subject.name,
            graduationDate: claims.graduationDate || new Date().toISOString(),
            degree: claims.degree,
            honors: claims.honors,
            gpa: claims.gpa,
            ...claims,
          },
        };

      default:
        throw new Error(`Unsupported credential type: ${credentialType}`);
    }
  }

  /**
   * Store credential record in database
   */
  private async storeCredentialRecord(params: {
    credential: VerifiableCredential;
    issuer: Organization;
    subject: Organization;
    credentialType: CredentialType;
    expiresAt?: Date;
  }): Promise<CredentialRecord> {
    const credentialId = this.extractCredentialId(params.credential);

    console.log(`[CREDENTIAL DEBUG] Storing credential record:`);
    console.log(`[CREDENTIAL DEBUG] - Credential ID: ${credentialId}`);
    console.log(`[CREDENTIAL DEBUG] - Type: ${params.credentialType}`);
    console.log(`[CREDENTIAL DEBUG] - Issuer DID: ${params.issuer.did}`);
    console.log(`[CREDENTIAL DEBUG] - Subject DID: ${params.subject.did}`);
    console.log(`[CREDENTIAL DEBUG] - Issuer ID: ${params.issuer.id}`);
    console.log(`[CREDENTIAL DEBUG] - Subject ID: ${params.subject.id}`);

    const record = this.credentialRepository.create({
      credentialId,
      credentialType: params.credentialType,
      issuerDid: params.issuer.did,
      subjectDid: params.subject.did,
      issuerId: params.issuer.id,
      subjectId: params.subject.id,
      credentialData: JSON.stringify(params.credential),
      claims: JSON.stringify(params.credential.credentialSubject),
      expiresAt: params.expiresAt,
      status: CredentialStatus.ACTIVE,
    });

    const savedRecord = await this.credentialRepository.save(record);
    console.log(
      `[CREDENTIAL DEBUG] Saved credential record with ID: ${savedRecord.id}`
    );

    return savedRecord;
  }

  /**
   * Extract credential ID from verifiable credential
   */
  private extractCredentialId(credential: VerifiableCredential): string {
    // For JWT credentials, use the jti claim or generate from proof
    if (typeof credential.proof === "object" && credential.proof.jwt) {
      return credential.proof.jwt.split(".")[1]; // Use payload as ID
    }

    // Fallback: generate hash from credential content
    return Buffer.from(JSON.stringify(credential.credentialSubject))
      .toString("base64")
      .slice(0, 32);
  }

  /**
   * Get credential record by credential
   */
  private async getCredentialRecord(
    credential: VerifiableCredential
  ): Promise<CredentialRecord | null> {
    const credentialId = this.extractCredentialId(credential);
    return await this.credentialRepository.findOne({
      where: { credentialId },
    });
  }

  /**
   * Check if credential type is an authorization credential
   */
  private isAuthorizationCredential(credentialType: CredentialType): boolean {
    return [
      CredentialType.COUNTRY_OFFICE_AUTHORIZATION,
      CredentialType.GOVERNMENT_AUTHORIZATION,
      CredentialType.SCHOOL_AUTHORIZATION,
    ].includes(credentialType);
  }
}
