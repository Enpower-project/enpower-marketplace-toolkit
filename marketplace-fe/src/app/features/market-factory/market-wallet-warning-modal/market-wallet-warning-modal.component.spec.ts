import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { of, throwError } from 'rxjs';

import { MarketWalletWarningModalComponent, MarketWalletWarningData } from './market-wallet-warning-modal.component';
import { WalletService, WalletCreationResult } from '../../../core/services/wallet/wallet.service';

describe('MarketWalletWarningModalComponent', () => {
  let component: MarketWalletWarningModalComponent;
  let fixture: ComponentFixture<MarketWalletWarningModalComponent>;
  let mockDialogRef: jasmine.SpyObj<MatDialogRef<MarketWalletWarningModalComponent>>;
  let mockWalletService: jasmine.SpyObj<WalletService>;
  let mockSnackBar: jasmine.SpyObj<MatSnackBar>;

  const mockDialogData: MarketWalletWarningData = {
    marketId: 'test-market-id',
    marketName: 'Test Market'
  };

  const mockWalletResult: WalletCreationResult = {
    pin: '123456',
    commonSecretEncrypted: 'encrypted-secret',
    privateKeyEncrypted: 'encrypted-key',
    publicAddress: '0x1234567890123456789012345678901234567890'
  };

  beforeEach(async () => {
    const dialogRefSpy = jasmine.createSpyObj('MatDialogRef', ['close']);
    const walletServiceSpy = jasmine.createSpyObj('WalletService', ['createMarketWallet']);
    const snackBarSpy = jasmine.createSpyObj('MatSnackBar', ['open']);

    await TestBed.configureTestingModule({
      imports: [MarketWalletWarningModalComponent],
      providers: [
        { provide: MatDialogRef, useValue: dialogRefSpy },
        { provide: MAT_DIALOG_DATA, useValue: mockDialogData },
        { provide: WalletService, useValue: walletServiceSpy },
        { provide: MatSnackBar, useValue: snackBarSpy }
      ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(MarketWalletWarningModalComponent);
    component = fixture.componentInstance;
    mockDialogRef = TestBed.inject(MatDialogRef) as jasmine.SpyObj<MatDialogRef<MarketWalletWarningModalComponent>>;
    mockWalletService = TestBed.inject(WalletService) as jasmine.SpyObj<WalletService>;
    mockSnackBar = TestBed.inject(MatSnackBar) as jasmine.SpyObj<MatSnackBar>;
  });

  beforeEach(() => {
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should initialize with correct data', () => {
    expect(component.data).toEqual(mockDialogData);
    expect(component.isCreatingWallet).toBeFalse();
    expect(component.walletCreated).toBeFalse();
    expect(component.createdWallet).toBeNull();
  });

  it('should display market name in template', () => {
    const compiled = fixture.nativeElement;
    expect(compiled.textContent).toContain('Test Market');
  });

  describe('onCreateWallet', () => {
    it('should create wallet successfully', () => {
      const mockResponse = { success: true, message: 'Success', data: mockWalletResult };
      mockWalletService.createMarketWallet.and.returnValue(of(mockResponse));

      component.onCreateWallet();

      expect(component.isCreatingWallet).toBeTrue();
      expect(mockWalletService.createMarketWallet).toHaveBeenCalledWith(mockDialogData.marketId);

      // Wait for async operation
      setTimeout(() => {
        expect(component.isCreatingWallet).toBeFalse();
        expect(component.walletCreated).toBeTrue();
        expect(component.createdWallet).toEqual(mockWalletResult);
        expect(mockSnackBar.open).toHaveBeenCalledWith(
          'Market wallet created successfully!', 
          'Close', 
          jasmine.any(Object)
        );
      });
    });

    it('should handle wallet creation error', () => {
      const errorMessage = 'Network error';
      mockWalletService.createMarketWallet.and.returnValue(throwError(() => ({ 
        error: { message: errorMessage } 
      })));

      component.onCreateWallet();

      expect(component.isCreatingWallet).toBeTrue();

      // Wait for async operation
      setTimeout(() => {
        expect(component.isCreatingWallet).toBeFalse();
        expect(component.walletCreated).toBeFalse();
        expect(mockSnackBar.open).toHaveBeenCalledWith(
          `Failed to create wallet: ${errorMessage}`, 
          'Close', 
          jasmine.any(Object)
        );
      });
    });

    it('should handle unsuccessful response', () => {
      const mockResponse = { success: false, message: 'Failed to create wallet', data: null };
      mockWalletService.createMarketWallet.and.returnValue(of(mockResponse));

      component.onCreateWallet();

      // Wait for async operation
      setTimeout(() => {
        expect(component.isCreatingWallet).toBeFalse();
        expect(component.walletCreated).toBeFalse();
        expect(mockSnackBar.open).toHaveBeenCalledWith(
          'Failed to create wallet: Failed to create wallet', 
          'Close', 
          jasmine.any(Object)
        );
      });
    });
  });

  describe('onCancel', () => {
    it('should close dialog with walletCreated false', () => {
      component.onCancel();
      
      expect(mockDialogRef.close).toHaveBeenCalledWith({
        walletCreated: false
      });
    });
  });

  describe('onClose', () => {
    it('should close dialog with wallet data', () => {
      component.createdWallet = mockWalletResult;
      
      component.onClose();
      
      expect(mockDialogRef.close).toHaveBeenCalledWith({
        walletCreated: true,
        walletData: mockWalletResult
      });
    });
  });

  describe('copyToClipboard', () => {
    let originalClipboard: any;

    beforeEach(() => {
      originalClipboard = navigator.clipboard;
      Object.assign(navigator, {
        clipboard: {
          writeText: jasmine.createSpy('writeText').and.returnValue(Promise.resolve())
        }
      });
    });

    afterEach(() => {
      Object.assign(navigator, { clipboard: originalClipboard });
    });

    it('should copy text to clipboard and show success message', async () => {
      const testText = 'test-address';

      await component.copyToClipboard(testText);

      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(testText);
      expect(mockSnackBar.open).toHaveBeenCalledWith(
        'Address copied to clipboard', 
        'Close', 
        jasmine.any(Object)
      );
    });

    it('should handle clipboard error', async () => {
      const testText = 'test-address';
      (navigator.clipboard.writeText as jasmine.Spy).and.returnValue(Promise.reject('Error'));

      await component.copyToClipboard(testText);

      expect(mockSnackBar.open).toHaveBeenCalledWith(
        'Failed to copy address', 
        'Close', 
        jasmine.any(Object)
      );
    });
  });
});