import { Injectable } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';
import { parse } from 'csv-parse/sync';
import {
  IDataParser,
  ParsedFlexibilityData,
  ParserOptions,
  ValidationResult,
  ValidationError,
  ValidationWarning,
} from '../interfaces/data-parser.interface';
import { MeasurementDto } from '../../dto/measurement.dto';
import { MeasurementType } from '../../schemas/interfaces';

/**
 * Parser per file CSV di dati di flessibilità
 * Formato atteso: CSV con header, colonne per timestamp e vari tipi di misurazione
 */
@Injectable()
export class CsvDataParser implements IDataParser {
  /**
   * Parse CSV file
   * Formato atteso:
   * timestamp,consumption [W],pv_production [W],storage_dispatch [W],net_load_with_flex [W],net_load_without_flex [W]
   *
   * Supporta formato europeo con virgola come separatore decimale (es. "305,0525")
   */
  async parse(
    filePath: string,
    options: ParserOptions,
  ): Promise<ParsedFlexibilityData> {
    // Leggi file
    const fileContent = await fs.readFile(filePath, 'utf-8');

    // Parse CSV usando csv-parse per gestire correttamente virgolette e delimitatori
    const records = parse(fileContent, {
      columns: true, // Prima riga come header
      skip_empty_lines: true,
      trim: true,
      relax_quotes: true, // Gestisce virgolette non standard
      relax_column_count: true, // Permette righe con numero colonne diverso
    }) as Record<string, string>[];

    if (!records || records.length === 0) {
      throw new Error('CSV file is empty or has no data rows');
    }

    // Trova colonna timestamp
    const header = Object.keys(records[0]);
    const timestampColumn = header.find((h) =>
      h.toLowerCase().includes('timestamp'),
    );

    if (!timestampColumn) {
      throw new Error('CSV must have a timestamp column');
    }

    // Determina data dal primo timestamp se non specificata
    const date =
      options.date || this.extractDateFromTimestamp(records[0][timestampColumn]);

    // Estrai measurements per ogni tipo di colonna
    const measurements: MeasurementDto[] = [];

    // Mappa header → MeasurementType
    const columnMapping = this.mapColumnsToMeasurementTypes(header);

    // Per ogni tipo di measurement, crea un MeasurementDto
    for (const [columnName, measurementType] of Object.entries(
      columnMapping,
    )) {
      const values = records.map((row) =>
        this.parseEuropeanNumber(row[columnName])
      );

      measurements.push({
        periodInMinutes: 15, // Assumiamo 15 minuti (96 valori per giorno)
        unit: 'W',
        type: measurementType,
        values,
      });
    }

    return {
      marketId: options.marketId,
      fspUserId: options.fspUserId,
      date,
      measurements,
      metadata: {
        source: 'csv',
        fileName: path.basename(filePath),
        parsedAt: new Date(),
        rowCount: records.length,
        ...options.metadata,
      },
    };
  }

  /**
   * Valida i dati parsati
   */
  async validate(
    data: ParsedFlexibilityData,
  ): Promise<ValidationResult> {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    // Valida marketId
    if (!data.marketId) {
      errors.push({
        field: 'marketId',
        message: 'marketId is required',
      });
    }

    // Valida fspUserId
    if (!data.fspUserId) {
      errors.push({
        field: 'fspUserId',
        message: 'fspUserId is required',
      });
    }

    // Valida measurements
    if (!data.measurements || data.measurements.length === 0) {
      errors.push({
        field: 'measurements',
        message: 'At least one measurement is required',
      });
    }

    // Valida ogni measurement
    data.measurements.forEach((m, i) => {
      // Verifica numero di valori
      if (m.periodInMinutes === 15 && m.values.length !== 96) {
        warnings.push({
          field: `measurements[${i}].values`,
          message: `Expected 96 values for 15min period, got ${m.values.length}`,
          value: m.values.length,
        });
      }

      if (m.periodInMinutes === 60 && m.values.length !== 24) {
        warnings.push({
          field: `measurements[${i}].values`,
          message: `Expected 24 values for 60min period, got ${m.values.length}`,
          value: m.values.length,
        });
      }

      // Verifica valori negativi (alcuni tipi possono essere negativi, es. storage_dispatch)
      const hasNegative = m.values.some((v) => v < 0);
      if (
        hasNegative &&
        m.type !== MeasurementType.STORAGE_DISPATCH &&
        !m.type.includes('net_load')
      ) {
        warnings.push({
          field: `measurements[${i}].values`,
          message: `Found negative values in ${m.type}, which is unusual`,
        });
      }
    });

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Ritorna le estensioni supportate
   */
  getSupportedExtensions(): string[] {
    return ['.csv', '.txt'];
  }

  /**
   * Parse CSV file che può contenere dati di più giorni
   * Ritorna un array di ParsedFlexibilityData, uno per ogni giorno
   */
  async parseMultipleDays(
    filePath: string,
    options: ParserOptions,
  ): Promise<ParsedFlexibilityData[]> {
    // Leggi file
    const fileContent = await fs.readFile(filePath, 'utf-8');

    // Parse CSV
    const records = parse(fileContent, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      relax_quotes: true,
      relax_column_count: true,
    }) as Record<string, string>[];

    if (!records || records.length === 0) {
      throw new Error('CSV file is empty or has no data rows');
    }

    // Trova colonna timestamp
    const header = Object.keys(records[0]);
    const timestampColumn = header.find((h) =>
      h.toLowerCase().includes('timestamp'),
    );

    if (!timestampColumn) {
      throw new Error('CSV must have a timestamp column');
    }

    // Raggruppa records per giorno
    const recordsByDay = this.groupRecordsByDay(records, timestampColumn);

    // Crea ParsedFlexibilityData per ogni giorno
    const results: ParsedFlexibilityData[] = [];
    const columnMapping = this.mapColumnsToMeasurementTypes(header);

    for (const [dateKey, dayRecords] of Object.entries(recordsByDay)) {
      const date = new Date(dateKey);
      const measurements: MeasurementDto[] = [];

      // Per ogni tipo di measurement, crea un MeasurementDto
      for (const [columnName, measurementType] of Object.entries(
        columnMapping,
      )) {
        const values = dayRecords.map((row) =>
          this.parseEuropeanNumber(row[columnName]),
        );

        measurements.push({
          periodInMinutes: 15,
          unit: 'W',
          type: measurementType,
          values,
        });
      }

      results.push({
        marketId: options.marketId,
        fspUserId: options.fspUserId,
        date,
        measurements,
        metadata: {
          source: 'csv',
          fileName: path.basename(filePath),
          parsedAt: new Date(),
          rowCount: dayRecords.length,
          dayCount: Object.keys(recordsByDay).length,
          ...options.metadata,
        },
      });
    }

    return results;
  }

