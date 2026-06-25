import { IsEthereumAddress, IsString, IsInt, Min, Max } from 'class-validator';
import { OfferStatus, FlexibilityType } from '../../../types/blockchain.types';

export class CreateOfferDto {
  @IsInt()
  @Min(0)
  @Max(23)
  hourSlot: number;

  @IsString()
  quantity: string; // in wei
}

export class SubmitSettlementDto {
  @IsInt()
  @Min(1)
  offerId: number;

  @IsString()
  deliveredQuantity: string; // in wei

  @IsString()
  penaltyAmount: string; // in wei

  @IsString()
  meterReadingsHash: string;
}

export class OfferInfoDto {
  offerId: number;
  hourSlot: number;
  fsp: string;
  quantity: string;
  price: string;
  timestamp: number;
  status: OfferStatus;
  nftTokenId: number;
  collateralAmount: string;
  feeAmount: string;
  nftTransferredToBuyer: boolean;
}

export class FlexibilityRequestInfoDto {
  hourSlot: number;
  quantity: string;
  quantityFilled: string;
  price: string;
  flexType: FlexibilityType;
  active: boolean;
  completed: boolean;
}

export class SettlementDataDto {
  deliveredQuantity: string;
  penalty: string;
  payment: string;
  platformFee: string;
  meterReadingsHash: string;
  validated: boolean;
  executed: boolean;
}
