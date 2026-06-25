import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';
import { User } from './User.schema';
import { Session } from './Session.schema';

export type HourlyOfferDocument = HourlyOffer & Document;

export enum OfferStatus {
  PENDING = 'PENDING',         // Creada off-chain, puede ser cancelada
  ACCEPTED = 'ACCEPTED',       // Creada on-chain y automáticamente aceptada, ya no puede ser cancelada
  REJECTED = 'REJECTED',       // Rechazada por el market owner
  CANCELLED = 'CANCELLED'      // Cancelada por el FSP (solo si está PENDING)
}

@Schema({ timestamps: true })
export class HourlyOffer {
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'Session',
    required: true
  })
  session: Session;

  @Prop({ required: true, min: 0, max: 23 })
  hour: number; // Hora de la bid a la que responde (0-23)

  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'User',
    required: true
  })
  fsp: User; // Usuario FSP que hace la offer

  @Prop({ required: true, min: 0 })
  powerMw: number; // Cantidad de MW que ofrece el FSP

  @Prop({ required: true, min: 0 })
  pricePerMwh: number; // Precio por MWh (tomado de la bid)

  @Prop({ required: true, min: 0 })
  collateralAmount: number; // Cantidad de collateral depositado en FLEX tokens (5%)

  @Prop({ required: true, min: 0, default: 0 })
  feeAmount: number; // Fee de plataforma depositado en FLEX tokens (2%)

  @Prop({ default: 0, min: 0 })
  collateralLocked: number; // Cantidad de collateral bloqueado

  @Prop({ default: 0, min: 0 })
  collateralReturned: number; // Cantidad de collateral devuelto

  @Prop({ default: 0, min: 0 })
  collateralForfeited: number; // Cantidad de collateral perdido por penalización

  @Prop({
    type: String,
    enum: Object.values(OfferStatus),
    default: OfferStatus.PENDING
  })
  status: OfferStatus;

  @Prop()
  acceptedAt: Date;

  @Prop()
  rejectedAt: Date;

  @Prop()
  cancelledAt: Date;

  @Prop()
  confirmedAt: Date; // Fecha de confirmación en blockchain

  @Prop()
  transactionHash: string; // Hash de la transacción en blockchain

  @Prop({ type: Number, default: null })
  blockchainOfferId: number | null; // ID de la offer en el smart contract (asignado solo al publicar en blockchain)

  // Campos timestamp automáticos (timestamps: true)
  createdAt?: Date;
  updatedAt?: Date;
}

export const HourlyOfferSchema = SchemaFactory.createForClass(HourlyOffer);

// Indexes for performance
HourlyOfferSchema.index({ session: 1, hour: 1 });
HourlyOfferSchema.index({ fsp: 1 });
HourlyOfferSchema.index({ status: 1 });
HourlyOfferSchema.index({ session: 1, blockchainOfferId: -1 }); // Para calcular el próximo ID
// Un FSP solo puede hacer una offer activa (no CANCELLED) por hora por sesión
HourlyOfferSchema.index(
  { session: 1, hour: 1, fsp: 1 },
  {
    unique: true,
    partialFilterExpression: { status: { $ne: OfferStatus.CANCELLED } }
  }
);
// blockchainOfferId debe ser único por sesión
HourlyOfferSchema.index(
  { session: 1, blockchainOfferId: 1 },
  { unique: true, partialFilterExpression: { blockchainOfferId: { $ne: null } } }
);
