import { IsString, IsInt, Min, Max, IsOptional, IsEnum } from 'class-validator';
import { SettlementStatus } from '../schemas/settlement.schema';

/**
 * DTO para calcular un settlement (preview sin enviar a blockchain)
 */
export class CalculateSettlementDto {
  @IsString()
  sessionAddress: string;

  @IsInt()
  @Min(1)
  offerId: number;
}

/**
 * DTO para enviar un settlement a blockchain con PIN
 */
export class SubmitSettlementWithPinDto {
  @IsString()
  pin: string;
}

/**
 * DTO para ejecutar un settlement con PIN
 */
export class ExecuteSettlementWithPinDto {
  @IsString()
  pin: string;
}

/**
 * Respuesta del cálculo de settlement
 */
export class SettlementCalculationResponseDto {
  offerId: number;
  hourSlot: number;
  bidType?: string; // DEMAND o SUPPLY
  fspUserId: string;
  fspAddress: string;
  deliveryDate: Date;

  // Cantidades
  committedQuantity: string;
  deliveredQuantity: string;
  deviationPercentage: number;
  deviationType?: string;

  // Collateral
  collateralAmount: string;
  collateralForfeited: string;
  collateralReturned: string;

  // Pagos
  penaltyAmount: string;
  payment: string;
  platformFee: string;
  price: string;

  // Hash
  meterReadingsHash: string;

  // Datos de consumo usados en el cálculo
  baselineConsumption?: number;
  actualConsumption?: number;
}

/**
 * Respuesta de un settlement guardado
 */
export class SettlementResponseDto {
  id: string;
  sessionId: string;
  sessionAddress: string;
  offerId: number;
  hourlyOfferId?: string;
  bidType?: string; // DEMAND o SUPPLY
  fspUserId: string;
  fspAddress: string;
  hourSlot: number;
  deliveryDate: Date;

  committedQuantity: string;
  deliveredQuantity: string;
  deviationPercentage: number;
  deviationType?: string;

  // Collateral
  collateralAmount: string;
  collateralForfeited: string;
  collateralReturned: string;

  penaltyAmount: string;
  payment: string;
  platformFee: string;
  price: string;

  meterReadingsHash: string;
  status: SettlementStatus;

  flexibilityNftId?: number;
  nftMetadata?: {
    promisedFlexibility: string;
    deliveredFlexibility: string;
    deliveryDate: Date;
    hourSlot: number;
    deviationPercentage: number;
    penaltyApplied: boolean;
  };

  submitTxHash?: string;
  executeTxHash?: string;
  errorMessage?: string;

  createdAt: Date;
  updatedAt: Date;
}

/**
 * Respuesta de transacción blockchain
 */
export class SettlementTxResponseDto {
  success: boolean;
  transactionHash: string;
  blockNumber?: number;
  status: SettlementStatus;
  settlement: SettlementResponseDto;
}

/**
 * Filtros para listar settlements
 */
export class SettlementFilterDto {
  @IsOptional()
  @IsString()
  sessionAddress?: string;

  @IsOptional()
  @IsEnum(SettlementStatus)
  status?: SettlementStatus;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(23)
  hourSlot?: number;
}

/**
 * Resumen de settlements de una session
 */
export class SessionSettlementsSummaryDto {
  sessionAddress: string;
  totalOffers: number;
  settlementsCalculated: number;
  settlementsSubmitted: number;
  settlementsExecuted: number;
  settlementsFailed: number;
  totalPayment: string;
  totalPlatformFees: string;
  totalPenalties: string;
}

// ============================================================================
// FRP Payment Request DTOs
// ============================================================================

/**
 * DTO for FRP to deposit funds with PIN
 */
export class DepositFrpPaymentDto {
  @IsString()
  pin: string;
}

/**
 * Response DTO for FRP payment request
 */
export class FrpPaymentRequestResponseDto {
  id: string;
  sessionAddress: string;
  sessionName?: string;
  marketId: string;
  marketName?: string;
  frpUserId: string;
  frpAddress: string;
  requestedByUserId: string;
  totalPayment: string;
  totalPlatformFees: string;
  totalSettlements: number;
  status: string;
  depositTxHash?: string;
  depositedAt?: Date;
  depositedAmount?: string;
  emailSentAt?: Date;
  emailSentTo?: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Response DTO for FRP deposit transaction
 */
export class FrpDepositResponseDto {
  success: boolean;
  transactionHash: string;
  amount: string;
  paymentRequestId: string;
}
