/**
 * Estado del settlement en el proceso de liquidación
 */
export enum SettlementStatus {
  PENDING = 'PENDING',
  CALCULATED = 'CALCULATED',
  SUBMITTED = 'SUBMITTED',
  EXECUTED = 'EXECUTED',
  FAILED = 'FAILED',
}

/**
 * Tipo de desviación en el settlement
 */
export enum DeviationType {
  OVER_DELIVERY = 'OVER_DELIVERY',
  UNDER_DELIVERY = 'UNDER_DELIVERY',
  EXACT = 'EXACT',
}

/**
 * Metadata del NFT de flexibilidad
 */
export interface NFTMetadata {
  promisedFlexibility: string;
  deliveredFlexibility: string;
  deliveryDate: string;
  hourSlot: number;
  settlementDate: string;
  deviationType: DeviationType;
  penaltyApplied: string;
}

/**
 * Respuesta del cálculo de settlement
 */
export interface SettlementCalculation {
  offerId: number;
  hourSlot: number;
  fspUserId: string;
  fspAddress: string;
  deliveryDate: string;

  // Cantidades
  committedQuantity: string;
  deliveredQuantity: string;
  deviationPercentage: number;
  deviationType?: DeviationType;

  // Collateral
  collateralAmount?: string;
  collateralReturned?: string;
  collateralForfeited?: string;

  // Pagos
  penaltyAmount: string;
  payment: string;
  platformFee: string;
  price: string;

  // Hash
  meterReadingsHash: string;

  // Datos de consumo usados
  baselineConsumption?: number;
  actualConsumption?: number;
}

/**
 * Settlement guardado en la base de datos
 */
export interface Settlement {
  id: string;
  sessionId: string;
  sessionAddress: string;
  offerId: number;
  hourlyOfferId?: string;
  fspUserId: string;
  fspAddress: string;
  hourSlot: number;
  deliveryDate: string;
  bidType?: string; // 'UPWARD' or 'DOWNWARD'

  committedQuantity: string;
  deliveredQuantity: string;
  deviationPercentage: number;
  deviationType?: DeviationType;

  // Collateral
  collateralAmount?: string;
  collateralReturned?: string;
  collateralForfeited?: string;

  // NFT
  flexibilityNftId?: string;
  nftMetadata?: NFTMetadata;

  penaltyAmount: string;
  payment: string;
  platformFee: string;
  price: string;

  meterReadingsHash: string;
  status: SettlementStatus;

  submitTxHash?: string;
  executeTxHash?: string;
  errorMessage?: string;

  createdAt: string;
  updatedAt: string;
}

/**
 * Respuesta de transacción de settlement
 */
export interface SettlementTxResponse {
  success: boolean;
  txHash: string;
  blockNumber?: number;
  status: SettlementStatus;
  settlement: Settlement;
}

/**
 * Resumen de settlements de una session
 */
export interface SessionSettlementsSummary {
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

/**
 * Respuesta API genérica
 */
export interface ApiResponse<T = any> {
  statusCode: number;
  data: T;
}

/**
 * Resultado de cálculo de flexibilidad
 */
export interface FlexibilityCalculationResult {
  fspUserId: string;
  date: string;
  success: boolean;
  message: string;
  recordsCreated?: number;
}

/**
 * Resumen de cálculo batch de flexibilidad
 */
export interface BatchCalculationSummary {
  date: string;
  totalFsps: number;
  successfulCalculations: number;
  failedCalculations: number;
  totalRecordsCreated: number;
  results: FlexibilityCalculationResult[];
  errors: string[];
}

// ============================================================================
// FRP Payment Request Types
// ============================================================================

/**
 * Estado del payment request del FRP
 */
export enum FrpPaymentRequestStatus {
  PENDING = 'PENDING',
  DEPOSITED = 'DEPOSITED',
  PARTIALLY_USED = 'PARTIALLY_USED',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
  EXPIRED = 'EXPIRED',
}

/**
 * Solicitud de pago para el FRP
 */
export interface FrpPaymentRequest {
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
  status: FrpPaymentRequestStatus;
  depositTxHash?: string;
  depositedAt?: string;
  depositedAmount?: string;
  emailSentAt?: string;
  emailSentTo?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Respuesta al depositar fondos FRP
 */
export interface FrpDepositResponse {
  success: boolean;
  transactionHash: string;
  amount: string;
  paymentRequestId: string;
}
