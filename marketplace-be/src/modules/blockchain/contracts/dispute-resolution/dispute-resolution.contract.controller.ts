import { Controller, Post, Get, Body, Param, ParseIntPipe, HttpStatus } from '@nestjs/common';
import { DisputeResolutionContractService } from './dispute-resolution.contract.service';
import { OpenDisputeDto, GrantRoleDto } from './dto/dispute-resolution.dto';

@Controller('blockchain/dispute-resolution')
export class DisputeResolutionContractController {
  constructor(private readonly disputeService: DisputeResolutionContractService) {}

  /** Check whether the DisputeResolution contract is available (deployed and configured). */
  @Get('available')
  async checkAvailability() {
    const isAvailable = this.disputeService.isAvailable();
    return {
      statusCode: HttpStatus.OK,
      data: { isAvailable },
    };
  }

  /** Open a new on-chain dispute for a session offer. */
  @Post('disputes')
  async openDispute(@Body() dto: OpenDisputeDto) {
    const { disputeId, tx } = await this.disputeService.openDispute(
      dto.sessionId,
      dto.offerId,
      dto.disputeType,
      dto.description,
      dto.evidenceHash,
    );
    const receipt = await tx.wait();

    return {
      statusCode: HttpStatus.CREATED,
      data: {
        disputeId,
        txHash: tx.hash,
        blockNumber: receipt?.blockNumber,
      },
    };
  }

  /** Retrieve on-chain data for a specific dispute by ID. */
  @Get('disputes/:disputeId')
  async getDispute(@Param('disputeId', ParseIntPipe) disputeId: number) {
    const dispute = await this.disputeService.getDispute(disputeId);
    return {
      statusCode: HttpStatus.OK,
      data: dispute,
    };
  }

  /** Grant the ARBITRATOR_ROLE on the DisputeResolution contract to the given address. */
  @Post('roles/arbitrator/grant')
  async grantArbitratorRole(@Body() dto: GrantRoleDto) {
    const tx = await this.disputeService.grantArbitratorRole(dto.address);
    const receipt = await tx.wait();

    return {
      statusCode: HttpStatus.OK,
      data: {
        txHash: tx.hash,
        blockNumber: receipt?.blockNumber,
      },
    };
  }

  /** Return the deployed DisputeResolution contract address. */
  @Get('contract-address')
  async getContractAddress() {
    const address = this.disputeService.getContractAddress();
    return {
      statusCode: HttpStatus.OK,
      data: { address },
    };
  }
}
