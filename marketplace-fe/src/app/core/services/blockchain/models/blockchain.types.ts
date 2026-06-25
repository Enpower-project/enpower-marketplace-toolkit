/**
 * Blockchain Types and Enums for Frontend
 * Matches Solidity contracts enums
 */

export enum FlexibilityType {
  UPWARD = 0,
  DOWNWARD = 1,
}

export enum SessionStatus {
  CREATED = 0,
  OFFERS_OPEN = 1,
  IN_DELIVERY = 2,
  SETTLEMENT_PENDING = 3,
  SETTLED = 4,
}

export enum ParticipantType {
  NONE = 0,
  MARKETPLACE_ADMIN = 1,
  FMO_LMO = 2,
  FRP = 3,
  FSP = 4,
}

export enum QualificationStatus {
  PENDING = 0,
  QUALIFIED = 1,
  SUSPENDED = 2,
  REVOKED = 3,
}

export enum NFTStatus {
  SUBMITTED = 0,
  ACCEPTED = 1,
  REJECTED = 2,
  DELIVERED = 3,
  FINALIZED = 4,
}

export enum OfferStatus {
  ACCEPTED = 0,
  DELIVERED = 1,
  VALIDATED = 2,
  SETTLED = 3,
}

export enum DisputeStatus {
  OPEN = 0,
  UNDER_REVIEW = 1,
  RESOLVED = 2,
  REJECTED = 3,
}

export enum DisputeType {
  MEASUREMENT = 0,
  SETTLEMENT = 1,
  PAYMENT = 2,
  OTHER = 3,
}
