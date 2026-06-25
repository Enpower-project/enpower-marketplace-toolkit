import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';
import { UserStatus, UserStatusManager } from '../enums/user-status.enum';
import { WalletBinding } from '../utils/WalletTypes';

export type UserDocument = User & Document;

export enum UserRole {
  MARKETPLACE_ADMIN = 'MARKETPLACE_ADMIN',
  FMO_LMO = 'FMO_LMO', // Formerly MARKET_OWNER
  FRP = 'FRP',
  FSP = 'FSP' // Formerly PROSUMER
}

@Schema({ timestamps: true })
export class User {
  @Prop({ required: true })
  username: string;

  @Prop({ required: true })
  email: string;

  @Prop()
  firstName: string;

  @Prop()
  lastName: string;

  @Prop()
  phone: string;

  @Prop()
  address: string;

  @Prop()
  city: string;

  @Prop()
  country: string;

  @Prop()
  postalCode: string;

  @Prop({ required: true })
  keycloakId: string;

  // Status field - replaces boolean flags for better state management
  @Prop({
    type: String,
    enum: Object.values(UserStatus),
    default: UserStatus.PENDING_WALLET_CREATION
  })
  status: UserStatus;

  // Legacy boolean fields - keep for backward compatibility during migration
  @Prop({ default: false })
  isVerified: boolean;

  @Prop({ default: false })
  temporaryPassword: boolean;

  @Prop({ default: false })
  firstLoginCompleted: boolean;

  @Prop({ default: false })
  profileCompleted: boolean;

  @Prop({ default: false })
  walletCreated: boolean;

  @Prop()
  encryptedPinHash: string;

  @Prop({
    type: String,
    enum: Object.values(UserRole),
  })
  role: UserRole;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Wallet' })
  wallet: Types.ObjectId;

  // New wallet system fields
  @Prop({
    type: String,
    enum: Object.values(WalletBinding)
  })
  walletBinding: WalletBinding;

  @Prop()
  privateKeyEncrypted: string;

  @Prop()
  publicAddress: string;

  @Prop()
  personalPinHash: string;

  @Prop()
  commonSecretEncrypted: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Market' })
  assignedMarket: Types.ObjectId;

  // Array of markets the user has access to (as ObjectIds)
  @Prop({ type: [MongooseSchema.Types.ObjectId], ref: 'Market', default: [] })
  accessibleMarkets: Types.ObjectId[];

  @Prop({ default: Date.now })
  lastLoginAt: Date;

  // PIN Security fields - per market
  @Prop({
    type: [{
      marketId: { type: MongooseSchema.Types.ObjectId, ref: 'Market', required: true },
      pinFailedAttempts: { type: Number, default: 0 },
      pinLockedUntil: { type: Date },
      lastPinFailureAt: { type: Date }
    }],
    default: []
  })
  marketPinSecurity: Array<{
    marketId: Types.ObjectId;
    pinFailedAttempts: number;
    pinLockedUntil?: Date;
    lastPinFailureAt?: Date;
  }>;

  // Virtual getter for next required step
  get nextRequiredStep(): string {
    return UserStatusManager.getNextRequiredStep(this.status);
  }

  // Method to check if user can perform specific actions
  canPerformAction(action: string): boolean {
    return UserStatusManager.canPerformAction(this.status, action);
  }

  // Method to update status - pre-save hook will handle field synchronization
  updateStatus(newStatus: UserStatus): void {
    this.status = newStatus;
  }

  // Method to migrate from boolean flags to status (for existing users)
  migrateToStatusEnum(): void {
    const flags = {
      temporaryPassword: this.temporaryPassword,
      firstLoginCompleted: this.firstLoginCompleted,
      profileCompleted: this.profileCompleted,
      walletCreated: this.walletCreated,
      isVerified: this.isVerified
    };
    
    this.status = UserStatusManager.determineStatusFromFlags(flags);
  }
}

export const UsersSchema = SchemaFactory.createForClass(User);

// Pre-save hook to automatically sync boolean flags with status
// Note: This hook only runs with save(), create(), insertMany()
// For findByIdAndUpdate() operations, fields must be updated manually
UsersSchema.pre('save', function(next) {
  // Only sync if status field has been modified or is new
  if (this.isModified('status') || this.isNew) {
    switch (this.status) {
      case UserStatus.PENDING_WALLET_CREATION:
        this.temporaryPassword = false;
        this.firstLoginCompleted = this.firstLoginCompleted || false; // Keep if already true
        this.profileCompleted = this.profileCompleted || false; // Keep if already true
        this.walletCreated = false;
        this.isVerified = false;
        break;
      case UserStatus.ACTIVE:
        this.temporaryPassword = false;
        this.firstLoginCompleted = true;
        this.profileCompleted = true;
        this.walletCreated = true;
        this.isVerified = true;
        break;
      case UserStatus.INACTIVE:
      case UserStatus.BLOCKED:
        // Keep current flags for inactive/blocked users
        break;
    }
  }
  next();
});

// Add performance indexes (removing duplicates)
UsersSchema.index({ username: 1 }, { unique: true });
UsersSchema.index({ email: 1 }, { unique: true });
UsersSchema.index({ keycloakId: 1 }, { unique: true });
UsersSchema.index({ role: 1 });
UsersSchema.index({ status: 1 }); // Index for the new status field
UsersSchema.index({ assignedMarket: 1 });
UsersSchema.index({ accessibleMarkets: 1 }); // Index for multi-tenant access