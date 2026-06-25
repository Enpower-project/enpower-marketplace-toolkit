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
 * Parser para archivos CSV del Pilot Griego (intervalos de 30 minutos).
 *
 * Formato esperado:
 *   timestamp,consumption [W],pv_production [W],net_load_without_flex [W]
 *
 * Diferencias respecto a CsvDataParser (Irish Pilot):
 *   - periodInMinutes: 30 (48 valores/día en vez de 96)
 *   - Sin columna storage_dispatch [W]
 *   - Sin columna net_load_with_flex [W]
 *   - Validación espera 48 valores para 30 min
 *   - Agregación horaria: suma 2 valores por hora (en vez de 4)
 */
@Injectable()
export class GreekCsvDataParser implements IDataParser {
  /** Número de valores por día para intervalos de 30 minutos */
  private readonly PERIOD_MINUTES = 30;
  private readonly VALUES_PER_DAY = 48;

  /**
   * Normaliza el contenido del CSV cuando Excel exporta cada fila entera
   * entre comillas dobles (p.ej. `"timestamp,consumption [W],..."` como una
   * sola cadena). Elimina esas comillas externas para que csv-parse lo procese
   * correctamente.
   */
  private normalizeExcelQuotedCsv(content: string): string {
    const lines = content.split('\n');
    const first = lines[0].trim();
    if (!first.startsWith('"') || !first.endsWith('"')) return content;

    return lines
      .map((line) => {
        const s = line.trim();
        return s.startsWith('"') && s.endsWith('"') ? s.slice(1, -1) : s;
      })
      .filter((s) => s.length > 0)
      .join('\n');
  }

  async parse(
    filePath: string,
    options: ParserOptions,
  ): Promise<ParsedFlexibilityData> {
    const raw = await fs.readFile(filePath, 'utf-8');
    const fileContent = this.normalizeExcelQuotedCsv(raw);

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

    const header = Object.keys(records[0]);
    const timestampColumn = header.find((h) =>
      h.toLowerCase().includes('timestamp'),
    );

    if (!timestampColumn) {
      throw new Error('CSV must have a timestamp column');
    }

    const date =
      options.date || this.extractDateFromTimestamp(records[0][timestampColumn]);

    const measurements = this.buildMeasurements(header, records);

    return {
      marketId: options.marketId,
      fspUserId: options.fspUserId,
      date,
      measurements,
      metadata: {
        source: 'csv-greek',
        fileName: path.basename(filePath),
        parsedAt: new Date(),
        rowCount: records.length,
        periodInMinutes: this.PERIOD_MINUTES,
        ...options.metadata,
      },
    };
  }

  /**
   * Detects the measurement period (in minutes) from the number of rows in a day.
   * 96 rows/day → 15-min (actual daily measurements)
   * 48 rows/day → 30-min (historical reference data)
   */
  private detectPeriodFromRowCount(rowCount: number): number {
    if (rowCount >= 90) return 15;   // 96 rows/day = 15-min intervals
    if (rowCount >= 42) return 30;   // 48 rows/day = 30-min intervals
    return this.PERIOD_MINUTES;      // fallback
  }

  async parseMultipleDays(
    filePath: string,
    options: ParserOptions,
  ): Promise<ParsedFlexibilityData[]> {
    const raw = await fs.readFile(filePath, 'utf-8');
    const fileContent = this.normalizeExcelQuotedCsv(raw);

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

    const header = Object.keys(records[0]);
    const timestampColumn = header.find((h) =>
      h.toLowerCase().includes('timestamp'),
    );

    if (!timestampColumn) {
      throw new Error('CSV must have a timestamp column');
    }

    const recordsByDay = this.groupRecordsByDay(records, timestampColumn);
    const columnMapping = this.mapColumnsToMeasurementTypes(header);
    const results: ParsedFlexibilityData[] = [];

    for (const [dateKey, dayRecords] of Object.entries(recordsByDay)) {
      const date = new Date(dateKey);
      const measurements: MeasurementDto[] = [];

      // Auto-detect period from number of rows for this day
      const periodInMinutes = this.detectPeriodFromRowCount(dayRecords.length);

      for (const [columnName, measurementType] of Object.entries(columnMapping)) {
        const values = dayRecords.map((row) =>
          this.parseEuropeanNumber(row[columnName]),
        );

        measurements.push({
          periodInMinutes,
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
          source: 'csv-greek',
          fileName: path.basename(filePath),
          parsedAt: new Date(),
          rowCount: dayRecords.length,
          dayCount: Object.keys(recordsByDay).length,
          periodInMinutes,
          ...options.metadata,
        },
      });
    }

    return results;
  }

