import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { TenantAwareBaseService } from '../../tenant/services/TenantAwareBaseService';
import { TenantContextService } from '../../tenant/services/tenant-context.service';
import { FlexibilityData, FlexibilityDataDocument } from '../schemas/flexibility-data.schema';
import { ConsumptionDataService } from './consumption-data.service';
import {
  FlexibilityType,
  MeasurementType,
  ProfileType,
} from '../schemas/interfaces';
import {
  ReferenceProfilesIncompleteException,
  MissingMeasurementException,
  ConsumptionDataNotFoundException,
  ReferenceProfileNotFoundException,
  InvalidFlexibilityValuesException,
} from '../exceptions/flexibility.exception';
import { UserService } from 'src/modules/user/user.service';
import { ConsumptionDataDocument } from '../schemas/consumption-data.schema';

@Injectable()
export class FlexibilityDataService extends TenantAwareBaseService<FlexibilityDataDocument> {
  constructor(
    @InjectModel(FlexibilityData.name) model: Model<FlexibilityDataDocument>,
    tenantContext: TenantContextService,
    private readonly consumptionDataService: ConsumptionDataService,
    private readonly userService: UserService,
  ) {
    super(model, tenantContext);
  }

  /** Returns the theoretical flexibility record for the given FSP, or null if not yet calculated. */
  async getTheoreticalFlexibility(
    fspUserId: string,
  ): Promise<FlexibilityDataDocument | null> {
    return this.findOne({
      fspUserId,
      flexibilityType: FlexibilityType.THEORETICAL,
      date: null,
    });
  }

  /** Returns the theoretical flexibility record for the currently authenticated FSP. */
  async getMyTheoreticalFlexibility(): Promise<FlexibilityDataDocument | null> {
    const userKeycloadId = this.tenantContext.getCurrentUserId() ?? "";
    const userId = (await this.userService.getUserByKeycloakId(userKeycloadId)).id
    if (!userId) {
      throw new Error('User context is required');
    }
    return this.getTheoreticalFlexibility(userId);
  } 

  /** Returns the actual flexibility record for the given FSP on a specific date, or null if absent. */
  async getActualFlexibility(
    fspUserId: string,
    date: Date,
  ): Promise<FlexibilityDataDocument | null> {
    return this.findOne({
      fspUserId,
      flexibilityType: FlexibilityType.ACTUAL,
      date,
    });
  }

  /** Returns the actual flexibility record for the given date for the currently authenticated FSP. */
  async getMyActualFlexibility(date: Date): Promise<FlexibilityDataDocument | null> {
    const userKeycloakId = this.tenantContext.getCurrentUserId() ?? "";
    const userId = (await this.userService.getUserByKeycloakId(userKeycloakId)).id
    if (!userId) {
      throw new Error('User context is required');
    }
    return this.getActualFlexibility(userId, date);
  }

