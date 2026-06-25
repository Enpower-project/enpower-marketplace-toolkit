import { IsString, IsNotEmpty, IsNumber, IsInt, Min, Max, IsMongoId } from 'class-validator';
import { Type } from 'class-transformer';
import { OfferStatus } from '../schemas/HourlyOffer.schema';

export class CreateHourlyOfferDto {
  @IsMongoId()
  @IsString()
  @IsNotEmpty()
  sessionId: string;

  @IsInt()
  @Min(0)
  @Max(23)
  hour: number;

  @IsNumber()
  @Min(0.001)
  @Type(() => Number)
  powerMw: number;
}

export class HourlyOfferResponseDto {
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
  transactionHash: string;
}

export class SessionWithBidsResponseDto {
  id: string;
  name: string;
  description?: string;
  sessionDate: string;
  market: {
    id: string;
    name: string;
  };
  status: string;
  bids: BidWithOffersDto[];
  publishedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export class BidWithOffersDto {
  hour: number;
  powerMw: number;
  pricePerMwh: number;
  bidType: string;
  fulfilledPowerMw: number;
  availablePowerMw: number;
  isFull: boolean;
  offers: HourlyOfferResponseDto[];
}

export class PublishOfferDto {
  @IsString()
  @IsNotEmpty()
  pin: string;
}
