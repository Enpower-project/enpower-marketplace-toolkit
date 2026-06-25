import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';
import { User } from './User.schema';

export type MarketDocument = Market & Document;

export enum MarketState {
  CREATED_OFFLINE = 'CREATED_OFFLINE', // DELETE IN THE FUTURE
  CREATED_OFFLINE_PENDING_ACCEPTATION = 'CREATED_OFFLINE_PENDING_ACCEPTATION',
  CREATED_OFFLINE_ACCEPTED = 'CREATED_OFFLINE_ACCEPTED',
  CREATED_OFFLINE_REJECTED = 'CREATED_OFFLINE_REJECTED',
  CREATED_OFFLINE_EXPIRED = 'CREATED_OFFLINE_EXPIRED',
  WALLET_CREATED_PENDING_ACTIVATION = 'WALLET_CREATED_PENDING_ACTIVATION',
  ACTIVE_ONCHAIN = 'ACTIVE_ONCHAIN',
  SUSPENDED = 'SUSPENDED',
  DEACTIVATED = 'DEACTIVATED'
}

@Schema({ timestamps: true })
export class Market {
  @Prop({ required: true })
  name: string;

  @Prop()
  description: string;

  @Prop()
  dso: string;

  @Prop()
  region: string;

  @Prop({ default: true })
  isActive: boolean;

  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'User',
    required: true
  })
  marketOwner: User;

  // Array of users assigned to this market (as ObjectIds)
  @Prop({ type: [MongooseSchema.Types.ObjectId], ref: 'User', default: [] })
  users: MongooseSchema.Types.ObjectId[];

  // FRP (Flexibility Resource Provider) - only one per market
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', default: null })
  frp: MongooseSchema.Types.ObjectId | null;

  @Prop({
    type: String,
    enum: Object.values(MarketState),
    default: MarketState.CREATED_OFFLINE_PENDING_ACCEPTATION
  })
  state: MarketState;

  @Prop()
  activatedAt: Date;

  @Prop()
  deactivatedAt: Date;

  @Prop()
  txHash: string;

  @Prop()
  marketAddress: string;

  @Prop()
  blockchainMarketId: number;

  // Market acceptance expiration date (one week after creation)
  @Prop()
  expireMarketAcceptationDate?: Date;

  // New wallet system fields
  @Prop()
  privateKeyEncrypted: string;

  @Prop()
  publicAddress: string;

  // Campi timestamp automatici da Mongoose (timestamps: true)
  createdAt?: Date;
  updatedAt?: Date;
}

export const MarketSchema = SchemaFactory.createForClass(Market);

// Indexes for performance (removing duplicates)
MarketSchema.index({ marketOwner: 1, state: 1 });
MarketSchema.index({ name: 1 }, { unique: true });
MarketSchema.index({ marketOwner: 1 });
MarketSchema.index({ state: 1 });
MarketSchema.index({ users: 1 }); // Index for users array