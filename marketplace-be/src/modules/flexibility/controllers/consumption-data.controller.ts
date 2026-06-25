import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ConsumptionDataService } from '../services/consumption-data.service';
import { CreateConsumptionDataDto } from '../dto/create-consumption-data.dto';
import { QueryConsumptionDto } from '../dto/query-consumption.dto';
import { Roles } from 'nest-keycloak-connect';
import { ProfileType } from '../schemas/interfaces';
import { UserService } from '../../user/user.service';
import { TenantContextService } from '../../tenant/services/tenant-context.service';
import { ApiOAuth2, ApiTags } from '@nestjs/swagger';

@ApiTags('consumption-data')
@ApiOAuth2(['openid'], 'keycloak')
@Controller('api/flexibility/consumption-data')
export class ConsumptionDataController {
  constructor(
    private readonly consumptionDataService: ConsumptionDataService,
    private readonly userService: UserService,
    private readonly tenantContext: TenantContextService,
  ) {}

  /**
   * Crea nuovi dati di consumo (effettivi o profilo di riferimento)
   */
  @Post()
  @Roles({ roles: ['realm:MARKETPLACE_ADMIN', 'realm:FSP'] })
  async create(@Body() createDto: CreateConsumptionDataDto) {
    const date = createDto.date ? new Date(createDto.date) : null;
    const validFrom = createDto.validFrom
      ? new Date(createDto.validFrom)
      : undefined;
    const validTo = createDto.validTo ? new Date(createDto.validTo) : undefined;

    return this.consumptionDataService.create({
      ...createDto,
      date,
      validFrom,
      validTo,
    });
  }

  /**
   * Recupera dati di consumo con filtri
   */
  @Get()
  @Roles({ roles: ['realm:MARKETPLACE_ADMIN', 'realm:FSP'] })
  async find(@Query() query: QueryConsumptionDto) {
    const filter: any = {};

    if (query.fspUserId) {
      filter.fspUserId = query.fspUserId;
    }

    if (query.profileType) {
      filter.profileType = query.profileType;
    }

    if (query.date) {
      filter.date = new Date(query.date);
    } else if (query.startDate && query.endDate) {
      filter.date = {
        $gte: new Date(query.startDate),
        $lte: new Date(query.endDate),
      };
    }

    return this.consumptionDataService.find(filter);
  }

  /**
   * Recupera consumo effettivo per FSP e data
   */
  @Get('actual/:fspUserId/:date')
  @Roles({ roles: ['realm:MARKETPLACE_ADMIN', 'realm:FSP'] })
  async getActual(
    @Param('fspUserId') fspUserId: string,
    @Param('date') dateStr: string,
  ) {
    const date = new Date(dateStr);
    const consumption =
      await this.consumptionDataService.getActualConsumption(fspUserId, date);

    if (!consumption) {
      throw new NotFoundException(
        `No actual consumption found for user ${fspUserId} on ${dateStr}`,
      );
    }

    return consumption;
  }

  /**
   * Recupera profilo di riferimento per FSP
   */
  @Get('reference/:fspUserId/:profileType')
  @Roles({ roles: ['realm:MARKETPLACE_ADMIN', 'realm:FSP', 'realm:FMO_LMO'] })
  async getReference(
    @Param('fspUserId') fspUserId: string,
    @Param('profileType') profileType: ProfileType,
  ) {
    const profile = await this.consumptionDataService.getReferenceProfile(
      fspUserId,
      profileType,
    );

    if (!profile) {
      throw new NotFoundException(
        `No ${profileType} profile found for user ${fspUserId}`,
      );
    }

    return profile;
  }

  /**
   * Recupera tutti i profili di riferimento (standard, min, max)
   */
  @Get('reference/:fspUserId')
  @Roles({ roles: ['realm:MARKETPLACE_ADMIN', 'realm:FSP'] })
  async getAllReferenceProfiles(@Param('fspUserId') fspUserId: string) {
    return this.consumptionDataService.getReferenceProfiles(fspUserId);
  }

  /**
   * Recupera dati per ID
   */
  @Get(':id')
  @Roles({ roles: ['realm:MARKETPLACE_ADMIN', 'realm:FSP'] })
  async findById(@Param('id') id: string) {
    const data = await this.consumptionDataService.findById(id);
    if (!data) {
      throw new NotFoundException(`Consumption data with id ${id} not found`);
    }
    return data;
  }

  /**
   * Recupera i profili di riferimento dell'utente corrente
   */
  @Get('me/reference')
  @Roles({ roles: ['realm:FSP'] })
  async getMyReferenceProfiles() {
    return this.consumptionDataService.getMyReferenceProfiles();
  }

  /**
   * Recupera il consumo effettivo dell'utente corrente per una data
   */
  @Get('me/actual/:date')
  @Roles({ roles: ['realm:FSP'] })
  async getMyActualConsumption(@Param('date') dateStr: string) {

    const date = new Date(dateStr);
    const consumption = await this.consumptionDataService.getMyActualConsumption(
      date,
    );

    if (!consumption) {
      throw new NotFoundException(
        `No actual consumption found for date ${dateStr}`,
      );
    }

    return consumption;
  }

  /**
   * Recupera il consumo offerto per un certo giorno dell'utente con id fspUserId per una data
   */
  @Get('offered/:fspUserId/:date')
  @Roles({ roles: ['realm:MARKETPLACE_ADMIN','realm:FSP','realm:FMO_LMO'] })
  async getOfferedConsumption(
    @Param('fspUserId') fspUserId: string,
    @Param('date') dateStr: string,
  ) {

    const date = new Date(dateStr);
    const consumption = await this.consumptionDataService.getOfferedConsumption(
      fspUserId,
      date,
    );

    if (!consumption) {
      throw new NotFoundException(
        `No offered consumption found for user ${fspUserId} on date ${dateStr}`,
      );
    }

    return consumption;
  }

  @Get('offered/:fspUserId/:date/csv')
  @Roles({ roles: ['realm:MARKETPLACE_ADMIN','realm:FSP','realm:FMO_LMO'] })
  async getOfferedConsumptionCSV(
    @Param('fspUserId') fspUserId: string,
    @Param('date') dateStr: string,
    @Param('period') period: number,
  ) {
    period=!period && period != 60 && period != 15 ? 15 : period;
    const date = new Date(dateStr);
    const csv = await this.consumptionDataService.getOfferedConsumptionCsv(
      fspUserId,
      date,
      period
    );
    return csv;
  }
}
