import { Document } from 'mongoose';
import { ITenantFiltered } from '../../tenant/schemas/tenant-filtered-entity';

/**
 * Tipo di profilo di consumo
 */
export enum ProfileType {
  ACTUAL = 'ACTUAL', // Dati di consumo effettivi giornalieri
  REFERENCE_STANDARD = 'REFERENCE_STANDARD', // Profilo standard di riferimento
  REFERENCE_MIN = 'REFERENCE_MIN', // Profilo minimo di riferimento
  REFERENCE_MAX = 'REFERENCE_MAX', // Profilo massimo di riferimento
}

/**
 * Tipo di misurazione
 * Enum per tipi noti + string per estensibilità futura
 */
export enum MeasurementType {
  CONSUMPTION = 'consumption',
  PV_PRODUCTION = 'pv_production',
  STORAGE_DISPATCH = 'storage_dispatch',
  NET_LOAD_WITH_FLEX = 'net_load_with_flex',
  NET_LOAD_WITHOUT_FLEX = 'net_load_without_flex',
  FLEXIBILITY_DOWNWARD = 'flexibility_downward',
  FLEXIBILITY_UPWARD = 'flexibility_upward',
}

/**
 * Tipo di flessibilità
 *
 * IMPORTANTE: La differenza tra THEORETICAL e ACTUAL non è nella struttura dello schema,
 * ma nel SIGNIFICATO dei valori nei measurements.
 *
 * @enum {string}
 *
 * @property THEORETICAL - Capacità bidirezionale disponibile
 *   - Rappresenta la CAPACITÀ dell'FSP in ogni slot temporale
 *   - Downward E Upward possono essere ENTRAMBI > 0 contemporaneamente
 *   - Downward = capacità di ridurre consumo (STANDARD → MIN)
 *   - Upward = capacità di aumentare consumo (STANDARD → MAX)
 *   - date = null (non legato a un giorno specifico)
 *   - Esempio: downward[9]=650Wh, upward[9]=420Wh (entrambi > 0)
 *
 * @property ACTUAL - Scelta unidirezionale effettuata
 *   - Rappresenta la flessibilità EFFETTIVAMENTE FORNITA dall'FSP
 *   - Solo UNO dei due (downward O upward) è > 0 per ogni slot
 *   - L'FSP ha fatto UNA scelta: o riduce o aumenta, non entrambe
 *   - date = data specifica del giorno
 *   - Esempio: downward[9]=0Wh, upward[9]=300Wh (solo uno > 0)
 *   - Calcolo: deviation = actual - standard, poi separa per segno
 *
 * @see README.md sezione "Differenza Fondamentale: THEORETICAL vs ACTUAL"
 */
export enum FlexibilityType {
  THEORETICAL = 'THEORETICAL',
  ACTUAL = 'ACTUAL',
}

/**
 * Interface per una singola misurazione
 */
export interface IMeasurement {
  periodInMinutes: number; // 15 | 60
  unit: string; // "W" | "Wh"
  type: MeasurementType | string; // Enum + estensibilità con string
  values: number[]; // 96 valori (15min) o 24 valori (60min)
}

/**
 * Interface per il summary della flessibilità effettiva
 */
export interface IFlexibilitySummary {
  totalDownwardWh: number; // Totale flessibilità downward fornita (Wh)
  totalUpwardWh: number; // Totale flessibilità upward fornita (Wh)
  complianceStatus: string; // "OK" | "BREACH" | "PARTIAL"
  peakFlexibilityHour?: number; // Ora con maggiore flessibilità fornita (0-23)
}

/**
 * Interface per ConsumptionData
 * Contiene i dati di consumo (effettivi o profili di riferimento)
 */
export interface IConsumptionData extends ITenantFiltered, Document {
  fspUserId: string;
  date: Date | null; // null per profili di riferimento
  profileType: ProfileType;
  measurements: IMeasurement[]; // Array flessibile di misurazioni
  validFrom?: Date; // Solo per profili di riferimento
  validTo?: Date; // Solo per profili di riferimento
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Interface per FlexibilityData
 *
 * Contiene i dati di flessibilità (teorica o effettiva).
 *
 * IMPORTANTE: Lo schema è identico per THEORETICAL e ACTUAL.
 * La differenza è nel significato dei valori nei measurements:
 * - THEORETICAL: downward e upward entrambi > 0 (capacità bidirezionale)
 * - ACTUAL: solo uno dei due > 0 per slot (scelta unidirezionale)
 *
 * @see FlexibilityType per documentazione dettagliata
 */
export interface IFlexibilityData extends ITenantFiltered, Document {
  /** ID dell'FSP proprietario */
  fspUserId: string;

  /** Data di riferimento (null per THEORETICAL, data specifica per ACTUAL) */
  date: Date | null;

  /** Tipo di flessibilità (THEORETICAL = capacità, ACTUAL = fornita) */
  flexibilityType: FlexibilityType;

  /**
   * Array di misurazioni (downward/upward per diverse granularità)
   *
   * SEMPRE presente sia downward che upward per entrambi i tipi.
   * La differenza è nei VALORI, non nella struttura.
   */
  measurements: IMeasurement[];

  /** Summary statistico (solo per ACTUAL) */
  summary?: IFlexibilitySummary;

  /** Timestamp di calcolo */
  calculatedAt: Date;

  createdAt: Date;
  updatedAt: Date;
}

/**
 * Interface per UserConsumptionProfile
 * Associa un FSP ai suoi profili di riferimento (standard, min, max)
 */
export interface IUserConsumptionProfile extends ITenantFiltered, Document {
  fspUserId: string;
  standardProfileId: string; // ID del ConsumptionData con profileType=REFERENCE_STANDARD
  minProfileId: string; // ID del ConsumptionData con profileType=REFERENCE_MIN
  maxProfileId: string; // ID del ConsumptionData con profileType=REFERENCE_MAX
  validFrom: Date;
  validTo?: Date;
  createdAt: Date;
  updatedAt: Date;
}
