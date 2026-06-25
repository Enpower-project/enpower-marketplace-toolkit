export enum OfferStatus {
  PENDING = 'PENDING',
  ACCEPTED = 'ACCEPTED',
  REJECTED = 'REJECTED',
  CANCELLED = 'CANCELLED'
}

export interface HourlyOffer {
  id: string;
  session: {
    id: string;
    name: string;
    sessionDate: string;
  };
  hour: number;
  fsp: {
    id: string;
    username: string;
    email: string;
  };
  powerMw: number;
  pricePerMwh: number;
  status: OfferStatus;
  acceptedAt?: Date;
  rejectedAt?: Date;
  cancelledAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateHourlyOfferRequest {
  sessionId: string;
  hour: number;
  powerMw: number;
}

export interface BidWithOffers {
  hour: number;
  powerMw: number;
  pricePerMwh: number;
  bidType: string;
  fulfilledPowerMw: number;
  availablePowerMw: number;
  isFull: boolean;
  offers: HourlyOffer[];
}

export interface SessionWithBids {
  id: string;
  name: string;
  description?: string;
  sessionDate: string;
  market: {
    id: string;
    name: string;
  };
  status: string;
  bids: BidWithOffers[];
  publishedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface HourlyOfferResponse {
  success: boolean;
  data: HourlyOffer;
  message: string;
}

export interface HourlyOfferListResponse {
  success: boolean;
  data: HourlyOffer[];
  message: string;
}

export interface SessionWithBidsResponse {
  success: boolean;
  data: SessionWithBids;
  message: string;
}
