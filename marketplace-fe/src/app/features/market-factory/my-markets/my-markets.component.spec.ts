import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';

import { MyMarketsComponent } from './my-markets.component';
import { MarketFactoryService } from '../services/market-factory.service';
import { MyMarket, MyMarketsResponse } from '../../../shared/models/market-place/market-model';

describe('MyMarketsComponent', () => {
  let component: MyMarketsComponent;
  let fixture: ComponentFixture<MyMarketsComponent>;
  let mockMarketFactoryService: jasmine.SpyObj<MarketFactoryService>;
  let mockRouter: jasmine.SpyObj<Router>;

  const mockMarketData: MyMarket[] = [
    {
      id: 'market1',
      marketName: 'Test Market 1',
      state: 'ACTIVE_ONCHAIN',
      creationDate: '2024-01-15T10:00:00Z',
      description: 'Test market description',
      marketType: 'ENERGY',
      isActive: true
    },
    {
      id: 'market2',
      marketName: 'Test Market 2',
      state: 'PENDING_ACTIVATION',
      creationDate: '2024-01-10T08:30:00Z',
      description: 'Another test market',
      marketType: 'ENERGY',
      isActive: false
    }
  ];

  const mockMyMarketsResponse: MyMarketsResponse = {
    success: true,
    data: {
      markets: mockMarketData,
      count: 2,
      userEmail: 'test@example.com'
    },
    message: 'Success'
  };

  beforeEach(async () => {
    const marketFactoryServiceSpy = jasmine.createSpyObj('MarketFactoryService', ['getMyMarkets']);
    const routerSpy = jasmine.createSpyObj('Router', ['navigate']);

    await TestBed.configureTestingModule({
      imports: [
        MyMarketsComponent,
        NoopAnimationsModule
      ],
      providers: [
        { provide: MarketFactoryService, useValue: marketFactoryServiceSpy },
        { provide: Router, useValue: routerSpy }
      ]
    }).compileComponents();

    mockMarketFactoryService = TestBed.inject(MarketFactoryService) as jasmine.SpyObj<MarketFactoryService>;
    mockRouter = TestBed.inject(Router) as jasmine.SpyObj<Router>;

    fixture = TestBed.createComponent(MyMarketsComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    mockMarketFactoryService.getMyMarkets.and.returnValue(of(mockMyMarketsResponse));
    expect(component).toBeTruthy();
  });

  describe('ngOnInit', () => {
    it('should call loadMyMarkets on init', () => {
      mockMarketFactoryService.getMyMarkets.and.returnValue(of(mockMyMarketsResponse));
      spyOn(component, 'loadMyMarkets');

      component.ngOnInit();

      expect(component.loadMyMarkets).toHaveBeenCalled();
    });
  });

  describe('loadMyMarkets', () => {
    it('should load markets successfully', () => {
      mockMarketFactoryService.getMyMarkets.and.returnValue(of(mockMyMarketsResponse));

      component.loadMyMarkets();

      expect(component.loading).toBe(false);
      expect(component.markets).toEqual(mockMarketData);
      expect(component.userInfo).toEqual({
        count: 2,
        userEmail: 'test@example.com'
      });
      expect(component.error).toBeNull();
    });

    it('should handle service error response', () => {
      const errorResponse: MyMarketsResponse = {
        success: false,
        data: { markets: [], count: 0, userEmail: '' },
        message: 'Service error'
      };
      mockMarketFactoryService.getMyMarkets.and.returnValue(of(errorResponse));

      component.loadMyMarkets();

      expect(component.loading).toBe(false);
      expect(component.error).toBe('Service error');
    });

    it('should handle HTTP error', () => {
      const httpError = new Error('Network error');
      mockMarketFactoryService.getMyMarkets.and.returnValue(throwError(() => httpError));

      component.loadMyMarkets();

      expect(component.loading).toBe(false);
      expect(component.error).toBe('Failed to load your markets. Please try again.');
    });

    it('should set loading state correctly', () => {
      mockMarketFactoryService.getMyMarkets.and.returnValue(of(mockMyMarketsResponse));

      expect(component.loading).toBe(false);
      component.loadMyMarkets();
      // Loading should be set to true at the start
      expect(mockMarketFactoryService.getMyMarkets).toHaveBeenCalled();
    });
  });

  describe('getStatusClass', () => {
    it('should return correct CSS class for CREATED_OFFLINE', () => {
      expect(component.getStatusClass('CREATED_OFFLINE')).toBe('status-created');
    });

    it('should return correct CSS class for PENDING_ACTIVATION', () => {
      expect(component.getStatusClass('PENDING_ACTIVATION')).toBe('status-pending');
    });

    it('should return correct CSS class for ACTIVE_ONCHAIN', () => {
      expect(component.getStatusClass('ACTIVE_ONCHAIN')).toBe('status-active');
    });

    it('should return empty string for unknown status', () => {
      expect(component.getStatusClass('UNKNOWN_STATUS')).toBe('');
    });
  });

  describe('getStatusLabel', () => {
    it('should return correct label for CREATED_OFFLINE', () => {
      expect(component.getStatusLabel('CREATED_OFFLINE')).toBe('Created');
    });

    it('should return correct label for PENDING_ACTIVATION', () => {
      expect(component.getStatusLabel('PENDING_ACTIVATION')).toBe('Pending');
    });

    it('should return correct label for ACTIVE_ONCHAIN', () => {
      expect(component.getStatusLabel('ACTIVE_ONCHAIN')).toBe('Active');
    });

    it('should return original state for unknown status', () => {
      expect(component.getStatusLabel('UNKNOWN_STATUS')).toBe('UNKNOWN_STATUS');
    });
  });

  describe('isMarketActive', () => {
    it('should return true for ACTIVE_ONCHAIN market', () => {
      const activeMarket = mockMarketData[0]; // ACTIVE_ONCHAIN
      expect(component.isMarketActive(activeMarket)).toBe(true);
    });

    it('should return false for non-active market', () => {
      const pendingMarket = mockMarketData[1]; // PENDING_ACTIVATION
      expect(component.isMarketActive(pendingMarket)).toBe(false);
    });
  });

  describe('formatDate', () => {
    it('should format date string correctly', () => {
      const dateString = '2024-01-15T10:00:00Z';
      const expectedDate = new Date(dateString).toLocaleDateString();

      expect(component.formatDate(dateString)).toBe(expectedDate);
    });
  });

  describe('navigation methods', () => {
    beforeEach(() => {
      mockMarketFactoryService.getMyMarkets.and.returnValue(of(mockMyMarketsResponse));
      fixture.detectChanges();
    });

    it('should navigate to market details when viewMarket is called', () => {
      const market = mockMarketData[0];

      component.viewMarket(market);

      expect(mockRouter.navigate).toHaveBeenCalledWith(['/markets', market.id]);
    });

    it('should navigate to edit market when editMarket is called', () => {
      const market = mockMarketData[0];

      component.editMarket(market);

      expect(mockRouter.navigate).toHaveBeenCalledWith(
        ['/markets/edit', market.id],
        { state: { marketData: market } }
      );
    });

    it('should navigate to create market when createNewMarket is called', () => {
      component.createNewMarket();

      expect(mockRouter.navigate).toHaveBeenCalledWith(['/markets/create']);
    });
  });

  describe('component integration', () => {
    it('should initialize with correct default values', () => {
      expect(component.markets).toEqual([]);
      expect(component.loading).toBe(false);
      expect(component.error).toBeNull();
      expect(component.userInfo).toBeNull();
    });

    it('should handle empty markets response', () => {
      const emptyResponse: MyMarketsResponse = {
        success: true,
        data: {
          markets: [],
          count: 0,
          userEmail: 'test@example.com'
        },
        message: 'No markets found'
      };
      mockMarketFactoryService.getMyMarkets.and.returnValue(of(emptyResponse));

      component.loadMyMarkets();

      expect(component.markets).toEqual([]);
      expect(component.userInfo).toEqual({
        count: 0,
        userEmail: 'test@example.com'
      });
      expect(component.error).toBeNull();
    });
  });
});