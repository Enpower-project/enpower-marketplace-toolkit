import { IsEthereumAddress, IsString, IsEnum, IsInt, Min } from 'class-validator';
import { ParticipantType } from '../../../types/blockchain.types';

export class RegisterParticipantDto {
  @IsEthereumAddress()
  participantAddress: string;

  @IsEnum(ParticipantType)
  participantType: ParticipantType;

  @IsString()
  credentialsReference: string;

  @IsString()
  region: string;
}

export class QualifyParticipantDto {
  @IsEthereumAddress()
  participantAddress: string;
}

export class SuspendParticipantDto {
  @IsEthereumAddress()
  participantAddress: string;

  @IsString()
  reason: string;
}

export class RevokeParticipantDto {
  @IsEthereumAddress()
  participantAddress: string;

  @IsString()
  reason: string;
}

export class UpdateCredentialsDto {
  @IsEthereumAddress()
  participantAddress: string;

  @IsString()
  newCredentialsReference: string;
}
