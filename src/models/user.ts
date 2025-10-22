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
  USER = "user",
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

  // Azure AD identity
  @Column({ unique: true })
  azureAdObjectId!: string; // Azure AD Object ID (oid)

  @Column({ nullable: true })
  azureAdTenantId?: string; // Azure AD Tenant ID
  // Note: Password/WebAuthn/DID fields removed in Azure AD migration

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

  // Multisig wallet association
  @Column({ nullable: true })
  multisigWalletId?: string;

  // Foreign key relationship to MultisigWallet (managed via multisigWalletId)
  // Bidirectional relationship removed to avoid circular dependencies

  @Column({ nullable: true })
  signerPrivateKey?: string; // EOA private key (if used)

  @Column({ nullable: true })
  signerAddress?: string; // EOA address for day-to-day operations

  @Column({ default: false })
  isMultisigEnabled!: boolean; // Flag to indicate if multisig is active

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
