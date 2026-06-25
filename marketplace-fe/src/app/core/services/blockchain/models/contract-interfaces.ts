import {
  SessionStatus,
  FlexibilityType,
  OfferStatus,
  NFTStatus,
  ParticipantType,
  QualificationStatus,
  DisputeStatus,
  DisputeType,
} from './blockchain.types';

export interface MarketInfo {
  marketAddress: string;
  communityId: string;
  region: string;
  owner: string;
  isActive: boolean;
  createdAt: number;
}

export interface SessionInfo {
  sessionAddress: string;
  deliveryDay: number;
  createdAt: number;
  status: SessionStatus;
}

export interface FlexibilityRequest {
  hourSlot: number;
  quantity: string;
  quantityFilled: string;
  price: string;
  flexType: FlexibilityType;
  active: boolean;
  completed: boolean;
}

export interface OfferInfo {
  offerId: number;
  hourSlot: number;
  fsp: string;
  quantity: string;
  price: string;
  timestamp: number;
  status: OfferStatus;
  nftTokenId: number;
  collateralAmount: string;
  nftTransferredToBuyer: boolean;
}

export interface NFTMetadata {
  tokenId: number;
  sessionId: number;
  offerId: number;
  hourSlot: number;
  fsp: string;
  offeredQuantity: string;
  price: string;
  creationTimestamp: number;
  collateralAmount: string;
  fmoLmo: string;
  acceptedQuantity: string;
  matchingTimestamp: number;
  deliveredQuantity: string;
  settlementTimestamp: number;
  meterReadingsHash: string;
  finalBuyer: string;
  actualPayment: string;
  status: NFTStatus;
}

export interface ParticipantInfo {
  participantAddress: string;
  pType: ParticipantType;
  status: QualificationStatus;
  credentialsReference: string;
  region: string;
  registrationDate: number;
  isActive: boolean;
}

export interface DisputeInfo {
  disputeId: number;
  sessionId: number;
  offerId: number;
  initiator: string;
  disputeType: DisputeType;
  description: string;
  evidenceHash: string;
  status: DisputeStatus;
  createdAt: number;
  resolvedAt: number;
  resolution: string;
}

export interface SettlementData {
  deliveredQuantity: string;
  penalty: string;
  payment: string;
  platformFee: string;
  meterReadingsHash: string;
  validated: boolean;
  executed: boolean;
}

export interface BalanceInfo {
  balance: string;
  availableBalance: string;
  collateralDeposited: string;
  collateralLocked: string;
}
