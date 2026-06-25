import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';
import { User } from './User.schema';
import { Market } from './Market.schema';
import { FlexibilityRequestInputDto } from 'src/modules/blockchain/contracts/market/dto/market.dto';

export type SessionDocument = Session & Document;

export enum SessionStatus {
  DRAFT = 'DRAFT',
  APPROVED = 'APPROVED',
  PUBLISHED = 'PUBLISHED',
  ACTIVE = 'ACTIVE',
  OFFERS_CLOSED = 'OFFERS_CLOSED',
  IN_DELIVERY = 'IN_DELIVERY',
  SETTLEMENT_PENDING = 'SETTLEMENT_PENDING',
  SETTLED = 'SETTLED',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED'
}

export enum BidType {
  UPWARD = 'UPWARD',
  DOWNWARD = 'DOWNWARD'
}

@Schema({ _id: false })
export class HourlyBid {
  @Prop({ required: true, min: 0, max: 23 })
  hour: number; // 0-23 para representar la hora (00:00-01:00 = 0, 01:00-02:00 = 1, etc.)

  @Prop({ required: true, min: 0 })
  powerMw: number; // Cantidad de MW

  @Prop({ required: true, min: 0 })
  pricePerMwh: number; // Precio por MWh

  @Prop({
    type: String,
    enum: Object.values(BidType),
    required: true
  })
  bidType: BidType; // Tipo de bid (UPWARD o DOWNWARD)

  @Prop({ default: 0, min: 0 })
  fulfilledPowerMw: number; // Cantidad ya cubierta por offers

  @Prop({ default: Date.now })
  createdAt: Date;

  @Prop({ default: Date.now })
  updatedAt: Date;
}

export const HourlyBidSchema = SchemaFactory.createForClass(HourlyBid);

@Schema({ timestamps: true })
export class Session {
  @Prop({ required: true })
  name: string;

  @Prop()
  description: string;

  @Prop({ required: true })
  sessionDate: Date; // Fecha de la sesión (solo la fecha, sin hora)

  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'Market',
    required: true
  })
  market: Market;

  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'User',
    required: true
  })
  createdBy: User;

  @Prop({
    type: String,
    enum: Object.values(SessionStatus),
    default: SessionStatus.DRAFT
  })
  status: SessionStatus;

  @Prop({ type: [HourlyBidSchema], default: [] })
  bids: HourlyBid[]; // Array de bids por hora

  @Prop({ type: [FlexibilityRequestInputDto], default: [] })
  flexibilityRequests: FlexibilityRequestInputDto[];

  @Prop({ default: 0 })
  totalBids: number; // Número total de bids en la sesión

  @Prop()
  publishedAt: Date; // Fecha cuando se publicó la sesión

  @Prop({ type: Date, default: null })
  offersOpenReminderSentAt?: Date | null;

  @Prop({ type: Date, default: null })
  offersCloseReminderSentAt?: Date | null;

  @Prop({ type: Date, default: null })
  cancellationNoticeSentAt?: Date | null;

  @Prop({ type: Date, default: null })
  lateCloseCancellationNoticeSentAt?: Date | null;

  @Prop({ type: Date, default: null })
  cancelledAt?: Date | null;

  @Prop()
  cancelReason?: string;

  @Prop({ type: Boolean, default: false })
  tokensReturned?: boolean; // Indica si los tokens fueron devueltos en una sesión cancelada

  @Prop()
  completedAt: Date; // Fecha cuando se completó la sesión

  // Campos para analytics
  @Prop({ default: 0 })
  totalPowerMw: number; // Total de potencia en todas las bids

  @Prop({ default: 0 })
  averagePricePerMwh: number; // Precio promedio por MWh

  // Blockchain fields
  @Prop()
  contractAddress: string; // Dirección del contrato desplegado en blockchain

  @Prop()
  transactionHash: string; // Hash de la transacción de despliegue

  @Prop()
  blockchainSessionId: number; // ID de la sesión en el contrato blockchain

  @Prop()
  frpAddress: string; // Dirección del FRP (Flexibility Requesting Party)

  @Prop()
  fmoLmoAddress: string; // Dirección del FMO/LMO managing this session

  // Campos timestamp automáticos da Mongoose (timestamps: true)
  createdAt?: Date;
  updatedAt?: Date;
}

export const SessionSchema = SchemaFactory.createForClass(Session);

// Indexes for performance
SessionSchema.index({ market: 1, sessionDate: 1 }, { unique: true }); // Una sesión por día por market
SessionSchema.index({ market: 1, status: 1 });
SessionSchema.index({ createdBy: 1 });
SessionSchema.index({ sessionDate: 1 });
SessionSchema.index({ 'bids.hour': 1 });

// Middleware para actualizar campos calculados
SessionSchema.pre('save', function (next) {
  if (this.isModified('bids')) {
    this.totalBids = this.bids.length;

    if (this.bids.length > 0) {
      this.totalPowerMw = this.bids.reduce((sum, bid) => sum + bid.powerMw, 0);
      this.averagePricePerMwh = this.bids.reduce((sum, bid) => sum + bid.pricePerMwh, 0) / this.bids.length;
    } else {
      this.totalPowerMw = 0;
      this.averagePricePerMwh = 0;
    }
  }
  next();
});