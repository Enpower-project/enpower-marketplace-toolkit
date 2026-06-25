import { IsEthereumAddress, IsString, IsInt, Min } from 'class-validator';

export class CreateMarketDto {
  @IsString()
  communityId: string;

  @IsString()
  region: string;

  @IsEthereumAddress()
  ownerAddress: string;
}

export class MarketInfoDto {
  marketAddress: string;
  communityId: string;
  region: string;
  owner: string;
  isActive: boolean;
  createdAt: number;
}

export class DeactivateMarketDto {
  @IsInt()
  @Min(1)
  marketId: number;
}

export class ReactivateMarketDto {
  @IsInt()
  @Min(1)
  marketId: number;
}
