import { ParsedFlexibilityData } from '../interfaces/data-parser.interface';
import { MeasurementDto } from '../../dto/measurement.dto';

/**
 * Utility per validazioni comuni sui dati di flessibilità
 */
export class DataValidatorUtil {
  /**
   * Valida che i valori siano nel range atteso (no NaN, no Infinity)
   */
  static validateNumericValues(values: number[]): boolean {
    return values.every(
      (v) => typeof v === 'number' && !isNaN(v) && isFinite(v),
    );
  }

  /**
   * Valida che il numero di valori corrisponda al periodo
   */
  static validateValueCount(
    values: number[],
    periodInMinutes: number,
  ): boolean {
    const expectedCount = periodInMinutes === 15 ? 96 : 24;
    return values.length === expectedCount;
  }

  /**
   * Valida che i measurement abbiano le proprietà richieste
   */
  static validateMeasurement(measurement: MeasurementDto): string[] {
    const errors: string[] = [];

    if (!measurement.periodInMinutes) {
      errors.push('periodInMinutes is required');
    } else if (![15, 60].includes(measurement.periodInMinutes)) {
      errors.push('periodInMinutes must be 15 or 60');
    }

    if (!measurement.unit) {
      errors.push('unit is required');
    }

    if (!measurement.type) {
      errors.push('type is required');
    }

    if (!measurement.values || !Array.isArray(measurement.values)) {
      errors.push('values must be an array');
    } else {
      if (!this.validateNumericValues(measurement.values)) {
        errors.push('values must be valid numbers');
      }

      if (!this.validateValueCount(measurement.values, measurement.periodInMinutes)) {
        errors.push(
          `values count mismatch: expected ${measurement.periodInMinutes === 15 ? 96 : 24}, got ${measurement.values.length}`,
        );
      }
    }

    return errors;
  }

  /**
   * Valida dati parsati completi
   */
  static validateParsedData(data: ParsedFlexibilityData): string[] {
    const errors: string[] = [];

    if (!data.marketId) {
      errors.push('marketId is required');
    }

    if (!data.fspUserId) {
      errors.push('fspUserId is required');
    }

    if (!data.date || !(data.date instanceof Date)) {
      errors.push('date must be a valid Date');
    }

    if (!data.measurements || data.measurements.length === 0) {
      errors.push('at least one measurement is required');
    } else {
      data.measurements.forEach((m, i) => {
        const measurementErrors = this.validateMeasurement(m);
        measurementErrors.forEach((err) => {
          errors.push(`measurements[${i}]: ${err}`);
        });
      });
    }

    return errors;
  }

  /**
   * Rileva outlier nei dati (valori anomali)
   */
  static detectOutliers(
    values: number[],
    threshold: number = 3,
  ): number[] {
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const stdDev = Math.sqrt(
      values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) /
        values.length,
    );

    const outlierIndices: number[] = [];
    values.forEach((v, i) => {
      if (Math.abs(v - mean) > threshold * stdDev) {
        outlierIndices.push(i);
      }
    });

    return outlierIndices;
  }

  /**
   * Verifica monotonia dei dati (per controllo qualità)
   */
  static checkDataQuality(values: number[]): {
    hasZeros: boolean;
    hasNegatives: boolean;
    hasOutliers: boolean;
    outlierCount: number;
  } {
    const outliers = this.detectOutliers(values);

    return {
      hasZeros: values.some((v) => v === 0),
      hasNegatives: values.some((v) => v < 0),
      hasOutliers: outliers.length > 0,
      outlierCount: outliers.length,
    };
  }
}
