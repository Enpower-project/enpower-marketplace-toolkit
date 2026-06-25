import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { TenantFilteredSchema } from '../../tenant/schemas/tenant-filtered.schema';
import { FlexibilityType } from './interfaces';
import { Measurement, MeasurementSchema } from './consumption-data.schema';

/**
 * Schema embedded per il summary della flessibilità effettiva
 */
@Schema({ _id: false })
export class FlexibilitySummary {
  @Prop({ required: true })
  totalDownwardWh: number;

  @Prop({ required: true })
  totalUpwardWh: number;

  @Prop({ required: true })
  complianceStatus: string; // "OK" | "BREACH" | "PARTIAL"

  @Prop()
  peakFlexibilityHour?: number; // 0-23
}

export const FlexibilitySummarySchema =
  SchemaFactory.createForClass(FlexibilitySummary);

/**
 * Schema per FlexibilityData
 *
 * Contiene dati di flessibilità teorica (THEORETICAL) o effettiva (ACTUAL).
 * Estende TenantFilteredSchema per avere automaticamente il campo 'market'.
 *
 * ⚠️ IMPORTANTE: La struttura dello schema è identica per THEORETICAL e ACTUAL.
 * La differenza è nel SIGNIFICATO dei valori nei measurements:
 *
 * - THEORETICAL: entrambi downward e upward > 0 nello stesso slot (capacità bidirezionale)
 * - ACTUAL: solo uno dei due > 0 per slot (scelta unidirezionale effettuata)
 *
 * @see FlexibilityType enum per dettagli completi sulla differenza
 * @see README.md sezione "Differenza Fondamentale: THEORETICAL vs ACTUAL"
 */
@Schema({ timestamps: true, collection: 'flexibility_data' })
export class FlexibilityData extends TenantFilteredSchema {
  /** ID dell'FSP (Flexibility Service Provider) proprietario di questa flessibilità */
  @Prop({ required: true, index: true })
  fspUserId: string;

  /**
   * Data di riferimento
   *
   * - THEORETICAL: null (capacità non legata a un giorno specifico)
   * - ACTUAL: data specifica del giorno (flessibilità effettivamente fornita)
   */
  @Prop({ type: Date, default: null, index: true })
  date: Date | null;

  /**
   * Tipo di flessibilità
   *
   * THEORETICAL (capacità bidirezionale):
   *   - downward[h] e upward[h] entrambi > 0 nello stesso slot
   *   - Indica capacità disponibili in entrambe le direzioni
   *
   * ACTUAL (scelta unidirezionale):
   *   - Solo downward[h] O upward[h] > 0 per ogni slot
   *   - Indica la scelta effettuata dall'FSP (o riduzione o aumento)
   *
   * @see FlexibilityType per documentazione dettagliata
   */
  @Prop({
    required: true,
    enum: Object.values(FlexibilityType),
    index: true,
  })
  flexibilityType: FlexibilityType;

  /**
   * Array di misurazioni di flessibilità
   *
   * Contiene SEMPRE sia downward che upward per entrambi i tipi (THEORETICAL e ACTUAL).
   * La differenza è nei VALORI:
   *
   * THEORETICAL:
   *   - flexibility_downward[9] = 650 Wh (capacità di ridurre)
   *   - flexibility_upward[9] = 420 Wh (capacità di aumentare)
   *   → Entrambi > 0 contemporaneamente
   *
   * ACTUAL:
   *   - flexibility_downward[9] = 0 Wh (non ha ridotto)
   *   - flexibility_upward[9] = 300 Wh (ha aumentato)
   *   → Solo uno > 0 per slot
   *
   * Include anche granularità 15min (W) e 60min (Wh)
   */
  @Prop({ type: [MeasurementSchema], required: true })
  measurements: Measurement[];

  /**
   * Summary statistico della flessibilità
   *
   * Solo per ACTUAL: contiene totali giornalieri e ora di picco
   * Non presente per THEORETICAL (non ha senso sommare capacità teoriche)
   */
  @Prop({ type: FlexibilitySummarySchema })
  summary?: FlexibilitySummary;

  /** Timestamp di calcolo della flessibilità */
  @Prop({ required: true, type: Date })
  calculatedAt: Date;
}

// Interface for instance methods
export interface FlexibilityDataMethods {
  getMeasurement(type: string, periodInMinutes: 15 | 60): number[] | null;
  getMeasurementAt(type: string, periodInMinutes: 15 | 60, hour: number): number | null;
}

// Export document type with methods
export type FlexibilityDataDocument = HydratedDocument<FlexibilityData, FlexibilityDataMethods>;

export const FlexibilityDataSchema =
  SchemaFactory.createForClass(FlexibilityData);

// Instance methods
FlexibilityDataSchema.methods.getMeasurement = function(
  type: string,
  periodInMinutes: 15 | 60
): number[] | null {
  const measurement = this.measurements.find(
    (m) => m.type === type && m.periodInMinutes === periodInMinutes,
  );
  return measurement?.values || null;
};

FlexibilityDataSchema.methods.getMeasurementAt = function(
  type: string,
  periodInMinutes: 15 | 60,
  hour: number
): number | null {
  // Prova a recuperare direttamente
  let values = this.getMeasurement(type, periodInMinutes);

  // FALLBACK: se 60min non esiste, calcola da 15min
  if (!values && periodInMinutes === 60) {
    const quarterly = this.getMeasurement(type, 15);
    if (quarterly && quarterly.length === 96) {
      const startIdx = hour * 4;
      return quarterly[startIdx] + quarterly[startIdx + 1] +
             quarterly[startIdx + 2] + quarterly[startIdx + 3];
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
FlexibilityDataSchema.index({
  market: 1,
  fspUserId: 1,
  date: 1,
  flexibilityType: 1,
});

// Indice per query su flessibilità teorica
FlexibilityDataSchema.index({ market: 1, flexibilityType: 1 });
