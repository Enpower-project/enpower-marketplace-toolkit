import { Injectable, BadRequestException, Inject, forwardRef, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { RegisterUserDto } from './dto/register-user.dto';
import { User, UserDocument, UserRole } from '../../schemas/User.schema';
import { Market, MarketDocument } from '../../schemas/Market.schema';
import { EmailService } from '../email/email.service';
import { UserStatus } from '../../enums/user-status.enum';
import { WalletBinding } from '../../utils/WalletTypes';
import { WalletService } from '../wallet/wallet.service';

export interface CreateMarketOwnerDto {
  email: string;
  username: string;
  temporaryPassword: boolean;
  firstName?: string;
  lastName?: string;
}

export interface RegisterUserResult {
  _id?: any;
  id?: any;
  username: string;
  email: string;
  status: UserStatus;
  nextRequiredStep: string;
  walletCreated?: boolean;
  walletPin?: string;
}

export interface CreateMarketOwnerResult {
  user: UserDocument;
  temporaryPassword: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(Market.name) private readonly marketModel: Model<MarketDocument>,
    private readonly emailService: EmailService,
    @Inject(forwardRef(() => WalletService))
    private readonly walletService: WalletService,
  ) { }

  /** Obtains a Keycloak admin access token using client credentials or password flow. */
  public async getAdminToken(): Promise<string> {
    const clientSecret = this.config.get('KEYCLOAK_ADMIN_CLIENT_SECRET');
    const realm = this.config.get('KEYCLOAK_REALM');

    // If we have a client secret, use client_credentials flow (preferred)
    if (clientSecret) {
      const url = `${this.config.get('KEYCLOAK_AUTH_SERVER_URL')}/realms/${realm}/protocol/openid-connect/token`;

      const body = new URLSearchParams();
      body.append('grant_type', 'client_credentials');
      body.append('client_id', this.config.get('KEYCLOAK_ADMIN_CLIENT_ID') || 'admin-cli');
      body.append('client_secret', clientSecret);

      const response = await firstValueFrom(
        this.http.post(url, body, {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        }),
      );

      return response.data.access_token;
    }

    // Fallback to password flow with master realm (requires admin user)
    const url = `${this.config.get('KEYCLOAK_AUTH_SERVER_URL')}/realms/${this.config.get('KEYCLOAK_REALM')}/protocol/openid-connect/token`;

    const body = new URLSearchParams();
    body.append('grant_type', 'password');
    body.append('client_id', 'admin-cli');
    body.append('username', this.config.get('KEYCLOAK_ADMIN_USERNAME')!);
    body.append('password', this.config.get('KEYCLOAK_ADMIN_PASSWORD')!);

    const response = await firstValueFrom(
      this.http.post(url, body, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      }),
    );

    return response.data.access_token;
  }

  /** Creates a prosumer account in Keycloak and MongoDB; user starts in PENDING_WALLET_CREATION status. */
  async registerUser(dto: RegisterUserDto): Promise<RegisterUserResult> {
    const token = await this.getAdminToken();
    const baseUrl = this.config.get('KEYCLOAK_AUTH_SERVER_URL');
    const realm = this.config.get('KEYCLOAK_REALM');

    // Check if user already exists in MongoDB
    const existingUser = await this.userModel.findOne({
      $or: [{ email: dto.email }, { username: dto.username }]
    });

    if (existingUser) {
      throw new BadRequestException('User with this email or username already exists');
    }

    try {
      // Create user in Keycloak
      await firstValueFrom(
        this.http.post(
          `${baseUrl}/admin/realms/${realm}/users`,
          {
            username: dto.username,
            email: dto.email,
            firstName: dto.firstName,
            lastName: dto.lastName,
            enabled: true,
            emailVerified: false
          },
          { headers: { Authorization: `Bearer ${token}` } }
        )
      );

      // Get the created user from Keycloak
      const users = await firstValueFrom(
        this.http.get(
          `${baseUrl}/admin/realms/${realm}/users?username=${dto.username}`,
          { headers: { Authorization: `Bearer ${token}` } },
        ),
      );

      const userId = users.data[0]?.id;
      if (!userId) throw new Error('User not found after creation');

      // Set password for the user
      await firstValueFrom(
        this.http.put(
          `${baseUrl}/admin/realms/${realm}/users/${userId}/reset-password`,
          {
            type: 'password',
            value: dto.password,
            temporary: false,
          },
          { headers: { Authorization: `Bearer ${token}` } },
        ),
      );

      // Assign role to the new user
      await this.assignRoleToUser(userId, dto.role, token);

      // Create user in MongoDB - Prosumers start with PENDING_WALLET_CREATION status
      // (they skip profile completion since they provide all data during registration)
      const user = await this.userModel.create({
        username: dto.username,
        email: dto.email,
        firstName: dto.firstName,
        lastName: dto.lastName,
        keycloakId: userId,
        role: dto.role, // Set default role for self-registered users
        status: UserStatus.PENDING_WALLET_CREATION,
        // Legacy fields for backward compatibility
        temporaryPassword: false,
        firstLoginCompleted: true,
        profileCompleted: true, // Profile completed during registration
        walletCreated: false,
        isVerified: false
      });

      // Wallet creation is now manual - users must call the wallet endpoints
      // User remains in PENDING_WALLET_CREATION status until they create their wallet manually
      const walletCreated = false;
      const walletPin: string | undefined = undefined;

      // Create result with wallet info
      const result: RegisterUserResult = {
        _id: user._id,
        id: user._id,
        username: user.username,
        email: user.email,
        status: user.status,
        nextRequiredStep: user.nextRequiredStep,
        walletCreated: walletCreated,
        walletPin: walletPin
      };

      return result;
    } catch (error) {
      throw new BadRequestException(`Failed to register user: ${error.message}`);
    }
  }

  /** Creates a market owner (FMO_LMO) account in Keycloak and MongoDB with a temporary password. */
  async createUserWithMarketOwnerRole(dto: CreateMarketOwnerDto): Promise<CreateMarketOwnerResult> {
    const temporaryPassword = this.generateTemporaryPassword();
    let keycloakUserId: string | null = null;

    try {
      const token = await this.getAdminToken();
      const baseUrl = this.config.get('KEYCLOAK_AUTH_SERVER_URL');
      const realm = this.config.get('KEYCLOAK_REALM');

      // Step 1: Check if user already exists in Keycloak by email
      const existingUsersByEmail = await firstValueFrom(
        this.http.get(
          `${baseUrl}/admin/realms/${realm}/users?email=${encodeURIComponent(dto.email)}&exact=true`,
          { headers: { Authorization: `Bearer ${token}` } }
        )
      );

      let userId: string;
      let userExistsInKeycloak = false;

      if (existingUsersByEmail.data && existingUsersByEmail.data.length > 0) {
        // User already exists in Keycloak
        userId = existingUsersByEmail.data[0].id;
        userExistsInKeycloak = true;
        this.logger.log(`User with email ${dto.email} already exists in Keycloak (ID: ${userId})`);
      } else {
        // Step 2: Create user in Keycloak
        try {
          await firstValueFrom(
            this.http.post(
              `${baseUrl}/admin/realms/${realm}/users`,
              {
                username: dto.username,
                email: dto.email,
                firstName: dto.firstName || dto.username,
                lastName: dto.lastName || '',
                enabled: true,
                emailVerified: false
              },
              { headers: { Authorization: `Bearer ${token}` } }
            )
          );

          this.logger.log(`Successfully created user in Keycloak with email ${dto.email}`);
        } catch (keycloakError) {
          if (keycloakError.response?.status === 409) {
            // Race condition: user was created between our check and creation attempt
            this.logger.warn(`Race condition detected: User ${dto.email} was created in Keycloak by another process`);
            userExistsInKeycloak = true;
          } else {
            throw keycloakError;
          }
        }

        // Step 3: Get user ID from Keycloak
        const users = await firstValueFrom(
          this.http.get(
            `${baseUrl}/admin/realms/${realm}/users?username=${encodeURIComponent(dto.username)}`,
            { headers: { Authorization: `Bearer ${token}` } }
          )
        );

        userId = users.data[0]?.id;
        if (!userId) throw new Error('User not found after creation');
      }

      keycloakUserId = userId;

      // Step 4: Set temporary password (only if user was just created or needs password reset)
      if (!userExistsInKeycloak) {
        await firstValueFrom(
          this.http.put(
            `${baseUrl}/admin/realms/${realm}/users/${userId}/reset-password`,
            {
              type: 'password',
              value: temporaryPassword,
              temporary: true
            },
            { headers: { Authorization: `Bearer ${token}` } }
          )
        );
        this.logger.log(`Set temporary password for user ${userId}`);
      }

      // Step 5: Assign FMO_LMO role to the user
      await this.assignRoleToUser(userId, UserRole.FMO_LMO, token);

      // Step 6: Create user in MongoDB
      const user = await this.userModel.create({
        username: dto.username,
        email: dto.email,
        role: UserRole.FMO_LMO,
        firstName: dto.firstName || dto.username,
        lastName: dto.lastName || '',
        keycloakId: userId,
        status: UserStatus.PENDING_WALLET_CREATION, // Market owner starts needing to create wallet
        // Legacy fields - pre-save hook will sync these based on status
        temporaryPassword: true,
        firstLoginCompleted: false,
        profileCompleted: false,
        walletCreated: false,
        isVerified: false
      });

      this.logger.log(`Successfully created user in MongoDB with ID ${user._id}`);

      // Step 7: Send welcome email - DISABLED to avoid duplicate emails
      this.logger.log(`Skipping welcome email - will be sent via market acceptance email`);

      return {
        user,
        temporaryPassword
      };

    } catch (error) {
      // If we created the user in Keycloak but failed to create in MongoDB, log for manual cleanup
      if (keycloakUserId) {
        this.logger.error(
          `INCONSISTENT STATE: User created in Keycloak (ID: ${keycloakUserId}) but failed in MongoDB. ` +
          `Email: ${dto.email}. Error: ${error.message}. Manual cleanup may be required.`
        );
      }
      throw new BadRequestException(`Failed to create Market Owner user: ${error.message}`);
    }
  }

  private generateTemporaryPassword(): string {
    const upper = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const lower = 'abcdefghijklmnopqrstuvwxyz';
    const digits = '0123456789';
    const special = '!@#$';
    const allChars = upper + lower + digits + special;

    const pick = (charset: string) => charset.charAt(Math.floor(Math.random() * charset.length));

    // Guarantee at least one character from each class
    const guaranteed = [pick(upper), pick(lower), pick(digits), pick(special)];

    // Fill remaining positions with random characters from the full set
    for (let i = guaranteed.length; i < 12; i++) {
      guaranteed.push(pick(allChars));
    }

    // Shuffle to avoid predictable positions (guaranteed chars always at the start)
    for (let i = guaranteed.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [guaranteed[i], guaranteed[j]] = [guaranteed[j], guaranteed[i]];
    }

    return guaranteed.join('');
  }

  /**
   * Register a user from an invitation (FRP or FSP role)
   * If user already exists by email, adds the new market to their accessible markets
   */
  async registerInvitedUser(
    username: string,
    password: string,
    firstName: string,
    lastName: string,
    email: string,
    role: UserRole,
    marketId: string
  ): Promise<RegisterUserResult> {
    this.logger.log(`🔄 Starting registration for invited user: ${username} (${email}) with role: ${role}`);

    try {
      const token = await this.getAdminToken();
      const baseUrl = this.config.get('KEYCLOAK_AUTH_SERVER_URL');
      const realm = this.config.get('KEYCLOAK_REALM');

      this.logger.log(`✅ Admin token obtained. Realm: ${realm}`);

      // Check if user already exists in MongoDB by email
      const existingUserByEmail = await this.userModel.findOne({ email });

      if (existingUserByEmail) {
        this.logger.log(`✅ User already exists with email ${email}. Adding market access instead of creating new user.`);

        // Check if user already has access to this market
        const hasMarketAccess = existingUserByEmail.accessibleMarkets.some(
          marketObjId => marketObjId.toString() === marketId
        );

        if (hasMarketAccess) {
          this.logger.warn(`⚠️  User ${email} already has access to market ${marketId}`);
          throw new BadRequestException('User already has access to this market');
        }

        // Add the new market to accessible markets
        existingUserByEmail.accessibleMarkets.push(new Types.ObjectId(marketId));

        // If this is the first market or user prefers this one, set it as assigned market
        if (!existingUserByEmail.assignedMarket) {
          existingUserByEmail.assignedMarket = new Types.ObjectId(marketId);
        }

        await existingUserByEmail.save();

        // Update market.users array for bidirectional relationship
        await this.marketModel.updateOne(
          { _id: marketId },
          { $addToSet: { users: existingUserByEmail._id } }
        );

        this.logger.log(`✅ Market ${marketId} added to user ${email}'s accessible markets`);

        // Return existing user info
        return {
          _id: existingUserByEmail._id,
          id: existingUserByEmail._id,
          username: existingUserByEmail.username,
          email: existingUserByEmail.email,
          status: existingUserByEmail.status,
          nextRequiredStep: existingUserByEmail.nextRequiredStep,
          walletCreated: existingUserByEmail.walletCreated,
          walletPin: undefined
        };
      }

      // Check if username is taken by a different email
      const existingUserByUsername = await this.userModel.findOne({ username });
      if (existingUserByUsername) {
        this.logger.error(`❌ Username ${username} is already taken by another user`);
        throw new BadRequestException('Username is already taken');
      }

      this.logger.log(`✅ User does not exist in MongoDB, proceeding with Keycloak creation`);

      // Try to create user in Keycloak
      let userId: string;
      let userExistedInKeycloak = false;

      try {
        this.logger.log(`📤 Creating user in Keycloak: ${username}`);
        await firstValueFrom(
          this.http.post(
            `${baseUrl}/admin/realms/${realm}/users`,
            {
              username,
              email,
              firstName,
              lastName,
              enabled: true,
              emailVerified: true // Email already validated through invitation
            },
            { headers: { Authorization: `Bearer ${token}` } }
          )
        );

        this.logger.log(`✅ User created in Keycloak successfully`);

        // Get the created user from Keycloak
        const users = await firstValueFrom(
          this.http.get(
            `${baseUrl}/admin/realms/${realm}/users?username=${encodeURIComponent(username)}&exact=true`,
            { headers: { Authorization: `Bearer ${token}` } },
          ),
        );

        userId = users.data[0]?.id;
        if (!userId) {
          this.logger.error(`❌ User not found in Keycloak after creation`);
          throw new Error('User not found after creation');
        }

        this.logger.log(`✅ User ID retrieved from Keycloak: ${userId}`);
      } catch (keycloakError) {
        // If user already exists in Keycloak (409), find them
        if (keycloakError.response?.status === 409) {
          this.logger.warn(`⚠️  User ${username} already exists in Keycloak, fetching existing user`);
          userExistedInKeycloak = true;

          const users = await firstValueFrom(
            this.http.get(
              `${baseUrl}/admin/realms/${realm}/users?username=${encodeURIComponent(username)}&exact=true`,
              { headers: { Authorization: `Bearer ${token}` } },
            ),
          );

          userId = users.data[0]?.id;
          if (!userId) {
            this.logger.error(`❌ User ${username} exists in Keycloak but could not be found`);
            throw new BadRequestException('User already exists but could not be found');
          }

          this.logger.log(`✅ Existing user ID retrieved: ${userId}`);
        } else {
          this.logger.error(`❌ Error creating user in Keycloak:`, keycloakError.response?.data || keycloakError.message);
          throw keycloakError;
        }
      }

      // Set password for the user
      this.logger.log(`🔑 Setting password for user ${userId}...`);
      try {
        await firstValueFrom(
          this.http.put(
            `${baseUrl}/admin/realms/${realm}/users/${userId}/reset-password`,
            {
              type: 'password',
              value: password,
              temporary: false,
            },
            { headers: { Authorization: `Bearer ${token}` } },
          ),
        );
        this.logger.log(`✅ Password set successfully for user ${userId}`);
      } catch (passwordError) {
        this.logger.error(`❌ Failed to set password for user ${userId}:`, passwordError.response?.data || passwordError.message);
        throw new BadRequestException(`Failed to set password: ${passwordError.message}`);
      }

      // Assign appropriate Keycloak role based on user role
      const keycloakRoleName = role === UserRole.FRP ? 'FRP' : 'FSP';
      this.logger.log(`👤 Assigning role ${keycloakRoleName} to user ${userId}...`);
      await this.assignRoleToUser(userId, keycloakRoleName, token);

      // Create user in MongoDB - starts with PENDING_WALLET_CREATION status
      this.logger.log(`💾 Creating user in MongoDB...`);
      const user = await this.userModel.create({
        username,
        email,
        firstName,
        lastName,
        keycloakId: userId,
        role,
        assignedMarket: marketId,
        accessibleMarkets: [marketId],
        status: UserStatus.PENDING_WALLET_CREATION,
        // Legacy fields for backward compatibility
        temporaryPassword: false,
        firstLoginCompleted: true,
        profileCompleted: true, // Profile completed during registration
        walletCreated: false,
        isVerified: false
      });

      // ✅ FIX: Update market.users array for bidirectional relationship
      if (marketId) {
        await this.marketModel.updateOne(
          { _id: marketId },
          { $addToSet: { users: user._id } }
        );
      }

      this.logger.log(`✅ User created in MongoDB with ID: ${user._id}`);
      this.logger.log(`🎉 Registration completed successfully for ${username}`);
      this.logger.log(`📋 User details - Keycloak ID: ${userId}, Role: ${role}, Market: ${marketId}`);

      // Create result
      const result: RegisterUserResult = {
        _id: user._id,
        id: user._id,
        username: user.username,
        email: user.email,
        status: user.status,
        nextRequiredStep: user.nextRequiredStep,
        walletCreated: false,
        walletPin: undefined
      };

      return result;
    } catch (error) {
      this.logger.error(`❌ Failed to register invited user ${username}:`, error);
      this.logger.error(`Error details:`, error.response?.data || error.message);
      throw new BadRequestException(`Failed to register invited user: ${error.message}`);
    }
  }

  /**
   * Add market access to an existing user (when they receive invitation to a new market)
   */
  async addMarketAccessToExistingUser(
    email: string,
    marketId: string
  ): Promise<UserDocument> {
    this.logger.log(`🔄 Adding market access for existing user: ${email} to market: ${marketId}`);

    try {
      // Find the user by email
      const user = await this.userModel.findOne({ email });

      if (!user) {
        this.logger.error(`❌ User not found with email: ${email}`);
        throw new BadRequestException('User not found');
      }

      // Check if user already has access to this market
      const hasAccess = user.accessibleMarkets.some(
        marketObjId => marketObjId.toString() === marketId
      );

      if (hasAccess) {
        this.logger.warn(`⚠️  User ${email} already has access to market ${marketId}`);
        return user;
      }

      // Add the new market to accessible markets
      user.accessibleMarkets.push(new Types.ObjectId(marketId));

      // If user doesn't have an assigned market, set this one
      if (!user.assignedMarket) {
        user.assignedMarket = new Types.ObjectId(marketId);
      }

      await user.save();

      // Update market.users array for bidirectional relationship
      await this.marketModel.updateOne(
        { _id: marketId },
        { $addToSet: { users: user._id } }
      );

      this.logger.log(`✅ Market ${marketId} added to user ${email}'s accessible markets`);
      this.logger.log(`📋 User now has access to ${user.accessibleMarkets.length} market(s)`);

      return user;
    } catch (error) {
      this.logger.error(`❌ Failed to add market access for user ${email}:`, error);
      throw new BadRequestException(`Failed to add market access: ${error.message}`);
    }
  }

  /** Sends a welcome email to a newly created market owner with their temporary credentials. */
  async sendMarketOwnerWelcomeEmail(
    email: string,
    username: string,
    temporaryPassword: string,
    marketName?: string,
    language: string = 'en'
  ): Promise<void> {
    await this.emailService.sendMarketOwnerWelcomeEmail({
      email,
      username,
      temporaryPassword,
      marketName,
      language
    });
  }

  /**
   * Update user status and handle the transition logic
   */
  async updateUserStatus(userId: string, newStatus: UserStatus): Promise<UserDocument> {
    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new BadRequestException('User not found');
    }

    // Use the schema method to update status and sync boolean flags
    user.updateStatus(newStatus);
    return await user.save();
  }

  async deactivateUser(userId: string): Promise<UserDocument> {

    try {
      const user = await this.userModel.findById(userId);
      if (!user) {
        this.logger.error(`User not found with ID ${userId}`)
        throw new BadRequestException('User not found');
      }

      this.logger.error(`User found: ${user.username} (${user.email})`)

      if (user.keycloakId) {
        try {
          const token = await this.getAdminToken();
          const baseUrl = this.config.get('KEYCLOAK_AUTH_SERVER_URL');
          const realm = this.config.get('KEYCLOAK_REALM');

          this.logger.log(`Disabling user in Keycloack (ID: ${user.keycloakId})`)

          await firstValueFrom(
            this.http.put(
              `${baseUrl}/admin/realms/${realm}/users/${user.keycloakId}`,
              { enabled: false },
              { headers: { Authorization: `Bearer ${token}` } }
            )
          );

          this.logger.log('User disabled on Keycloack successfully')
        } catch (keycloakError) {
          this.logger.error(`Failed to disable user in Keycloak:`,
            keycloakError
          )

          throw new BadRequestException(`Failed to disable user in Keycloack ${keycloakError}`)
        }
      } else {
        this.logger.warn('User has no Keycloack ID, skipping Keycloack Deactivation')
      }

      this.logger.log(`💾 Updating user status to INACTIVE in MongoDB...`);

      await this.userModel.findByIdAndUpdate(
        userId,
        { $set: { status: UserStatus.INACTIVE } },
        { new: true }
      );

      this.logger.log(`✅ User deactivated successfully in MongoDB (${user.username})`)

      return user;
    } catch (error) {
      this.logger.error(`Failed to deactivate User with id ${userId}: ${error}`);
      throw new BadRequestException(`Failed to deactivate user: ${error}`);
    }
  }

  async reactivateUser(userId: string): Promise<UserDocument> {

    try {
      const user = await this.userModel.findById(userId);
      if (!user) {
        this.logger.error(`User not found with ID ${userId}`)
        throw new BadRequestException('User not found');
      }

      this.logger.error(`User found: ${user.username} (${user.email})`)

      if (user.keycloakId) {
        try {
          const token = await this.getAdminToken();
          const baseUrl = this.config.get('KEYCLOAK_AUTH_SERVER_URL');
          const realm = this.config.get('KEYCLOAK_REALM');

          this.logger.log(`Reactivating user in Keycloack (ID: ${user.keycloakId})`)

          await firstValueFrom(
            this.http.put(
              `${baseUrl}/admin/realms/${realm}/users/${user.keycloakId}`,
              { enabled: true },
              { headers: { Authorization: `Bearer ${token}` } }
            )
          );

          this.logger.log('User reactivated on Keycloack successfully')
        } catch (keycloakError) {
          this.logger.error(`Failed to reactivate user in Keycloak:`,
            keycloakError
          )

          throw new BadRequestException(`Failed to reactivate user in Keycloack ${keycloakError}`)
        }
      } else {
        this.logger.warn('User has no Keycloack ID, skipping Keycloack Reactivation')
      }

      this.logger.log(`💾 Updating user status to Active in MongoDB...`);

      await this.userModel.findByIdAndUpdate(
        userId,
        { $set: { status: UserStatus.ACTIVE } },
        { new: true }
      );

      this.logger.log(`✅ User reactivated successfully in MongoDB (${user.username})`)

      return user;
    } catch (error) {
      this.logger.error(`Failed to reactivate User with id ${userId}: ${error}`);
      throw new BadRequestException(`Failed to reactivate user: ${error}`);
    }
  }

  /**
   * Get user status and next required step
   */
  async getUserStatusInfo(userId: string): Promise<{
    status: UserStatus;
    nextRequiredStep: string;
    canPerformActions: Record<string, boolean>;
  }> {
    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new BadRequestException('User not found');
    }

    return {
      status: user.status,
      nextRequiredStep: user.nextRequiredStep,
      canPerformActions: {
        login: user.canPerformAction('login'),
        trade: user.canPerformAction('trade'),
        createOffers: user.canPerformAction('create_offers'),
        bid: user.canPerformAction('bid'),
        updateProfile: user.canPerformAction('update_profile'),
        createWallet: user.canPerformAction('create_wallet')
      }
    };
  }

  /**
   * Migrate existing users from boolean flags to status enum
   * This method should be run once during deployment
   */
  async migrateUsersToStatusEnum(): Promise<{ migrated: number; errors: string[] }> {
    const users = await this.userModel.find({});
    let migrated = 0;
    const errors: string[] = [];

    for (const user of users) {
      try {
        // Only migrate if status is not already set
        if (!user.status) {
          user.migrateToStatusEnum();
          await user.save();
          migrated++;
        }
      } catch (error) {
        errors.push(`Failed to migrate user ${user.username}: ${error.message}`);
      }
    }

    return { migrated, errors };
  }

  /**
   * Get users by status for administrative purposes
   */
  async getUsersByStatus(status: UserStatus): Promise<UserDocument[]> {
    return await this.userModel.find({ status }).exec();
  }

  /**
   * Handle first login completion
   * Note: In the simplified flow, users start at PENDING_WALLET_CREATION
   * This method is kept for backward compatibility
   */
  async completeFirstLogin(userId: string): Promise<UserDocument> {
    return await this.updateUserStatus(userId, UserStatus.PENDING_WALLET_CREATION);
  }

  /**
   * Handle profile completion
   * Note: Profile is auto-completed on first login via middleware
   * This method is kept for backward compatibility
   */
  async completeProfile(userId: string): Promise<UserDocument> {
    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new BadRequestException('User not found');
    }
    user.profileCompleted = true;
    return await user.save();
  }

  /**
   * Handle wallet creation completion
   * Transitions user to ACTIVE status
   */
  async completeWalletCreation(userId: string): Promise<UserDocument> {
    return await this.updateUserStatus(userId, UserStatus.ACTIVE);
  }

  /**
   * Handle email verification completion
   * Note: Email verification is now part of wallet creation flow
   * This method is kept for backward compatibility
   */
  async completeEmailVerification(userId: string): Promise<UserDocument> {
    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new BadRequestException('User not found');
    }
    user.isVerified = true;
    return await user.save();
  }

  /**
   * Convert UserRole enum to Keycloak role name
   * Keycloak roles are lowercase with underscores
   */
  private convertToKeycloakRoleName(role: UserRole | string): string {
    // Map enum values to Keycloak role names
    const roleMap: Record<string, string> = {
      'FMO_LMO': 'FMO_LMO',
      'FSP': 'FSP',
      'FRP': 'FRP',
      'MARKETPLACE_ADMIN': 'MARKETPLACE_ADMIN'
    };

    // Check if the role is in our map
    if (roleMap[role]) {
      return roleMap[role];
    }

    // If not in map and already lowercase, return as is
    if (role === role.toLowerCase()) {
      return role;
    }

    // Otherwise, convert to lowercase
    return role.toLowerCase();
  }

  /**
   * Assign a role to a user in Keycloak
   */
  private async assignRoleToUser(keycloakUserId: string, roleName: string | UserRole, token: string): Promise<void> {
    // Convert to Keycloak role name before try block so it's available in catch
    const keycloakRoleName = this.convertToKeycloakRoleName(roleName);

    try {
      const baseUrl = this.config.get('KEYCLOAK_AUTH_SERVER_URL');
      const realm = this.config.get('KEYCLOAK_REALM');

      const roleUrl = `${baseUrl}/admin/realms/${realm}/roles/${keycloakRoleName}`;
      this.logger.log(`Fetching role from: ${roleUrl}`);
      this.logger.log(`Converted role name: ${keycloakRoleName} (from ${roleName})`);

      // First, get the role information
      const rolesResponse = await firstValueFrom(
        this.http.get(
          roleUrl,
          { headers: { Authorization: `Bearer ${token}` } }
        )
      );

      const role = rolesResponse.data;

      // Then assign the role to the user
      await firstValueFrom(
        this.http.post(
          `${baseUrl}/admin/realms/${realm}/users/${keycloakUserId}/role-mappings/realm`,
          [role],
          { headers: { Authorization: `Bearer ${token}` } }
        )
      );

      this.logger.log(`Successfully assigned role ${keycloakRoleName} to user ${keycloakUserId}`);
    } catch (error) {
      this.logger.error(`Failed to assign role ${keycloakRoleName} to user ${keycloakUserId}:`, error.message);
      throw new Error(`Failed to assign role: ${error.message}`);
    }
  }

}
