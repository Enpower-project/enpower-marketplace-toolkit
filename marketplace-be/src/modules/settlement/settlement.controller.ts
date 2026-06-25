import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { AuthenticatedUser, Roles } from 'nest-keycloak-connect';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from '../../schemas/User.schema';
import { SettlementService } from './settlement.service';
import {
  SubmitSettlementWithPinDto,
  ExecuteSettlementWithPinDto,
  SettlementCalculationResponseDto,
  SettlementResponseDto,
  SettlementTxResponseDto,
  SessionSettlementsSummaryDto,
  DepositFrpPaymentDto,
  FrpPaymentRequestResponseDto,
  FrpDepositResponseDto,
} from './dto/settlement.dto';
import { FrpPaymentRequestDocument } from './schemas/frp-payment-request.schema';
import { ApiOAuth2, ApiTags } from '@nestjs/swagger';

/**
 * Controller para gestión de settlements
 *
 * Flujo de Settlement:
 * 1. closeOffers() en session → status = IN_DELIVERY
 * 2. POST /settlements/session/:sessionAddress/submit-measurement-data → status = SETTLEMENT_PENDING
 * 3. POST /settlements/session/:sessionAddress/offer/:offerId/submit   → submitSettlement por cada offer
 * 4. POST /settlements/session/:sessionAddress/offer/:offerId/execute  → executeSettlement por cada offer
 * 5. finalizeSession() → status = SETTLED
 *
 * Endpoints:
 * - GET  /settlements/my                                              - Mis settlements (FSP)
 * - GET  /settlements/session/:sessionAddress                         - Lista settlements de session
 * - GET  /settlements/session/:sessionAddress/summary                 - Resumen de session
 * - POST /settlements/session/:sessionAddress/calculate-all           - Calcular todos los settlements
 * - POST /settlements/session/:sessionAddress/submit-measurement-data - Enviar measurement data (REQUERIDO antes de submit)
 * - GET  /settlements/session/:sessionAddress/offer/:offerId          - Obtener settlement
 * - GET  /settlements/session/:sessionAddress/offer/:offerId/calculate- Calcular settlement (preview)
 * - POST /settlements/session/:sessionAddress/offer/:offerId/submit   - Enviar con PIN
 * - POST /settlements/session/:sessionAddress/offer/:offerId/execute  - Ejecutar con PIN
 */
@ApiTags('settlements')
@ApiOAuth2(['openid'], 'keycloak')
@Controller('settlements')
export class SettlementController {
  private readonly logger = new Logger(SettlementController.name);

  constructor(
    private readonly settlementService: SettlementService,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
  ) { }

  /**
   * Helper to get MongoDB user ID from Keycloak ID
   */
  private async getUserIdFromKeycloak(keycloakId: string): Promise<string> {
    const user = await this.userModel.findOne({ keycloakId }).exec();
    if (!user) {
      throw new NotFoundException(`User with keycloakId ${keycloakId} not found`);
    }
    return (user._id as any).toString();
  }

  /**
   * Obtiene los settlements del usuario actual (FSP)
   */
  @Get('my')
  async getMySettlements(): Promise<{
    statusCode: number;
    data: SettlementResponseDto[];
  }> {
    this.logger.log('Getting my settlements');
    const settlements = await this.settlementService.getMySettlements();
    return {
      statusCode: HttpStatus.OK,
      data: settlements,
    };
  }

  /**
   * Lista todos los settlements de una session
   */
  @Get('session/:sessionAddress')
  async getSessionSettlements(
    @Param('sessionAddress') sessionAddress: string,
  ): Promise<{
    statusCode: number;
    data: SettlementResponseDto[];
  }> {
    this.logger.log(`Getting settlements for session ${sessionAddress}`);
    const settlements = await this.settlementService.getSettlementsBySession(sessionAddress);
    return {
      statusCode: HttpStatus.OK,
      data: settlements,
    };
  }

  /**
   * Obtiene resumen de settlements de una session
   */
  @Get('session/:sessionAddress/summary')
  async getSessionSettlementsSummary(
    @Param('sessionAddress') sessionAddress: string,
  ): Promise<{
    statusCode: number;
    data: SessionSettlementsSummaryDto;
  }> {
    this.logger.log(`Getting settlements summary for session ${sessionAddress}`);
    const summary = await this.settlementService.getSessionSettlementsSummary(sessionAddress);
    return {
      statusCode: HttpStatus.OK,
      data: summary,
    };
  }

