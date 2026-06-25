export enum WalletBinding {
  SELF = 'self',
  MARKET = 'market'
}

export interface WalletCreationResult {
  pin: string;
  commonSecretEncrypted: string;
  privateKeyEncrypted: string;
  publicAddress: string;
}

export interface WalletDecryptionData {
  privateKey: string;
  publicKey: string;
  address: string;
}

export interface SelfWalletData {
  privateKeyEncrypted: string;
  publicAddress: string;
  personalPin: string;
  commonSecretEncrypted: string;
}

export interface MarketWalletData {
  marketData: {
    privateKeyEncrypted: string;
    publicAddress: string;
  };
  userData: {
    personalPin: string;
    commonSecretEncrypted: string;
  };
}

export interface WalletInvitationData {
  randomPin: string;
  commonSecretEncrypted: string;
}

export enum UserWalletRole {
  OWNER = 'owner',
  ADMIN = 'admin',
  OPERATOR = 'operator'
}

export interface WalletPermissions {
  canCreateWallet: boolean;
  canAccessWallet: boolean;
  role: UserWalletRole;
}