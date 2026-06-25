import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { of, throwError } from 'rxjs';

import { MarketActivationWarningModalComponent, MarketActivationWarningData } from './market-activation-warning-modal.component';
import { MarketFactoryService } from '../services/market-factory.service';

describe('MarketActivationWarningModalComponent', () => {
  let component: MarketActivationWarningModalComponent;
  let fixture: ComponentFixture<MarketActivationWarningModalComponent>;
  let mockDialogRef: jasmine.SpyObj<MatDialogRef<MarketActivationWarningModalComponent>>;
  let mockmarketFactoryService: jasmine.SpyObj<MarketFactoryService>;
  let mockSnackBar: jasmine.SpyObj<MatSnackBar>;

  const mockDialogData: MarketActivationWarningData = {
    marketId: 'test-market-id',
    marketName: 'Test Market',
    marketDescription: 'Test market description',
    region: 'Test Region'
  };

  beforeEach(async () => {
    const dialogRefSpy = jasmine.createSpyObj('MatDialogRef', ['close']);
    const marketFactoryServiceSpy = jasmine.createSpyObj('MarketFactoryService', ['activateMarket']);
    const snackBarSpy = jasmine.createSpyObj('MatSnackBar', ['open']);

    await TestBed.configureTestingModule({
      imports: [MarketActivationWarningModalComponent],
      providers: [
        { provide: MatDialogRef, useValue: dialogRefSpy },
        { provide: MAT_DIALOG_DATA, useValue: mockDialogData },
        { provide: MarketFactoryService, useValue: marketFactoryServiceSpy },
        { provide: MatSnackBar, useValue: snackBarSpy }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(MarketActivationWarningModalComponent);
    component = fixture.componentInstance;
    mockDialogRef = TestBed.inject(MatDialogRef) as jasmine.SpyObj<MatDialogRef<MarketActivationWarningModalComponent>>;
    mockmarketFactoryService = TestBed.inject(MarketFactoryService) as jasmine.SpyObj<MarketFactoryService>;
    mockSnackBar = TestBed.inject(MatSnackBar) as jasmine.SpyObj<MatSnackBar>;

    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should display market information', () => {
    expect(component.data).toEqual(mockDialogData);
  });

  it('should activate market successfully', () => {
    const mockResponse = {
      success: true,
      data: {
        txHash: '0x123',
        newContractAddress: '0x456'
      },
      message: 'Success'
    };

    mockmarketFactoryService.activateMarket.and.returnValue(of(mockResponse));

    component.onActivateMarket();

    expect(component.isActivatingMarket).toBe(false);
    expect(component.marketActivated).toBe(true);
    expect(component.activationData).toEqual({
      txHash: '0x123',
      contractAddress: '0x456'
    });
    expect(mockSnackBar.open).toHaveBeenCalledWith(
      'Market activated successfully on blockchain!',
      'Close',
      jasmine.any(Object)
    );
  });

  it('should handle activation error', () => {
    const mockError = {
      error: { message: 'Activation failed' }
    };

    mockmarketFactoryService.activateMarket.and.returnValue(throwError(() => mockError));

    component.onActivateMarket();

    expect(component.isActivatingMarket).toBe(false);
    expect(component.marketActivated).toBe(false);
    expect(mockSnackBar.open).toHaveBeenCalledWith(
      'Failed to activate market: Activation failed',
      'Close',
      jasmine.any(Object)
    );
  });

  it('should close dialog on cancel', () => {
    component.onCancel();

    expect(mockDialogRef.close).toHaveBeenCalledWith({
      marketActivated: false
    });
  });

  it('should close dialog with success data', () => {
    component.activationData = {
      txHash: '0x123',
      contractAddress: '0x456'
    };

    component.onClose();

    expect(mockDialogRef.close).toHaveBeenCalledWith({
      marketActivated: true,
      activationData: component.activationData
    });
  });
});
