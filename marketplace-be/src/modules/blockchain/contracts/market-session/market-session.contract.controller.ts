import { Controller, Post, Get, Body, Param, ParseIntPipe, HttpStatus } from '@nestjs/common';
import { MarketSessionContractService } from './market-session.contract.service';
import { CreateOfferDto, SubmitSettlementDto } from './dto/market-session.dto';

@Controller('blockchain/market-session')
export class MarketSessionContractController {
  constructor(private readonly sessionService: MarketSessionContractService) {}

  // Configuration endpoints
  /** Set the FlexibilityNFT contract address on the given session contract. */
  @Post(':sessionAddress/config/nft-contract')
  async setNFTContract(
    @Param('sessionAddress') sessionAddress: string,
    @Body('nftAddress') nftAddress: string,
  ) {
    const tx = await this.sessionService.setNFTContract(sessionAddress, nftAddress);
    const receipt = await tx.wait();
    return {
      statusCode: HttpStatus.OK,
      data: { txHash: tx.hash, blockNumber: receipt?.blockNumber },
    };
  }

  /** Set the ParticipantRegistry contract address on the given session contract. */
  @Post(':sessionAddress/config/participant-registry')
  async setParticipantRegistry(
    @Param('sessionAddress') sessionAddress: string,
    @Body('registryAddress') registryAddress: string,
  ) {
    const tx = await this.sessionService.setParticipantRegistry(sessionAddress, registryAddress);
    const receipt = await tx.wait();
    return {
      statusCode: HttpStatus.OK,
      data: { txHash: tx.hash, blockNumber: receipt?.blockNumber },
    };
  }

  // Session lifecycle endpoints
  /** Open the offers period on the given market session. */
  @Post(':sessionAddress/offers/open')
  async openOffers(@Param('sessionAddress') sessionAddress: string) {
    const tx = await this.sessionService.openOffers(sessionAddress);
    const receipt = await tx.wait();
    return {
      statusCode: HttpStatus.OK,
      data: { txHash: tx.hash, blockNumber: receipt?.blockNumber },
    };
  }

  /** Close the offers period on the given market session. */
  @Post(':sessionAddress/offers/close')
  async closeOffers(@Param('sessionAddress') sessionAddress: string) {
    const tx = await this.sessionService.closeOffers(sessionAddress);
    const receipt = await tx.wait();
    return {
      statusCode: HttpStatus.OK,
      data: { txHash: tx.hash, blockNumber: receipt?.blockNumber },
    };
  }

  /** Create a new flexibility offer within the given session. */
  @Post(':sessionAddress/offers')
  async createOffer(
    @Param('sessionAddress') sessionAddress: string,
    @Body() dto: CreateOfferDto,
  ) {
    const { offerId, tx } = await this.sessionService.createOffer(
      sessionAddress,
      dto.hourSlot,
      dto.quantity,
    );
    const receipt = await tx.wait();

    return {
      statusCode: HttpStatus.CREATED,
      data: {
        offerId,
        txHash: tx.hash,
        blockNumber: receipt?.blockNumber,
      },
    };
  }

  /** Return the total number of offers submitted in the given session. */
  @Get(':sessionAddress/offers/count')
  async getOfferCount(@Param('sessionAddress') sessionAddress: string) {
    const count = await this.sessionService.getOfferCount(sessionAddress);
    return {
      statusCode: HttpStatus.OK,
      data: { count },
    };
  }

  /** Return on-chain offer information for a specific offer within a session. */
  @Get(':sessionAddress/offers/:offerId')
  async getOffer(
    @Param('sessionAddress') sessionAddress: string,
    @Param('offerId', ParseIntPipe) offerId: number,
  ) {
    const offer = await this.sessionService.getOffer(sessionAddress, offerId);
    return {
      statusCode: HttpStatus.OK,
      data: offer,
    };
  }

  // Flexibility requests
  /** Return the flexibility request details for a given hour slot in a session. */
  @Get(':sessionAddress/requests/:hourSlot')
  async getFlexibilityRequest(
    @Param('sessionAddress') sessionAddress: string,
    @Param('hourSlot', ParseIntPipe) hourSlot: number,
  ) {
    const request = await this.sessionService.getFlexibilityRequest(sessionAddress, hourSlot);
    return {
      statusCode: HttpStatus.OK,
      data: request,
    };
  }