  async validate(data: ParsedFlexibilityData): Promise<ValidationResult> {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    if (!data.marketId) {
      errors.push({ field: 'marketId', message: 'marketId is required' });
    }

    if (!data.fspUserId) {
      errors.push({ field: 'fspUserId', message: 'fspUserId is required' });
    }

    if (!data.measurements || data.measurements.length === 0) {
      errors.push({
        field: 'measurements',
        message: 'At least one measurement is required',
      });
    }

    data.measurements.forEach((m, i) => {
      if (m.periodInMinutes === this.PERIOD_MINUTES && m.values.length !== this.VALUES_PER_DAY) {
        warnings.push({
          field: `measurements[${i}].values`,
          message: `Expected ${this.VALUES_PER_DAY} values for ${this.PERIOD_MINUTES}min period (Greek Pilot), got ${m.values.length}`,
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
    });

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  getSupportedExtensions(): string[] {
    return ['.csv', '.txt'];
  }

  private buildMeasurements(
    header: string[],
    records: Record<string, string>[],
  ): MeasurementDto[] {
    const measurements: MeasurementDto[] = [];
    const columnMapping = this.mapColumnsToMeasurementTypes(header);

    for (const [columnName, measurementType] of Object.entries(columnMapping)) {
      const values = records.map((row) =>
        this.parseEuropeanNumber(row[columnName]),
      );

      measurements.push({
        periodInMinutes: this.PERIOD_MINUTES,
        unit: 'W',
        type: measurementType,
        values,
      });
    }

    return measurements;
  }

  /**
   * Mapea columnas del CSV griego a MeasurementType.
   * El Pilot Griego no tiene storage_dispatch ni net_load_with_flex.
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
      } else if (colLower.includes('net') && colLower.includes('without')) {
        mapping[col] = MeasurementType.NET_LOAD_WITHOUT_FLEX;
      } else if (!colLower.includes('timestamp') && !colLower.includes('date')) {
        // Columna desconocida, mapear con nombre normalizado
        mapping[col] = col.toLowerCase().replace(/\s+/g, '_').replace(/\[.*\]/, '').trim();
      }
    });

    return mapping;
  }

  private extractDateFromTimestamp(timestamp: string): Date {
    const date = new Date(timestamp);
    date.setHours(0, 0, 0, 0);
    return date;
  }

  private parseEuropeanNumber(value: string | number): number {
    if (typeof value === 'number') return value;
    if (!value || value.trim() === '') return 0;

    const cleaned = value.trim().replace(/^["']|["']$/g, '');
    const normalized = cleaned.replace(',', '.');
    const parsed = parseFloat(normalized);

    return isNaN(parsed) ? 0 : parsed;
  }

  private groupRecordsByDay(
    records: Record<string, string>[],
    timestampColumn: string,
  ): Record<string, Record<string, string>[]> {
    const recordsByDay: Record<string, Record<string, string>[]> = {};

    for (const record of records) {
      const timestamp = record[timestampColumn];
      if (!timestamp) continue;

      const date = new Date(timestamp);
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const dateKey = `${year}-${month}-${day}`;

      if (!recordsByDay[dateKey]) {
        recordsByDay[dateKey] = [];
      }

      recordsByDay[dateKey].push(record);
    }

    return recordsByDay;
  }
}
