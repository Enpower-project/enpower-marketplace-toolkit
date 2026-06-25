import {
  Controller,
  Post,
  Body,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { Roles } from 'nest-keycloak-connect';
import { FlexibilityDataService } from '../services/flexibility-data.service';
import { ConsumptionDataService } from '../services/consumption-data.service';
import { TenantContextService } from '../../tenant/services/tenant-context.service';
import { ApiOAuth2, ApiTags } from '@nestjs/swagger';

/** DTO for batch theoretical flexibility calculation requests. */
class CalculateTheoreticalBatchDto {
  fspUserIds: string[];
  marketId: string;
}

/** Controller for batch flexibility operations. */
@ApiTags('batch')
@ApiOAuth2(['openid'], 'keycloak')
@Controller('flexibility/batch')
export class FlexibilityBatchController {
  private readonly logger = new Logger(FlexibilityBatchController.name);

  constructor(
    private readonly flexibilityDataService: FlexibilityDataService,
    private readonly consumptionDataService: ConsumptionDataService,
    private readonly tenantContext: TenantContextService,
  ) {}

  /**
   * Calculates THEORETICAL flexibility for multiple FSPs in a given market.
   * Supports both JWT user tokens (MARKETPLACE_ADMIN, FSP_ADMIN) and Keycloak service account tokens.
   *
   * @param body List of FSP user IDs and the target market ID
   * @returns Summary of successful and failed calculations
   */
  @Post('theoretical/calculate')
  @Roles({
    roles: [
      'realm:MARKETPLACE_ADMIN',
      'realm:FSP_ADMIN',
      'realm:service-account', // Service accounts
    ],
  })
  async calculateTheoreticalBatch(
    @Body() body: CalculateTheoreticalBatchDto,
  ): Promise<{
    success: string[];
    failed: Array<{ fspUserId: string; error: string }>;
    total: number;
  }> {
    const { fspUserIds, marketId } = body;

    if (!fspUserIds || fspUserIds.length === 0) {
      throw new BadRequestException('fspUserIds array is required');
    }

    if (!marketId) {
      throw new BadRequestException('marketId is required');
    }

    this.logger.log(
      `Starting batch THEORETICAL calculation for ${fspUserIds.length} FSPs in market ${marketId}`,
    );

    const success: string[] = [];
    const failed: Array<{ fspUserId: string; error: string }> = [];

    // Process each FSP with market context
    for (const fspUserId of fspUserIds) {
      try {
        await this.tenantContext.run({ marketId }, async () => {
          // 1. Verifica che l'FSP abbia i 3 profili di riferimento
          const profiles =
            await this.consumptionDataService.getReferenceProfiles(fspUserId);

          if (!profiles.standard || !profiles.min || !profiles.max) {
            throw new Error(
              `Missing reference profiles (has: ${Object.keys(profiles).filter((k) => profiles[k]).join(', ')})`,
            );
          }

          // 2. Calcola THEORETICAL flexibility
          const theoretical =
            await this.flexibilityDataService.calculateTheoreticalFlexibility(
              fspUserId,
            );

          this.logger.log(
            `✅ THEORETICAL calculated for FSP ${fspUserId}: ${theoretical._id}`,
          );
          success.push(fspUserId);
        });
      } catch (error) {
        this.logger.error(
          `❌ Failed to calculate THEORETICAL for FSP ${fspUserId}: ${error.message}`,
        );
        failed.push({
          fspUserId,
          error: error.message,
        });
      }
    }

    const summary = {
      success,
      failed,
      total: fspUserIds.length,
    };

    this.logger.log(
      `Batch calculation completed: ${success.length}/${fspUserIds.length} successful`,
    );

    return summary;
  }
}
