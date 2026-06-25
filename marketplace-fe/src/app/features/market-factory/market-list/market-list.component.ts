import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatTableModule } from '@angular/material/table';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Market } from '../../../shared/models/market-place/market-model';
import { MarketFactoryService } from '../services/market-factory.service';
import { Router, RouterModule } from '@angular/router';
import { UserService } from '../../../core/services/user/user.service';
import { Observable, of } from 'rxjs';
import { map } from 'rxjs/operators';
import { MarketUsersViewComponent } from '../market-users-view/market-users-view.component';
import { InviteUserModalComponent } from '../../../shared/components/invite-user-modal/invite-user-modal.component';
import { InviteUserDialogData } from '../../../shared/models/invitation.model';
import { InvitationService } from '../../../core/services/invitation/invitation.service';
import { ConfirmationDialogComponent, ConfirmationDialogResult } from '../../../shared/components/confirmation-dialog/confirmation-dialog.component';

@Component({
  selector: 'app-market-list',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatTableModule,
    MatIconModule,
    MatSelectModule,
    MatDialogModule,
    MatTooltipModule,
    MatProgressSpinnerModule,
    RouterModule,
  ],
  templateUrl: './market-list.component.html',
  styleUrl: './market-list.component.css'
})
export class MarketListComponent implements OnInit {
  markets: Market[] = [];
  filteredMarkets: Market[] = [];
  searchTerm = '';
  selectedStates: string[] = [];
  allStates: string[] = ['Active', 'Inactive', 'Retired'];
  displayedColumns: string[] = ['name', 'description', 'region', 'owner', 'state', 'actions'];
  isLoading = false;

  constructor(
    private marketFactoryService: MarketFactoryService,
    private router: Router,
    private userService: UserService,
    private dialog: MatDialog,
    private invitationService: InvitationService
  ) { }

  ngOnInit(): void {
    this.loadMarkets();
  }

  loadMarkets(): void {
    this.isLoading = true;
    this.marketFactoryService.getMarkets().subscribe({
      next: (markets) => {
        this.markets = markets;
        this.filterMarkets();
        this.isLoading = false;
      },
      error: (error) => {
        this.isLoading = false;
      }
    });
  }

  createNewMarket(): void {
    this.router.navigate(['/markets/create']);
  }

  delete(market: Market): void {
    if (!market._id) return;

    const dialogRef = this.dialog.open(ConfirmationDialogComponent, {
      width: '420px',
      data: {
        title: 'Deactivate Market',
        message: `Are you sure you want to deactivate ${market.name}? This will disable the market on the blockchain.`,
        confirmLabel: 'Deactivate',
        cancelLabel: 'Cancel',
        confirmColor: 'warn'
      }
    });

    dialogRef.afterClosed().subscribe((result : ConfirmationDialogResult) => {
      if (!result?.confirmed) return;

      this.isLoading = true;
      this.marketFactoryService.deactivateMarket(market._id!).subscribe({
        next: () => {
          this.loadMarkets();
        },
        error: () => {
          this.isLoading = false;
        }
      });
    });
  }

  manageUsers(market: Market): void {
    this.dialog.open(MarketUsersViewComponent, {
      width: '600px',
      maxWidth: '80vw',
      data: { market }
    });
  }

  openInviteModal(market: Market): void {
    if (!market._id) {
      return;
    }

    // Check if market already has an FRP assigned
    this.invitationService.checkMarketHasFRP(market._id).subscribe({
      next: (response) => {
        const dialogData: InviteUserDialogData = {
          marketId: market._id!,
          marketName: market.name,
          hasFRP: response.hasFRP
        };

        const dialogRef = this.dialog.open(InviteUserModalComponent, {
          width: '500px',
          data: dialogData
        });

        dialogRef.afterClosed().subscribe(result => {
          if (result?.success) {
            // Invitation sent successfully
          }
        });
      },
      error: (error) => {
        // Open modal anyway with hasFRP = false
        const dialogData: InviteUserDialogData = {
          marketId: market._id!,
          marketName: market.name,
          hasFRP: false
        };

        this.dialog.open(InviteUserModalComponent, {
          width: '500px',
          data: dialogData
        });
      }
    });
  }


  filterMarkets(): void {
    this.filteredMarkets = this.markets.filter(market => {
      const matchesState =
        this.selectedStates.length === 0 ||
        (market.state && this.selectedStates.includes(market.state));
      const matchesSearch = market.name?.toLowerCase().includes(this.searchTerm.toLowerCase());
      return matchesState && matchesSearch;
    });
  }

  removeStateFilter(state: string): void {
    this.selectedStates = this.selectedStates.filter(s => s !== state);
    this.filterMarkets();
  }

  onStateChange(): void {
    this.filterMarkets();
  }

  /**
   * Returns an observable that resolves to the market owner's email.
   * Handles three data shapes: populated object, inline ownerEmail field, or raw ID string.
   */
  getMarketOwnerEmail(market: Market): Observable<string> {
    if (market.marketOwner && typeof market.marketOwner === 'object' && market.marketOwner.email) {
      return of(market.marketOwner.email);
    }
    if (market.ownerEmail) {
      return of(market.ownerEmail);
    }
    if (market.marketOwner && typeof market.marketOwner === 'string') {
      return this.userService.getUserById(market.marketOwner).pipe(
        map(user => user?.email || 'Email not found')
      );
    }
    return of('Email not available');
  }

  /**
   * Synchronous version of getMarketOwnerEmail for template binding.
   * Returns a placeholder string when the owner data must be fetched asynchronously.
   */
  getMarketOwnerEmailSync(market: Market): string {
    if (market.marketOwner && typeof market.marketOwner === 'object' && market.marketOwner.email) {
      return market.marketOwner.email;
    }
    if (market.ownerEmail) {
      return market.ownerEmail;
    }
    if (market.marketOwner && typeof market.marketOwner === 'string') {
      return 'Loading email...';
    }
    return 'Email not available';
  }
}
