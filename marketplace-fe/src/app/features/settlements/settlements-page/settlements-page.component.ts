import { Component, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatChipsModule } from '@angular/material/chips';
import { MatTooltipModule } from '@angular/material/tooltip';
import { SettlementHttpService } from '../../../core/services/settlement/settlement.http.service';
import { MarketSelectionService } from '../../../core/services/market-selection/market-selection.service';
import {
  Settlement,
  SettlementCalculation,
  SettlementStatus,
  SessionSettlementsSummary,
  DeviationType,
  FrpPaymentRequest,
  FrpPaymentRequestStatus,
} from '../../../core/services/settlement/settlement.types';
import { SettlementConfirmModalComponent } from '../settlement-confirm-modal/settlement-confirm-modal.component';
import { ToastNotificationComponent } from '../../../shared/components/toast-notification/toast-notification.component';
import { KeycloakService } from '../../../core/services/keycloak/keycloak.service';
import { UserService } from '../../../core/services/user.service';
import { MarketFactoryService } from '../../market-factory/services/market-factory.service';
import { getKeycloakInstance } from '../../../core/services/keycloak/keycloak-init';
import { MarketAuthService } from '../../../core/services/auth/market-auth.service';
import { SessionService } from '../../../core/services/session/session.service';

/**
 * Settlement management page for Oracle/FMO
 *
 * Shows:
 * - List of offers pending settlement
 * - "Calculate Settlement" button per offer
 * - "Submit Settlement" button (opens modal with PIN)
 * - "Execute Settlement" button (opens modal with PIN)
 * - Status of each settlement
 */

@Component({
  selector: 'app-settlements-page',
  standalone: true,
  imports: [
    CommonModule,
    MatIconModule,
    MatTableModule,
    MatButtonModule,
    MatProgressSpinnerModule,
    MatChipsModule,
    MatTooltipModule,
    SettlementConfirmModalComponent,
  ],
  templateUrl: './settlements-page.component.html',
  styleUrls: ['./settlements-page.component.css']
})
export class SettlementsPageComponent implements OnInit {
  @ViewChild(SettlementConfirmModalComponent) confirmModal!: SettlementConfirmModalComponent;

  sessionAddress: string = '';
  settlements: Settlement[] = [];
  summary: SessionSettlementsSummary | null = null;
  loading = false;
  submittingMeasurementData = false;

  usernamesMap : Map<string, string> = new Map();

  isMarketDeactivated = false;
  finalizingSettlement = false;
  error: string | null = null;
  isFMO: boolean = false;
  isFSP: boolean = false;

  // FRP Payment Request state
  paymentRequest: FrpPaymentRequest | null = null;
  requestingFrpPayment = false;

  // Track if flexibility has been generated
  actualFlexibilityGenerated = false;

  // Settlement workflow step: 0=initial, 1=generated, 2=calculated, 3=submitted, 4=settled
  settlementStep = 0;
  isMarketContextLoaded = false;
  
  // Modal state
  showConfirmModal = false;
  modalAction: 'submit' | 'execute' | 'measurement' = 'submit';
  selectedCalculation: SettlementCalculation | null = null;
  selectedOfferId: number | null = null;

  sessionFinalized = false

  displayedColumns = ['offerId', 'provider' , 'hourSlot', 'bidType', 'deliveredQuantity', 'deviationPercentage', 'collateral', 'payment', 'nft', 'status', 'actions'];

