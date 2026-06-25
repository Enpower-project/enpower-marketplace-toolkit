import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../../../environments/environment';

export interface TransferTokenDto {
  to: string;
  amount: string;
}

export interface ApproveTokenDto {
  spender: string;
  amount: string;
}

export interface MintTokenDto {
  to: string;
  amount: string;
}

export interface BurnTokenDto {
  amount: string;
}

export interface GrantRoleDto {
  address: string;
}

export interface AvailableBalanceInfo {
  balance: string;
  collateralLocked: string;
  availableBalance: string;
}

export interface ApiResponse<T = any> {
  statusCode: number;
  data: T;
}

@Injectable({
  providedIn: 'root'
})
export class FlexibilityTokenHttpService {
  private readonly baseUrl = `${environment.apiUrl}/blockchain/flexibility-token`;

  constructor(private http: HttpClient) {}

  balanceOf(address: string): Observable<ApiResponse<{ balance: string }>> {
    return this.http.get<ApiResponse<{ balance: string }>>(`${this.baseUrl}/balance/${address}`);
  }

  availableBalance(address: string): Observable<ApiResponse<AvailableBalanceInfo>> {
    return this.http.get<ApiResponse<AvailableBalanceInfo>>(`${this.baseUrl}/available-balance/${address}`);
  }

  totalSupply(): Observable<ApiResponse<{ totalSupply: string }>> {
    return this.http.get<ApiResponse<{ totalSupply: string }>>(`${this.baseUrl}/total-supply`);
  }

  allowance(owner: string, spender: string): Observable<ApiResponse<{ allowance: string }>> {
    return this.http.get<ApiResponse<{ allowance: string }>>(`${this.baseUrl}/allowance/${owner}/${spender}`);
  }

  transfer(dto: TransferTokenDto): Observable<ApiResponse<{ txHash: string; blockNumber: number }>> {
    return this.http.post<ApiResponse<{ txHash: string; blockNumber: number }>>(`${this.baseUrl}/transfer`, dto);
  }

  approve(dto: ApproveTokenDto): Observable<ApiResponse<{ txHash: string; blockNumber: number }>> {
    return this.http.post<ApiResponse<{ txHash: string; blockNumber: number }>>(`${this.baseUrl}/approve`, dto);
  }

  mint(dto: MintTokenDto): Observable<ApiResponse<{ txHash: string; blockNumber: number }>> {
    return this.http.post<ApiResponse<{ txHash: string; blockNumber: number }>>(`${this.baseUrl}/mint`, dto);
  }

  burn(dto: BurnTokenDto): Observable<ApiResponse<{ txHash: string; blockNumber: number }>> {
    return this.http.post<ApiResponse<{ txHash: string; blockNumber: number }>>(`${this.baseUrl}/burn`, dto);
  }

  pause(): Observable<ApiResponse<{ txHash: string; blockNumber: number }>> {
    return this.http.post<ApiResponse<{ txHash: string; blockNumber: number }>>(`${this.baseUrl}/pause`, {});
  }

  unpause(): Observable<ApiResponse<{ txHash: string; blockNumber: number }>> {
    return this.http.post<ApiResponse<{ txHash: string; blockNumber: number }>>(`${this.baseUrl}/unpause`, {});
  }

  grantMinterRole(dto: GrantRoleDto): Observable<ApiResponse<{ txHash: string; blockNumber: number }>> {
    return this.http.post<ApiResponse<{ txHash: string; blockNumber: number }>>(`${this.baseUrl}/roles/minter/grant`, dto);
  }

  grantTreasuryRole(dto: GrantRoleDto): Observable<ApiResponse<{ txHash: string; blockNumber: number }>> {
    return this.http.post<ApiResponse<{ txHash: string; blockNumber: number }>>(`${this.baseUrl}/roles/treasury/grant`, dto);
  }

  getContractAddress(): Observable<ApiResponse<{ address: string }>> {
    return this.http.get<ApiResponse<{ address: string }>>(`${this.baseUrl}/contract-address`);
  }
}
