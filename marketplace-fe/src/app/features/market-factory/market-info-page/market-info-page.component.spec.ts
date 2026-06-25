import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatChipsModule } from '@angular/material/chips';
import { MatDividerModule } from '@angular/material/divider';
import { MatTooltipModule } from '@angular/material/tooltip';
import { of } from 'rxjs';

import { MarketInfoPageComponent } from './market-info-page.component';
import { MarketAuthService } from '../../../core/services/auth/market-auth.service';
import { MarketSelectionService } from '../../../core/services/market-selection/market-selection.service';
import { MarketFactoryService } from '../services/market-factory.service';
import { WalletService } from '../../../core/services/wallet/wallet.service';

describe('MarketInfoPageComponent', () => {
  let component: MarketInfoPageComponent;
  let fixture: ComponentFixture<MarketInfoPageComponent>;
  let mockMarketAuthService: jasmine.SpyObj<MarketAuthService>;
  let mockMarketSelectionService: jasmine.SpyObj<MarketSelectionService>;
  let mockMarketFactoryService: jasmine.SpyObj<MarketFactoryService>;
  let mockWalletService: jasmine.SpyObj<WalletService>;
  let mockDialog: jasmine.SpyObj<MatDialog>;

  beforeEach(async () => {
    const marketAuthServiceSpy = jasmine.createSpyObj('MarketAuthService', ['getSelectedMarketId']);
    const marketSelectionServiceSpy = jasmine.createSpyObj('MarketSelectionService', ['getCurrentMarketId', 'getSelectedMarket']);
    const marketFactoryServiceSpy = jasmine.createSpyObj('MarketFactoryService', ['getMyMarkets']);
    const walletServiceSpy = jasmine.createSpyObj('WalletService', ['checkWalletStatus', 'createWallet']);
    const dialogSpy = jasmine.createSpyObj('MatDialog', ['open']);

    await TestBed.configureTestingModule({
      imports: [
        MarketInfoPageComponent,
        MatCardModule,
        MatIconModule,
        MatButtonModule,
        MatProgressSpinnerModule,
        MatChipsModule,
        MatDividerModule,
        MatTooltipModule
      ],
      providers: [
        { provide: MarketAuthService, useValue: marketAuthServiceSpy },
        { provide: MarketSelectionService, useValue: marketSelectionServiceSpy },
        { provide: MarketFactoryService, useValue: marketFactoryServiceSpy },
        { provide: WalletService, useValue: walletServiceSpy },
        { provide: MatDialog, useValue: dialogSpy }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(MarketInfoPageComponent);
    component = fixture.componentInstance;

    mockMarketAuthService = TestBed.inject(MarketAuthService) as jasmine.SpyObj<MarketAuthService>;
    mockMarketSelectionService = TestBed.inject(MarketSelectionService) as jasmine.SpyObj<MarketSelectionService>;
    mockMarketFactoryService = TestBed.inject(MarketFactoryService) as jasmine.SpyObj<MarketFactoryService>;
    mockWalletService = TestBed.inject(WalletService) as jasmine.SpyObj<WalletService>;
    mockDialog = TestBed.inject(MatDialog) as jasmine.SpyObj<MatDialog>;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should initialize with default values', () => {
    expect(component.currentMarketId).toBeNull();
    expect(component.marketDetails).toBeNull();
    expect(component.isLoading).toBeFalse();
    expect(component.hasError).toBeFalse();
    expect(component.errorMessage).toBe('');
    expect(component.isCheckingWallet).toBeFalse();
  });

  it('should call loadMarketInfo on init', () => {
    spyOn(component, 'loadMarketInfo');
    component.ngOnInit();
    expect(component.loadMarketInfo).toHaveBeenCalled();
  });

  it('should unsubscribe on destroy', () => {
    spyOn(component['subscription'], 'unsubscribe').and.stub();
    component.ngOnDestroy();
    expect(component['subscription'].unsubscribe).toHaveBeenCalled();
  });

  it('should return correct status class', () => {
    expect(component.getStatusClass('ACTIVE_ONCHAIN')).toBe('status-active');
    expect(component.getStatusClass('PENDING')).toBe('status-pending');
    expect(component.getStatusClass('INACTIVE')).toBe('status-inactive');
    expect(component.getStatusClass('UNKNOWN')).toBe('status-default');
  });

  it('should return correct status icon', () => {
    expect(component.getStatusIcon('ACTIVE_ONCHAIN')).toBe('check_circle');
    expect(component.getStatusIcon('PENDING')).toBe('hourglass_empty');
    expect(component.getStatusIcon('INACTIVE')).toBe('cancel');
    expect(component.getStatusIcon('UNKNOWN')).toBe('help');
  });

  it('should return correct status label', () => {
    expect(component.getStatusLabel('ACTIVE_ONCHAIN')).toBe('Active on Blockchain');
    expect(component.getStatusLabel('PENDING')).toBe('Pending Activation');
    expect(component.getStatusLabel('INACTIVE')).toBe('Inactive');
    expect(component.getStatusLabel('UNKNOWN')).toBe('Unknown');
  });

  it('should handle clipboard copy', async () => {
    spyOn(navigator.clipboard, 'writeText').and.returnValue(Promise.resolve());

    await component.copyToClipboard('test-text');

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('test-text');
  });
});