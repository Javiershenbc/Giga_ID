import { DataSource, Repository } from "typeorm";
import { User } from "../models/user.js";
import { logger } from "../utils/logger.js";

export class UserService {
  private userRepository: Repository<User>;

  constructor(dbConnection: DataSource) {
    this.userRepository = dbConnection.getRepository(User);
  }

  // Azure AD sync helper
  async syncUserFromAzureToken(token: {
    oid: string;
    tid?: string;
    preferred_username?: string;
    name?: string;
  }): Promise<User> {
    let user = await this.userRepository.findOne({
      where: { azureAdObjectId: token.oid },
    });
    const username = token.preferred_username || token.oid;
    const displayName = token.name || username;
    const email = token.preferred_username || `${token.oid}@unknown`;
    if (!user) {
      user = this.userRepository.create({
        username,
        email,
        displayName,
        azureAdObjectId: token.oid,
        azureAdTenantId: token.tid,
      });
    } else {
      user.displayName = displayName;
      user.azureAdTenantId = token.tid;
    }
    return await this.userRepository.save(user);
  }

  async getUserByEmail(email: string): Promise<User | null> {
    return await this.userRepository.findOne({ where: { email } });
  }

  async getUserByUsername(username: string): Promise<User | null> {
    try {
      logger.info(`Looking up user by username: ${username}`);
      const user = await this.userRepository.findOne({
        where: { username },
        select: [
          "id",
          "username",
          "email",
          "displayName",
          "organizationId",
          "organizationRole",
          "multisigWalletId",
          "signerAddress",
          "isMultisigEnabled",
        ],
      });
      if (user) {
        logger.info(`Found user ${username} with ID: ${user.id}`);
      } else {
        logger.info(`No user found with username: ${username}`);
      }
      return user;
    } catch (error) {
      logger.error("Error getting user:", error);
      throw error;
    }
  }

  async getUserById(id: string): Promise<User | null> {
    try {
      return await this.userRepository.findOne({
        where: { id },
        relations: ["organization"],
        select: [
          "id",
          "username",
          "email",
          "displayName",
          "organizationId",
          "organizationRole",
          "multisigWalletId",
          "signerAddress",
          "isMultisigEnabled",
        ],
      });
    } catch (error) {
      logger.error("Error getting user by ID:", error);
      throw error;
    }
  }

  async saveUser(user: User): Promise<User> {
    return await this.userRepository.save(user);
  }

  async getAllUsers(): Promise<User[]> {
    try {
      logger.info("Getting all users");
      const users = await this.userRepository.find();
      logger.info(`Found ${users.length} users`);
      return users;
    } catch (error) {
      logger.error("Error getting all users:", error);
      return [];
    }
  }
}
