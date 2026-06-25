import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../../../environments/environment';

export interface CreateOfferDto {
  hourSlot: number;
  quantity: string;
}

export interface SubmitSettlementDto {
  offerId: number;
  deliveredQuantity: string;
  penaltyAmount: string;
  meterReadingsHash: string;
}

export interface OfferInfo {
  offerId: number;
  hourSlot: number;
  fsp: string;
  quantity: string;
  price: string;
  timestamp: number;
  status: number;
  nftTokenId: number;
  collateralAmount: string;
  nftTransferredToBuyer: boolean;
}

export interface FlexibilityRequestInfo {
  hourSlot: number;
  quantity: string;
  quantityFilled: string;
  price: string;
  flexType: number;
  active: boolean;
  completed: boolean;
}

export interface OfferCreationResult {
  offerId: number;
  txHash: string;
  blockNumber: number;
}

export interface ApiResponse<T = any> {
  statusCode: number;
  data: T;
}

@Injectable({
  providedIn: 'root'
})
export class MarketSessionHttpService {
  private readonly baseUrl = `${environment.apiUrl}/blockchain/market-session`;

  constructor(private http: HttpClient) {}

  // Configuration endpoints
  setNFTContract(sessionAddress: string, nftAddress: string): Observable<ApiResponse<{ txHash: string; blockNumber: number }>> {
    return this.http.post<ApiResponse<{ txHash: string; blockNumber: number }>>(`${this.baseUrl}/${sessionAddress}/config/nft-contract`, { nftAddress });
  }

  setParticipantRegistry(sessionAddress: string, registryAddress: string): Observable<ApiResponse<{ txHash: string; blockNumber: number }>> {
    return this.http.post<ApiResponse<{ txHash: string; blockNumber: number }>>(`${this.baseUrl}/${sessionAddress}/config/participant-registry`, { registryAddress });
  }

  // Session lifecycle endpoints
  openOffers(sessionAddress: string): Observable<ApiResponse<{ txHash: string; blockNumber: number }>> {
    return this.http.post<ApiResponse<{ txHash: string; blockNumber: number }>>(`${this.baseUrl}/${sessionAddress}/offers/open`, {});
  }

  closeOffers(sessionAddress: string): Observable<ApiResponse<{ txHash: string; blockNumber: number }>> {
    return this.http.post<ApiResponse<{ txHash: string; blockNumber: number }>>(`${this.baseUrl}/${sessionAddress}/offers/close`, {});
  }

  createOffer(sessionAddress: string, dto: CreateOfferDto): Observable<ApiResponse<OfferCreationResult>> {
    return this.http.post<ApiResponse<OfferCreationResult>>(`${this.baseUrl}/${sessionAddress}/offers`, dto);
  }

  getOffer(sessionAddress: string, offerId: number): Observable<ApiResponse<OfferInfo>> {
    return this.http.get<ApiResponse<OfferInfo>>(`${this.baseUrl}/${sessionAddress}/offers/${offerId}`);
  }

  getOfferCount(sessionAddress: string): Observable<ApiResponse<{ count: number }>> {
    return this.http.get<ApiResponse<{ count: number }>>(`${this.baseUrl}/${sessionAddress}/offers/count`);
  }

  // Flexibility requests
  getFlexibilityRequest(sessionAddress: string, hourSlot: number): Observable<ApiResponse<FlexibilityRequestInfo>> {
    return this.http.get<ApiResponse<FlexibilityRequestInfo>>(`${this.baseUrl}/${sessionAddress}/requests/${hourSlot}`);
  }

  getRemainingQuantity(sessionAddress: string, hourSlot: number): Observable<ApiResponse<{ remaining: string }>> {
    return this.http.get<ApiResponse<{ remaining: string }>>(`${this.baseUrl}/${sessionAddress}/requests/${hourSlot}/remaining`);
  }

  // Settlement endpoints
  submitMeasurementData(sessionAddress: string, measurementHash: string): Observable<ApiResponse<{ txHash: string; blockNumber: number }>> {
    return this.http.post<ApiResponse<{ txHash: string; blockNumber: number }>>(`${this.baseUrl}/${sessionAddress}/measurement-data`, { measurementHash });
  }

  submitSettlement(sessionAddress: string, dto: SubmitSettlementDto): Observable<ApiResponse<{ txHash: string; blockNumber: number }>> {
    return this.http.post<ApiResponse<{ txHash: string; blockNumber: number }>>(`${this.baseUrl}/${sessionAddress}/settlements`, dto);
  }

  executeSettlement(sessionAddress: string, offerId: number): Observable<ApiResponse<{ txHash: string; blockNumber: number }>> {
    return this.http.post<ApiResponse<{ txHash: string; blockNumber: number }>>(`${this.baseUrl}/${sessionAddress}/settlements/${offerId}/execute`, {});
  }

  getSettlement(sessionAddress: string, offerId: number): Observable<ApiResponse<any>> {
    return this.http.get<ApiResponse<any>>(`${this.baseUrl}/${sessionAddress}/settlements/${offerId}`);
  }

  finalizeSession(sessionAddress: string): Observable<ApiResponse<{ txHash: string; blockNumber: number }>> {
    return this.http.post<ApiResponse<{ txHash: string; blockNumber: number }>>(`${this.baseUrl}/${sessionAddress}/finalize`, {});
  }

  getTotalPlatformFees(sessionAddress: string): Observable<ApiResponse<{ fees: string }>> {
    return this.http.get<ApiResponse<{ fees: string }>>(`${this.baseUrl}/${sessionAddress}/platform-fees`);
  }

  // Role management
  grantFSPRole(sessionAddress: string, fspAddress: string): Observable<ApiResponse<{ txHash: string; blockNumber: number }>> {
    return this.http.post<ApiResponse<{ txHash: string; blockNumber: number }>>(`${this.baseUrl}/${sessionAddress}/roles/fsp/grant`, { fspAddress });
  }

  grantOracleRole(sessionAddress: string, oracleAddress: string): Observable<ApiResponse<{ txHash: string; blockNumber: number }>> {
    return this.http.post<ApiResponse<{ txHash: string; blockNumber: number }>>(`${this.baseUrl}/${sessionAddress}/roles/oracle/grant`, { oracleAddress });
  }
}
