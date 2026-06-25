import { IsString, IsNotEmpty, IsDateString, IsOptional, IsArray, ValidateNested, IsNumber, IsEnum, Min, Max, IsInt } from 'class-validator';
import { Type } from 'class-transformer';
import { BidType } from '../schemas/Session.schema';
import { FlexibilityRequestInputDto } from '../modules/blockchain/contracts/market/dto/market.dto';

export class CreateHourlyBidDto {
  @IsInt()
  @Min(0)
  @Max(23)
  hour: number;

  @IsNumber()
  @Min(0)
  powerMw: number;

  @IsNumber()
  @Min(0)
  pricePerMwh: number;

  @IsEnum(BidType)
  bidType: BidType;
}

export class CreateSessionDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsDateString()
  sessionDate: string; // YYYY-MM-DD format

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateHourlyBidDto)
  @IsOptional()
  bids?: CreateHourlyBidDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FlexibilityRequestInputDto)
  @IsOptional()
  flexibilityRequests?: FlexibilityRequestInputDto[];
}

export class UpdateHourlyBidDto {
  @IsInt()
  @Min(0)
  @Max(23)
  @IsOptional()
  hour?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  powerMw?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  pricePerMwh?: number;

  @IsEnum(BidType)
  @IsOptional()
  bidType?: BidType;
}

export class UpdateSessionDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsDateString()
  @IsOptional()
  sessionDate?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateHourlyBidDto)
  @IsOptional()
  bids?: UpdateHourlyBidDto[];
}

export class SessionResponseDto {
  id: string;
  name: string;
  description?: string;
  sessionDate: string;
  market: {
    id: string;
    name: string;
  };
  createdBy: {
    id: string;
    username: string;
    email: string;
  };
  status: string;
  bids: {
    hour: number;
    powerMw: number;
    pricePerMwh: number;
    bidType: BidType;
    fulfilledPowerMw: number;
    availablePowerMw?: number;
    isFull?: boolean;
    createdAt: Date;
    updatedAt: Date;
  }[];
  totalBids: number;
  totalPowerMw: number;
  averagePricePerMwh: number;
  publishedAt?: Date;
  completedAt?: Date;
  cancelReason?: string;
  cancelledAt?: Date | null;
  contractAddress?: string;
  transactionHash?: string;
  createdAt: Date;
  updatedAt: Date;
}
