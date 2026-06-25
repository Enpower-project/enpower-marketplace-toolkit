import { Types } from 'mongoose';
import { UserRole } from '../../../schemas/User.schema';
import { InvitationStatus } from '../../../schemas/Invitation.schema';

export class InvitationResponseDto {
  _id: string;
  email: string;
  role: UserRole;
  marketId: string;
  marketName?: string;
  invitedBy: string;
  invitedByName?: string;
  invitationToken: string;
  status: InvitationStatus;
  expiresAt: Date;
  acceptedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export class InvitationDetailsDto {
  email: string;
  role: UserRole;
  marketId: string;
  marketName: string;
  invitedBy: string;
  invitedByName: string;
  expiresAt: Date;
  isExpired: boolean;
  isValid: boolean;
  userExists?: boolean;
  existingUsername?: string;
}
