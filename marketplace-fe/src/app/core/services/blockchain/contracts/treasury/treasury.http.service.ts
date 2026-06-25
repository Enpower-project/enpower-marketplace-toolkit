import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../../../environments/environment';

export interface DepositDto {
  amount: string;
}

export interface WithdrawDto {
  amount: string;
}

export interface DepositPaymentForSessionDto {
  sessionId: number;
  amount: string;
}

export interface GrantRoleDto {
  address: string;
}

export interface OfferCollateralInfo {
  sessionContract: string;
  sessionId: number;
  offerId: number;
  fsp: string;
  collateralAmount: string;
  feeAmount: string;
  released: boolean;
}

export interface ApiResponse<T = any> {
  statusCode: number;
  data: T;
}

@Injectable({
  providedIn: 'root'
})
export class TreasuryHttpService {
  private readonly baseUrl = `${environment.apiUrl}/blockchain/treasury`;

  constructor(private http: HttpClient) {}

  deposit(dto: DepositDto): Observable<ApiResponse<{ txHash: string; blockNumber: number }>> {
    return this.http.post<ApiResponse<{ txHash: string; blockNumber: number }>>(`${this.baseUrl}/deposit`, dto);
  }

  withdraw(dto: WithdrawDto): Observable<ApiResponse<{ txHash: string; blockNumber: number }>> {
    return this.http.post<ApiResponse<{ txHash: string; blockNumber: number }>>(`${this.baseUrl}/withdraw`, dto);
  }

  depositPaymentForSession(dto: DepositPaymentForSessionDto): Observable<ApiResponse<{ txHash: string; blockNumber: number }>> {
    return this.http.post<ApiResponse<{ txHash: string; blockNumber: number }>>(`${this.baseUrl}/deposit-payment`, dto);
  }

  getBalance(address: string): Observable<ApiResponse<{ balance: string }>> {
    return this.http.get<ApiResponse<{ balance: string }>>(`${this.baseUrl}/balance/${address}`);
  }

  getAvailableBalance(address: string): Observable<ApiResponse<{ availableBalance: string }>> {
    return this.http.get<ApiResponse<{ availableBalance: string }>>(`${this.baseUrl}/available-balance/${address}`);
  }

  getCollateralDeposited(address: string): Observable<ApiResponse<{ collateralDeposited: string }>> {
    return this.http.get<ApiResponse<{ collateralDeposited: string }>>(`${this.baseUrl}/collateral-deposited/${address}`);
  }

  getCollateralLocked(address: string): Observable<ApiResponse<{ collateralLocked: string }>> {
    return this.http.get<ApiResponse<{ collateralLocked: string }>>(`${this.baseUrl}/collateral-locked/${address}`);
  }

  getOfferCollateral(sessionContract: string, sessionId: string, offerId: string): Observable<ApiResponse<OfferCollateralInfo>> {
    return this.http.get<ApiResponse<OfferCollateralInfo>>(`${this.baseUrl}/offer-collateral/${sessionContract}/${sessionId}/${offerId}`);
  }

  grantSessionContractRole(dto: GrantRoleDto): Observable<ApiResponse<{ txHash: string; blockNumber: number }>> {
    return this.http.post<ApiResponse<{ txHash: string; blockNumber: number }>>(`${this.baseUrl}/roles/session-contract/grant`, dto);
  }

  grantFRPRole(dto: GrantRoleDto): Observable<ApiResponse<{ txHash: string; blockNumber: number }>> {
    return this.http.post<ApiResponse<{ txHash: string; blockNumber: number }>>(`${this.baseUrl}/roles/frp/grant`, dto);
  }

  getContractAddress(): Observable<ApiResponse<{ address: string }>> {
    return this.http.get<ApiResponse<{ address: string }>>(`${this.baseUrl}/contract-address`);
  }
}
