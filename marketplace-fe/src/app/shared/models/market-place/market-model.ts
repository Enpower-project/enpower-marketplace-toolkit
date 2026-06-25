export interface Market {
  id?: string;
  _id?: string;
  name: string;
  description: string;
  region: string;
  dsoAddress: string;
  ownerEmail: string;
  marketOwner?: MarketOwner;
  state?: 'CREATED_OFFLINE' | 'WALLET_CREATED_PENDING_ACTIVATION' | 'ACTIVE_ONCHAIN'| 'DEACTIVATED';
  createdAt?: Date;
  updatedAt?: Date;
  deactivatedAt?: Date,
  // Blockchain fields for "Blockchain Information" section
  marketAddress?: string;
  txHash?: string;
  publicAddress?: string;
  _links?: any; // Per HATEOAS
}

export interface MarketOwner {
  id?: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  email: string;
  phone?: string;
  status?: 'pending_activation' | 'active';
  temporary_password?: boolean;
}

export interface CreateMarketRequest {
  name: string;
  description: string;
  ownerEmail: string;
  ownerFirstName: string;
  ownerLastName: string;
  dsoAddress: string;
  region: string;
}

export interface UpdateMarketRequest {
  name?: string;
  description?: string;
  region?: string;
  dso?: string;
  state?: 'CREATED_OFFLINE' | 'WALLET_CREATED_PENDING_ACTIVATION' | 'ACTIVE_ONCHAIN' | 'SUSPENDED';
  isActive?: boolean;
  marketAddress?: string;
  txHash?: string;
}

// New interfaces for My Markets response
export interface MyMarket {
  id: string;
  name: string;
  description: string;
  state: 'CREATED_OFFLINE' | 'WALLET_CREATED_PENDING_ACTIVATION' | 'ACTIVE_ONCHAIN';
  region: string;
  isActive: boolean;
  createdAt: string;
  // Blockchain fields for "Blockchain Information" section
  marketAddress?: string;
  txHash?: string;
  publicAddress?: string;
  marketOwner: MyMarketOwner;
}

export interface MyMarketOwner {
  profileCompleted: boolean;
  walletCreated: boolean;
  role: string;
  _id: string;
  username: string;
  email: string;
  firstName?: string;
  lastName?: string;
  keycloakId: string;
  isVerified: boolean;
  createdAt: string;
  updatedAt: string;
  __v: number;
  bids: string[];
  offers: string[];
  wallet: string;
  firstLoginCompleted: boolean;
  temporaryPassword: boolean;
  lastLoginAt: string;
}

export interface MyMarketsResponse {
  success: boolean;
  data: {
    markets: MyMarket[];
    count: number;
    userId: string;
    userEmail: string;
  };
  message: string;
}

export interface MarketResponse {
  success: boolean;
  data: {
    market: Market;
  };
  message: string;
}