  /**
   * Calcula settlements para todas las ofertas de una sesión
   */
  @Post('session/:sessionAddress/calculate-all')
  @HttpCode(HttpStatus.OK)
  async calculateAllSettlements(
    @Param('sessionAddress') sessionAddress: string,
  ): Promise<{
    statusCode: number;
    data: {
      total: number;
      success: number;
      failed: number;
      settlements: SettlementCalculationResponseDto[];
      errors: string[];
    };
  }> {
    this.logger.log(`Calculating all settlements for session ${sessionAddress}`);
    const result = await this.settlementService.calculateAllSettlements(sessionAddress);
    return {
      statusCode: HttpStatus.OK,
      data: result,
    };
  }

  /**
   * Obtiene un settlement específico
   */
  @Get('session/:sessionAddress/offer/:offerId')
  async getSettlement(
    @Param('sessionAddress') sessionAddress: string,
    @Param('offerId') offerId: number,
  ): Promise<{
    statusCode: number;
    data: SettlementResponseDto | null;
  }> {
    this.logger.log(`Getting settlement for session ${sessionAddress}, offer ${offerId}`);
    const settlement = await this.settlementService.getSettlement(sessionAddress, offerId);
    return {
      statusCode: HttpStatus.OK,
      data: settlement,
    };
  }

  /**
   * Calcula un settlement (preview sin enviar a blockchain)
   */
  @Get('session/:sessionAddress/offer/:offerId/calculate')
  async calculateSettlement(
    @Param('sessionAddress') sessionAddress: string,
    @Param('offerId') offerId: number,
  ): Promise<{
    statusCode: number;
    data: SettlementCalculationResponseDto;
  }> {
    this.logger.log(`Calculating settlement for session ${sessionAddress}, offer ${offerId}`);
    const calculation = await this.settlementService.calculateSettlement(
      sessionAddress,
      Number(offerId),
    );
    return {
      statusCode: HttpStatus.OK,
      data: calculation,
    };
  }

  @Post('session/:sessionAddress/finalize')
  @Roles({ roles: ['realm:FMO_LMO'] })
  async finalizeSession(
    @Param('sessionAddress') sessionAddress: string,
    @Body() body: { pin: string; marketId: string },
    @AuthenticatedUser() user: any
  ) {
    const userId = await this.getUserIdFromKeycloak(user.sub);

    return this.settlementService.finalizeSession(
      sessionAddress,
      userId,
      body.pin,
      body.marketId,
    );
  }

  /**
   * Envía los measurement data para avanzar la sesión a SETTLEMENT_PENDING
   * DEBE llamarse ANTES de submitSettlement
   */
  @Post('session/:sessionAddress/submit-measurement-data')
  @HttpCode(HttpStatus.OK)
  async submitMeasurementData(
    @Param('sessionAddress') sessionAddress: string,
    @Body() dto: SubmitSettlementWithPinDto,
    @AuthenticatedUser() user: any,
    @Query('marketId') marketId?: string,
  ): Promise<{
    statusCode: number;
    data: { transactionHash: string; measurementHash: string };
    message: string;
  }> {
    this.logger.log(`Submitting measurement data for session ${sessionAddress}`);

    if (!marketId) {
      throw new Error('marketId query parameter is required');
    }

    // Convert Keycloak ID to MongoDB ObjectId
    const userId = await this.getUserIdFromKeycloak(user.sub);

    const result = await this.settlementService.submitMeasurementData(
      sessionAddress,
      userId,
      dto.pin,
      marketId,
    );

    return {
      statusCode: HttpStatus.OK,
      data: result,
      message: 'Measurement data submitted. Session status advanced to SETTLEMENT_PENDING.',
    };
  }

  /**
   * Envía un settlement a blockchain con PIN
   */
  @Post('session/:sessionAddress/offer/:offerId/submit')
  @HttpCode(HttpStatus.OK)
  async submitSettlement(
    @Param('sessionAddress') sessionAddress: string,
    @Param('offerId') offerId: number,
    @Body() dto: SubmitSettlementWithPinDto,
    @AuthenticatedUser() user: any,
    @Query('marketId') marketId?: string,
  ): Promise<{
    statusCode: number;
    data: SettlementTxResponseDto;
  }> {
    this.logger.log(`Submitting settlement for session ${sessionAddress}, offer ${offerId}`);

    // Convert Keycloak ID to MongoDB ObjectId
    const userId = await this.getUserIdFromKeycloak(user.sub);

    const result = await this.settlementService.submitSettlementWithPin(
      sessionAddress,
      Number(offerId),
      userId,
      dto.pin,
      marketId,
    );

    return {
      statusCode: HttpStatus.OK,
      data: result,
    };
  }

