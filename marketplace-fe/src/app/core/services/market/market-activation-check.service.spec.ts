import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { of, throwError } from 'rxjs';
import { MarketActivationCheckService } from './market-activation-check.service';
import { MarketFactoryService } from '../../../features/market-factory/services/market-factory.service';
import { KeycloakService } from '../keycloak/keycloak.service';
import { MyMarketsResponse } from '../../../shared/models/market-place/market-model';

describe('MarketActivationCheckService', () => {
  let service: MarketActivationCheckService;
  let mockMarketService: jasmine.SpyObj<MarketFactoryService>;
  let mockKeycloakService: jasmine.SpyObj<KeycloakService>;
  let mockDialog: jasmine.SpyObj<MatDialog>;

  beforeEach(() => {
    const marketServiceSpy = jasmine.createSpyObj('MarketFactoryService', ['getMyMarkets']);
    const keycloakServiceSpy = jasmine.createSpyObj('KeycloakService', ['getRoles']);
    const dialogSpy = jasmine.createSpyObj('MatDialog', ['open']);

    TestBed.configureTestingModule({
      providers: [
        MarketActivationCheckService,
        { provide: MarketFactoryService, useValue: marketServiceSpy },
        { provide: KeycloakService, useValue: keycloakServiceSpy },
        { provide: MatDialog, useValue: dialogSpy }
      ]
    });

    service = TestBed.inject(MarketActivationCheckService);
    mockMarketService = TestBed.inject(MarketFactoryService) as jasmine.SpyObj<MarketFactoryService>;
    mockKeycloakService = TestBed.inject(KeycloakService) as jasmine.SpyObj<KeycloakService>;
    mockDialog = TestBed.inject(MatDialog) as jasmine.SpyObj<MatDialog>;
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should return true for non-market owner users', () => {
    mockKeycloakService.getRoles.and.returnValue(['prosumer']);

    service.checkMarketActivation().subscribe(result => {
      expect(result).toBe(true);
    });

    expect(mockMarketService.getMyMarkets).not.toHaveBeenCalled();
  });

  it('should return true when no markets need activation', () => {
    mockKeycloakService.getRoles.and.returnValue(['market_owner']);

    const mockResponse: MyMarketsResponse = {
      success: true,
      data: {
        markets: [{
          id: '1',
          name: 'Test Market',
          description: 'Test',
          state: 'ACTIVE_ONCHAIN',
          region: 'Test Region',
          isActive: true,
          createdAt: '2024-01-01',
          marketOwner: {} as any
        }],
        count: 1,
        userId: 'user1',
        userEmail: 'test@test.com'
      },
      message: 'Success'
    };

    mockMarketService.getMyMarkets.and.returnValue(of(mockResponse));

    service.checkMarketActivation().subscribe(result => {
      expect(result).toBe(true);
    });

    expect(mockMarketService.getMyMarkets).toHaveBeenCalled();
    expect(mockDialog.open).not.toHaveBeenCalled();
  });

  it('should show modal when markets need activation', () => {
    mockKeycloakService.getRoles.and.returnValue(['market_owner']);

    const mockResponse: MyMarketsResponse = {
      success: true,
      data: {
        markets: [{
          id: '1',
          name: 'Test Market',
          description: 'Test',
          state: 'WALLET_CREATED_PENDING_ACTIVATION',
          region: 'Test Region',
          isActive: false,
          createdAt: '2024-01-01',
          marketOwner: {} as any
        }],
        count: 1,
        userId: 'user1',
        userEmail: 'test@test.com'
      },
      message: 'Success'
    };

    const mockDialogRef = {
      afterClosed: () => of({ marketActivated: true })
    };

    mockMarketService.getMyMarkets.and.returnValue(of(mockResponse));
    mockDialog.open.and.returnValue(mockDialogRef as any);

    service.checkMarketActivation().subscribe(result => {
      expect(result).toBe(true);
    });

    expect(mockDialog.open).toHaveBeenCalled();
  });

  it('should handle errors gracefully', () => {
    mockKeycloakService.getRoles.and.returnValue(['market_owner']);
    mockMarketService.getMyMarkets.and.returnValue(throwError(() => new Error('API Error')));

    service.checkMarketActivation().subscribe(result => {
      expect(result).toBe(true);
    });

    expect(mockDialog.open).not.toHaveBeenCalled();
  });

  it('should reset check flags', () => {
    service.resetActivationCheck();

    expect(service.hasPerformedActivationCheck()).toBe(false);
    expect(service.isActivationModalOpen()).toBe(false);
  });
});
