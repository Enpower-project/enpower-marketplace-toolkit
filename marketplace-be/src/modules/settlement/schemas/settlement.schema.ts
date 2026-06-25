import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export type SettlementDocument = Settlement & Document;

/**
 * Estado del settlement en el proceso de liquidación
 */
export enum SettlementStatus {
  PENDING = 'PENDING',           // Esperando cálculo
  CALCULATED = 'CALCULATED',     // Calculado, pendiente de envío a blockchain
  SUBMITTED = 'SUBMITTED',       // Enviado a blockchain, pendiente de ejecución
  EXECUTED = 'EXECUTED',         // Ejecutado, pago procesado
  FAILED = 'FAILED',             // Falló en algún paso
}

/**
 * Schema para persistir los settlements en MongoDB
 * Mantiene un registro off-chain de los settlements para auditoría y consultas
 */
@Schema({ timestamps: true, collection: 'settlements' })
export class Settlement {
  /**
   * ID de la sesión en MongoDB
   */
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Session', required: true, index: true })
  sessionId: MongooseSchema.Types.ObjectId;

  /**
   * Dirección del contrato MarketSession en blockchain
   */
  @Prop({ required: true, index: true })
  sessionAddress: string;

  /**
   * ID de la oferta en el smart contract
   */
  @Prop({ required: true })
  offerId: number;

  /**
   * ID de la oferta en MongoDB
   */
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'HourlyOffer' })
  hourlyOfferId?: MongooseSchema.Types.ObjectId;

  /**
   * ID del FSP (usuario) propietario de la oferta
   */
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true, index: true })
  fspUserId: MongooseSchema.Types.ObjectId;

  /**
   * Dirección pública del wallet del FSP
   */
  @Prop({ required: true })
  fspAddress: string;

  /**
   * Hora del slot de flexibilidad (0-23)
   */
  @Prop({ required: true, min: 0, max: 23 })
  hourSlot: number;

  /**
   * Tipo de bid (DEMAND o SUPPLY)
   */
  @Prop({ type: String })
  bidType?: string;

  /**
   * Fecha de entrega de la flexibilidad
   */
  @Prop({ required: true, type: Date })
  deliveryDate: Date;

  /**
   * Cantidad comprometida en wei
   */
  @Prop({ required: true })
  committedQuantity: string;

  /**
   * Cantidad entregada en wei
   */
  @Prop({ required: true })
  deliveredQuantity: string;

  /**
   * Porcentaje de desviación
   */
  @Prop({ required: true })
  deviationPercentage: number;

  /**
   * Tipo de desviación (shortfall/excess)
   */
  @Prop()
  deviationType?: string;

  /**
   * Collateral depositado en FLEX tokens
   */
  @Prop({ required: true })
  collateralAmount: string;

  /**
   * Collateral devuelto al FSP en FLEX tokens
   */
  @Prop({ default: '0' })
  collateralReturned: string;

  /**
   * Collateral perdido por penalización en FLEX tokens
   */
  @Prop({ default: '0' })
  collateralForfeited: string;

  /**
   * Monto de penalización en wei
   */
  @Prop({ required: true })
  penaltyAmount: string;

  /**
   * Pago en wei (deliveredQuantity * price / 1e18) - FRP paga, FSP recibe
   */
  @Prop({ required: true })
  payment: string;

  /**
   * Fee de plataforma en wei (2% del valor comprometido, pre-pagado por FSP)
   */
  @Prop({ required: true })
  platformFee: string;

  /**
   * Precio por unidad en wei
   */
  @Prop({ required: true })
  price: string;

  /**
   * Hash de las lecturas del medidor
   */
  @Prop({ required: true })
  meterReadingsHash: string;

  /**
   * ID del NFT de flexibilidad emitido
   */
  @Prop()
  flexibilityNftId?: number;

  /**
   * Metadata del NFT (promised vs delivered)
   */
  @Prop({ type: MongooseSchema.Types.Mixed })
  nftMetadata?: {
    promisedFlexibility: string;
    deliveredFlexibility: string;
    deliveryDate: Date;
    hourSlot: number;
    deviationPercentage: number;
    penaltyApplied: boolean;
  };

  /**
   * Estado del settlement
   */
  @Prop({
    type: String,
    enum: Object.values(SettlementStatus),
    default: SettlementStatus.PENDING,
    index: true,
  })
  status: SettlementStatus;

  /**
   * Hash de la transacción de submitSettlement
   */
  @Prop()
  submitTxHash?: string;

  /**
   * Hash de la transacción de executeSettlement
   */
  @Prop()
  executeTxHash?: string;

  /**
   * Mensaje de error si falló
   */
  @Prop()
  errorMessage?: string;

  /**
   * ID del market
   */
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Market', required: true, index: true })
  market: MongooseSchema.Types.ObjectId;

  // Campos timestamp automáticos (timestamps: true)
  createdAt?: Date;
  updatedAt?: Date;
}

export const SettlementSchema = SchemaFactory.createForClass(Settlement);

// Índices para consultas eficientes
SettlementSchema.index({ sessionAddress: 1, offerId: 1 }, { unique: true });
SettlementSchema.index({ market: 1, status: 1 });
SettlementSchema.index({ fspUserId: 1, status: 1 });
SettlementSchema.index({ deliveryDate: 1 });
