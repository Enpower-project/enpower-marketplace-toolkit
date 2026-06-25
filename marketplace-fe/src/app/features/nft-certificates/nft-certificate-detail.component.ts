import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTabsModule } from '@angular/material/tabs';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDividerModule } from '@angular/material/divider';
import { MatChipsModule } from '@angular/material/chips';
import { NftService, NftCertificateDetail } from '../../core/services/nft/nft.service';

@Component({
  selector: 'app-nft-certificate-detail',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatTabsModule,
    MatProgressSpinnerModule,
    MatDividerModule,
    MatChipsModule
  ],
  template: `
    <div class="nft-detail-container">
      <button mat-button (click)="goBack()">
        <mat-icon>arrow_back</mat-icon>
        Back to Certificates
      </button>

      <div *ngIf="loading" class="loading">
        <mat-spinner diameter="60"></mat-spinner>
      </div>

      <div *ngIf="!loading && certificate" class="detail-content">
        <mat-card class="header-card">
          <mat-card-header>
            <mat-card-title>
              <mat-icon>workspace_premium</mat-icon>
              NFT Certificate #{{ certificate.tokenId }}
            </mat-card-title>
            <mat-chip [color]="certificate.blockchain.isSoulbound ? 'primary' : 'accent'">
              {{ certificate.blockchain.isSoulbound ? 'Soulbound' : 'Transferable' }}
            </mat-chip>
          </mat-card-header>
        </mat-card>

        <mat-tab-group>
          <mat-tab label="Blockchain Data">
            <mat-card>
              <mat-card-content>
                <div class="data-grid">
                  <div class="data-item"><strong>Session ID:</strong> {{ certificate.blockchain.sessionId }}</div>
                  <div class="data-item"><strong>Offer ID:</strong> {{ certificate.blockchain.offerId }}</div>
                  <div class="data-item"><strong>Hour Slot:</strong> {{ certificate.blockchain.hourSlot }}:00</div>
                  <div class="data-item"><strong>FSP Address:</strong> <code>{{ certificate.blockchain.fspAddress }}</code></div>
                  <div class="data-item"><strong>Offered:</strong> {{ formatWei(certificate.blockchain.offeredQuantity) }} Wh</div>
                  <div class="data-item"><strong>Delivered:</strong> {{ formatWei(certificate.blockchain.deliveredQuantity) }} Wh</div>
                  <div class="data-item"><strong>Price:</strong> {{ formatWei(certificate.blockchain.price) }} wei</div>
                  <div class="data-item"><strong>Collateral:</strong> {{ formatWei(certificate.blockchain.collateralAmount) }} FLEX</div>
                  <div class="data-item"><strong>Payment:</strong> {{ formatWei(certificate.blockchain.actualPayment) }} FLEX</div>
                  <div class="data-item"><strong>Status:</strong> <mat-chip color="primary">{{ certificate.blockchain.status }}</mat-chip></div>
                </div>
              </mat-card-content>
            </mat-card>
          </mat-tab>

          <mat-tab label="Settlement Info" *ngIf="certificate.offChain">
            <mat-card>
              <mat-card-content>
                <div class="data-grid">
                  <div class="data-item"><strong>Session:</strong> {{ certificate.offChain.sessionName }}</div>
                  <div class="data-item"><strong>FSP:</strong> {{ certificate.offChain.fspUsername }}</div>
                  <div class="data-item"><strong>Committed:</strong> {{ formatWei(certificate.offChain.committedQuantity) }} Wh</div>
                  <div class="data-item"><strong>Deviation:</strong> {{ certificate.offChain.deviationPercentage }}%</div>
                  <div class="data-item"><strong>Penalty:</strong> {{ formatWei(certificate.offChain.penaltyAmount) }} FLEX</div>
                  <div class="data-item"><strong>Platform Fee:</strong> {{ formatWei(certificate.offChain.platformFee) }} FLEX</div>
                  <div class="data-item"><strong>Collateral Returned:</strong> {{ formatWei(certificate.offChain.collateralReturned) }} FLEX</div>
                  <div class="data-item"><strong>Collateral Forfeited:</strong> {{ formatWei(certificate.offChain.collateralForfeited) }} FLEX</div>
                  <div class="data-item"><strong>Submit TX:</strong> <a [href]="'https://etherscan.io/tx/' + certificate.offChain.submitTxHash" target="_blank">{{ certificate.offChain.submitTxHash?.slice(0,10) }}...</a></div>
                </div>
              </mat-card-content>
            </mat-card>
          </mat-tab>

          <mat-tab label="Metadata JSON">
            <mat-card>
              <mat-card-content>
                <pre>{{ certificate | json }}</pre>
              </mat-card-content>
            </mat-card>
          </mat-tab>
        </mat-tab-group>
      </div>
    </div>
  `,
  styles: [`
    .nft-detail-container { padding: 20px; max-width: 1200px; margin: 0 auto; }
    .loading { text-align: center; padding: 60px; }
    .header-card mat-card-header { display: flex; justify-content: space-between; align-items: center; }
    .header-card mat-card-title { display: flex; gap: 8px; align-items: center; }
    .detail-content { margin-top: 20px; }
    .data-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 16px; padding: 20px; }
    .data-item { padding: 12px; background: #f5f5f5; border-radius: 4px; }
    code { background: #eee; padding: 4px 8px; border-radius: 4px; font-size: 0.9em; }
    pre { background: #f5f5f5; padding: 16px; border-radius: 4px; overflow-x: auto; }
  `]
})
export class NftCertificateDetailComponent implements OnInit {
  certificate: NftCertificateDetail | null = null;
  loading = false;
  tokenId: number = 0;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private nftService: NftService
  ) {}

  ngOnInit(): void {
    this.tokenId = Number(this.route.snapshot.paramMap.get('tokenId'));
    this.loadCertificate();
  }

  loadCertificate(): void {
    this.loading = true;
    this.nftService.getCertificateDetail(this.tokenId).subscribe({
      next: (cert) => {
        this.certificate = cert;
        this.loading = false;
      },
      error: () => {
        this.loading = false;
      }
    });
  }

  formatWei(weiValue: string): string {
    try {
      const ethers = (window as any).ethers;
      if (ethers && weiValue) {
        const formatted = ethers.formatEther(weiValue);
        return parseFloat(formatted).toLocaleString('en-US', { maximumFractionDigits: 4 });
      }
    } catch (e) {}
    return weiValue || '0';
  }

  goBack(): void {
    this.router.navigate(['/nft-certificates']);
  }
}
