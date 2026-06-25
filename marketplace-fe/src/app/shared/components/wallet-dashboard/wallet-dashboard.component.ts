import { Component } from '@angular/core';
import { TransactionHistoryComponent } from "../transaction-history/transaction-history.component";

@Component({
  selector: 'app-wallet-dashboard',
  imports: [TransactionHistoryComponent],
  templateUrl: './wallet-dashboard.component.html',
  styleUrl: './wallet-dashboard.component.css',
})
export class WalletDashboardComponent {  }
