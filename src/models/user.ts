import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from "typeorm";
// Import only the type reference to avoid circular dependency
// The actual relationship will be established via foreign key

// Removed hierarchy roles

export enum AuthMethod {
  PASSWORD = "password",
  // WEBAUTHN = "webauthn",     // Commented out for future use
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

  // Removed hierarchy association fields

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
