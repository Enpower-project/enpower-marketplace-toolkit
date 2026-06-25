import { IsEthereumAddress, IsString, IsOptional } from 'class-validator';

export class TokenBalanceDto {
  @IsEthereumAddress()
  account: string;

  balance: string;
}

export class AvailableBalanceDto {
  @IsEthereumAddress()
  account: string;

  availableBalance: string;
  collateralLocked: string;
}

export class TransferTokenDto {
  @IsEthereumAddress()
  to: string;

  @IsString()
  amount: string; // in wei
}

export class ApproveTokenDto {
  @IsEthereumAddress()
  spender: string;

  @IsString()
  amount: string; // in wei
}

export class MintTokenDto {
  @IsEthereumAddress()
  to: string;

  @IsString()
  amount: string; // in wei
}

export class BurnTokenDto {
  @IsString()
  amount: string; // in wei
}

export class GrantRoleDto {
  @IsEthereumAddress()
  address: string;

  @IsOptional()
  @IsString()
  role?: string; // Role bytes32 hash
}
