import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../../../environments/environment';

export interface CreateMarketDto {
  communityId: string;
  region: string;
  ownerAddress: string;
}

export interface MarketInfo {
  marketAddress: string;
  communityId: string;
  region: string;
  owner: string;
  isActive: boolean;
  createdAt: number;
}

export interface MarketCreationResult {
  marketId: number;
  txHash: string;
  blockNumber: number;
}

export interface ApiResponse<T = any> {
  statusCode: number;
  data: T;
}

export interface ActivateMarketWithPinDto {
  pin: string;
}

export interface MarketActivationResult {
  marketId: string;
  marketName: string;
  marketAddress: string;
  transactionHash: string;
  activatedAt: Date;
}

export interface MarketActivationResponse {
  success: boolean;
  message: string;
  data?: MarketActivationResult;
}

@Injectable({
  providedIn: 'root'
})
export class MarketFactoryHttpService {
  private readonly baseUrl = `${environment.apiUrl}/blockchain/market-factory`;

  constructor(private http: HttpClient) {}

  createMarket(dto: CreateMarketDto): Observable<ApiResponse<MarketCreationResult>> {
    return this.http.post<ApiResponse<MarketCreationResult>>(`${this.baseUrl}/markets`, dto);
  }

  getMarket(marketId: number): Observable<ApiResponse<MarketInfo>> {
    return this.http.get<ApiResponse<MarketInfo>>(`${this.baseUrl}/markets/${marketId}`);
  }

  getMarketCount(): Observable<ApiResponse<{ count: number }>> {
    return this.http.get<ApiResponse<{ count: number }>>(`${this.baseUrl}/markets/count`);
  }

  deactivateMarket(marketId: number): Observable<ApiResponse<{ txHash: string; blockNumber: number }>> {
    return this.http.post<ApiResponse<{ txHash: string; blockNumber: number }>>(`${this.baseUrl}/markets/${marketId}/deactivate`, {});
  }

  reactivateMarket(marketId: number): Observable<ApiResponse<{ txHash: string; blockNumber: number }>> {
    return this.http.post<ApiResponse<{ txHash: string; blockNumber: number }>>(`${this.baseUrl}/markets/${marketId}/reactivate`, {});
  }

  grantMarketplaceAdmin(address: string): Observable<ApiResponse<{ txHash: string; blockNumber: number }>> {
    return this.http.post<ApiResponse<{ txHash: string; blockNumber: number }>>(`${this.baseUrl}/roles/marketplace-admin/grant`, { address });
  }

  getContractAddress(): Observable<ApiResponse<{ address: string }>> {
    return this.http.get<ApiResponse<{ address: string }>>(`${this.baseUrl}/contract-address`);
  }

  /**
   * Activate a market on blockchain with PIN verification
   * @param marketId MongoDB market ID
   * @param pin 6-digit PIN code for wallet authentication
   * @returns Market activation result
   */
  activateMarketWithPin(marketId: string, pin: string): Observable<MarketActivationResponse> {
    return this.http.post<MarketActivationResponse>(
      `${this.baseUrl}/${marketId}/activate-market-with-pin`,
      { pin }
    );
  }
}