  /**
   * Mappa nomi colonne CSV ai MeasurementType
   */
  private mapColumnsToMeasurementTypes(
    header: string[],
  ): Record<string, string> {
    const mapping: Record<string, string> = {};

    header.forEach((col) => {
      const colLower = col.toLowerCase();

      if (colLower.includes('consumption')) {
        mapping[col] = MeasurementType.CONSUMPTION;
      } else if (colLower.includes('pv') || colLower.includes('production')) {
        mapping[col] = MeasurementType.PV_PRODUCTION;
      } else if (colLower.includes('storage') || colLower.includes('dispatch')) {
        mapping[col] = MeasurementType.STORAGE_DISPATCH;
      } else if (colLower.includes('net') && !colLower.includes('without') && colLower.includes('flex')) {
        mapping[col] = MeasurementType.NET_LOAD_WITH_FLEX;
      } else if (colLower.includes('net') && colLower.includes('without')) {
        mapping[col] = MeasurementType.NET_LOAD_WITHOUT_FLEX;
      } else if (!colLower.includes('timestamp') && !colLower.includes('date')) {
        // Colonna sconosciuta, la mappiamo come tipo custom
        mapping[col] = col.toLowerCase().replace(/\s+/g, '_').replace(/\[.*\]/, '').trim();
      }
    });

    return mapping;
  }

  /**
   * Estrae data dal timestamp
   */
  private extractDateFromTimestamp(timestamp: string): Date {
    const date = new Date(timestamp);
    // Resetta ora a mezzanotte
    date.setHours(0, 0, 0, 0);
    return date;
  }

  /**
   * Converte un numero in formato europeo (virgola decimale) in numero JavaScript
   * Esempi: "305,0525" → 305.0525, "2,75" → 2.75, "0" → 0
   */
  private parseEuropeanNumber(value: string | number): number {
    if (typeof value === 'number') {
      return value;
    }

    if (!value || value.trim() === '') {
      return 0;
    }

    // Rimuovi eventuali virgolette
    const cleaned = value.trim().replace(/^["']|["']$/g, '');

    // Sostituisci virgola con punto per il parsing decimale
    const normalized = cleaned.replace(',', '.');

    const parsed = parseFloat(normalized);

    return isNaN(parsed) ? 0 : parsed;
  }

  /**
   * Raggruppa records CSV per giorno in base al timestamp
   * Ritorna un oggetto con chiave = data (YYYY-MM-DD) e valore = array di records
   */
  private groupRecordsByDay(
    records: Record<string, string>[],
    timestampColumn: string,
  ): Record<string, Record<string, string>[]> {
    const recordsByDay: Record<string, Record<string, string>[]> = {};

    for (const record of records) {
      const timestamp = record[timestampColumn];
      if (!timestamp) continue;

      // Estrai solo la data (senza ora) - usa la data locale per evitare problemi di timezone
      const date = new Date(timestamp);
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const dateKey = `${year}-${month}-${day}`; // YYYY-MM-DD

      if (!recordsByDay[dateKey]) {
        recordsByDay[dateKey] = [];
      }

      recordsByDay[dateKey].push(record);
    }

    return recordsByDay;
  }
}
