import { ParticipantType, QualificationStatus } from '../../../types/blockchain.types';

export class ParticipantInfoDto {
  participantAddress: string;
  pType: ParticipantType;
  status: QualificationStatus;
  credentialsReference: string;
  region: string;
  registrationDate: number;
  isActive: boolean;
}
