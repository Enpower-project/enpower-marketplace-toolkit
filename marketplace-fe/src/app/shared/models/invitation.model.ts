export enum InvitationStatus {
  PENDING = 'PENDING',
  ACCEPTED = 'ACCEPTED',
  REJECTED = 'REJECTED',
  EXPIRED = 'EXPIRED',
  REVOKED = 'REVOKED'
}

export enum UserRole {
  MARKET_OWNER = 'MARKET_OWNER',
  PROSUMER = 'PROSUMER',
  ADMIN = 'ADMIN',
  FRP = 'FRP',
  FSP = 'FSP'
}

export interface Invitation {
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

export interface InvitationDetails {
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

export interface SendInvitationRequest {
  email: string;
  role: UserRole;
  marketId: string;
}

export interface AcceptInvitationRequest {
  username?: string;
  password?: string;
  firstName?: string;
  lastName?: string;
}

export interface InvitationResponse {
  success: boolean;
  message: string;
  data?: Invitation;
}

export interface InvitationDetailsResponse {
  success: boolean;
  data: InvitationDetails;
}

export interface AcceptInvitationResponse {
  success: boolean;
  message: string;
  data: {
    username: string;
    email: string;
    role: UserRole;
    marketName: string;
  };
}

export interface InviteUserDialogData {
  marketId: string;
  marketName: string;
  hasFRP: boolean;
}
