import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { environment } from '../../../../environments/environment';
import {
  Settlement,
  SettlementCalculation,
  SettlementTxResponse,
  SessionSettlementsSummary,
  ApiResponse,
  FlexibilityCalculationResult,
  BatchCalculationSummary,
  FrpPaymentRequest,
  FrpDepositResponse,
} from './settlement.types';

/**
 * Servicio HTTP para gestión de settlements
 *
 * Endpoints:
 * - GET  /settlements/my                                    - Mis settlements (FSP)
 * - GET  /settlements/session/:sessionAddress               - Lista settlements de session
 * - GET  /settlements/session/:sessionAddress/summary       - Resumen de session
 * - GET  /settlements/session/:sessionAddress/offer/:offerId           - Obtener settlement
 * - GET  /settlements/session/:sessionAddress/offer/:offerId/calculate - Calcular settlement
 * - POST /settlements/session/:sessionAddress/offer/:offerId/submit    - Enviar con PIN
 * - POST /settlements/session/:sessionAddress/offer/:offerId/execute   - Ejecutar con PIN
 * - POST /flexibility-data/calculate-actual-batch                      - Calcular flexibilidad ACTUAL batch
 * - POST /flexibility-data/calculate-actual-session/:sessionAddress    - Calcular flexibilidad ACTUAL para sesión
 * - POST /flexibility-data/calculate-actual-single                     - Calcular flexibilidad ACTUAL para FSP y fecha
 */
@Injectable({
  providedIn: 'root'
})
export class SettlementHttpService {
  private readonly baseUrl = `${environment.apiUrl}/settlements`;
  private readonly flexibilityUrl = `${environment.apiUrl}/api/flexibility/flexibility-data`;

  constructor(private http: HttpClient) { }

  /**
   * Obtiene los settlements del usuario actual (FSP)
   */
  getMySettlements(): Observable<Settlement[]> {
    return this.http.get<ApiResponse<Settlement[]>>(`${this.baseUrl}/my`)
      .pipe(map(response => response.data));
  }

  /**
   * Lista todos los settlements de una session
   */
  getSessionSettlements(sessionAddress: string): Observable<Settlement[]> {
    return this.http.get<ApiResponse<Settlement[]>>(
      `${this.baseUrl}/session/${sessionAddress}`
    ).pipe(map(response => response.data));
  }

  /**
   * Obtiene resumen de settlements de una session
   */
  getSessionSettlementsSummary(sessionAddress: string): Observable<SessionSettlementsSummary> {
    return this.http.get<ApiResponse<SessionSettlementsSummary>>(
      `${this.baseUrl}/session/${sessionAddress}/summary`
    ).pipe(map(response => response.data));
  }

  /**
   * Obtiene un settlement específico
   */
  getSettlement(sessionAddress: string, offerId: number): Observable<Settlement | null> {
    return this.http.get<ApiResponse<Settlement | null>>(
      `${this.baseUrl}/session/${sessionAddress}/offer/${offerId}`
    ).pipe(map(response => response.data));
  }

  /**
   * Calcula un settlement (preview sin enviar a blockchain)
   */
  calculateSettlement(sessionAddress: string, offerId: number): Observable<SettlementCalculation> {
    return this.http.get<ApiResponse<SettlementCalculation>>(
      `${this.baseUrl}/session/${sessionAddress}/offer/${offerId}/calculate`
    ).pipe(map(response => response.data));
  }

  /**
   * Calcula settlements para todas las ofertas de una sesión
   */
  calculateAllSettlements(sessionAddress: string): Observable<{
    total: number;
    success: number;
    failed: number;
    settlements: SettlementCalculation[];
    errors: string[];
  }> {
    return this.http.post<ApiResponse<{
      total: number;
      success: number;
      failed: number;
      settlements: SettlementCalculation[];
      errors: string[];
    }>>(
      `${this.baseUrl}/session/${sessionAddress}/calculate-all`,
      {}
    ).pipe(map(response => response.data));
  }

  /**
   * Envía los measurement data para avanzar la sesión a SETTLEMENT_PENDING
   * DEBE llamarse ANTES de submitSettlement
   */
  submitMeasurementData(
    sessionAddress: string,
    pin: string,
    marketId: string
  ): Observable<{ txHash: string; measurementHash: string }> {
    const params = new HttpParams().set('marketId', marketId);

    return this.http.post<ApiResponse<{ txHash: string; measurementHash: string }> & { message: string }>(
      `${this.baseUrl}/session/${sessionAddress}/submit-measurement-data`,
      { pin },
      { params }
    ).pipe(map(response => response.data));
  }

