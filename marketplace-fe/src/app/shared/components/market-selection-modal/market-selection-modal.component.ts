import { Component, Inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { FormsModule } from '@angular/forms';
import { MarketSelectionService } from '../../../core/services/market-selection/market-selection.service';
import { KeycloakService } from '../../../core/services/keycloak/keycloak.service';

export interface MarketSelectionModalData {
  availableMarkets: string[];
  title?: string;
  message?: string;
}

@Component({
  selector: 'app-market-selection-modal',
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatButtonModule,
    MatSelectModule,
    MatFormFieldModule,
    MatIconModule,
    MatProgressSpinnerModule,
    FormsModule
  ],
  templateUrl: './market-selection-modal.component.html',
  styleUrl: './market-selection-modal.component.css'
})
export class MarketSelectionModalComponent implements OnInit {
  selectedMarket: string = '';
  isLoading = false;
  errorMessage = '';

  constructor(
    public dialogRef: MatDialogRef<MarketSelectionModalComponent>,
    @Inject(MAT_DIALOG_DATA) public data: MarketSelectionModalData,
    private marketSelectionService: MarketSelectionService,
    private keycloakService: KeycloakService
  ) { }

  ngOnInit(): void {
    // Pre-select first market if only one available
    if (this.data.availableMarkets.length === 1) {
      this.selectedMarket = this.data.availableMarkets[0];
    }
  }

  getMarketDisplayName(marketId: string): string {
    return this.marketSelectionService.getMarketName(marketId);
  }

  onCancel(): void {
    this.dialogRef.close(null);
  }

  retrySelection(): void {
    // Clear error message and retry the selection
    this.errorMessage = '';
    this.onConfirm();
  }

  onConfirm(): void {
    if (!this.selectedMarket || this.isLoading) {
      return;
    }

    this.isLoading = true;
    this.errorMessage = '';

    this.marketSelectionService.selectMarket(this.selectedMarket).subscribe({
      next: (response) => {
        if (response.success) {
          // Update the local state
          this.marketSelectionService.setSelectedMarket(this.selectedMarket);

          const closeModal = (tokenRefreshed = false, tokenRefreshError = null) => {
            // Ensure loading is false before closing
            this.isLoading = false;

            // Small delay to ensure UI updates
            setTimeout(() => {
              this.dialogRef.close({
                selectedMarket: this.selectedMarket,
                success: true,
                tokenRefreshed,
                tokenRefreshError
              });
            }, 100);
          };

          if (response.requiresTokenRefresh) {
            // Force token refresh by updating with minimal validity
            this.keycloakService.updateToken(3600).then(() => {
              closeModal(true);
            }).catch((error) => {
              closeModal(false, error);
            });
          } else {
            closeModal(false);
          }
        } else {
          this.isLoading = false;
          this.errorMessage = response.message || 'Failed to select market';
        }
      },
      error: (error) => {
        this.isLoading = false;

        let errorMessage = 'Failed to select market. Please try again.';

        // Handle different types of errors
        if (error.status === 503) {
          errorMessage = 'Backend service is temporarily unavailable. Please check if the server is running.';
        } else if (error.status === 401) {
          // Para errores 401, intentar refresh del token automáticamente

          this.keycloakService.updateToken(0).then((refreshed) => {
            if (refreshed) {
              // Si el token se refrescó exitosamente, reintentar la selección
              this.errorMessage = '';
              this.onConfirm(); // Reintentar la selección
              return;
            } else {
              this.errorMessage = 'Authentication expired. Please login again.';
            }
          }).catch((refreshError) => {
            this.errorMessage = 'Authentication expired. Please login again.';
          });

          return; // No continuar con el resto del manejo de errores
        } else if (error.status === 403) {
          errorMessage = 'Access denied to selected market.';
        } else if (error.status === 0) {
          errorMessage = 'Cannot connect to server. Please check your network connection.';
        } else if (error.error?.detail) {
          errorMessage = error.error.detail;
        } else if (error.error?.message) {
          errorMessage = error.error.message;
        } else if (error.message) {
          errorMessage = error.message;
        }

        this.errorMessage = errorMessage;
      }
    });
  }
}
