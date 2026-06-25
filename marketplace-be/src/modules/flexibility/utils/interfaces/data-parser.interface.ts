import { MeasurementDto } from '../../dto/measurement.dto';

/**
 * Risultato del parsing di un file di dati
 */
export interface ParsedFlexibilityData {
  marketId: string;
  fspUserId: string;
  date: Date;
  measurements: MeasurementDto[];
  metadata?: {
    source?: string;
    fileName?: string;
    parsedAt?: Date;
    [key: string]: any;
  };
}

/**
 * Risultato della validazione dei dati
 */
export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

export interface ValidationError {
  field: string;
  message: string;
  value?: any;
}

export interface ValidationWarning {
  field: string;
  message: string;
  value?: any;
}

/**
 * Opzioni per il parsing
 */
export interface ParserOptions {
  marketId: string;
  fspUserId: string;
  date?: Date; // Se non specificata, la prende dal file o usa oggi
  skipValidation?: boolean;
  metadata?: Record<string, any>;
}

/**
 * Interface per i parser di dati di flessibilità
 * Implementata da CSV, Excel, JSON, API parsers, ecc.
 */
export interface IDataParser {
  /**
   * Parse file e ritorna dati in formato standard
   */
  parse(
    filePath: string,
    options: ParserOptions,
  ): Promise<ParsedFlexibilityData>;

  /**
   * Valida i dati parsati
   */
  validate(data: ParsedFlexibilityData): Promise<ValidationResult>;

  /**
   * Ritorna i tipi di file supportati da questo parser
   */
  getSupportedExtensions(): string[];
}