  /**
   * Ejecuta un settlement para procesar el pago con PIN
   */
  @Post('session/:sessionAddress/offer/:offerId/execute')
  @HttpCode(HttpStatus.OK)
  async executeSettlement(
    @Param('sessionAddress') sessionAddress: string,
    @Param('offerId') offerId: number,
    @Body() dto: ExecuteSettlementWithPinDto,
    @AuthenticatedUser() user: any,
    @Query('marketId') marketId?: string,
  ): Promise<{
    statusCode: number;
    data: SettlementTxResponseDto;
  }> {
    this.logger.log(`Executing settlement for session ${sessionAddress}, offer ${offerId}`);

    // Convert Keycloak ID to MongoDB ObjectId
    const userId = await this.getUserIdFromKeycloak(user.sub);

    const result = await this.settlementService.executeSettlementWithPin(
      sessionAddress,
      Number(offerId),
      userId,
      dto.pin,
      marketId,
    );

    return {
      statusCode: HttpStatus.OK,
      data: result,
    };
  }

  // ============================================================================
  // FRP Payment Request Endpoints
  // ============================================================================

  /**
   * Request FRP to deposit funds for session settlements (called by FMO/LMO)
   * Creates a payment request and sends email notification to the FRP
   */
  @Post('session/:sessionAddress/request-frp-payment')
  @HttpCode(HttpStatus.OK)
  async requestFrpPayment(
    @Param('sessionAddress') sessionAddress: string,
    @AuthenticatedUser() user: any,
    @Query('marketId') marketId?: string,
  ): Promise<{
    statusCode: number;
    data: FrpPaymentRequestResponseDto;
    message: string;
  }> {
    this.logger.log(`Requesting FRP payment for session ${sessionAddress}`);

    if (!marketId) {
      throw new Error('marketId query parameter is required');
    }

    // Convert Keycloak ID to MongoDB ObjectId
    const userId = await this.getUserIdFromKeycloak(user.sub);

    const paymentRequest = await this.settlementService.requestFrpPayment(
      sessionAddress,
      userId,
      marketId,
    );

    return {
      statusCode: HttpStatus.OK,
      data: this.toFrpPaymentRequestResponseDto(paymentRequest),
      message: 'Payment request created and email notification sent to FRP.',
    };
  }

  /**
   * Get payment request status for a session
   */
  @Get('session/:sessionAddress/payment-request')
  async getPaymentRequest(
    @Param('sessionAddress') sessionAddress: string,
  ): Promise<{
    statusCode: number;
    data: FrpPaymentRequestResponseDto | null;
  }> {
    this.logger.log(`Getting payment request for session ${sessionAddress}`);

    const paymentRequest = await this.settlementService.getPaymentRequestBySession(sessionAddress);

    return {
      statusCode: HttpStatus.OK,
      data: paymentRequest ? this.toFrpPaymentRequestResponseDto(paymentRequest) : null,
    };
  }

  /**
   * Get pending payment requests for the current FRP user
   */
  @Get('frp/pending-payments')
  async getPendingPaymentsForFrp(
    @AuthenticatedUser() user: any,
  ): Promise<{
    statusCode: number;
    data: FrpPaymentRequestResponseDto[];
  }> {
    this.logger.log('Getting pending payments for FRP');

    // Convert Keycloak ID to MongoDB ObjectId
    const userId = await this.getUserIdFromKeycloak(user.sub);

    const pendingRequests = await this.settlementService.getPendingPaymentRequestsForFrp(userId);

    return {
      statusCode: HttpStatus.OK,
      data: pendingRequests.map(req => this.toFrpPaymentRequestResponseDto(req)),
    };
  }

