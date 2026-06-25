import { IsString, IsOptional, IsBoolean, IsEnum, Length } from 'class-validator';
import { MarketState } from '../schemas/Market.schema';

export class UpdateMarketDto {
  @IsOptional()
  @IsString()
  @Length(3, 100, { message: 'Market name must be between 3 and 100 characters' })
  name?: string;

  @IsOptional()
  @IsString()
  @Length(10, 500, { message: 'Description must be between 10 and 500 characters' })
  description?: string;

  @IsOptional()
  @IsString()
  @Length(2, 100, { message: 'DSO must be between 2 and 100 characters' })
  dso?: string;

  @IsOptional()
  @IsString()
  @Length(2, 100, { message: 'Region must be between 2 and 100 characters' })
  region?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsEnum(MarketState, { message: 'Invalid market state' })
  state?: MarketState;

  @IsOptional()
  @IsString()
  @Length(10, 200, { message: 'Market address must be between 10 and 200 characters' })
  marketAddress?: string;

  @IsOptional()
  @IsString()
  @Length(10, 200, { message: 'Transaction hash must be between 10 and 200 characters' })
  txHash?: string;
}

export class UpdateMarketRequestDto extends UpdateMarketDto {
  // Se puede extender si necesitamos validaciones adicionales para la request
}

export interface UpdateMarketResponse {
  success: boolean;
  data: {
    market: {
      id: string;
      name: string;
      description?: string;
      dso?: string;
      region?: string;
      isActive: boolean;
      state: MarketState;
      marketAddress?: string;
      txHash?: string;
      marketOwner: string;
      createdAt: Date;
      updatedAt: Date;
      activatedAt?: Date;
    };
    message: string;
  };
}
