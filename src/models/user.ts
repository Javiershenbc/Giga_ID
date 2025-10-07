import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from "typeorm";
import { Organization } from "./organization.js";
// Import only the type reference to avoid circular dependency
// The actual relationship will be established via foreign key

export enum UserRole {
  ADMIN = "admin",
  STAFF = "staff",
  MEMBER = "member",
  STUDENT = "student",
}

export enum AuthMethod {
  PASSWORD = "password",
  // HYBRID = "hybrid"          // Commented out for future use
}

@Entity()
export class User {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ unique: true })
  username!: string;

  @Column({ unique: true })
  email!: string;

  @Column()
  displayName!: string;

  @Column({ nullable: true })
  did!: string;

  // Authentication method and password
  @Column({
    type: "varchar",
    enum: AuthMethod,
    default: AuthMethod.PASSWORD,
  })
  authMethod!: AuthMethod;

  @Column({ nullable: true })
  passwordHash?: string;

  @Column("text", { nullable: true })
  credentials!: string;

  @Column({ nullable: true })
  currentChallenge?: string;

  // Backup related fields
  @Column({ nullable: true })
  backupEncryptedCredentials?: string;

  @Column({ nullable: true })
  backupSalt?: string;

  @Column({ nullable: true })
  backupIv?: string;

  // Flag to indicate if backup is enabled
  @Column({ default: false })
  hasBackup!: boolean;

  // Organization association
  @Column({ nullable: true })
  organizationId?: string;

  @ManyToOne(() => Organization, { nullable: true })
  @JoinColumn({ name: "organizationId" })
  organization?: Organization;

  @Column({
    type: "varchar",
    enum: UserRole,
    nullable: true,
  })
  organizationRole?: UserRole;

  // Hierarchical credentials received by this user
  @Column("text", { nullable: true })
  hierarchicalCredentials?: string; // JSON array of credential IDs

  // Multisig wallet association
  @Column({ nullable: true })
  multisigWalletId?: string;

  // Foreign key relationship to MultisigWallet (managed via multisigWalletId)
  // Bidirectional relationship removed to avoid circular dependencies

  @Column({ nullable: true })
  signerPrivateKey?: string; // EOA private key for VC signing (encrypted)

  @Column({ nullable: true })
  signerAddress?: string; // EOA address for day-to-day operations

  @Column({ default: false })
  isMultisigEnabled!: boolean; // Flag to indicate if multisig is active

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
