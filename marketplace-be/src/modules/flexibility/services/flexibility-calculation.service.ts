import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { FlexibilityDataService } from './flexibility-data.service';
import { ConsumptionDataService } from './consumption-data.service';
import { HourlyOffer, HourlyOfferDocument, OfferStatus } from '../../../schemas/HourlyOffer.schema';
import { Session, SessionDocument } from '../../../schemas/Session.schema';
import { User, UserDocument } from '../../../schemas/User.schema';

export interface FlexibilityCalculationResult {
  fspUserId: string;
  fspName: string;
  date: Date;
  success: boolean;
  error?: string;
  flexibilityDataId?: string;
}

export interface BatchCalculationSummary {
  totalFsps: number;
  successful: number;
  failed: number;
  results: FlexibilityCalculationResult[];
}

@Injectable()
export class FlexibilityCalculationService {
  private readonly logger = new Logger(FlexibilityCalculationService.name);

  constructor(
    @InjectModel(HourlyOffer.name) private hourlyOfferModel: Model<HourlyOfferDocument>,
    @InjectModel(Session.name) private sessionModel: Model<SessionDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private readonly flexibilityDataService: FlexibilityDataService,
    private readonly consumptionDataService: ConsumptionDataService,
  ) { }

  /**
   * Calculates and persists actual flexibility for a single FSP on the given date.
   * Skips calculation if a result already exists for that day.
   */
  async calculateActualFlexibilityForDate(
    fspUserId: string,
    date: Date,
  ): Promise<FlexibilityCalculationResult> {
    const normalizedDate = new Date(date);
    normalizedDate.setUTCHours(0, 0, 0, 0);

    try {
      const user = await this.userModel.findById(fspUserId).exec();
      const fspName = user ? `${user.firstName} ${user.lastName}` : fspUserId;

      const existingFlexibility = await this.flexibilityDataService.getActualFlexibility(
        fspUserId,
        normalizedDate,
      );

      if (existingFlexibility) {
        this.logger.log(
          `Actual flexibility already exists for FSP ${fspName} on ${normalizedDate.toISOString()}`,
        );
        return {
          fspUserId,
          fspName,
          date: normalizedDate,
          success: true,
          flexibilityDataId: (existingFlexibility as any)._id.toString(),
        };
      }

      const actualConsumption = await this.consumptionDataService.getActualConsumption(
        fspUserId,
        normalizedDate,
      );

      if (!actualConsumption) {
        throw new Error(`No actual consumption data found for date ${normalizedDate.toISOString()}`);
      }

      const flexibilityData = await this.flexibilityDataService.calculateActualFlexibility(
        fspUserId,
        normalizedDate,
      );

      this.logger.log(
        `✅ Successfully calculated actual flexibility for FSP ${fspName} on ${normalizedDate.toISOString()}`,
      );

      return {
        fspUserId,
        fspName,
        date: normalizedDate,
        success: true,
        flexibilityDataId: (flexibilityData as any)._id.toString(),
      };
    } catch (error: any) {
      this.logger.error(
        `❌ Failed to calculate actual flexibility for FSP ${fspUserId}: ${error.message}`,
      );

      return {
        fspUserId,
        fspName: fspUserId,
        date: normalizedDate,
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Calculates actual flexibility for all FSPs that have accepted offers on the given date.
   * Looks up sessions scheduled for that date and processes each unique FSP once.
   */
  async calculateActualFlexibilityBatch(date: Date): Promise<BatchCalculationSummary> {
    const normalizedDate = new Date(date);
    normalizedDate.setUTCHours(0, 0, 0, 0);

    this.logger.log(`Starting batch calculation of actual flexibility for ${normalizedDate.toISOString()}`);

    const sessions = await this.sessionModel.find({
      sessionDate: normalizedDate,
    }).exec();

    if (sessions.length === 0) {
      this.logger.warn(`No sessions found for date ${normalizedDate.toISOString()}`);
      return {
        totalFsps: 0,
        successful: 0,
        failed: 0,
        results: [],
      };
    }

    const sessionIds = sessions.map((s) => s._id);

    const acceptedOffers = await this.hourlyOfferModel
      .find({
        session: { $in: sessionIds },
        status: OfferStatus.ACCEPTED,
      })
      .populate('fsp')
      .exec();

    const uniqueFspIds = [...new Set(acceptedOffers.map((offer) => {
      const fsp = offer.fsp as any;
      return fsp._id.toString();
    }))];

    this.logger.log(`Found ${uniqueFspIds.length} unique FSPs with accepted offers for date ${normalizedDate.toISOString()}`);

    const results: FlexibilityCalculationResult[] = [];

    for (const fspId of uniqueFspIds) {
      const result = await this.calculateActualFlexibilityForDate(fspId, normalizedDate);
      results.push(result);
    }

    const successful = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;

    this.logger.log(`Batch calculation completed: ${successful} successful, ${failed} failed`);

    return {
      totalFsps: uniqueFspIds.length,
      successful,
      failed,
      results,
    };
  }

  /**
   * Calculates actual flexibility for all FSPs with accepted offers in the specified session.
   *
   * @param sessionAddress Blockchain contract address of the MarketSession
   */
  async calculateActualFlexibilityForSession(
    sessionAddress: string,
  ): Promise<BatchCalculationSummary> {
    this.logger.log(`Calculating actual flexibility for all offers in session ${sessionAddress}`);

    const session = await this.sessionModel.findOne({
      contractAddress: sessionAddress,
    }).exec();

    if (!session) {
      throw new Error(`Session not found: ${sessionAddress}`);
    }

    const sessionDate = new Date(session.sessionDate);
    sessionDate.setUTCHours(0, 0, 0, 0);

    const acceptedOffers = await this.hourlyOfferModel
      .find({
        session: session._id,
        status: OfferStatus.ACCEPTED,
      })
      .populate('fsp')
      .exec();

    const uniqueFspIds = [...new Set(acceptedOffers.map((offer) => {
      const fsp = offer.fsp as any;
      return fsp._id.toString();
    }))];

    this.logger.log(`Found ${uniqueFspIds.length} unique FSPs with accepted offers in session ${sessionAddress}`);

    const results: FlexibilityCalculationResult[] = [];

    for (const fspId of uniqueFspIds) {
      const result = await this.calculateActualFlexibilityForDate(fspId, sessionDate);
      results.push(result);
    }

    const successful = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;

    this.logger.log(`Session calculation completed: ${successful} successful, ${failed} failed`);

    return {
      totalFsps: uniqueFspIds.length,
      successful,
      failed,
      results,
    };
  }
}