  /**
   * FRP deposits funds for session settlements
   */
  @Post('session/:sessionAddress/deposit-frp-payment')
  @HttpCode(HttpStatus.OK)
  async depositFrpPayment(
    @Param('sessionAddress') sessionAddress: string,
    @Body() dto: DepositFrpPaymentDto,
    @AuthenticatedUser() user: any,
    @Query('marketId') marketId?: string,
  ): Promise<{
    statusCode: number;
    data: FrpDepositResponseDto;
    message: string;
  }> {
    this.logger.log(`FRP depositing payment for session ${sessionAddress}`);

    if (!marketId) {
      throw new Error('marketId query parameter is required');
    }

    // Convert Keycloak ID to MongoDB ObjectId
    const userId = await this.getUserIdFromKeycloak(user.sub);

    const result = await this.settlementService.depositFrpPayment(
      sessionAddress,
      userId,
      dto.pin,
      marketId,
    );

    return {
      statusCode: HttpStatus.OK,
      data: {
        success: true,
        transactionHash: result.transactionHash,
        amount: result.amount,
        paymentRequestId: result.paymentRequestId,
      },
      message: 'Funds deposited successfully. Settlements can now be executed.',
    };
  }

  // ============================================================================
  // FMO/LMO Analytics Endpoints
  // ============================================================================

  /**
   * Get fees summary for a specific market (FMO/LMO analytics)
   * Returns total fees collected and breakdown by session
   */
  @Get('market/:marketId/fees-summary')
  async getMarketFeesSummary(
    @Param('marketId') marketId: string,
  ): Promise<{
    statusCode: number;
    data: {
      marketId: string;
      totalFees: string;
      totalSettlements: number;
      executedSettlements: number;
      feesBySession: Array<{
        sessionId: string;
        sessionName?: string;
        sessionAddress: string;
        totalFees: string;
        settlementsCount: number;
      }>;
    };
  }> {
    this.logger.log(`Getting fees summary for market ${marketId}`);

    // Get all executed settlements for this market
    const settlements = await this.settlementService.getSettlementsByMarket(marketId);

    // Calculate total fees
    const totalFees = settlements
      .filter((s) => s.status === 'EXECUTED')
      .reduce((sum, s) => sum + BigInt(s.platformFee), BigInt(0))
      .toString();

    // Group by session
    const sessionMap = new Map<
      string,
      {
        sessionId: string;
        sessionName?: string;
        sessionAddress: string;
        fees: bigint;
        count: number;
      }
    >();

    for (const settlement of settlements.filter((s) => s.status === 'EXECUTED')) {
      const key = settlement.sessionAddress;
      const existing = sessionMap.get(key);

      if (existing) {
        existing.fees += BigInt(settlement.platformFee);
        existing.count++;
      } else {
        const session = settlement.sessionId as any;
        sessionMap.set(key, {
          sessionId: settlement.sessionId?.toString() || '',
          sessionName: session?.name,
          sessionAddress: settlement.sessionAddress,
          fees: BigInt(settlement.platformFee),
          count: 1,
        });
      }
    }

    // Convert map to array
    const feesBySession = Array.from(sessionMap.values()).map((entry) => ({
      sessionId: entry.sessionId,
      sessionName: entry.sessionName,
      sessionAddress: entry.sessionAddress,
      totalFees: entry.fees.toString(),
      settlementsCount: entry.count,
    }));

    // Sort by fees descending
    feesBySession.sort((a, b) => {
      const aFees = BigInt(a.totalFees);
      const bFees = BigInt(b.totalFees);
      if (aFees > bFees) return -1;
      if (aFees < bFees) return 1;
      return 0;
    });

    return {
      statusCode: HttpStatus.OK,
      data: {
        marketId,
        totalFees,
        totalSettlements: settlements.length,
        executedSettlements: settlements.filter((s) => s.status === 'EXECUTED').length,
        feesBySession,
      },
    };
  }

  /**
   * Helper to convert FrpPaymentRequest document to response DTO
   */
  private toFrpPaymentRequestResponseDto(doc: FrpPaymentRequestDocument): FrpPaymentRequestResponseDto {
    const session = doc.session as any;
    const market = doc.market as any;

    return {
      id: doc._id?.toString() || '',
      sessionAddress: doc.sessionAddress,
      sessionName: session?.name,
      marketId: doc.market?.toString() || '',
      marketName: market?.name,
      frpUserId: doc.frpUser?.toString() || '',
      frpAddress: doc.frpAddress,
      requestedByUserId: doc.requestedBy?.toString() || '',
      totalPayment: doc.totalPayment,
      totalPlatformFees: doc.totalPlatformFees,
      totalSettlements: doc.totalSettlements,
      status: doc.status,
      depositTxHash: doc.depositTxHash,
      depositedAt: doc.depositedAt,
      depositedAmount: doc.depositedAmount,
      emailSentAt: doc.emailSentAt,
      emailSentTo: doc.emailSentTo,
      createdAt: doc.createdAt!,
      updatedAt: doc.updatedAt!,
    };
  }
}
