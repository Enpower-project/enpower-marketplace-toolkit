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
import { MatTooltipModule } from '@angular/material/tooltip';
import { Clipboard } from '@angular/cdk/clipboard';
import { NftService, NftCertificateDetail } from '../../../core/services/nft/nft.service';
import { ToastNotificationComponent } from '../../../shared/components/toast-notification/toast-notification.component';

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
    MatChipsModule,
    MatTooltipModule
  ],
  templateUrl: './nft-certificate-detail.component.html',
  styleUrl: './nft-certificate-detail.component.css'
})
export class NftCertificateDetailComponent implements OnInit {
  certificate: NftCertificateDetail | null = null;
  loading = false;
  error: string | null = null;
  tokenId: number = 0;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private nftService: NftService,
    private clipboard: Clipboard
  ) {}

  ngOnInit(): void {
    this.tokenId = Number(this.route.snapshot.paramMap.get('tokenId'));
    this.loadCertificate();
  }

  loadCertificate(): void {
    this.loading = true;
    this.error = null;
    this.nftService.getCertificateDetail(this.tokenId).subscribe({
      next: (cert) => {
        this.certificate = cert;
        this.loading = false;
      },
      error: (err) => {
        this.error = err.error?.message || 'Failed to load certificate details';
        this.loading = false;
      }
    });
  }

  formatQuantity(weiValue: string): string {
    if (!weiValue || weiValue === '0') return '0';
    try {
      const value = parseFloat(weiValue) / 1e18;
      if (value < 0.0001 && value > 0) return '< 0.0001';
      return value.toLocaleString('en-US', { maximumFractionDigits: 6 });
    } catch {
      return weiValue;
    }
  }

  calculateDeviation(): string {
    if (!this.certificate) return '0';
    try {
      const offered = parseFloat(this.certificate.blockchain.offeredQuantity);
      const delivered = parseFloat(this.certificate.blockchain.deliveredQuantity);
      if (offered === 0) return '0';
      const deviation = Math.abs((delivered - offered) / offered) * 100;
      return deviation.toFixed(2);
    } catch {
      return '0';
    }
  }

  getDeviationClass(): string {
    const deviation = parseFloat(this.calculateDeviation());
    if (deviation <= 5) return 'success';
    if (deviation <= 15) return 'warning';
    return 'error';
  }

  getDeviationIcon(): string {
    const deviation = parseFloat(this.calculateDeviation());
    if (deviation <= 5) return 'check_circle';
    if (deviation <= 15) return 'warning';
    return 'error';
  }

  getDeviationValueClass(percentage: number | string): string {
    const value = typeof percentage === 'string' ? parseFloat(percentage) : percentage;
    if (Math.abs(value) <= 5) return 'success';
    if (Math.abs(value) <= 15) return 'warning';
    return 'penalty';
  }

  getStatusIcon(status: string): string {
    const icons: Record<string, string> = {
      'EXECUTED': 'verified',
      'FINALIZED': 'check_circle',
      'DELIVERED': 'local_shipping',
      'ACCEPTED': 'thumb_up',
      'SUBMITTED': 'schedule',
      'PENDING': 'hourglass_empty'
    };
    return icons[status] || 'help';
  }

  copyToClipboard(value: string): void {
    this.clipboard.copy(value);
    ToastNotificationComponent.show('Copied to clipboard', 'success', 1500);
  }

  copyJsonToClipboard(): void {
    if (this.certificate) {
      this.clipboard.copy(JSON.stringify(this.certificate, null, 2));
      ToastNotificationComponent.show('JSON copied to clipboard', 'success', 1500);
    }
  }

  downloadJson(): void {
    if (!this.certificate) return;

    const jsonContent = JSON.stringify(this.certificate, null, 2);
    const blob = new Blob([jsonContent], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `nft-certificate-${this.tokenId}.json`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    ToastNotificationComponent.show('Certificate JSON downloaded', 'success');
  }

  goBack(): void {
    const state = window.history.state;
    
    if (state?.sessionAddress) {
      // Return to the specific settlement session page
      this.router.navigate(['/settlements/session', state.sessionAddress]);
    } else {
      // Return to settlement manager list
      this.router.navigate(['/settlement-manager']);
    }
  }
}