  /** Return the remaining unfilled quantity for a flexibility request in a given hour slot. */
  @Get(':sessionAddress/requests/:hourSlot/remaining')
  async getRemainingQuantity(
    @Param('sessionAddress') sessionAddress: string,
    @Param('hourSlot', ParseIntPipe) hourSlot: number,
  ) {
    const remaining = await this.sessionService.getRemainingQuantity(sessionAddress, hourSlot);
    return {
      statusCode: HttpStatus.OK,
      data: { remaining },
    };
  }

  // Settlement endpoints
  /** Submit the measurement data hash (Oracle role) to the session contract. */
  @Post(':sessionAddress/measurement-data')
  async submitMeasurementData(
    @Param('sessionAddress') sessionAddress: string,
    @Body('measurementHash') measurementHash: string,
  ) {
    const tx = await this.sessionService.submitMeasurementData(sessionAddress, measurementHash);
    const receipt = await tx.wait();
    return {
      statusCode: HttpStatus.OK,
      data: { txHash: tx.hash, blockNumber: receipt?.blockNumber },
    };
  }

  /** Submit settlement data for an offer (Oracle role). */
  @Post(':sessionAddress/settlements')
  async submitSettlement(
    @Param('sessionAddress') sessionAddress: string,
    @Body() dto: SubmitSettlementDto,
  ) {
    const tx = await this.sessionService.submitSettlement(
      sessionAddress,
      dto.offerId,
      dto.deliveredQuantity,
      dto.penaltyAmount,
      dto.meterReadingsHash,
    );
    const receipt = await tx.wait();
    return {
      statusCode: HttpStatus.OK,
      data: { txHash: tx.hash, blockNumber: receipt?.blockNumber },
    };
  }

  /** Execute the settlement for a specific offer (Oracle role), triggering token transfers. */
  @Post(':sessionAddress/settlements/:offerId/execute')
  async executeSettlement(
    @Param('sessionAddress') sessionAddress: string,
    @Param('offerId', ParseIntPipe) offerId: number,
  ) {
    const tx = await this.sessionService.executeSettlement(sessionAddress, offerId);
    const receipt = await tx.wait();
    return {
      statusCode: HttpStatus.OK,
      data: { txHash: tx.hash, blockNumber: receipt?.blockNumber },
    };
  }

  /** Return on-chain settlement data for a specific offer in a session. */
  @Get(':sessionAddress/settlements/:offerId')
  async getSettlement(
    @Param('sessionAddress') sessionAddress: string,
    @Param('offerId', ParseIntPipe) offerId: number,
  ) {
    const settlement = await this.sessionService.getSettlement(sessionAddress, offerId);
    return {
      statusCode: HttpStatus.OK,
      data: settlement,
    };
  }

  /** Finalize the session, completing all remaining lifecycle state transitions. */
  @Post(':sessionAddress/finalize')
  async finalizeSession(@Param('sessionAddress') sessionAddress: string) {
    const tx = await this.sessionService.finalizeSession(sessionAddress);
    const receipt = await tx.wait();
    return {
      statusCode: HttpStatus.OK,
      data: { txHash: tx.hash, blockNumber: receipt?.blockNumber },
    };
  }

  /** Return the total platform fees accumulated in the given session. */
  @Get(':sessionAddress/platform-fees')
  async getTotalPlatformFees(@Param('sessionAddress') sessionAddress: string) {
    const fees = await this.sessionService.getTotalPlatformFees(sessionAddress);
    return {
      statusCode: HttpStatus.OK,
      data: { fees },
    };
  }

  // Role management
  /** Grant the FSP role to an address on the given session contract. */
  @Post(':sessionAddress/roles/fsp/grant')
  async grantFSPRole(
    @Param('sessionAddress') sessionAddress: string,
    @Body('fspAddress') fspAddress: string,
  ) {
    const tx = await this.sessionService.grantFSPRole(sessionAddress, fspAddress);
    const receipt = await tx.wait();
    return {
      statusCode: HttpStatus.OK,
      data: { txHash: tx.hash, blockNumber: receipt?.blockNumber },
    };
  }

  /** Grant the Oracle role to an address on the given session contract. */
  @Post(':sessionAddress/roles/oracle/grant')
  async grantOracleRole(
    @Param('sessionAddress') sessionAddress: string,
    @Body('oracleAddress') oracleAddress: string,
  ) {
    const tx = await this.sessionService.grantOracleRole(sessionAddress, oracleAddress);
    const receipt = await tx.wait();
    return {
      statusCode: HttpStatus.OK,
      data: { txHash: tx.hash, blockNumber: receipt?.blockNumber },
    };
  }
}
