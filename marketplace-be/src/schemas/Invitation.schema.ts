import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';
import { UserRole } from './User.schema';

export type InvitationDocument = Invitation & Document;

export enum InvitationStatus {
  PENDING = 'PENDING',
  ACCEPTED = 'ACCEPTED',
  REJECTED = 'REJECTED',
  EXPIRED = 'EXPIRED',
  REVOKED = 'REVOKED'
}

@Schema({ timestamps: true })
export class Invitation {
  @Prop({ required: true })
  email: string;

  @Prop({
    type: String,
    enum: Object.values(UserRole),
    required: true
  })
  role: UserRole;

  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'Market',
    required: true
  })
  marketId: Types.ObjectId;

  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'User',
    required: true
  })
  invitedBy: Types.ObjectId;

  @Prop({ required: true, unique: true })
  invitationToken: string;

  @Prop({
    type: String,
    enum: Object.values(InvitationStatus),
    default: InvitationStatus.PENDING
  })
  status: InvitationStatus;

  @Prop({ required: true })
  expiresAt: Date;

  @Prop()
  acceptedAt: Date;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User' })
  acceptedUserId: Types.ObjectId;

  // Timestamps automáticos
  createdAt?: Date;
  updatedAt?: Date;
}

export const InvitationSchema = SchemaFactory.createForClass(Invitation);

// Indexes para performance
InvitationSchema.index({ email: 1, marketId: 1 });
InvitationSchema.index({ invitationToken: 1 }, { unique: true });
InvitationSchema.index({ status: 1 });
InvitationSchema.index({ expiresAt: 1 });
InvitationSchema.index({ marketId: 1, role: 1 });
