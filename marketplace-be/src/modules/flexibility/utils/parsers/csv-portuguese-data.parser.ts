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
 * Parser para archivos CSV del Pilot Portugués (intervalos de 15 minutos).
 *
 * Formato esperado:
 *   reading_time,consumption [kW],injection [kW]
 *   (el nombre de la columna timestamp puede ser 'reading_time' o 'timestamp')
 *
 * Diferencias respecto a CsvDataParser (Irish Pilot):
 *   - Sin storage_dispatch [W], net_load_with_flex [W], net_load_without_flex [W]
 *   - injection [kW] = energía solar inyectada a la red → MeasurementType.PV_PRODUCTION
 *   - Timestamps con timezone offset (+01:00) → fecha extraída de los primeros 10 chars
 *     para evitar que la conversión UTC desplace el día
 *   - periodInMinutes: 15, VALUES_PER_DAY: 96 (igual que Irish)
 *   - Los valores de la fuente están en kW → se multiplican por 1000 para almacenar en W
 */
@Injectable()
export class PortugueseCsvDataParser implements IDataParser {
  private readonly PERIOD_MINUTES = 15;
  private readonly VALUES_PER_DAY = 96;
  /** Factor de conversión: los datos portugueses vienen en kW, el sistema almacena W */
  private readonly KW_TO_W = 1000;

  /**
   * Normaliza el contenido del CSV cuando Excel exporta cada fila entera
   * entre comillas dobles. Elimina esas comillas externas para que csv-parse
   * lo procese correctamente.
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
    const timestampColumn = header.find((h) => {
      const l = h.toLowerCase();
      return l.includes('timestamp') || l.includes('reading_time');
    });

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
        source: 'csv-portuguese',
        fileName: path.basename(filePath),
        parsedAt: new Date(),
        rowCount: records.length,
        periodInMinutes: this.PERIOD_MINUTES,
        ...options.metadata,
      },
    };
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
    const timestampColumn = header.find((h) => {
      const l = h.toLowerCase();
      return l.includes('timestamp') || l.includes('reading_time');
    });

    if (!timestampColumn) {
      throw new Error('CSV must have a timestamp column');
    }

    const recordsByDay = this.groupRecordsByDay(records, timestampColumn);
    const columnMapping = this.mapColumnsToMeasurementTypes(header);
    const results: ParsedFlexibilityData[] = [];

    for (const [dateKey, dayRecords] of Object.entries(recordsByDay)) {
      const date = new Date(dateKey);
      const measurements: MeasurementDto[] = [];

      for (const [columnName, measurementType] of Object.entries(columnMapping)) {
        const values = dayRecords.map((row) =>
          this.parseEuropeanNumber(row[columnName]) * this.KW_TO_W,
        );

        measurements.push({
          periodInMinutes: this.PERIOD_MINUTES,
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
          source: 'csv-portuguese',
          fileName: path.basename(filePath),
          parsedAt: new Date(),
          rowCount: dayRecords.length,
          dayCount: Object.keys(recordsByDay).length,
          periodInMinutes: this.PERIOD_MINUTES,
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
          message: `Expected ${this.VALUES_PER_DAY} values for ${this.PERIOD_MINUTES}min period (Portuguese Pilot), got ${m.values.length}`,
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
        this.parseEuropeanNumber(row[columnName]) * this.KW_TO_W,
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
   * Mapea columnas del CSV portugués a MeasurementType.
   * injection [W] = energía inyectada a la red (solar/FV) → PV_PRODUCTION.
   */
  private mapColumnsToMeasurementTypes(
    header: string[],
  ): Record<string, string> {
    const mapping: Record<string, string> = {};

    header.forEach((col) => {
      const colLower = col.toLowerCase();

      if (colLower.includes('consumption')) {
        mapping[col] = MeasurementType.CONSUMPTION;
      } else if (colLower.includes('injection')) {
        mapping[col] = MeasurementType.PV_PRODUCTION;
      } else if (!colLower.includes('timestamp') && !colLower.includes('reading_time') && !colLower.includes('date')) {
        mapping[col] = col.toLowerCase().replace(/\s+/g, '_').replace(/\[.*\]/, '').trim();
      }
    });

    return mapping;
  }

  /**
   * Extrae la fecha del timestamp portugués sin conversión UTC.
   * Los timestamps del Pilot Portugués incluyen offset (+01:00), por lo que
   * usar `new Date(timestamp)` desplazaría el día. Se toman los primeros 10
   * caracteres (YYYY-MM-DD) directamente.
   */
  private extractDateFromTimestamp(timestamp: string): Date {
    const datePart = timestamp.trim().substring(0, 10);
    const date = new Date(`${datePart}T00:00:00.000Z`);
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

      // Extract date from first 10 chars to avoid UTC shift from timezone offset
      const dateKey = timestamp.trim().substring(0, 10);

      if (!recordsByDay[dateKey]) {
        recordsByDay[dateKey] = [];
      }

      recordsByDay[dateKey].push(record);
    }

    return recordsByDay;
  }
}
