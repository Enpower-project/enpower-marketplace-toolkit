import { Controller, Post, Get, Body, Param, Query, HttpStatus } from '@nestjs/common';
import { MarketContractService } from './market.contract.service';
import { CreateSessionDto } from './dto/market.dto';
import { Roles } from 'nest-keycloak-connect';
import { ConfigService } from '@nestjs/config';

@Controller('blockchain/market')
export class MarketContractController {
  constructor(
    private readonly marketService: MarketContractService,
    private readonly config: ConfigService,
  ) {}

  /** Create a new market session with flexibility requests. Restricted to FMO_LMO realm role. */
  @Post(':marketAddress/sessions')
  @Roles({ roles: ['realm:FMO_LMO']})
  async createSession(
    @Param('marketAddress') marketAddress: string,
    @Body() dto: CreateSessionDto,
  ) {
    const { sessionId, sessionAddress, tx } = await this.marketService.createSession(
      marketAddress,
      dto.deliveryDay,
      this.config.get('TREASURY__ADDRESS')!,
      dto.fmoLmoAddress,
      dto.frpAddress,
      dto.requests,
    );

    const receipt = await tx.wait();

    return {
      statusCode: HttpStatus.CREATED,
      data: {
        sessionId,
        sessionAddress,
        txHash: tx.hash,
        blockNumber: receipt?.blockNumber,
      },
    };
  }

  /** Return on-chain session information for a given market and session ID. */
  @Get(':marketAddress/sessions/:sessionId')
  async getSession(
    @Param('marketAddress') marketAddress: string,
    @Param('sessionId') sessionId: string,
  ) {
    const session = await this.marketService.getSession(marketAddress, parseInt(sessionId));
    return {
      statusCode: HttpStatus.OK,
      data: session,
    };
  }

  /** Return the total number of sessions created in the given market. */
  @Get(':marketAddress/sessions/count')
  async getSessionCount(@Param('marketAddress') marketAddress: string) {
    const count = await this.marketService.getSessionCount(marketAddress);
    return {
      statusCode: HttpStatus.OK,
      data: { count },
    };
  }

  /** Return community ID, region, and active status for the given market contract. */
  @Get(':marketAddress/info')
  async getMarketInfo(@Param('marketAddress') marketAddress: string) {
    const communityId = await this.marketService.getCommunityId(marketAddress);
    const region = await this.marketService.getRegion(marketAddress);
    const isActive = await this.marketService.isActive(marketAddress);

    return {
      statusCode: HttpStatus.OK,
      data: {
        communityId,
        region,
        isActive,
      },
    };
  }

  /** Set the ParticipantRegistry contract address on the given market contract. */
  @Post(':marketAddress/participant-registry')
  async setParticipantRegistry(
    @Param('marketAddress') marketAddress: string,
    @Body('registryAddress') registryAddress: string,
  ) {
    const tx = await this.marketService.setParticipantRegistry(marketAddress, registryAddress);
    const receipt = await tx.wait();

    return {
      statusCode: HttpStatus.OK,
      data: {
        txHash: tx.hash,
        blockNumber: receipt?.blockNumber,
      },
    };
  }
}
