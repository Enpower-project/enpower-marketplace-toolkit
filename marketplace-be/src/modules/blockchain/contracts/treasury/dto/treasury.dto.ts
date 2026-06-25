import { IsEthereumAddress, IsString, IsInt, Min } from 'class-validator';

export class DepositDto {
  @IsString()
  amount: string; // in wei
}

export class WithdrawDto {
  @IsString()
  amount: string; // in wei
}

export class DepositPaymentForSessionDto {
  @IsInt()
  @Min(1)
  sessionId: number;

  @IsString()
  amount: string; // in wei
}

export class BalanceInfoDto {
  balance: string;
  availableBalance: string;
  collateralDeposited: string;
  collateralLocked: string;
}

export class OfferCollateralInfoDto {
  sessionContract: string;
  sessionId: number;
  offerId: number;
  fsp: string;
  collateralAmount: string;
  feeAmount: string;
  released: boolean;
}

export class GrantRoleDto {
  @IsEthereumAddress()
  address: string;
}
