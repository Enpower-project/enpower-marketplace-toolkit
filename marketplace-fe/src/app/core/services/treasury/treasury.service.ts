import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../../../environments/environment';

export interface TreasuryBalance {
  address: string;
  collateralDeposited: string;
  collateralLocked: string;
  availableBalance: string;
  lockedPercentage: string; // Basis points: 10000 = 100%
}

@Injectable({
  providedIn: 'root'
})
export class TreasuryService {
  private readonly baseUrl = `${environment.apiUrl}/blockchain/treasury`;

  constructor(private http: HttpClient) {}

  /**
   * Get aggregated treasury balance for an address
   * Returns deposited, locked, and available balance in a single call
   */
  getBalanceSummary(address: string): Observable<TreasuryBalance> {
    return this.http.get<{ statusCode: number; data: TreasuryBalance }>(
      `${this.baseUrl}/balance-summary/${address}`
    ).pipe(
      map(response => response.data)
    );
  }

  /**
   * Get individual balance components
   */
  getBalance(address: string): Observable<string> {
    return this.http.get<{ statusCode: number; data: { balance: string } }>(
      `${this.baseUrl}/balance/${address}`
    ).pipe(
      map(response => response.data.balance)
    );
  }

  getAvailableBalance(address: string): Observable<string> {
    return this.http.get<{ statusCode: number; data: { availableBalance: string } }>(
      `${this.baseUrl}/available-balance/${address}`
    ).pipe(
      map(response => response.data.availableBalance)
    );
  }

  getCollateralDeposited(address: string): Observable<string> {
    return this.http.get<{ statusCode: number; data: { collateralDeposited: string } }>(
      `${this.baseUrl}/collateral-deposited/${address}`
    ).pipe(
      map(response => response.data.collateralDeposited)
    );
  }

  getCollateralLocked(address: string): Observable<string> {
    return this.http.get<{ statusCode: number; data: { collateralLocked: string } }>(
      `${this.baseUrl}/collateral-locked/${address}`
    ).pipe(
      map(response => response.data.collateralLocked)
    );
  }

  /**
   * Get Treasury contract address
   */
  getContractAddress(): Observable<string> {
    return this.http.get<{ statusCode: number; data: { address: string } }>(
      `${this.baseUrl}/contract-address`
    ).pipe(
      map(response => response.data.address)
    );
  }
}
