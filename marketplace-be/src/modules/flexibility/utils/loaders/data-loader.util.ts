import { Injectable, Logger } from '@nestjs/common';
import { ParsedFlexibilityData } from '../interfaces/data-parser.interface';
import { ConsumptionDataService } from '../../services/consumption-data.service';
import { FlexibilityDataService } from '../../services/flexibility-data.service';
import { UserConsumptionProfileService } from '../../services/user-consumption-profile.service';
import { ProfileType } from '../../schemas/interfaces';
import { DataValidatorUtil } from '../validators/data-validator.util';
import { InvalidProfileTypeException } from '../../exceptions/flexibility.exception';

export interface LoadResult {
  success: boolean;
  consumptionDataId?: string;
  errors: string[];
  warnings: string[];
}

export interface LoadOptions {
  calculateFlexibility?: boolean; // Se true, calcola anche flessibilità effettiva
  profileType?: ProfileType; // Se specificato, carica come profilo di riferimento
}

/**
 * Utility per caricare dati parsati nel database
 * Riutilizzabile dal microservizio ETL
 */
@Injectable()
export class DataLoaderUtil {
  private readonly logger = new Logger(DataLoaderUtil.name);

  constructor(
    private readonly consumptionDataService: ConsumptionDataService,
    private readonly flexibilityDataService: FlexibilityDataService,
    private readonly userProfileService: UserConsumptionProfileService,
  ) {}

  /**
   * Carica dati di consumo effettivi nel database
   */
  async loadActualConsumption(
    data: ParsedFlexibilityData,
    options: LoadOptions = {},
  ): Promise<LoadResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // Valida dati
      const validationErrors = DataValidatorUtil.validateParsedData(data);
      if (validationErrors.length > 0) {
        return {
          success: false,
          errors: validationErrors,
          warnings,
        };
      }

      // Verifica qualità dati
      data.measurements.forEach((m) => {
        const quality = DataValidatorUtil.checkDataQuality(m.values);
        if (quality.hasOutliers) {
          warnings.push(
            `${m.type}: Found ${quality.outlierCount} potential outliers`,
          );
        }
      });

      // Crea ConsumptionData
      const consumptionData = await this.consumptionDataService.create({
        market: data.marketId,
        fspUserId: data.fspUserId,
        date: data.date,
        profileType: options.profileType || ProfileType.ACTUAL,
        measurements: data.measurements,
        ...data.metadata,
      });

      this.logger.log(
        `Loaded consumption data for ${data.fspUserId} on ${data.date.toISOString().split('T')[0]}`,
      );

      // Aggiungi aggregazione oraria per tutti i measurement types
      const hourlyMeasurements: any[] = [];

      for (const measurement of data.measurements) {
        if (measurement.periodInMinutes === 15 && measurement.values.length === 96) {
          const hourlyValues = this.consumptionDataService.aggregateToHourly(
            measurement.values
          );

          hourlyMeasurements.push({
            periodInMinutes: 60,
            unit: 'Wh',
            type: measurement.type,
            values: hourlyValues,
          });
        }
      }

      if (hourlyMeasurements.length > 0) {
        consumptionData.measurements.push(...hourlyMeasurements);
        await consumptionData.save();
        this.logger.log(
          `Added ${hourlyMeasurements.length} hourly aggregations for ${data.fspUserId}`
        );
      }

      // Se richiesto, calcola flessibilità effettiva
      if (options.calculateFlexibility && options.profileType === undefined) {
        try {
          await this.flexibilityDataService.calculateActualFlexibility(
            data.fspUserId,
            data.date,
          );
          this.logger.log(
            `Calculated actual flexibility for ${data.fspUserId} on ${data.date.toISOString().split('T')[0]}`,
          );
        } catch (flexError) {
          warnings.push(
            `Failed to calculate flexibility: ${(flexError as Error).message}`,
          );
        }
      }

      return {
        success: true,
        consumptionDataId: String((consumptionData as any)._id),
        errors,
        warnings,
      };
    } catch (error) {
      this.logger.error(
        `Failed to load consumption data: ${(error as Error).message}`,
      );
      errors.push((error as Error).message);
      return {
        success: false,
        errors,
        warnings,
      };
    }
  }

  /**
   * Carica profilo di riferimento (standard, min, max)
   */
  async loadReferenceProfile(
    data: ParsedFlexibilityData,
    profileType: ProfileType,
  ): Promise<LoadResult> {
    if (profileType === ProfileType.ACTUAL) {
      throw new InvalidProfileTypeException(
        profileType,
        'loadReferenceProfile',
      );
    }

    return this.loadActualConsumption(data, {
      profileType,
      calculateFlexibility: false,
    });
  }

  /**
   * Carica set completo di profili di riferimento (standard, min, max)
   * e crea UserConsumptionProfile
   */
  async loadCompleteReferenceProfiles(
    marketId: string,
    fspUserId: string,
    standardData: ParsedFlexibilityData,
    minData: ParsedFlexibilityData,
    maxData: ParsedFlexibilityData,
  ): Promise<LoadResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // Carica i 3 profili
      const [standardResult, minResult, maxResult] = await Promise.all([
        this.loadReferenceProfile(standardData, ProfileType.REFERENCE_STANDARD),
        this.loadReferenceProfile(minData, ProfileType.REFERENCE_MIN),
        this.loadReferenceProfile(maxData, ProfileType.REFERENCE_MAX),
      ]);

      // Verifica success
      if (!standardResult.success || !minResult.success || !maxResult.success) {
        errors.push(
          ...standardResult.errors,
          ...minResult.errors,
          ...maxResult.errors,
        );
        return { success: false, errors, warnings };
      }

      // Crea UserConsumptionProfile
      await this.userProfileService.createOrUpdateProfile(fspUserId, {
        standardProfileId: standardResult.consumptionDataId!,
        minProfileId: minResult.consumptionDataId!,
        maxProfileId: maxResult.consumptionDataId!,
      });

      // Calcola flessibilità teorica
      try {
        await this.flexibilityDataService.calculateTheoreticalFlexibility(
          fspUserId,
        );
        this.logger.log(
          `Calculated theoretical flexibility for ${fspUserId}`,
        );
      } catch (flexError) {
        warnings.push(
          `Failed to calculate theoretical flexibility: ${(flexError as Error).message}`,
        );
      }

      return {
        success: true,
        errors,
        warnings: [
          ...warnings,
          ...standardResult.warnings,
          ...minResult.warnings,
          ...maxResult.warnings,
        ],
      };
    } catch (error) {
      errors.push((error as Error).message);
      return { success: false, errors, warnings };
    }
  }

  /**
   * Carica batch di dati di consumo effettivi
   */
  async loadBatch(
    dataArray: ParsedFlexibilityData[],
    options: LoadOptions = {},
  ): Promise<{
    successCount: number;
    failureCount: number;
    results: LoadResult[];
  }> {
    const results: LoadResult[] = [];
    let successCount = 0;
    let failureCount = 0;

    for (const data of dataArray) {
      const result = await this.loadActualConsumption(data, options);
      results.push(result);

      if (result.success) {
        successCount++;
      } else {
        failureCount++;
      }
    }

    this.logger.log(
      `Batch load complete: ${successCount} success, ${failureCount} failures`,
    );

    return {
      successCount,
      failureCount,
      results,
    };
  }
}
