import { Controller, Post, Get, Body, Param, HttpStatus } from '@nestjs/common';
import { ParticipantRegistryContractService } from './participant-registry.contract.service';
import {
  RegisterParticipantDto,
  QualifyParticipantDto,
  SuspendParticipantDto,
  RevokeParticipantDto,
  UpdateCredentialsDto,
} from './dto/register-participant.dto';

@Controller('blockchain/participant-registry')
export class ParticipantRegistryContractController {
  constructor(private readonly registryService: ParticipantRegistryContractService) {}

  /** Register a new participant in the ParticipantRegistry contract. */
  @Post('participants')
  async registerParticipant(@Body() dto: RegisterParticipantDto) {
    const tx = await this.registryService.registerParticipant(
      dto.participantAddress,
      dto.participantType,
      dto.credentialsReference,
      dto.region,
    );
    const receipt = await tx.wait();

    return {
      statusCode: HttpStatus.CREATED,
      data: {
        txHash: tx.hash,
        blockNumber: receipt?.blockNumber,
      },
    };
  }

  /** Qualify a registered participant, enabling them to operate in the marketplace. */
  @Post('participants/qualify')
  async qualifyParticipant(@Body() dto: QualifyParticipantDto) {
    const tx = await this.registryService.qualifyParticipant(dto.participantAddress);
    const receipt = await tx.wait();

    return {
      statusCode: HttpStatus.OK,
      data: {
        txHash: tx.hash,
        blockNumber: receipt?.blockNumber,
      },
    };
  }

  /** Suspend a participant, preventing them from participating in sessions. */
  @Post('participants/suspend')
  async suspendParticipant(@Body() dto: SuspendParticipantDto) {
    const tx = await this.registryService.suspendParticipant(
      dto.participantAddress,
      dto.reason,
    );
    const receipt = await tx.wait();

    return {
      statusCode: HttpStatus.OK,
      data: {
        txHash: tx.hash,
        blockNumber: receipt?.blockNumber,
      },
    };
  }

  /** Revoke a participant's access, permanently removing their marketplace privileges. */
  @Post('participants/revoke')
  async revokeParticipant(@Body() dto: RevokeParticipantDto) {
    const tx = await this.registryService.revokeParticipant(dto.participantAddress, dto.reason);
    const receipt = await tx.wait();

    return {
      statusCode: HttpStatus.OK,
      data: {
        txHash: tx.hash,
        blockNumber: receipt?.blockNumber,
      },
    };
  }

  /** Update the credentials reference (KYC hash) for an existing participant. */
  @Post('participants/credentials')
  async updateCredentials(@Body() dto: UpdateCredentialsDto) {
    const tx = await this.registryService.updateCredentials(
      dto.participantAddress,
      dto.newCredentialsReference,
    );
    const receipt = await tx.wait();

    return {
      statusCode: HttpStatus.OK,
      data: {
        txHash: tx.hash,
        blockNumber: receipt?.blockNumber,
      },
    };
  }

  /** Return on-chain participant information for the given address. */
  @Get('participants/:address')
  async getParticipant(@Param('address') address: string) {
    const participant = await this.registryService.getParticipant(address);
    return {
      statusCode: HttpStatus.OK,
      data: participant,
    };
  }

  /** Check whether the participant at the given address is currently qualified. */
  @Get('participants/:address/qualified')
  async isQualified(@Param('address') address: string) {
    const isQualified = await this.registryService.isQualified(address);
    return {
      statusCode: HttpStatus.OK,
      data: { isQualified },
    };
  }

  /** Check whether the participant at the given address holds the specified role type. */
  @Get('participants/:address/role/:type')
  async hasRole(@Param('address') address: string, @Param('type') type: string) {
    const hasRole = await this.registryService.hasRole(address, parseInt(type));
    return {
      statusCode: HttpStatus.OK,
      data: { hasRole },
    };
  }

  /** Return all participant addresses registered in the given region. */
  @Get('regions/:region/participants')
  async getParticipantsByRegion(@Param('region') region: string) {
    const participants = await this.registryService.getParticipantsByRegion(region);
    return {
      statusCode: HttpStatus.OK,
      data: { participants },
    };
  }

  /** Return all participant addresses registered in the ParticipantRegistry contract. */
  @Get('participants')
  async getAllParticipants() {
    const participants = await this.registryService.getAllParticipants();
    return {
      statusCode: HttpStatus.OK,
      data: { participants },
    };
  }

  /** Return the deployed ParticipantRegistry contract address. */
  @Get('contract-address')
  async getContractAddress() {
    const address = this.registryService.getContractAddress();
    return {
      statusCode: HttpStatus.OK,
      data: { address },
    };
  }
}