  /**
   * Derives and persists theoretical flexibility from the FSP's three reference consumption profiles.
   * Replaces any previously stored theoretical flexibility record.
   *
   * @throws {ReferenceProfilesIncompleteException} if any reference profile is missing
   */
  async calculateTheoreticalFlexibility(
    fspUserId: string,
  ): Promise<FlexibilityDataDocument> {
    // Verifica che esistano tutti i profili di riferimento
    const hasProfiles =
      await this.consumptionDataService.hasCompleteReferenceProfiles(
        fspUserId,
      );
    if (!hasProfiles) {
      throw new ReferenceProfilesIncompleteException(fspUserId);
    }

    const profiles =
      await this.consumptionDataService.getReferenceProfiles(fspUserId);

    // Auto-detect del periodo desde los perfiles almacenados (15 min Irish, 30 min Greek)
    const period = this.consumptionDataService.detectPeriod(profiles.standard!);

    const standardValues = this.consumptionDataService.getMeasurement(
      profiles.standard!,
      MeasurementType.CONSUMPTION,
      period,
    );
    const minValues = this.consumptionDataService.getMeasurement(
      profiles.min!,
      MeasurementType.CONSUMPTION,
      period,
    );
    const maxValues = this.consumptionDataService.getMeasurement(
      profiles.max!,
      MeasurementType.CONSUMPTION,
      period,
    );

    if (!standardValues || !minValues || !maxValues) {
      throw new MissingMeasurementException(
        MeasurementType.CONSUMPTION,
        period,
        'reference profiles',
      );
    }

    // Calcola downward e upward flexibility al periodo nativo
    const downward = standardValues.map((s, i) => s - minValues[i]);
    const upward = maxValues.map((m, i) => m - standardValues[i]);

    // Verifica validità (non devono essere negativi)
    this.validateFlexibilityValues(downward, `downward ${period}min`);
    this.validateFlexibilityValues(upward, `upward ${period}min`);

    // Aggrega a 60min usando il numero corretto di slot per ora
    const downward60 =
      this.consumptionDataService.aggregateToHourlyFromPeriod(downward, period);
    const upward60 =
      this.consumptionDataService.aggregateToHourlyFromPeriod(upward, period);

    // Invalida flessibilità teorica precedente se esiste
    const existing = await this.getTheoreticalFlexibility(fspUserId);
    if (existing) {
      await this.delete(String((existing as any)._id));
      this.logger.debug(
        `Deleted previous theoretical flexibility for user ${fspUserId}`,
      );
    }

    // Crea nuova flessibilità teorica con il periodo rilevato automaticamente
    const flexibilityData = await this.create({
      fspUserId,
      date: null,
      flexibilityType: FlexibilityType.THEORETICAL,
      measurements: [
        {
          periodInMinutes: period,
          unit: 'W',
          type: MeasurementType.FLEXIBILITY_DOWNWARD,
          values: downward,
        },
        {
          periodInMinutes: period,
          unit: 'W',
          type: MeasurementType.FLEXIBILITY_UPWARD,
          values: upward,
        },
        {
          periodInMinutes: 60,
          unit: 'Wh',
          type: MeasurementType.FLEXIBILITY_DOWNWARD,
          values: downward60,
        },
        {
          periodInMinutes: 60,
          unit: 'Wh',
          type: MeasurementType.FLEXIBILITY_UPWARD,
          values: upward60,
        },
      ],
      calculatedAt: new Date(),
    });

    this.logger.debug(
      `Calculated theoretical flexibility for user ${fspUserId}`,
    );
    this.logger.debug(`Theoretical Flexibility ID: ${(flexibilityData as any)._id}`);
    return flexibilityData;
  }

