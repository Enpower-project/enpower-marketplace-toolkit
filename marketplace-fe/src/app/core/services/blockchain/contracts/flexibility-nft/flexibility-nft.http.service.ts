import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../../../environments/environment';

export interface GrantRoleDto {
  address: string;
}

export interface ApiResponse<T = any> {
  statusCode: number;
  data: T;
}

@Injectable({
  providedIn: 'root'
})
export class FlexibilityNFTHttpService {
  private readonly baseUrl = `${environment.apiUrl}/blockchain/flexibility-nft`;

  constructor(private http: HttpClient) {}

  getSessionId(tokenId: number): Observable<ApiResponse<{ sessionId: number }>> {
    return this.http.get<ApiResponse<{ sessionId: number }>>(`${this.baseUrl}/tokens/${tokenId}/session-id`);
  }

  getOfferId(tokenId: number): Observable<ApiResponse<{ offerId: number }>> {
    return this.http.get<ApiResponse<{ offerId: number }>>(`${this.baseUrl}/tokens/${tokenId}/offer-id`);
  }

  getHourSlot(tokenId: number): Observable<ApiResponse<{ hourSlot: number }>> {
    return this.http.get<ApiResponse<{ hourSlot: number }>>(`${this.baseUrl}/tokens/${tokenId}/hour-slot`);
  }

  getFsp(tokenId: number): Observable<ApiResponse<{ fsp: string }>> {
    return this.http.get<ApiResponse<{ fsp: string }>>(`${this.baseUrl}/tokens/${tokenId}/fsp`);
  }

  getOfferedQuantity(tokenId: number): Observable<ApiResponse<{ offeredQuantity: string }>> {
    return this.http.get<ApiResponse<{ offeredQuantity: string }>>(`${this.baseUrl}/tokens/${tokenId}/offered-quantity`);
  }

  getPrice(tokenId: number): Observable<ApiResponse<{ price: string }>> {
    return this.http.get<ApiResponse<{ price: string }>>(`${this.baseUrl}/tokens/${tokenId}/price`);
  }

  getCollateralAmount(tokenId: number): Observable<ApiResponse<{ collateralAmount: string }>> {
    return this.http.get<ApiResponse<{ collateralAmount: string }>>(`${this.baseUrl}/tokens/${tokenId}/collateral-amount`);
  }

  getFmoLmo(tokenId: number): Observable<ApiResponse<{ fmoLmo: string }>> {
    return this.http.get<ApiResponse<{ fmoLmo: string }>>(`${this.baseUrl}/tokens/${tokenId}/fmo-lmo`);
  }

  getAcceptedQuantity(tokenId: number): Observable<ApiResponse<{ acceptedQuantity: string }>> {
    return this.http.get<ApiResponse<{ acceptedQuantity: string }>>(`${this.baseUrl}/tokens/${tokenId}/accepted-quantity`);
  }

  getDeliveredQuantity(tokenId: number): Observable<ApiResponse<{ deliveredQuantity: string }>> {
    return this.http.get<ApiResponse<{ deliveredQuantity: string }>>(`${this.baseUrl}/tokens/${tokenId}/delivered-quantity`);
  }

  getFinalBuyer(tokenId: number): Observable<ApiResponse<{ finalBuyer: string }>> {
    return this.http.get<ApiResponse<{ finalBuyer: string }>>(`${this.baseUrl}/tokens/${tokenId}/final-buyer`);
  }

  getActualPayment(tokenId: number): Observable<ApiResponse<{ actualPayment: string }>> {
    return this.http.get<ApiResponse<{ actualPayment: string }>>(`${this.baseUrl}/tokens/${tokenId}/actual-payment`);
  }

  getStatus(tokenId: number): Observable<ApiResponse<{ status: number }>> {
    return this.http.get<ApiResponse<{ status: number }>>(`${this.baseUrl}/tokens/${tokenId}/status`);
  }

  getIsSoulbound(tokenId: number): Observable<ApiResponse<{ isSoulbound: boolean }>> {
    return this.http.get<ApiResponse<{ isSoulbound: boolean }>>(`${this.baseUrl}/tokens/${tokenId}/is-soulbound`);
  }

  balanceOf(address: string, tokenId: number): Observable<ApiResponse<{ balance: number }>> {
    return this.http.get<ApiResponse<{ balance: number }>>(`${this.baseUrl}/balance/${address}/${tokenId}`);
  }

  uri(tokenId: number): Observable<ApiResponse<{ uri: string }>> {
    return this.http.get<ApiResponse<{ uri: string }>>(`${this.baseUrl}/tokens/${tokenId}/uri`);
  }

  grantMinterRole(dto: GrantRoleDto): Observable<ApiResponse<{ txHash: string; blockNumber: number }>> {
    return this.http.post<ApiResponse<{ txHash: string; blockNumber: number }>>(`${this.baseUrl}/roles/minter/grant`, dto);
  }

  grantUpdaterRole(dto: GrantRoleDto): Observable<ApiResponse<{ txHash: string; blockNumber: number }>> {
    return this.http.post<ApiResponse<{ txHash: string; blockNumber: number }>>(`${this.baseUrl}/roles/updater/grant`, dto);
  }

  getContractAddress(): Observable<ApiResponse<{ address: string }>> {
    return this.http.get<ApiResponse<{ address: string }>>(`${this.baseUrl}/contract-address`);
  }
}
