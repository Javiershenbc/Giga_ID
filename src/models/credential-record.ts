import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from "typeorm";
import { Organization } from "./organization.js";

export enum CredentialType {
  COUNTRY_OFFICE_AUTHORIZATION = "country_office_authorization",
  GOVERNMENT_AUTHORIZATION = "government_authorization",
  SCHOOL_AUTHORIZATION = "school_authorization",
  STUDENT_ENROLLMENT = "student_enrollment",
  INFORMATION_WORKER = "information_worker",
  ATTENDANCE_CERTIFICATE = "attendance_certificate",
  GRADUATION_DIPLOMA = "graduation_diploma",
}

export enum CredentialStatus {
  ACTIVE = "active",
  REVOKED = "revoked",
  EXPIRED = "expired",
  SUSPENDED = "suspended",
}

@Entity()
@Index(["issuerDid", "subjectDid"])
@Index(["credentialType", "status"])
export class CredentialRecord {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  // Credential identifier (usually the JWT ID or hash)
  @Column({ unique: true })
  credentialId!: string;

  @Column({
    type: "varchar",
    enum: CredentialType,
  })
  credentialType!: CredentialType;

  @Column({
    type: "varchar",
    enum: CredentialStatus,
    default: CredentialStatus.ACTIVE,
  })
  status!: CredentialStatus;

  // DID of the issuer
  @Column()
  issuerDid!: string;

  // DID of the subject (who receives the credential)
  @Column()
  subjectDid!: string;

  // Reference to issuer organization
  @Column({ nullable: true })
  issuerId?: string;

  @ManyToOne(() => Organization, { nullable: true })
  @JoinColumn({ name: "issuerId" })
  issuer?: Organization;

  // Reference to subject organization (if applicable)
  @Column({ nullable: true })
  subjectId?: string;

  @ManyToOne(() => Organization, { nullable: true })
  @JoinColumn({ name: "subjectId" })
  subject?: Organization;

  // The actual credential (JWT format)
  @Column("text")
  credentialData!: string;

  // Credential claims/subject data
  @Column("text", { nullable: true })
  claims?: string;

  // Expiration date (if applicable)
  @Column({ nullable: true })
  expiresAt?: Date;

  // Revocation reason (if revoked)
  @Column({ nullable: true })
  revocationReason?: string;

  @Column({ nullable: true })
  revokedAt?: Date;

  @CreateDateColumn()
  issuedAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