  /**
   * Calculates and persists actual (daily) flexibility by comparing measured consumption
   * against the FSP's standard reference profile.
   *
   * @throws {ConsumptionDataNotFoundException} if actual consumption data is unavailable
   * @throws {ReferenceProfileNotFoundException} if the standard reference profile is missing
   */
  async calculateActualFlexibility(
    fspUserId: string,
    date: Date,
  ): Promise<FlexibilityDataDocument> {
    // Recupera consumo effettivo del giorno
    const actualConsumption =
      await this.consumptionDataService.getActualConsumption(fspUserId, date);
    if (!actualConsumption) {
      throw new ConsumptionDataNotFoundException(fspUserId, date);
    }

    // Recupera profilo standard
    const standardProfile =
      await this.consumptionDataService.getReferenceProfile(
        fspUserId,
        ProfileType.REFERENCE_STANDARD,
      );
    if (!standardProfile) {
      throw new ReferenceProfileNotFoundException(
        fspUserId,
        ProfileType.REFERENCE_STANDARD,
      );
    }

    // Use pre-stored 60-min values for comparison, matching settlement.service.ts exactly.
    // Prefer NET_LOAD_WITHOUT_FLEX over CONSUMPTION — same priority as settlement.service.ts.
    const preferredTypes = [MeasurementType.NET_LOAD_WITHOUT_FLEX, MeasurementType.CONSUMPTION];

    const getHourly = (doc: ConsumptionDataDocument): number[] | null => {
      for (const t of preferredTypes) {
        const vals = this.consumptionDataService.getMeasurement(doc, t, 60);
        if (vals?.length === 24) return vals;
      }
      // Fallback: aggregate from native period if 60-min not pre-stored
      const period = this.consumptionDataService.detectPeriod(doc);
      for (const t of preferredTypes) {
        const vals = this.consumptionDataService.getMeasurement(doc, t, period);
        if (vals) return this.consumptionDataService.aggregateToHourlyFromPeriod(vals, period);
      }
      return null;
    };

    // Computes sub-hourly flexibility at finest available resolution.
    // If actual is 15-min and std is 30-min, upsamples std by repeating each value twice.
    const getSubHourlyFlexibility = (): { downward: number[]; upward: number[]; period: number } | null => {
      let actualValues: number[] | null = null;
      let actualPeriod = 0;
      for (const t of preferredTypes) {
        for (const [p, len] of [[15, 96], [30, 48]] as [number, number][]) {
          const vals = this.consumptionDataService.getMeasurement(actualConsumption, t, p);
          if (vals?.length === len) { actualValues = vals; actualPeriod = p; break; }
        }
        if (actualValues) break;
      }
      if (!actualValues) return null;

      let stdValues: number[] | null = null;
      for (const t of preferredTypes) {
        const exact = this.consumptionDataService.getMeasurement(standardProfile, t, actualPeriod);
        if (exact?.length === (60 / actualPeriod) * 24) { stdValues = exact; break; }
        if (actualPeriod === 15) {
          const vals30 = this.consumptionDataService.getMeasurement(standardProfile, t, 30);
          if (vals30?.length === 48) {
            stdValues = [];
            for (const v of vals30) { stdValues.push(v, v); }
            break;
          }
        }
      }
      if (!stdValues) return null;

      return {
        downward: stdValues.map((s, i) => Math.max(0, s - actualValues![i])),
        upward: actualValues.map((a, i) => Math.max(0, a - stdValues![i])),
        period: actualPeriod,
      };
    };

    const std60 = getHourly(standardProfile);
    const actual60 = getHourly(actualConsumption);

    if (!std60 || !actual60) {
      throw new MissingMeasurementException(
        MeasurementType.CONSUMPTION,
        60,
        'actual or standard consumption data',
      );
    }

    // Compute deviation at hourly level — identical approach to settlement.service.ts
    const downward60 = std60.map((s, i) => Math.max(0, s - actual60[i]));
    const upward60 = actual60.map((a, i) => Math.max(0, a - std60[i]));

    const totalDownwardWh = downward60.reduce((sum, val) => sum + val, 0);
    const totalUpwardWh = upward60.reduce((sum, val) => sum + val, 0);
    const maxFlexHour = this.findPeakFlexibilityHour(downward60, upward60);
    const complianceStatus = 'OK';

    // Compute native-period flexibility for granular visualization (max(0) applied per slot).
    const subHourly = getSubHourlyFlexibility();
    const nativeMeasurements: Array<{
      periodInMinutes: number; unit: string; type: MeasurementType; values: number[];
    }> = subHourly ? [
      { periodInMinutes: subHourly.period, unit: 'W', type: MeasurementType.FLEXIBILITY_DOWNWARD, values: subHourly.downward },
      { periodInMinutes: subHourly.period, unit: 'W', type: MeasurementType.FLEXIBILITY_UPWARD, values: subHourly.upward },
    ] : [];

    // Remove any pre-existing ACTUAL record for this FSP/date to avoid duplicates
    const existing = await this.findOne({ fspUserId, date, flexibilityType: FlexibilityType.ACTUAL });
    if (existing) {
      await this.delete(String((existing as any)._id));
    }

    // Salva flessibilità effettiva
    const flexibilityData = await this.create({
      fspUserId,
      date,
      flexibilityType: FlexibilityType.ACTUAL,
      measurements: [
        ...nativeMeasurements,
        {
          periodInMinutes: 60,
          unit: 'Wh',
          type: MeasurementType.FLEXIBILITY_DOWNWARD,
          values: downward60,
        },
        {
          periodInMinutes: 60,
          unit: 'Wh',
          type: MeasurementType.FLEXIBILITY_UPWARD,
          values: upward60,
        },
      ],
      summary: {
        totalDownwardWh,
        totalUpwardWh,
        complianceStatus,
        peakFlexibilityHour: maxFlexHour,
      },
      calculatedAt: new Date(),
    });

    this.logger.debug(
      `Calculated actual flexibility for user ${fspUserId} on ${date}`,
    );
    return flexibilityData;
  }

  /**
   * Valida che i valori di flessibilità non siano negativi
   */
  private validateFlexibilityValues(values: number[], label: string): void {
    const hasNegative = values.some((v) => v < 0);
    if (hasNegative) {
      throw new InvalidFlexibilityValuesException(label, 'found negative values');
    }
  }

  /**
   * Trova l'ora con maggiore flessibilità totale
   */
  private findPeakFlexibilityHour(
    downward: number[],
    upward: number[],
  ): number {
    let maxHour = 0;
    let maxFlex = 0;

    for (let h = 0; h < 24; h++) {
      const totalFlex = downward[h] + upward[h];
      if (totalFlex > maxFlex) {
        maxFlex = totalFlex;
        maxHour = h;
      }
    }

    return maxHour;
  }

  /** Returns actual flexibility records for a FSP within the specified date range (inclusive). */
  async getActualFlexibilityRange(
    fspUserId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<FlexibilityDataDocument[]> {
    return this.find({
      fspUserId,
      flexibilityType: FlexibilityType.ACTUAL,
      date: { $gte: startDate, $lte: endDate },
    });
  }
}
