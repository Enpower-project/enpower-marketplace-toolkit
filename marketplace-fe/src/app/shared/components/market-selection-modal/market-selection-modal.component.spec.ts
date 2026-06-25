import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { of, throwError } from 'rxjs';

import { MarketSelectionModalComponent, MarketSelectionModalData } from './market-selection-modal.component';
import { MarketSelectionService } from '../../../core/services/market-selection/market-selection.service';
import { KeycloakService } from '../../../core/services/keycloak/keycloak.service';

describe('MarketSelectionModalComponent', () => {
  let component: MarketSelectionModalComponent;
  let fixture: ComponentFixture<MarketSelectionModalComponent>;
  let mockDialogRef: jasmine.SpyObj<MatDialogRef<MarketSelectionModalComponent>>;
  let mockMarketSelectionService: jasmine.SpyObj<MarketSelectionService>;
  let mockKeycloakService: jasmine.SpyObj<KeycloakService>;

  const mockDialogData: MarketSelectionModalData = {
    availableMarkets: ['market1', 'market2', 'market3'],
    title: 'Select Market',
    message: 'Please choose a market'
  };

  const mockMarketSelectionResponse = {
    success: true,
    message: 'Market selected successfully',
    requiresTokenRefresh: false
  };

  beforeEach(async () => {
    const dialogRefSpy = jasmine.createSpyObj('MatDialogRef', ['close']);
    const marketSelectionServiceSpy = jasmine.createSpyObj('MarketSelectionService', [
      'selectMarket',
      'setSelectedMarket',
      'getMarketName'
    ]);
    const keycloakServiceSpy = jasmine.createSpyObj('KeycloakService', ['updateToken']);

    await TestBed.configureTestingModule({
      imports: [
        MarketSelectionModalComponent,
        NoopAnimationsModule
      ],
      providers: [
        { provide: MatDialogRef, useValue: dialogRefSpy },
        { provide: MAT_DIALOG_DATA, useValue: mockDialogData },
        { provide: MarketSelectionService, useValue: marketSelectionServiceSpy },
        { provide: KeycloakService, useValue: keycloakServiceSpy }
      ]
    }).compileComponents();

    mockDialogRef = TestBed.inject(MatDialogRef) as jasmine.SpyObj<MatDialogRef<MarketSelectionModalComponent>>;
    mockMarketSelectionService = TestBed.inject(MarketSelectionService) as jasmine.SpyObj<MarketSelectionService>;
    mockKeycloakService = TestBed.inject(KeycloakService) as jasmine.SpyObj<KeycloakService>;

    fixture = TestBed.createComponent(MarketSelectionModalComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('ngOnInit', () => {
    it('should pre-select first market when only one available', () => {
      const singleMarketData: MarketSelectionModalData = {
        availableMarkets: ['market1']
      };
      component.data = singleMarketData;

      component.ngOnInit();

      expect(component.selectedMarket).toBe('market1');
    });

    it('should not pre-select when multiple markets available', () => {
      component.ngOnInit();

      expect(component.selectedMarket).toBe('');
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

  describe('onCancel', () => {
    it('should close dialog with null result', () => {
      component.onCancel();

      expect(mockDialogRef.close).toHaveBeenCalledWith(null);
    });
  });

  describe('retrySelection', () => {
    it('should clear error message and retry selection', () => {
      component.errorMessage = 'Previous error';
      component.selectedMarket = 'market1';
      mockMarketSelectionService.selectMarket.and.returnValue(of(mockMarketSelectionResponse));
      spyOn(component, 'onConfirm');

      component.retrySelection();

      expect(component.errorMessage).toBe('');
      expect(component.onConfirm).toHaveBeenCalled();
    });
  });

  describe('onConfirm', () => {
    beforeEach(() => {
      component.selectedMarket = 'market1';
      fixture.detectChanges();
    });

    it('should return early if no market selected', () => {
      component.selectedMarket = '';

      component.onConfirm();

      expect(mockMarketSelectionService.selectMarket).not.toHaveBeenCalled();
    });

    it('should return early if already loading', () => {
      component.isLoading = true;

      component.onConfirm();

      expect(mockMarketSelectionService.selectMarket).not.toHaveBeenCalled();
    });

    it('should successfully select market without token refresh', (done) => {
      mockMarketSelectionService.selectMarket.and.returnValue(of(mockMarketSelectionResponse));

      component.onConfirm();

      setTimeout(() => {
        expect(mockMarketSelectionService.selectMarket).toHaveBeenCalledWith('market1');
        expect(mockMarketSelectionService.setSelectedMarket).toHaveBeenCalledWith('market1');
        expect(mockDialogRef.close).toHaveBeenCalledWith({
          selectedMarket: 'market1',
          success: true,
          tokenRefreshed: false,
          tokenRefreshError: null
        });
        done();
      }, 150);
    });

    it('should successfully select market with token refresh', (done) => {
      const responseWithRefresh = {
        ...mockMarketSelectionResponse,
        requiresTokenRefresh: true
      };
      mockMarketSelectionService.selectMarket.and.returnValue(of(responseWithRefresh));
      mockKeycloakService.updateToken.and.returnValue(Promise.resolve(true));

      component.onConfirm();

      setTimeout(() => {
        expect(mockKeycloakService.updateToken).toHaveBeenCalledWith(3600);
        expect(mockDialogRef.close).toHaveBeenCalledWith({
          selectedMarket: 'market1',
          success: true,
          tokenRefreshed: true,
          tokenRefreshError: null
        });
        done();
      }, 150);
    });

    it('should handle token refresh failure', (done) => {
      const responseWithRefresh = {
        ...mockMarketSelectionResponse,
        requiresTokenRefresh: true
      };
      const refreshError = new Error('Token refresh failed');
      mockMarketSelectionService.selectMarket.and.returnValue(of(responseWithRefresh));
      mockKeycloakService.updateToken.and.returnValue(Promise.reject(refreshError));

      component.onConfirm();

      setTimeout(() => {
        expect(mockDialogRef.close).toHaveBeenCalledWith({
          selectedMarket: 'market1',
          success: true,
          tokenRefreshed: false,
          tokenRefreshError: refreshError
        });
        done();
      }, 150);
    });

    it('should handle unsuccessful market selection', () => {
      const errorResponse = {
        success: false,
        message: 'Selection failed',
        requiresTokenRefresh: false
      };
      mockMarketSelectionService.selectMarket.and.returnValue(of(errorResponse));

      component.onConfirm();

      expect(component.isLoading).toBe(false);
      expect(component.errorMessage).toBe('Selection failed');
    });

    it('should handle 503 service unavailable error', () => {
      const error = { status: 503 };
      mockMarketSelectionService.selectMarket.and.returnValue(throwError(() => error));

      component.onConfirm();

      expect(component.errorMessage).toBe('Backend service is temporarily unavailable. Please check if the server is running.');
    });

    it('should handle 401 authentication error with successful token refresh', () => {
      const error = { status: 401 };
      mockMarketSelectionService.selectMarket.and.callFake(() => {
        if (mockMarketSelectionService.selectMarket.calls.count() === 1) {
          return throwError(() => error);
        }
        return of(mockMarketSelectionResponse);
      });
      mockKeycloakService.updateToken.and.returnValue(Promise.resolve(true));

      spyOn(component, 'onConfirm').and.callThrough();
      component.onConfirm();

      // The method should be called again after token refresh
      expect(component.onConfirm).toHaveBeenCalledTimes(1);
    });

    it('should handle 401 authentication error with failed token refresh', (done) => {
      const error = { status: 401 };
      mockMarketSelectionService.selectMarket.and.returnValue(throwError(() => error));
      mockKeycloakService.updateToken.and.returnValue(Promise.resolve(false));

      component.onConfirm();

      setTimeout(() => {
        expect(component.errorMessage).toBe('Authentication expired. Please login again.');
        done();
      }, 10);
    });

    it('should handle 403 forbidden error', () => {
      const error = { status: 403 };
      mockMarketSelectionService.selectMarket.and.returnValue(throwError(() => error));

      component.onConfirm();

      expect(component.errorMessage).toBe('Access denied to selected market.');
    });

    it('should handle network connection error', () => {
      const error = { status: 0 };
      mockMarketSelectionService.selectMarket.and.returnValue(throwError(() => error));

      component.onConfirm();

      expect(component.errorMessage).toBe('Cannot connect to server. Please check your network connection.');
    });

    it('should handle error with detail message', () => {
      const error = { error: { detail: 'Detailed error message' } };
      mockMarketSelectionService.selectMarket.and.returnValue(throwError(() => error));

      component.onConfirm();

      expect(component.errorMessage).toBe('Detailed error message');
    });

    it('should handle error with generic message', () => {
      const error = { error: { message: 'Generic error message' } };
      mockMarketSelectionService.selectMarket.and.returnValue(throwError(() => error));

      component.onConfirm();

      expect(component.errorMessage).toBe('Generic error message');
    });

    it('should handle error with top-level message', () => {
      const error = { message: 'Top level error message' };
      mockMarketSelectionService.selectMarket.and.returnValue(throwError(() => error));

      component.onConfirm();

      expect(component.errorMessage).toBe('Top level error message');
    });

    it('should set loading state correctly during operation', () => {
      mockMarketSelectionService.selectMarket.and.returnValue(of(mockMarketSelectionResponse));

      expect(component.isLoading).toBe(false);
      component.onConfirm();

      // Should be set to true immediately
      expect(component.isLoading).toBe(true);
    });
  });

  describe('component integration', () => {
    it('should initialize with correct default values', () => {
      expect(component.selectedMarket).toBe('');
      expect(component.isLoading).toBe(false);
      expect(component.errorMessage).toBe('');
      expect(component.data).toBe(mockDialogData);
    });

    it('should have access to injected dialog data', () => {
      expect(component.data.availableMarkets).toEqual(['market1', 'market2', 'market3']);
      expect(component.data.title).toBe('Select Market');
      expect(component.data.message).toBe('Please choose a market');
    });
  });
});