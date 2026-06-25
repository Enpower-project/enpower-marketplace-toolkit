import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { TenantFilteredSchema } from '../../tenant/schemas/tenant-filtered.schema';
import { ProfileType, MeasurementType } from './interfaces';

/**
 * Schema embedded per una singola misurazione
 */
@Schema({ _id: false })
export class Measurement {
  @Prop({ required: true })
  periodInMinutes: number;

  @Prop({ required: true })
  unit: string;

  @Prop({ required: true, type: String })
  type: MeasurementType | string;

  @Prop({ required: true, type: [Number] })
  values: number[];
}

export const MeasurementSchema = SchemaFactory.createForClass(Measurement);

/**
 * Schema per ConsumptionData
 * Contiene dati di consumo effettivi (profileType=ACTUAL) o profili di riferimento
 * Estende TenantFilteredSchema per avere automaticamente il campo 'market'
 */
@Schema({ timestamps: true, collection: 'consumption_data' })
export class ConsumptionData extends TenantFilteredSchema {
  @Prop({ required: true, index: true })
  fspUserId: string;

  @Prop({ type: Date, default: null, index: true })
  date: Date | null; // null per profili di riferimento

  @Prop({
    required: true,
    enum: Object.values(ProfileType),
    index: true,
  })
  profileType: ProfileType;

  @Prop({ type: [MeasurementSchema], required: true })
  measurements: Measurement[];

  @Prop({ type: Date })
  validFrom?: Date; // Solo per profili di riferimento

  @Prop({ type: Date })
  validTo?: Date; // Solo per profili di riferimento
}

// Interface for instance methods
export interface ConsumptionDataMethods {
  getMeasurement(type: string, periodInMinutes: 15 | 60): number[] | null;
  getMeasurementAt(type: string, periodInMinutes: 15 | 60, hour: number): number | null;
}

// Export document type with methods
export type ConsumptionDataDocument = HydratedDocument<ConsumptionData, ConsumptionDataMethods>;

export const ConsumptionDataSchema =
  SchemaFactory.createForClass(ConsumptionData);

// Instance methods
ConsumptionDataSchema.methods.getMeasurement = function(
  type: string,
  periodInMinutes: 15 | 60
): number[] | null {
  const measurement = this.measurements.find(
    (m) => m.type === type && m.periodInMinutes === periodInMinutes,
  );
  return measurement?.values || null;
};

ConsumptionDataSchema.methods.getMeasurementAt = function(
  type: string,
  periodInMinutes: 15 | 60,
  hour: number
): number | null {
  // Prova a recuperare direttamente
  let values = this.getMeasurement(type, periodInMinutes);

  // FALLBACK: if 60min not found, try computing from finer granularity
  if (!values && periodInMinutes === 60) {
    // From 15-min (96 values/day) — correct period label
    const quarterly = this.getMeasurement(type, 15);
    if (quarterly && quarterly.length === 96) {
      const startIdx = hour * 4;
      return quarterly[startIdx] + quarterly[startIdx + 1] +
             quarterly[startIdx + 2] + quarterly[startIdx + 3];
    }
    // From 30-min data: genuine 30-min (48 values) or legacy 15-min stored as 30-min (96 values)
    const halfHourly = this.getMeasurement(type, 30);
    if (halfHourly) {
      if (halfHourly.length === 48) {
        return (halfHourly[hour * 2] ?? 0) + (halfHourly[hour * 2 + 1] ?? 0);
      }
      if (halfHourly.length === 96) {
        // Legacy: 15-min data incorrectly labeled as 30-min — sum 4 values per hour
        const startIdx = hour * 4;
        return (halfHourly[startIdx] ?? 0) + (halfHourly[startIdx + 1] ?? 0) +
               (halfHourly[startIdx + 2] ?? 0) + (halfHourly[startIdx + 3] ?? 0);
      }
    }
  }

  if (!values) return null;

  if (periodInMinutes === 60) {
    return values[hour] ?? null;
  } else {
    // 15min: somma i 4 quarti per l'ora
    const startIdx = hour * 4;
    if (startIdx + 3 >= values.length) return null;
    return values[startIdx] + values[startIdx + 1] +
           values[startIdx + 2] + values[startIdx + 3];
  }
};

// Indici compound per query efficienti
ConsumptionDataSchema.index({
  market: 1,
  fspUserId: 1,
  date: 1,
  profileType: 1,
});

// Indice per query su profili di riferimento
ConsumptionDataSchema.index({ market: 1, profileType: 1, validTo: 1 });

// Indice per trovare measurement per tipo
ConsumptionDataSchema.index({ 'measurements.type': 1 });
