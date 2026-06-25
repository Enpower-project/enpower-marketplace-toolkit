import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { of, throwError } from 'rxjs';
import { ProsumerWalletCheckService } from './prosumer-wallet-check.service';
import { WalletService } from './wallet.service';
import { KeycloakService } from '../keycloak/keycloak.service';
import { ProsumerWalletModalComponent } from '../../../shared/components/prosumer-wallet-modal/prosumer-wallet-modal.component';

describe('ProsumerWalletCheckService', () => {
  let service: ProsumerWalletCheckService;
  let mockWalletService: jasmine.SpyObj<WalletService>;
  let mockKeycloakService: jasmine.SpyObj<KeycloakService>;
  let mockDialog: jasmine.SpyObj<MatDialog>;
  let mockDialogRef: jasmine.SpyObj<any>;

  beforeEach(() => {
    const walletServiceSpy = jasmine.createSpyObj('WalletService', ['getWallet']);
    const keycloakServiceSpy = jasmine.createSpyObj('KeycloakService', ['getRoles', 'getUsername']);
    const dialogSpy = jasmine.createSpyObj('MatDialog', ['open']);
    const dialogRefSpy = jasmine.createSpyObj('MatDialogRef', ['afterClosed']);

    TestBed.configureTestingModule({
      providers: [
        ProsumerWalletCheckService,
        { provide: WalletService, useValue: walletServiceSpy },
        { provide: KeycloakService, useValue: keycloakServiceSpy },
        { provide: MatDialog, useValue: dialogSpy }
      ]
    });

    service = TestBed.inject(ProsumerWalletCheckService);
    mockWalletService = TestBed.inject(WalletService) as jasmine.SpyObj<WalletService>;
    mockKeycloakService = TestBed.inject(KeycloakService) as jasmine.SpyObj<KeycloakService>;
    mockDialog = TestBed.inject(MatDialog) as jasmine.SpyObj<MatDialog>;
    mockDialogRef = dialogRefSpy;

    // Setup default dialog behavior
    mockDialog.open.and.returnValue(mockDialogRef);
    mockDialogRef.afterClosed.and.returnValue(of({ walletCreated: false }));
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('checkProsumerWallet', () => {
    it('should return true if already checked wallet', () => {
      // Set the service as having already checked
      service['hasCheckedWallet'] = true;

      service.checkProsumerWallet().subscribe(result => {
        expect(result).toBeTrue();
      });

      expect(mockWalletService.getWallet).not.toHaveBeenCalled();
    });

    it('should return true if dialog is already open', () => {
      service['isDialogOpen'] = true;

      service.checkProsumerWallet().subscribe(result => {
        expect(result).toBeTrue();
      });

      expect(mockWalletService.getWallet).not.toHaveBeenCalled();
    });

    it('should return true if user is not a prosumer', () => {
      mockKeycloakService.getRoles.and.returnValue(['market_owner', 'admin']);

      service.checkProsumerWallet().subscribe(result => {
        expect(result).toBeTrue();
      });

      expect(mockWalletService.getWallet).not.toHaveBeenCalled();
    });

    it('should return true if prosumer already has wallet', () => {
      mockKeycloakService.getRoles.and.returnValue(['prosumer']);
      mockWalletService.getWallet.and.returnValue(of({
        success: true,
        message: 'Success',
        data: { address: '0x123', binding: 'SELF', hasWallet: true }
      }));

      service.checkProsumerWallet().subscribe(result => {
        expect(result).toBeTrue();
      });

      expect(mockWalletService.getWallet).toHaveBeenCalled();
      expect(mockDialog.open).not.toHaveBeenCalled();
    });

    it('should show modal if prosumer has no wallet', () => {
      mockKeycloakService.getRoles.and.returnValue(['prosumer']);
      mockKeycloakService.getUsername.and.returnValue('test-user');
      mockWalletService.getWallet.and.returnValue(of({
        success: true,
        message: 'No wallet found',
        data: { address: null, binding: 'SELF', hasWallet: false }
      }));
      mockDialogRef.afterClosed.and.returnValue(of({ walletCreated: true, walletData: {} }));

      service.checkProsumerWallet().subscribe(result => {
        expect(result).toBeTrue();
      });

      expect(mockWalletService.getWallet).toHaveBeenCalled();
      expect(mockDialog.open).toHaveBeenCalledWith(ProsumerWalletModalComponent, jasmine.any(Object));
    });

    it('should show modal when wallet service returns error', () => {
      mockKeycloakService.getRoles.and.returnValue(['prosumer']);
      mockKeycloakService.getUsername.and.returnValue('test-user');
      mockWalletService.getWallet.and.returnValue(throwError(() => new Error('Network error')));
      mockDialogRef.afterClosed.and.returnValue(of({ walletCreated: false }));

      service.checkProsumerWallet().subscribe(result => {
        expect(result).toBeFalse();
      });

      expect(mockWalletService.getWallet).toHaveBeenCalled();
      expect(mockDialog.open).toHaveBeenCalled();
    });
  });

  describe('resetWalletCheck', () => {
    it('should reset wallet check flags', () => {
      service['hasCheckedWallet'] = true;
      service['isDialogOpen'] = true;

      service.resetWalletCheck();

      expect(service['hasCheckedWallet']).toBeFalse();
      expect(service['isDialogOpen']).toBeFalse();
    });
  });

  describe('forceWalletCheck', () => {
    it('should reset flags and perform wallet check', () => {
      service['hasCheckedWallet'] = true;
      mockKeycloakService.getRoles.and.returnValue(['prosumer']);
      mockWalletService.getWallet.and.returnValue(of({
        success: true,
        message: 'Success',
        data: { address: '0x123', binding: 'SELF', hasWallet: true }
      }));

      service.forceWalletCheck().subscribe(result => {
        expect(result).toBeTrue();
      });

      expect(service['hasCheckedWallet']).toBeTrue(); // Should be set to true after check
      expect(mockWalletService.getWallet).toHaveBeenCalled();
    });
  });

  describe('hasPerformedWalletCheck', () => {
    it('should return false initially', () => {
      expect(service.hasPerformedWalletCheck()).toBeFalse();
    });

    it('should return true after wallet check', () => {
      service['hasCheckedWallet'] = true;
      expect(service.hasPerformedWalletCheck()).toBeTrue();
    });
  });

  describe('isWalletModalOpen', () => {
    it('should return false initially', () => {
      expect(service.isWalletModalOpen()).toBeFalse();
    });

    it('should return true when dialog is open', () => {
      service['isDialogOpen'] = true;
      expect(service.isWalletModalOpen()).toBeTrue();
    });
  });
});