  get randomColor () {
    return `#${Math.floor(Math.random() * 0xFFFFFF).toString(16).padStart(6, '0')}`;
  }

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private settlementService: SettlementHttpService,
    private marketSelectionService: MarketSelectionService,
    private marketFactoryService: MarketFactoryService,
    private marketAuthService: MarketAuthService,
    private keycloakService: KeycloakService,
    private userService: UserService,
    private sessionService: SessionService
  ) { }

  ngOnInit(): void {
    this.isFMO = this.keycloakService.hasRole('FMO_LMO')
    this.isFSP = this.keycloakService.hasRole('FSP')

    this.loading = true;
    
    this.marketAuthService.marketContextReady$.subscribe(isReady => {
      if (isReady) {
        const marketId = this.marketSelectionService.getSelectedMarket();
        if (marketId) {
          this.marketFactoryService.getMarketById(marketId).subscribe({
            next: (market: any) => {
              this.isMarketDeactivated = (market.state || market.status) === 'DEACTIVATED';
              this.isMarketContextLoaded = true;
            },
            error: () => {
              this.isMarketDeactivated = false
              this.isMarketContextLoaded = true;
            }
          });
        }
      }
    });

    this.route.params.subscribe(params => {
      if (params['sessionAddress']) {
        this.sessionAddress = params['sessionAddress'];
        this.loadSettlements();
      }
    });
  }

  loadSettlements(): void {
    if (!this.sessionAddress) return;

    this.loading = true;
    this.error = null;

    const applyLoaded = (allSettlements: Settlement[], summary: any, paymentRequest: any, sessionResponse: any, userId?: string) => {
      let filtered = allSettlements || [];
      // FSP only sees their own offers — applied after data is available
      if (userId) {
        filtered = filtered.filter(s => s.fspUserId === userId);
      }
      this.settlements = filtered;
      this.summary = summary || null;
      this.paymentRequest = paymentRequest || null;

      if (sessionResponse?.data?.status === 'SETTLED') {
        this.sessionFinalized = true;
      }

      const hasDelivered = this.settlements.length > 0 &&
        this.settlements.some(s => s.deliveredQuantity && s.deliveredQuantity !== '0');
      this.actualFlexibilityGenerated = this.actualFlexibilityGenerated || hasDelivered;
      this.updateSettlementStep();
      this.loading = false;
    };

    const loadCore = (userId?: string) => {
      Promise.all([
        this.settlementService.getSessionSettlements(this.sessionAddress).toPromise(),
        this.settlementService.getSessionSettlementsSummary(this.sessionAddress).toPromise(),
        this.settlementService.getPaymentRequest(this.sessionAddress).toPromise(),
        this.sessionService.getSessionByAddress(this.sessionAddress).toPromise()
      ]).then(([settlements, summary, paymentRequest, sessionResponse]) => {
        this.loadUsernames(settlements || [])
        applyLoaded(settlements as Settlement[], summary, paymentRequest, sessionResponse, userId);
      }).catch(err => {
        this.error = err.message || 'Error loading settlements';
        this.loading = false;
      });
    };

    if (this.isFSP) {
      this.userService.getCurrentUser().subscribe({
        next: (response) => loadCore(response.data.id),
        error: () => loadCore()
      });
    } else {
      loadCore();
    }
  }

  areAllSettlementsFinalized(): boolean {
    if (!this.settlements || this.settlements.length === 0) return false;
    return this.settlements.every(
      (s) => s.status === SettlementStatus.EXECUTED || s.status === SettlementStatus.FAILED
    );
  }

