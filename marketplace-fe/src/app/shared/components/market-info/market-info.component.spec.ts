import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { of, throwError, BehaviorSubject } from 'rxjs';

import { MarketInfoComponent } from './market-info.component';
import { MarketAuthService } from '../../../core/services/auth/market-auth.service';
import { MarketSelectionService, AvailableMarketsResponse } from '../../../core/services/market-selection/market-selection.service';

describe('MarketInfoComponent', () => {
  let component: MarketInfoComponent;
  let fixture: ComponentFixture<MarketInfoComponent>;
  let mockMarketAuthService: jasmine.SpyObj<MarketAuthService>;
  let mockMarketSelectionService: jasmine.SpyObj<MarketSelectionService>;
  let mockSelectedMarketSubject: BehaviorSubject<string | null>;
  let mockMarketContextReadySubject: BehaviorSubject<boolean>;

  const mockAvailableMarketsResponse: AvailableMarketsResponse = {
    success: true,
    availableMarkets: ['market1', 'market2', 'market3'],
    message: 'Markets loaded successfully'
  };

  const mockCurrentMarketResponse = {
    success: true,
    marketId: 'market1',
    message: 'Current market retrieved'
  };

  beforeEach(async () => {
    mockSelectedMarketSubject = new BehaviorSubject<string | null>('market1');
    mockMarketContextReadySubject = new BehaviorSubject<boolean>(true);

    const marketAuthServiceSpy = jasmine.createSpyObj('MarketAuthService', [
      'isMarketContextReady',
      'getCurrentMarketId',
      'switchMarket'
    ], {
      marketContextReady$: mockMarketContextReadySubject.asObservable()
    });

    const marketSelectionServiceSpy = jasmine.createSpyObj('MarketSelectionService', [
      'getAvailableMarkets',
      'getCurrentMarket',
      'setSelectedMarket',
      'getMarketName'
    ], {
      selectedMarket$: mockSelectedMarketSubject.asObservable()
    });

    await TestBed.configureTestingModule({
      imports: [
        MarketInfoComponent,
        NoopAnimationsModule
      ],
      providers: [
        { provide: MarketAuthService, useValue: marketAuthServiceSpy },
        { provide: MarketSelectionService, useValue: marketSelectionServiceSpy }
      ]
    }).compileComponents();

    mockMarketAuthService = TestBed.inject(MarketAuthService) as jasmine.SpyObj<MarketAuthService>;
    mockMarketSelectionService = TestBed.inject(MarketSelectionService) as jasmine.SpyObj<MarketSelectionService>;

    fixture = TestBed.createComponent(MarketInfoComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('ngOnInit', () => {
    it('should initialize and load markets when market context is ready', () => {
      mockMarketAuthService.isMarketContextReady.and.returnValue(true);
      mockMarketAuthService.getCurrentMarketId.and.returnValue('market1');
      mockMarketSelectionService.getAvailableMarkets.and.returnValue(of(mockAvailableMarketsResponse));
      spyOn(component, 'loadCurrentMarket' as any);
      spyOn(component, 'loadAvailableMarkets' as any);

      component.ngOnInit();

      expect(component['loadCurrentMarket']).toHaveBeenCalled();
      expect(component['loadAvailableMarkets']).toHaveBeenCalled();
    });

    it('should subscribe to selectedMarket$ changes', () => {
      mockMarketAuthService.isMarketContextReady.and.returnValue(true);
      mockMarketAuthService.getCurrentMarketId.and.returnValue('market1');
      mockMarketSelectionService.getAvailableMarkets.and.returnValue(of(mockAvailableMarketsResponse));

      component.ngOnInit();
      mockSelectedMarketSubject.next('market2');

      expect(component.currentMarket).toBe('market2');
      expect(component.isLoading).toBe(false);
      expect(component.hasError).toBe(false);
    });

    it('should subscribe to marketContextReady$ changes', () => {
      mockMarketAuthService.isMarketContextReady.and.returnValue(false);
      mockMarketSelectionService.getCurrentMarket.and.returnValue(of(mockCurrentMarketResponse));
      mockMarketSelectionService.getAvailableMarkets.and.returnValue(of(mockAvailableMarketsResponse));

      component.ngOnInit();

      // Simulate market context becoming ready
      mockMarketAuthService.getCurrentMarketId.and.returnValue('market1');
      mockMarketContextReadySubject.next(true);

      expect(component.currentMarket).toBe('market1');
      expect(component.isLoading).toBe(false);
      expect(component.hasError).toBe(false);
    });
  });

  describe('loadCurrentMarket', () => {
    it('should load current market when context is ready', () => {
      mockMarketAuthService.isMarketContextReady.and.returnValue(true);
      mockMarketAuthService.getCurrentMarketId.and.returnValue('market1');

      component['loadCurrentMarket']();

      expect(component.currentMarket).toBe('market1');
      expect(component.isLoading).toBe(false);
      expect(component.hasError).toBe(false);
    });

    it('should fetch current market from backend when context is not ready', () => {
      mockMarketAuthService.isMarketContextReady.and.returnValue(false);
      mockMarketSelectionService.getCurrentMarket.and.returnValue(of(mockCurrentMarketResponse));

      component['loadCurrentMarket']();

      expect(mockMarketSelectionService.getCurrentMarket).toHaveBeenCalled();
      expect(mockMarketSelectionService.setSelectedMarket).toHaveBeenCalledWith('market1');
      expect(component.currentMarket).toBe('market1');
      expect(component.isLoading).toBe(false);
      expect(component.hasError).toBe(false);
    });

    it('should handle error when fetching current market from backend', () => {
      mockMarketAuthService.isMarketContextReady.and.returnValue(false);
      mockMarketSelectionService.getCurrentMarket.and.returnValue(throwError(() => new Error('Network error')));

      spyOn(console, 'error');
      component['loadCurrentMarket']();

      expect(console.error).toHaveBeenCalledWith('Failed to get current market:', jasmine.any(Error));
      expect(component.isLoading).toBe(false);
      expect(component.hasError).toBe(true);
    });

    it('should set error when no market ID is returned', () => {
      mockMarketAuthService.isMarketContextReady.and.returnValue(false);
      const emptyResponse = { ...mockCurrentMarketResponse, marketId: '' };
      mockMarketSelectionService.getCurrentMarket.and.returnValue(of(emptyResponse));

      component['loadCurrentMarket']();

      expect(component.hasError).toBe(true);
      expect(component.currentMarket).toBe('');
    });
  });

  describe('getMarketDisplayName', () => {
    it('should call market selection service to get market name', () => {
      mockMarketSelectionService.getMarketName.and.returnValue('Test Market Name');

      const result = component.getMarketDisplayName('market1');

      expect(mockMarketSelectionService.getMarketName).toHaveBeenCalledWith('market1');
      expect(result).toBe('Test Market Name');
    });
  });

  describe('getTooltipText', () => {
    beforeEach(() => {
      mockMarketAuthService.isMarketContextReady.and.returnValue(true);
      mockMarketAuthService.getCurrentMarketId.and.returnValue('market1');
      mockMarketSelectionService.getAvailableMarkets.and.returnValue(of(mockAvailableMarketsResponse));
      mockMarketSelectionService.getMarketName.and.returnValue('Test Market 1');
      fixture.detectChanges();
    });

    it('should return switching message when switching market', () => {
      component.isSwitching = true;

      expect(component.getTooltipText()).toBe('Switching market...');
    });

    it('should return switchable tooltip when multiple markets available', () => {
      component.currentMarket = 'market1';
      component.availableMarkets = ['market1', 'market2'];
      component.isSwitching = false;

      expect(component.getTooltipText()).toBe('Current market: Test Market 1 (Click to switch)');
    });

    it('should return simple tooltip when only one market available', () => {
      component.currentMarket = 'market1';
      component.availableMarkets = ['market1'];
      component.isSwitching = false;

      expect(component.getTooltipText()).toBe('Current market: Test Market 1');
    });
  });

  describe('switchToMarket', () => {
    beforeEach(() => {
      component.currentMarket = 'market1';
      component.isSwitching = false;
    });

    it('should not switch if target market is the same as current', () => {
      component.switchToMarket('market1');

      expect(mockMarketAuthService.switchMarket).not.toHaveBeenCalled();
    });

    it('should not switch if already switching', () => {
      component.isSwitching = true;

      component.switchToMarket('market2');

      expect(mockMarketAuthService.switchMarket).not.toHaveBeenCalled();
    });

    it('should successfully switch market', () => {
      mockMarketAuthService.switchMarket.and.returnValue(of(true));
      spyOn(console, 'log');

      component.switchToMarket('market2');

      expect(mockMarketAuthService.switchMarket).toHaveBeenCalledWith('market2');
      expect(component.isSwitching).toBe(false);
      expect(component.currentMarket).toBe('market2');
      expect(console.log).toHaveBeenCalledWith('MarketInfo: Market switched successfully to:', 'market2');
    });

    it('should handle failed market switch', () => {
      mockMarketAuthService.switchMarket.and.returnValue(of(false));
      spyOn(console, 'error');

      component.switchToMarket('market2');

      expect(component.isSwitching).toBe(false);
      expect(console.error).toHaveBeenCalledWith('MarketInfo: Failed to switch market');
    });

    it('should handle market switch error', () => {
      mockMarketAuthService.switchMarket.and.returnValue(throwError(() => new Error('Switch error')));
      spyOn(console, 'error');

      component.switchToMarket('market2');

      expect(component.isSwitching).toBe(false);
      expect(console.error).toHaveBeenCalledWith('MarketInfo: Error switching market:', jasmine.any(Error));
    });
  });

  describe('refreshMarkets', () => {
    it('should refresh available markets successfully', () => {
      mockMarketSelectionService.getAvailableMarkets.and.returnValue(of(mockAvailableMarketsResponse));
      spyOn(console, 'log');

      component.refreshMarkets();

      expect(mockMarketSelectionService.getAvailableMarkets).toHaveBeenCalled();
      expect(component.availableMarkets).toEqual(mockAvailableMarketsResponse.availableMarkets);
      expect(component.loadingMarkets).toBe(false);
      expect(console.log).toHaveBeenCalledWith('MarketInfo: Available markets refreshed:', mockAvailableMarketsResponse);
    });

    it('should handle error when refreshing markets', () => {
      mockMarketSelectionService.getAvailableMarkets.and.returnValue(throwError(() => new Error('Refresh error')));
      spyOn(console, 'error');

      component.refreshMarkets();

      expect(component.loadingMarkets).toBe(false);
      expect(console.error).toHaveBeenCalledWith('MarketInfo: Error refreshing markets:', jasmine.any(Error));
    });
  });

  describe('loadAvailableMarkets', () => {
    it('should load available markets successfully', () => {
      mockMarketSelectionService.getAvailableMarkets.and.returnValue(of(mockAvailableMarketsResponse));
      spyOn(console, 'log');

      component['loadAvailableMarkets']();

      expect(mockMarketSelectionService.getAvailableMarkets).toHaveBeenCalled();
      expect(component.availableMarkets).toEqual(mockAvailableMarketsResponse.availableMarkets);
      expect(console.log).toHaveBeenCalledWith('MarketInfo: Initial available markets:', mockAvailableMarketsResponse);
    });

    it('should handle error when loading available markets', () => {
      mockMarketSelectionService.getAvailableMarkets.and.returnValue(throwError(() => new Error('Load error')));
      spyOn(console, 'error');

      component['loadAvailableMarkets']();

      expect(component.availableMarkets).toEqual([]);
      expect(console.error).toHaveBeenCalledWith('MarketInfo: Error loading available markets:', jasmine.any(Error));
    });
  });

  describe('ngOnDestroy', () => {
    it('should unsubscribe from all subscriptions', () => {
      spyOn(component['subscription'], 'unsubscribe');

      component.ngOnDestroy();

      expect(component['subscription'].unsubscribe).toHaveBeenCalled();
    });
  });

  describe('component integration', () => {
    it('should initialize with correct default values', () => {
      expect(component.currentMarket).toBeNull();
      expect(component.availableMarkets).toEqual([]);
      expect(component.isLoading).toBe(true);
      expect(component.hasError).toBe(false);
      expect(component.loadingMarkets).toBe(false);
      expect(component.isSwitching).toBe(false);
    });

    it('should handle empty available markets response', () => {
      const emptyResponse: AvailableMarketsResponse = {
        success: true,
        availableMarkets: [],
        message: 'No markets available'
      };
      mockMarketSelectionService.getAvailableMarkets.and.returnValue(of(emptyResponse));

      component['loadAvailableMarkets']();

      expect(component.availableMarkets).toEqual([]);
    });

    it('should handle null available markets in response', () => {
      const nullResponse: AvailableMarketsResponse = {
        success: true,
        availableMarkets: null as any,
        message: 'No markets available'
      };
      mockMarketSelectionService.getAvailableMarkets.and.returnValue(of(nullResponse));

      component['loadAvailableMarkets']();

      expect(component.availableMarkets).toEqual([]);
    });
  });
});