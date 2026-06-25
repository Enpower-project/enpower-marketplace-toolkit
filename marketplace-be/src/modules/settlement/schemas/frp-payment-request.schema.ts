import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export type FrpPaymentRequestDocument = FrpPaymentRequest & Document;

export enum FrpPaymentRequestStatus {
  PENDING = 'PENDING',           // Awaiting FRP deposit
  DEPOSITED = 'DEPOSITED',       // FRP has deposited funds
  PARTIALLY_USED = 'PARTIALLY_USED', // Some settlements executed
  COMPLETED = 'COMPLETED',       // All settlements executed
  CANCELLED = 'CANCELLED',       // Request cancelled
  EXPIRED = 'EXPIRED',           // Request expired
}

@Schema({ timestamps: true })
export class FrpPaymentRequest {
  @Prop({ required: true })
  sessionAddress: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Session', required: true })
  session: MongooseSchema.Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Market', required: true })
  market: MongooseSchema.Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true })
  frpUser: MongooseSchema.Types.ObjectId;

  @Prop({ required: true })
  frpAddress: string; // Blockchain address of FRP

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true })
  requestedBy: MongooseSchema.Types.ObjectId; // FMO/LMO who requested

  @Prop({ required: true })
  totalPayment: string; // Total payment in wei (sum of all payments)

  @Prop({ required: true })
  totalPlatformFees: string; // Total platform fees in wei

  @Prop({ required: true })
  totalSettlements: number; // Number of settlements

  @Prop({
    type: String,
    enum: Object.values(FrpPaymentRequestStatus),
    default: FrpPaymentRequestStatus.PENDING,
  })
  status: FrpPaymentRequestStatus;

  @Prop()
  depositTxHash?: string; // Transaction hash when FRP deposited

  @Prop()
  depositedAt?: Date;

  @Prop()
  depositedAmount?: string; // Amount deposited in wei

  @Prop()
  emailSentAt?: Date;

  @Prop()
  emailSentTo?: string;

  @Prop()
  notificationSentAt?: Date; // When in-app notification was created

  @Prop()
  expiresAt?: Date; // Optional expiration date

  @Prop()
  completedAt?: Date;

  @Prop()
  cancelledAt?: Date;

  @Prop()
  cancelReason?: string;

  // Timestamps from Mongoose
  createdAt?: Date;
  updatedAt?: Date;
}

export const FrpPaymentRequestSchema = SchemaFactory.createForClass(FrpPaymentRequest);

// Indexes
FrpPaymentRequestSchema.index({ sessionAddress: 1 }, { unique: true });
FrpPaymentRequestSchema.index({ frpUser: 1, status: 1 });
FrpPaymentRequestSchema.index({ market: 1, status: 1 });
FrpPaymentRequestSchema.index({ status: 1 });
