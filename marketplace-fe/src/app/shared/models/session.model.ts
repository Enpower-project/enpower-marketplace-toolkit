export enum SessionStatus {
  DRAFT = 'DRAFT',
  APPROVED = 'APPROVED',
  PUBLISHED = 'PUBLISHED',
  ACTIVE = 'ACTIVE',
  OFFERS_CLOSED = 'OFFERS_CLOSED',
  IN_DELIVERY = 'IN_DELIVERY',
  SETTLEMENT_PENDING = 'SETTLEMENT_PENDING',
  SETTLED = 'SETTLED',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED'
}

export enum BidType {
  UPWARD = 'UPWARD',
  DOWNWARD = 'DOWNWARD'
}

export interface HourlyBid {
  hour: number; // 0-23
  powerMw: number;
  pricePerMwh: number;
  bidType: BidType;
  fulfilledPowerMw: number;
  availablePowerMw?: number;
  isFull?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Session {
  id: string;
  name: string;
  description?: string;
  sessionDate: string; // YYYY-MM-DD format
  market: {
    id: string;
    name: string;
  };
  createdBy: {
    id: string;
    username: string;
    email: string;
  };
  status: SessionStatus;
  bids: HourlyBid[];
  totalBids: number;
  totalPowerMw: number;
  averagePricePerMwh: number;
  contractAddress?: string; // Blockchain session contract address
  marketAddress?: string; // Blockchain market contract address
  fmoLmoAddress?: string; // FMO/LMO address for blockchain
  frpAddress?: string; // FRP address for blockchain
  publishedAt?: Date;
  completedAt?: Date;
  cancelReason?: string; // Reason for cancellation if status is CANCELLED
  cancelledAt?: Date; // When the session was cancelled
  tokensReturned?: boolean; // Indicates if tokens were returned for a cancelled session
  createdAt: Date;
  updatedAt: Date;
}

export interface FlexibilityRequestInput {
  hourSlot: number;      // 0-23
  quantity: string;      // Power in wei format
  price: string;         // Price in wei format
  flexType: number;      // 0=UPWARD, 1=DOWNWARD
}

export interface CreateSessionRequest {
  name: string;
  description?: string;
  sessionDate: string; // YYYY-MM-DD format
  bids?: CreateBidRequest[];
  flexibilityRequests?: FlexibilityRequestInput[]; // Blockchain data
}

export interface CreateBidRequest {
  hour: number;
  powerMw: number;
  pricePerMwh: number;
  bidType: BidType;
}

export interface UpdateSessionRequest {
  name?: string;
  description?: string;
  sessionDate?: string;
  bids?: CreateBidRequest[];
}

export interface SessionResponse {
  success: boolean;
  data: Session;
  message: string;
}

export interface SessionListResponse {
  success: boolean;
  data: Session[];
  message: string;
}

// Helper interfaces para el frontend
export interface TimeSlot {
  hour: number;
  startTime: string; // "00:00"
  endTime: string; // "01:00"
  displayTime: string; // "00:00 - 01:00"
  bid?: HourlyBid;
  hasData: boolean;
}

export interface SessionDraft {
  name: string;
  description: string;
  sessionDate: Date;
  bids: Map<number, CreateBidRequest>; // hour -> bid
}