import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  NotFoundException,
  BadRequestException,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { FlexibilityDataService } from '../services/flexibility-data.service';
import { FlexibilityCalculationService } from '../services/flexibility-calculation.service';
import { Roles } from 'nest-keycloak-connect';
import {
  CalculateActualFlexibilityBatchDto,
  CalculateActualFlexibilitySingleDto,
} from '../dto/calculate-flexibility.dto';
import { ApiOAuth2, ApiTags } from '@nestjs/swagger';

@ApiTags('flexibility-data')
@ApiOAuth2(['openid'], 'keycloak')
@Controller('api/flexibility/flexibility-data')
export class FlexibilityDataController {
  constructor(
    private readonly flexibilityDataService: FlexibilityDataService,
    private readonly flexibilityCalculationService: FlexibilityCalculationService,
  ) { }

  /**
   * Calcola flessibilità teorica per FSP
   */
  @Post('theoretical/:fspUserId/calculate')
  @Roles({ roles: ['realm:MARKETPLACE_ADMIN', 'realm:FSP', 'realm:FMO_LMO'] })
  async calculateTheoretical(@Param('fspUserId') fspUserId: string) {
    return this.flexibilityDataService.calculateTheoreticalFlexibility(
      fspUserId,
    );
  }

  /**
   * Recupera flessibilità teorica per FSP
   */
  @Get('theoretical/:fspUserId')
  @Roles({ roles: ['realm:MARKETPLACE_ADMIN', 'realm:FSP', 'realm:FMO_LMO'] })
  async getTheoretical(@Param('fspUserId') fspUserId: string) {
    const flexibility =
      await this.flexibilityDataService.getTheoreticalFlexibility(fspUserId);

    if (!flexibility) {
      throw new NotFoundException(
        `No theoretical flexibility found for user ${fspUserId}`,
      );
    }

    return flexibility;
  }

  /**
   * Calcola flessibilità effettiva per FSP e data
   */
  @Post('actual/:fspUserId/:date/calculate')
  @Roles({ roles: ['realm:MARKETPLACE_ADMIN', 'realm:FSP'] })
  async calculateActual(
    @Param('fspUserId') fspUserId: string,
    @Param('date') dateStr: string,
  ) {
    const date = new Date(dateStr);
    return this.flexibilityDataService.calculateActualFlexibility(
      fspUserId,
      date,
    );
  }

  /**
   * Recupera flessibilità effettiva per FSP e data
   */
  @Get('actual/:fspUserId/:date')
  @Roles({ roles: ['realm:MARKETPLACE_ADMIN', 'realm:FSP'] })
  async getActual(
    @Param('fspUserId') fspUserId: string,
    @Param('date') dateStr: string,
  ) {
    const date = new Date(dateStr);
    const flexibility =
      await this.flexibilityDataService.getActualFlexibility(fspUserId, date);

    if (!flexibility) {
      throw new NotFoundException(
        `No actual flexibility found for user ${fspUserId} on ${dateStr}`,
      );
    }

    return flexibility;
  }

  /**
   * Recupera flessibilità effettiva per range di date
   */
  @Get('actual/:fspUserId')
  @Roles({ roles: ['realm:MARKETPLACE_ADMIN', 'realm:FSP'] })
  async getActualRange(
    @Param('fspUserId') fspUserId: string,
    @Query('startDate') startDateStr: string,
    @Query('endDate') endDateStr: string,
  ) {
    if (!startDateStr || !endDateStr) {
      throw new NotFoundException('startDate and endDate query params required');
    }

    const startDate = new Date(startDateStr);
    const endDate = new Date(endDateStr);

    return this.flexibilityDataService.getActualFlexibilityRange(
      fspUserId,
      startDate,
      endDate,
    );
  }

  /**
   * Recupera flessibilità per ID
   */
  @Get(':id')
  @Roles({ roles: ['realm:MARKETPLACE_ADMIN', 'realm:FSP'] })
  async findById(@Param('id') id: string) {
    const data = await this.flexibilityDataService.findById(id);
    if (!data) {
      throw new NotFoundException(`Flexibility data with id ${id} not found`);
    }
    return data;
  }

  /**
   * Recupera la flessibilità teorica dell'utente corrente
   */
  @Get('me/theoretical')
  @Roles({ roles: ['realm:FSP'] })
  async getMyTheoreticalFlexibility() {

    const flexibility = await this.flexibilityDataService.getMyTheoreticalFlexibility();

    if (!flexibility) {
      throw new NotFoundException('No theoretical flexibility found');
    }

    return flexibility;
  }

  /**
   * Recupera la flessibilità effettiva dell'utente corrente per una data
   */
  @Get('me/actual/:date')
  @Roles({ roles: ['realm:FSP'] })
  async getMyActualFlexibility(@Param('date') dateStr: string) {

    const date = new Date(dateStr);
    const flexibility = await this.flexibilityDataService.getMyActualFlexibility(
      date,
    );

    if (!flexibility) {
      throw new NotFoundException(
        `No actual flexibility found for date ${dateStr}`,
      );
    }

    return flexibility;
  }

  @Post('calculate-actual-batch')
  @Roles({ roles: ['realm:MARKETPLACE_ADMIN', 'realm:FMO'] })
  @HttpCode(HttpStatus.OK)
  async calculateActualFlexibilityBatch(
    @Body() dto: CalculateActualFlexibilityBatchDto,
  ) {
    const date = new Date(dto.date);
    if (isNaN(date.getTime())) {
      throw new BadRequestException('Invalid date format');
    }

    const result = await this.flexibilityCalculationService.calculateActualFlexibilityBatch(date);

    return {
      statusCode: HttpStatus.OK,
      message: `Batch calculation completed: ${result.successful} successful, ${result.failed} failed`,
      data: result,
    };
  }

  @Post('calculate-actual-session/:sessionAddress')
  @Roles({ roles: ['realm:MARKETPLACE_ADMIN', 'realm:FMO_LMO'] })
  @HttpCode(HttpStatus.OK)
  async calculateActualFlexibilityForSession(
    @Param('sessionAddress') sessionAddress: string,
  ) {
    const result = await this.flexibilityCalculationService.calculateActualFlexibilityForSession(
      sessionAddress,
    );

    return {
      statusCode: HttpStatus.OK,
      message: `Session calculation completed: ${result.successful} successful, ${result.failed} failed`,
      data: {
        successful: result.successful,
        totalFsps: result.totalFsps,
        failed: result.failed,
        results: result.results,
        failedCalculations: result.failed,
        successfulCalculations: result.successful,
      },
    };
  }

  @Post('calculate-actual-single')
  @Roles({ roles: ['realm:MARKETPLACE_ADMIN', 'realm:FMO', 'realm:FSP'] })
  @HttpCode(HttpStatus.OK)
  async calculateActualFlexibilitySingle(
    @Body() dto: CalculateActualFlexibilitySingleDto,
  ) {
    const date = new Date(dto.date);
    if (isNaN(date.getTime())) {
      throw new BadRequestException('Invalid date format');
    }

    const result = await this.flexibilityCalculationService.calculateActualFlexibilityForDate(
      dto.fspUserId,
      date,
    );

    if (!result.success) {
      throw new BadRequestException(result.error);
    }

    return {
      statusCode: HttpStatus.OK,
      message: 'Actual flexibility calculated successfully',
      data: result,
    };
  }
}
