import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from "typeorm";

@Entity()
export class APIKey {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ unique: true })
  key!: string;

  @Column()
  owner!: string; // e.g., 'Giga', 'Country Office', 'School', etc.

  @Column("simple-array")
  scopes!: string[]; // e.g., ['issue:school', 'issue:worker']

  @Column({ default: true })
  active!: boolean;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  lastUsedAt!: Date;
}
