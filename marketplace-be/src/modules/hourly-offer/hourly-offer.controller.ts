import { Controller, Post, Get, Delete, Body, Param, HttpCode, HttpStatus } from '@nestjs/common';
import { HourlyOfferService } from './hourly-offer.service';
import { CreateHourlyOfferDto, HourlyOfferResponseDto, SessionWithBidsResponseDto, PublishOfferDto } from '../../dtos/hourly-offer.dto';
import { Roles } from 'nest-keycloak-connect';
import { ApiOAuth2, ApiTags } from '@nestjs/swagger';

@ApiTags('bids')
@ApiOAuth2(['openid'], 'keycloak')
@Controller('hourly-offers')
export class HourlyOfferController {
  constructor(private readonly hourlyOfferService: HourlyOfferService) {}

  /** Creates a new hourly offer for the authenticated FSP in the specified session. */
  @Post()
  @Roles({ roles: ['realm:FSP'] })
  @HttpCode(HttpStatus.CREATED)
  async createOffer(@Body() createOfferDto: CreateHourlyOfferDto): Promise<HourlyOfferResponseDto> {
    return this.hourlyOfferService.createOffer(createOfferDto);
  }

  /** Returns all offers created by the authenticated FSP. */
  @Get('my-offers')
  @Roles({ roles: ['realm:FSP'] })
  async getMyOffers(): Promise<HourlyOfferResponseDto[]> {
    return this.hourlyOfferService.getOffersByProsumer();
  }

  /** Returns all hourly offers for the specified session. */
  @Get('session/:sessionId')
  @Roles({ roles: ['realm:FMO_LMO', 'realm:FRP', 'realm:FSP'] })
  async getOffersBySession(@Param('sessionId') sessionId: string): Promise<HourlyOfferResponseDto[]> {
    return this.hourlyOfferService.getOffersBySession(sessionId);
  }

  /** Returns a session with its bids and the authenticated FSP's active offers grouped by hour. */
  @Get('session/:sessionId/with-bids')
  @Roles({ roles: ['realm:FMO_LMO', 'realm:dso', 'realm:FSP'] })
  async getSessionWithBidsAndOffers(@Param('sessionId') sessionId: string): Promise<{
    success: boolean;
    data: SessionWithBidsResponseDto;
    message: string;
  }> {
    const data = await this.hourlyOfferService.getSessionWithBidsAndOffers(sessionId);
    return {
      success: true,
      data,
      message: 'Session with bids loaded successfully'
    };
  }

  /** Cancels a PENDING offer owned by the authenticated FSP. */
  @Delete(':offerId')
  @Roles({ roles: ['realm:FSP'] })
  @HttpCode(HttpStatus.OK)
  async cancelOffer(@Param('offerId') offerId: string): Promise<HourlyOfferResponseDto> {
    return this.hourlyOfferService.cancelOffer(offerId);
  }

  /** Publishes a PENDING offer to the blockchain using the FSP's PIN-unlocked wallet. */
  @Post(':offerId/publish')
  @Roles({ roles: ['realm:FSP'] })
  @HttpCode(HttpStatus.OK)
  async publishOffer(
    @Param('offerId') offerId: string,
    @Body() publishOfferDto: PublishOfferDto
  ): Promise<HourlyOfferResponseDto> {
    return this.hourlyOfferService.publishOfferToBlockchain(offerId, publishOfferDto.pin);
  }
}
