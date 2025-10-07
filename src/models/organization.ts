import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from "typeorm";

export enum OrganizationType {
  GIGA = "giga",
  COUNTRY_OFFICE = "country_office",
  GOVERNMENT = "government",
  SCHOOL = "school",
  STUDENT = "student",
}

export enum OrganizationStatus {
  PENDING = "pending",
  VERIFIED = "verified",
  SUSPENDED = "suspended",
  REVOKED = "revoked",
}

@Entity()
export class Organization {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ unique: true })
  name!: string;

  @Column({
    type: "varchar",
    enum: OrganizationType,
  })
  type!: OrganizationType;

  @Column({
    type: "varchar",
    enum: OrganizationStatus,
    default: OrganizationStatus.PENDING,
  })
  status!: OrganizationStatus;

  @Column({ unique: true })
  did!: string;

  @Column({ nullable: true })
  description?: string;

  @Column({ nullable: true })
  country?: string;

  @Column({ nullable: true })
  region?: string;

  @Column({ nullable: true })
  contactEmail?: string;

  // Self-referencing relationship for hierarchy
  @Column({ nullable: true })
  parentId?: string;

  @ManyToOne(() => Organization, (org) => org.children, { nullable: true })
  @JoinColumn({ name: "parentId" })
  parent?: Organization;

  @OneToMany(() => Organization, (org) => org.parent)
  children!: Organization[];

  // Credential that authorizes this organization to issue credentials
  @Column("text", { nullable: true })
  authorizationCredential?: string;

  // Metadata for additional organization info
  @Column("text", { nullable: true })
  metadata?: string;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
