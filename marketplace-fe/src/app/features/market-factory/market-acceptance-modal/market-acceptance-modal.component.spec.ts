import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { of, throwError } from 'rxjs';

import { MarketAcceptanceModalComponent, MarketAcceptanceModalData, PendingMarket } from './market-acceptance-modal.component';
import { MarketFactoryService } from '../services/market-factory.service';
import { MarketState } from '../enums/market-enums';

describe('MarketAcceptanceModalComponent', () => {
  let component: MarketAcceptanceModalComponent;
  let fixture: ComponentFixture<MarketAcceptanceModalComponent>;
  let mockDialogRef: jasmine.SpyObj<MatDialogRef<MarketAcceptanceModalComponent>>;
  let mockmarketFactoryService: jasmine.SpyObj<MarketFactoryService>;
  let mockSnackBar: jasmine.SpyObj<MatSnackBar>;

  const mockPendingMarkets: PendingMarket[] = [
    {
      id: '1',
      name: 'Test Market 1',
      description: 'Test description 1',
      state: MarketState.CREATED_OFFLINE_PENDING_ACCEPTATION,
      createdAt: '2024-01-01T00:00:00.000Z'
    },
    {
      id: '2',
      name: 'Test Market 2',
      description: 'Test description 2',
      state: MarketState.CREATED_OFFLINE_PENDING_ACCEPTATION,
      createdAt: '2024-01-02T00:00:00.000Z'
    }
  ];

  const mockDialogData: MarketAcceptanceModalData = {
    pendingMarkets: mockPendingMarkets,
    userEmail: 'test@example.com'
  };

  beforeEach(async () => {
    mockDialogRef = jasmine.createSpyObj('MatDialogRef', ['close']);
    mockmarketFactoryService = jasmine.createSpyObj('MarketFactoryService', ['acceptMarket', 'rejectMarket']);
    mockSnackBar = jasmine.createSpyObj('MatSnackBar', ['open']);

    await TestBed.configureTestingModule({
      imports: [MarketAcceptanceModalComponent, NoopAnimationsModule],
      providers: [
        { provide: MatDialogRef, useValue: mockDialogRef },
        { provide: MAT_DIALOG_DATA, useValue: mockDialogData },
        { provide: MarketFactoryService, useValue: mockmarketFactoryService },
        { provide: MatSnackBar, useValue: mockSnackBar }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(MarketAcceptanceModalComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should initialize with correct data', () => {
    expect(component.data).toBe(mockDialogData);
    expect(component.acceptedMarkets.size).toBe(0);
    expect(component.rejectedMarkets.size).toBe(0);
    expect(component.isProcessing).toBe(false);
  });

  it('should display pending markets correctly', () => {
    const marketCards = fixture.debugElement.nativeElement.querySelectorAll('.market-card');
    expect(marketCards.length).toBe(2);

    const firstCardTitle = marketCards[0].querySelector('mat-card-title');
    expect(firstCardTitle.textContent).toContain('Test Market 1');
  });

  it('should handle successful market acceptance', () => {
    const mockResponse = { success: true, data: { market: { id: '1', name: 'Test Market 1' } } };
    mockmarketFactoryService.acceptMarket.and.returnValue(of(mockResponse));

    component.acceptMarket(mockPendingMarkets[0]);

    expect(mockmarketFactoryService.acceptMarket).toHaveBeenCalledWith('1');
    expect(component.acceptedMarkets.has('1')).toBe(true);
    expect(mockSnackBar.open).toHaveBeenCalledWith(
      'Market "Test Market 1" accepted successfully',
      'Close',
      jasmine.any(Object)
    );
  });

  it('should handle market acceptance error', () => {
    const mockError = { message: 'Network error' };
    mockmarketFactoryService.acceptMarket.and.returnValue(throwError(() => mockError));

    component.acceptMarket(mockPendingMarkets[0]);

    expect(component.acceptedMarkets.has('1')).toBe(false);
    expect(mockSnackBar.open).toHaveBeenCalledWith(
      'Error accepting market "Test Market 1": Network error',
      'Close',
      jasmine.any(Object)
    );
  });

  it('should handle successful market rejection', () => {
    const mockResponse = { success: true, data: { market: { id: '1', name: 'Test Market 1' } } };
    mockmarketFactoryService.rejectMarket.and.returnValue(of(mockResponse));

    component.rejectMarket(mockPendingMarkets[0]);

    expect(mockmarketFactoryService.rejectMarket).toHaveBeenCalledWith('1');
    expect(component.rejectedMarkets.has('1')).toBe(true);
    expect(mockSnackBar.open).toHaveBeenCalledWith(
      'Market "Test Market 1" rejected successfully',
      'Close',
      jasmine.any(Object)
    );
  });

  it('should close dialog with postponed result', () => {
    component.acceptMarket(mockPendingMarkets[0]);
    fixture.detectChanges();

    component.postpone();

    expect(mockDialogRef.close).toHaveBeenCalledWith({
      postponed: true,
      acceptedMarkets: ['1'],
      rejectedMarkets: []
    });
  });

  it('should close dialog with completed result', () => {
    component.acceptMarket(mockPendingMarkets[0]);
    component.rejectMarket(mockPendingMarkets[1]);
    fixture.detectChanges();

    component.close();

    expect(mockDialogRef.close).toHaveBeenCalledWith({
      completed: true,
      acceptedMarkets: ['1'],
      rejectedMarkets: ['2']
    });
  });

  it('should return correct state display', () => {
    expect(component.getStateDisplay(MarketState.CREATED_OFFLINE_PENDING_ACCEPTATION))
      .toBe('Pending Acceptance');
    expect(component.getStateDisplay(MarketState.CREATED_OFFLINE_ACCEPTED))
      .toBe('Accepted');
    expect(component.getStateDisplay(MarketState.CREATED_OFFLINE_REJECTED))
      .toBe('Rejected');
    expect(component.getStateDisplay(MarketState.CREATED_OFFLINE_EXPIRED))
      .toBe('Expired');
    expect(component.getStateDisplay('UNKNOWN_STATE'))
      .toBe('UNKNOWN_STATE');
  });

  it('should track markets by id', () => {
    const result = component.trackByMarketId(0, mockPendingMarkets[0]);
    expect(result).toBe('1');
  });
});