  /**
   * Envía un settlement a blockchain con PIN
   */
  submitSettlement(
    sessionAddress: string,
    offerId: number,
    pin: string,
    marketId?: string
  ): Observable<SettlementTxResponse> {
    let params = new HttpParams();
    if (marketId) {
      params = params.set('marketId', marketId);
    }

    return this.http.post<ApiResponse<SettlementTxResponse>>(
      `${this.baseUrl}/session/${sessionAddress}/offer/${offerId}/submit`,
      { pin },
      { params }
    ).pipe(map(response => response.data));
  }

  /**
   * Ejecuta un settlement para procesar el pago con PIN
   */
  executeSettlement(
    sessionAddress: string,
    offerId: number,
    pin: string,
    marketId?: string
  ): Observable<SettlementTxResponse> {
    let params = new HttpParams();
    if (marketId) {
      params = params.set('marketId', marketId);
    }

    return this.http.post<ApiResponse<SettlementTxResponse>>(
      `${this.baseUrl}/session/${sessionAddress}/offer/${offerId}/execute`,
      { pin },
      { params }
    ).pipe(map(response => response.data));
  }

  /**
   * Calcula flexibilidad ACTUAL para todas las ofertas aceptadas en una fecha
   */
  calculateActualFlexibilityBatch(date: string): Observable<BatchCalculationSummary> {
    return this.http.post<ApiResponse<BatchCalculationSummary>>(
      `${this.flexibilityUrl}/calculate-actual-batch`,
      { date }
    ).pipe(map(response => response.data));
  }

  /**
   * Calcula flexibilidad ACTUAL para todas las ofertas aceptadas en una sesión
   */
  calculateActualFlexibilityForSession(sessionAddress: string): Observable<BatchCalculationSummary> {
    return this.http.post<ApiResponse<BatchCalculationSummary>>(
      `${this.flexibilityUrl}/calculate-actual-session/${sessionAddress}`,
      {}
    ).pipe(map(response => response.data));
  }

  /**
   * Calcula flexibilidad ACTUAL para un FSP específico en una fecha
   */
  calculateActualFlexibilitySingle(fspUserId: string, date: string): Observable<FlexibilityCalculationResult> {
    return this.http.post<ApiResponse<FlexibilityCalculationResult>>(
      `${this.flexibilityUrl}/calculate-actual-single`,
      { fspUserId, date }
    ).pipe(map(response => response.data));
  }

  // ============================================================================
  // FRP Payment Request Methods
  // ============================================================================

  /**
   * Request FRP to deposit funds for session settlements (called by FMO/LMO)
   */
  requestFrpPayment(sessionAddress: string, marketId: string): Observable<FrpPaymentRequest> {
    const params = new HttpParams().set('marketId', marketId);

    return this.http.post<ApiResponse<FrpPaymentRequest> & { message: string }>(
      `${this.baseUrl}/session/${sessionAddress}/request-frp-payment`,
      {},
      { params }
    ).pipe(map(response => response.data));
  }

  /**
   * Get payment request status for a session
   */
  getPaymentRequest(sessionAddress: string): Observable<FrpPaymentRequest | null> {
    return this.http.get<ApiResponse<FrpPaymentRequest | null>>(
      `${this.baseUrl}/session/${sessionAddress}/payment-request`
    ).pipe(map(response => response.data));
  }

  /**
   * Get pending payment requests for the current FRP user
   */
  getPendingPaymentsForFrp(): Observable<FrpPaymentRequest[]> {
    return this.http.get<ApiResponse<FrpPaymentRequest[]>>(
      `${this.baseUrl}/frp/pending-payments`
    ).pipe(map(response => response.data));
  }

  /**
   * FRP deposits funds for session settlements
   */
  depositFrpPayment(
    sessionAddress: string,
    pin: string,
    marketId: string
  ): Observable<FrpDepositResponse> {
    const params = new HttpParams().set('marketId', marketId);

    return this.http.post<ApiResponse<FrpDepositResponse> & { message: string }>(
      `${this.baseUrl}/session/${sessionAddress}/deposit-frp-payment`,
      { pin },
      { params }
    ).pipe(map(response => response.data));
  }

finalizeSession(pin: string, marketId: string, sessionAddress: string): Observable<{ txHash: string; sessionAddress: string }> {
  return this.http.post<{ txHash: string; sessionAddress: string }>(
    `${this.baseUrl}/session/${sessionAddress}/finalize`,
    { pin, marketId }
  );
}
}
