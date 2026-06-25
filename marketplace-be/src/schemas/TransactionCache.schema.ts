import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';

export type TransactionCacheDocument = TransactionCache & Document;

export enum TransactionStatus {
  ACCEPTED = 1,
  REVERTED = 0
}

@Schema({
  collection: 'transactionCache',
  timestamps: true,
})
export class TransactionCache {

  @Prop({ required: false })
  transactionHash: string;

  @Prop({ required: false })
  transactionLog: string;

  @Prop({ required: false })
  timestamp: number; 

  @Prop({ required: true })
  from: string;

  @Prop({ required: true })
  to: string;

  @Prop()
  gasUsed?: string;

  @Prop()
  gasPrice?: string;

    @Prop({ type: Object })
  transaction?: any; // Store raw transaction data for failed txs

  @Prop(({ type: Number, enum: TransactionStatus, default: TransactionStatus.ACCEPTED }))
  status: TransactionStatus;
}

export const TransactionCacheSchema =
  SchemaFactory.createForClass(TransactionCache);

TransactionCacheSchema.index({ from: 1, timestamp: -1 });
TransactionCacheSchema.index({ transactionHash: 1 }, { unique: true });
