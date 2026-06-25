import { IsInt, IsEnum, IsString, IsEthereumAddress, Min } from 'class-validator';

export enum DisputeType {
  QUALITY = 0,
  QUANTITY = 1,
  TIMING = 2,
  PAYMENT = 3,
  OTHER = 4,
}

export class OpenDisputeDto {
  @IsInt()
  @Min(0)
  sessionId: number;

  @IsInt()
  @Min(0)
  offerId: number;

  @IsEnum(DisputeType)
  disputeType: number;

  @IsString()
  description: string;

  @IsString()
  evidenceHash: string;
}

export class GrantRoleDto {
  @IsEthereumAddress()
  address: string;
}