async finalizeSession(pin: string): Promise<void> {
  if (!this.sessionAddress) return;

  const marketId = this.marketSelectionService.getSelectedMarket();
  if (!marketId) {
    throw new Error('Market ID is required');
  }

  this.finalizingSettlement = true;
  try {
    const result = await this.settlementService.finalizeSession(
      pin,
      marketId,
      this.sessionAddress,
    ).toPromise();

    if (result) {
      ToastNotificationComponent.show('Session finalized and set to SETTLED.', 'success');
      this.sessionFinalized = true;
      this.settlementStep = 4;
      this.sessionService.clearSessionCache();
    }
  } finally {
    this.finalizingSettlement = false;
  }
  // No loadSettlements() here — onConfirmed handles that
}
  /**
   * Calculates settlements for all offers in the session
   */
  async calculateAllSettlements(): Promise<void> {


    if (this.isMarketDeactivated) {
      ToastNotificationComponent.show('Can not perform this action on a deactivated market', 'warning')
      return;
    }
    if (!this.sessionAddress) return;

    try {
      this.loading = true;
      const result = await this.settlementService.calculateAllSettlements(this.sessionAddress).toPromise();

      if (result) {
        ToastNotificationComponent.show(
          `Calculated: ${result.success} settlements${result.failed > 0 ? ` | Errors: ${result.failed}` : ''}`,
          result.failed > 0 ? 'warning' : 'success'
        );

        // Mark step 2 as complete (before loading settlements to avoid rollback)
        this.settlementStep = Math.max(this.settlementStep, 2);
        this.loadSettlements();
      }
    } catch (err: any) {
      ToastNotificationComponent.show(err.message || 'Error calculating settlements', 'error');
      this.loading = false;
    }
  }

  /**
   * Calculates a settlement (preview)
   */
  async calculateSettlement(offerId: number): Promise<void> {
    try {
      this.loading = true;
      const calculation = await this.settlementService.calculateSettlement(
        this.sessionAddress,
        offerId
      ).toPromise();

      if (calculation) {
        this.selectedCalculation = calculation;
        this.selectedOfferId = offerId;
        this.modalAction = 'submit';
        this.showConfirmModal = true;
      }
    } catch (err: any) {
      ToastNotificationComponent.show(err.message || 'Error calculating settlement', 'error');
    } finally {
      this.loading = false;
    }
  }

  /**
   * Opens modal to submit settlement
   */
  async openSubmitModal(settlement: Settlement): Promise<void> {
    try {
      this.loading = true;
      const calculation = await this.settlementService.calculateSettlement(
        this.sessionAddress,
        settlement.offerId
      ).toPromise();

      if (calculation) {
        this.selectedCalculation = calculation;
        this.selectedOfferId = settlement.offerId;
        this.modalAction = 'submit';
        this.showConfirmModal = true;
      }
    } catch (err: any) {
      ToastNotificationComponent.show(err.message || 'Error calculating settlement', 'error');
    } finally {
      this.loading = false;
    }
  }

  /**
   * Opens modal to execute settlement
   */
  openExecuteModal(settlement: Settlement): void {
    this.selectedCalculation = {
      offerId: settlement.offerId,
      hourSlot: settlement.hourSlot,
      fspUserId: settlement.fspUserId,
      fspAddress: settlement.fspAddress,
      deliveryDate: settlement.deliveryDate,
      committedQuantity: settlement.committedQuantity,
      deliveredQuantity: settlement.deliveredQuantity,
      deviationPercentage: settlement.deviationPercentage,
      penaltyAmount: settlement.penaltyAmount,
      payment: settlement.payment,
      platformFee: settlement.platformFee,
      price: settlement.price,
      meterReadingsHash: settlement.meterReadingsHash,
    };
    this.selectedOfferId = settlement.offerId;
    this.modalAction = 'execute';
    this.showConfirmModal = true;
  }

  /**
   * Closes the modal
   */
  closeModal(): void {
    this.showConfirmModal = false;
    this.selectedCalculation = null;
    this.selectedOfferId = null;
  }

  /**
   * Processes the modal confirmation (submit or execute)
   */
  async onConfirmed(pin: string): Promise<void> {
    if (this.selectedOfferId === null || !this.confirmModal) return;

    this.confirmModal.setSubmitting(true);
    const marketId = this.marketSelectionService.getSelectedMarket();

    try {
      if (this.selectedOfferId === -1) {
        if (!marketId) {
          throw new Error('Market ID is required');
        }
        await this.settlementService.submitMeasurementData(
          this.sessionAddress,
          pin,
          marketId
        ).toPromise();
        // Mark step 3 as complete (measurement data submitted)
        this.settlementStep = 3;
        ToastNotificationComponent.show('Measurement data submitted. Session advanced to SETTLEMENT_PENDING.', 'success');
      } else if (this.selectedOfferId === -2) {
        await this.finalizeSession(pin)
      } else if (this.modalAction === 'submit') {
        await this.settlementService.submitSettlement(
          this.sessionAddress,
          this.selectedOfferId,
          pin,
          marketId || undefined
        ).toPromise();
        ToastNotificationComponent.show('Settlement submitted successfully', 'success');
      } else {
        await this.settlementService.executeSettlement(
          this.sessionAddress,
          this.selectedOfferId,
          pin,
          marketId || undefined
        ).toPromise();
        ToastNotificationComponent.show('Settlement executed successfully', 'success');
      }

      this.closeModal();
      this.loadSettlements();
    } catch (err: any) {
      this.confirmModal.setError(err.error?.message || err.message || 'Transaction error');
      this.confirmModal.setSubmitting(false);
    }
  }

  loadUsernames(settlements: Settlement[]){
    const adresses = [... new Set(settlements.map(s => s.fspAddress).filter(Boolean))]

    adresses.forEach(address => {
      this.userService.getUserByWalletAddress(address).subscribe({
        next: (response) => {
          if(response.success){
            this.usernamesMap.set(address, response.data.username);
          }
        },

        error: (error) =>{
          console.log('There was an error fetching the users', error);
        }
      })
    })
  }

  getUsernameByAddress(address: string): string {
    return this.usernamesMap.get(address) || 'Unknown user';
  }

  /**
   * Gets CSS class for the status
   */
  getStatusClass(status: SettlementStatus): string {
    switch (status) {
      case SettlementStatus.PENDING:
        return 'status-pending';
      case SettlementStatus.CALCULATED:
        return 'status-calculated';
      case SettlementStatus.SUBMITTED:
        return 'status-submitted';
      case SettlementStatus.EXECUTED:
        return 'status-executed';
      case SettlementStatus.FAILED:
        return 'status-failed';
      default:
        return '';
    }
  }

  /**
   * Gets label for the status
   */
  getStatusLabel(status: SettlementStatus): string {
    switch (status) {
      case SettlementStatus.PENDING:
        return 'Pending';
      case SettlementStatus.CALCULATED:
        return 'Calculated';
      case SettlementStatus.SUBMITTED:
        return 'Submitted';
      case SettlementStatus.EXECUTED:
        return 'Executed';
      case SettlementStatus.FAILED:
        return 'Failed';
      default:
        return status;
    }
  }

  /**
   * Formats wei to readable value
   */
  formatWei(wei: string): string {
    if (!wei) return '0';
    const value = parseFloat(wei) / 1e18;
    return value.toFixed(4);
  }

  /**
   * Checks if the settlement can be submitted
   * Requires all 3 steps to be completed first
   */
  canSubmit(settlement: Settlement): boolean {
    if (this.isMarketDeactivated) return false;
    // All 3 steps must be completed: Generate, Calculate, Submit Measurement
    if (this.settlementStep < 3) {
      return false;
    }
    return settlement.status === SettlementStatus.PENDING ||
      settlement.status === SettlementStatus.CALCULATED;
  }

  /**
   * Checks if all settlements have been submitted
   * Used to show FRP Payment Request button
   */
  areAllSettlementsSubmitted(): boolean {
    if (!this.settlements || this.settlements.length === 0) {
      return false;
    }
    return this.settlements.every(
      (s) => s.status === SettlementStatus.SUBMITTED ||
        s.status === SettlementStatus.EXECUTED
    );
  }

  /**
   * Checks if the settlement can be executed
   * Requires FRP Payment to be DEPOSITED
   */
  canExecute(settlement: Settlement): boolean {
    // Can only execute if settlement is SUBMITTED
    if (this.isMarketDeactivated) return false;
    if (settlement.status !== SettlementStatus.SUBMITTED) {
      return false;
    }

    // Can only execute if FRP has deposited payment
    if (!this.paymentRequest || this.paymentRequest.status !== 'DEPOSITED') {
      return false;
    }

    return true;
  }

  /**
   * Gets the tooltip message for Execute button
   */
  getExecuteTooltip(): string {
    if (!this.paymentRequest || this.paymentRequest.status !== 'DEPOSITED') {
      return 'Waiting for FRP payment';
    }
    return 'Execute Settlement';
  }

  /**
   * Opens modal to submit measurement data (advances session to SETTLEMENT_PENDING)
   */
  openSubmitMeasurementDataModal(): void {
    if (this.isMarketDeactivated) {
      ToastNotificationComponent.show('Can not perform this action on a deactivated market', 'warning')
      return;
    }
    this.selectedCalculation = {
      offerId: 0,
      hourSlot: 0,
      fspUserId: '',
      fspAddress: '',
      deliveryDate: new Date().toISOString(),
      committedQuantity: '0',
      deliveredQuantity: '0',
      deviationPercentage: 0,
      penaltyAmount: '0',
      payment: '0',
      platformFee: '0',
      price: '0',
      meterReadingsHash: '',
    };
    this.modalAction = 'measurement';
    this.showConfirmModal = true;
    this.selectedOfferId = -1;
  }

  openFinalizeModal(): void {
    this.selectedCalculation = {
      offerId: 0,
      hourSlot: 0,
      fspUserId: '',
      fspAddress: '',
      deliveryDate: new Date().toISOString(),
      committedQuantity: '0',
      deliveredQuantity: '0',
      deviationPercentage: 0,
      penaltyAmount: '0',
      payment: '0',
      platformFee: '0',
      price: '0',
      meterReadingsHash: '',
    };
    this.modalAction = 'finalize' as any;
    this.showConfirmModal = true;
    this.selectedOfferId = -2;
  }

  /**
   * Submits measurement data to advance session to SETTLEMENT_PENDING
   */
  async submitMeasurementData(pin: string): Promise<void> {
    if (this.isMarketDeactivated) return;
    if (!this.sessionAddress) return;

    const marketId = this.marketSelectionService.getSelectedMarket();
    if (!marketId) {
      ToastNotificationComponent.show('Market ID is required', 'error');
      return;
    }

    try {
      this.submittingMeasurementData = true;
      const result = await this.settlementService.submitMeasurementData(
        this.sessionAddress,
        pin,
        marketId
      ).toPromise();

      if (result) {
        ToastNotificationComponent.show(
          `Measurement data submitted! Session advanced to SETTLEMENT_PENDING. TX: ${result.txHash.slice(0, 10)}...`,
          'success'
        );
        // Mark step 3 as complete
        this.settlementStep = 3;
        this.closeModal();
      }
    } catch (err: any) {
      ToastNotificationComponent.show(
        err.error?.message || err.message || 'Error submitting measurement data',
        'error'
      );
    } finally {
      this.submittingMeasurementData = false;
    }
  }

  /**
   * Gets CSS class for the deviation type
   */
  getDeviationClass(deviationType?: DeviationType): string {
    if (!deviationType) return '';
    switch (deviationType) {
      case DeviationType.OVER_DELIVERY:
        return 'deviation-over';
      case DeviationType.UNDER_DELIVERY:
        return 'deviation-under';
      case DeviationType.EXACT:
        return 'deviation-exact';
      default:
        return '';
    }
  }

  /**
   * Gets label for the deviation type
   */
  getDeviationLabel(deviationType?: DeviationType): string {
    if (!deviationType) return '';
    switch (deviationType) {
      case DeviationType.OVER_DELIVERY:
        return 'Over';
      case DeviationType.UNDER_DELIVERY:
        return 'Under';
      case DeviationType.EXACT:
        return 'Exact';
      default:
        return '';
    }
  }

  // ============================================================================
  // FRP Payment Request Methods
  // ============================================================================

  /**
   * Request FRP to deposit funds for settlement execution
   */
  async requestFrpPayment(): Promise<void> {
    if (!this.sessionAddress) return;

    const marketId = this.marketSelectionService.getSelectedMarket();
    if (!marketId) {
      ToastNotificationComponent.show('Market ID is required', 'error');
      return;
    }

    try {
      this.requestingFrpPayment = true;
      const result = await this.settlementService.requestFrpPayment(
        this.sessionAddress,
        marketId
      ).toPromise();

      if (result) {
        this.paymentRequest = result;
        ToastNotificationComponent.show(
          `Payment request sent to FRP (${result.emailSentTo}). Waiting for deposit of ${this.formatWei(result.totalPayment)} FLEX.`,
          'success'
        );
      }
    } catch (err: any) {
      ToastNotificationComponent.show(
        err.error?.message || err.message || 'Error requesting FRP payment',
        'error'
      );
    } finally {
      this.requestingFrpPayment = false;
    }
  }

  /**
   * Load/refresh payment request status
   */
  async loadPaymentRequest(): Promise<void> {
    if (!this.sessionAddress) return;

    try {
      this.loading = true;
      const result = await this.settlementService.getPaymentRequest(this.sessionAddress).toPromise();
      this.paymentRequest = result || null;
    } catch (err: any) {
    } finally {
      this.loading = false;
    }
  }

  /**
   * Get icon for payment request status
   */
  getPaymentStatusIcon(status: FrpPaymentRequestStatus): string {
    switch (status) {
      case FrpPaymentRequestStatus.PENDING:
        return 'hourglass_empty';
      case FrpPaymentRequestStatus.DEPOSITED:
        return 'check_circle';
      case FrpPaymentRequestStatus.COMPLETED:
        return 'verified';
      case FrpPaymentRequestStatus.CANCELLED:
        return 'cancel';
      case FrpPaymentRequestStatus.EXPIRED:
        return 'schedule';
      default:
        return 'info';
    }
  }

  /**
   * Get CSS class for payment status icon
   */
  getPaymentStatusIconClass(status: FrpPaymentRequestStatus): string {
    switch (status) {
      case FrpPaymentRequestStatus.PENDING:
        return 'icon-pending';
      case FrpPaymentRequestStatus.DEPOSITED:
        return 'icon-success';
      case FrpPaymentRequestStatus.COMPLETED:
        return 'icon-success';
      case FrpPaymentRequestStatus.CANCELLED:
        return 'icon-error';
      case FrpPaymentRequestStatus.EXPIRED:
        return 'icon-warning';
      default:
        return '';
    }
  }
  /**
   * Update settlement step based on current data
   */
  private updateSettlementStep(): void {

  let newStep = 0;

  if (this.sessionFinalized) {
    newStep = 4;
  } else if (this.areAllSettlementsFinalized()) {
    // All settlements are EXECUTED or FAILED → ready to finalize, stay at step 3
    newStep = 3;
  } else if (this.summary && (this.summary.settlementsExecuted > 0 || this.summary.settlementsSubmitted > 0)) {
    newStep = 3;
  } else if (this.summary && this.summary.settlementsCalculated > 0) {
    newStep = 2;
  } else {
    newStep = 1;
  }

  this.settlementStep = Math.max(this.settlementStep, newStep);
}

  /** Check helpers for step state */
  isStepCompleted(step: number): boolean {
    return this.settlementStep >= step;
  }

  isStepActive(step: number): boolean {
    return this.settlementStep === (step - 1);
  }

  isStepLocked(step: number): boolean {
    return this.settlementStep < (step - 1);
  }

  getStepClass(step: number): string {
    if (this.isMarketDeactivated) return 'step-locked';
    if (this.isStepCompleted(step)) return 'step-completed';

    if (step === 4) {
      return this.areAllSettlementsFinalized() ? 'step-active' : 'step-locked';
    }

    if (this.isStepActive(step)) return 'step-active';
    return 'step-locked';
  }
  /**
   * Navigate back to settlement manager (sessions list)
   */
  goBack(): void {
    this.router.navigate(['/settlement-manager']);
  }

  /**
   * Navigate to NFT details
   */
  navigateToNFT(nftId: string): void {
    if (nftId) {
      this.router.navigate(['/nft-certificates', nftId], {
        state: { sessionAddress: this.sessionAddress }
      });
    }
  }

  /**
   * Get bid type label
   */
  getBidTypeLabel(bidType: string): string {
    return bidType === 'UPWARD' ? 'Upward' : bidType === 'DOWNWARD' ? 'Downward' : bidType || '-';
  }

  /**
   * Get bid type class for styling
   */
  getBidTypeClass(bidType: string): string {
    return bidType === 'UPWARD' ? 'bid-type-demand' : bidType === 'DOWNWARD' ? 'bid-type-supply' : '';
  }
}
