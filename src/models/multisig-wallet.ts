import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  OneToMany,
} from "typeorm";
// No direct import of User to avoid circular dependency
// Relationships will be managed programmatically via foreign keys

export enum MultisigType {
  GNOSIS_SAFE = "gnosis_safe",
  CUSTOM = "custom",
  ETHEREUM_MULTISIG = "ethereum_multisig",
}

export enum MultisigTransactionStatus {
  PENDING = "pending",
  EXECUTED = "executed",
  FAILED = "failed",
  CANCELLED = "cancelled",
}

export enum MultisigTransactionType {
  DID_UPDATE = "did_update",
  DID_CONTROLLER_CHANGE = "did_controller_change",
  ASSET_TRANSFER = "asset_transfer",
  CONTRACT_INTERACTION = "contract_interaction",
}

@Entity()
export class MultisigWallet {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ unique: true })
  address!: string; // The multisig wallet address

  @Column({
    type: "varchar",
    enum: MultisigType,
    default: MultisigType.GNOSIS_SAFE,
  })
  type!: MultisigType;

  @Column("text")
  owners!: string; // JSON array of owner addresses

  @Column()
  threshold!: number; // Number of signatures required

  @Column("text", { nullable: true })
  metadata?: string; // Additional configuration as JSON

  @Column({ nullable: true })
  network?: string; // Ethereum network (mainnet, sepolia, etc.)

  @Column({ default: true })
  isActive!: boolean;

  // Associated users managed via foreign key relationship
  // Query users using: userRepository.find({ where: { multisigWalletId: this.id } })

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}

@Entity()
export class MultisigTransaction {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column()
  multisigWalletId!: string;

  @ManyToOne(() => MultisigWallet)
  @JoinColumn({ name: "multisigWalletId" })
  multisigWallet!: MultisigWallet;

  @Column({ nullable: true })
  initiatorUserId?: string; // User who initiated the transaction

  // Initiator managed via foreign key (initiatorUserId)
  // Query initiator using: userRepository.findOne({ where: { id: this.initiatorUserId } })

  @Column({
    type: "varchar",
    enum: MultisigTransactionType,
  })
  transactionType!: MultisigTransactionType;

  @Column("text")
  transactionData!: string; // JSON data for the transaction

  @Column({ nullable: true })
  ethereumTxHash?: string; // Hash of the actual Ethereum transaction

  @Column({
    type: "varchar",
    enum: MultisigTransactionStatus,
    default: MultisigTransactionStatus.PENDING,
  })
  status!: MultisigTransactionStatus;

  @Column("text", { nullable: true })
  signatures?: string; // JSON array of signatures collected

  @Column({ nullable: true })
  requiredSignatures?: number; // Number of signatures needed

  @Column({ nullable: true })
  executedAt?: Date;

  @Column("text", { nullable: true })
  failureReason?: string;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
