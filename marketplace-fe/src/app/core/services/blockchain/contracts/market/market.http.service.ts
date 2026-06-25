import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../../../environments/environment';

export interface FlexibilityRequestInputDto {
  hourSlot: number;
  quantity: string;
  price: string;
  flexType: number;
}

export interface CreateSessionDto {
  deliveryDay: number;
  treasuryAddress: string;
  fmoLmoAddress: string;
  frpAddress: string;
  requests: FlexibilityRequestInputDto[];
}

export interface SessionInfo {
  sessionAddress: string;
  deliveryDay: number;
  createdAt: number;
  status: number;
}

export interface SessionCreationResult {
  sessionId: number;
  sessionAddress: string;
  txHash: string;
  blockNumber: number;
}

export interface MarketInfoData {
  communityId: string;
  region: string;
  isActive: boolean;
}

export interface ApiResponse<T = any> {
  statusCode: number;
  data: T;
}

@Injectable({
  providedIn: 'root'
})
export class MarketHttpService {
  private readonly baseUrl = `${environment.apiUrl}/blockchain/market`;

  constructor(private http: HttpClient) {}

  createSession(marketAddress: string, dto: CreateSessionDto): Observable<ApiResponse<SessionCreationResult>> {
    return this.http.post<ApiResponse<SessionCreationResult>>(`${this.baseUrl}/${marketAddress}/sessions`, dto);
  }

  getSession(marketAddress: string, sessionId: string): Observable<ApiResponse<SessionInfo>> {
    return this.http.get<ApiResponse<SessionInfo>>(`${this.baseUrl}/${marketAddress}/sessions/${sessionId}`);
  }

  getSessionCount(marketAddress: string): Observable<ApiResponse<{ count: number }>> {
    return this.http.get<ApiResponse<{ count: number }>>(`${this.baseUrl}/${marketAddress}/sessions/count`);
  }

  getMarketInfo(marketAddress: string): Observable<ApiResponse<MarketInfoData>> {
    return this.http.get<ApiResponse<MarketInfoData>>(`${this.baseUrl}/${marketAddress}/info`);
  }

  setParticipantRegistry(marketAddress: string, registryAddress: string): Observable<ApiResponse<{ txHash: string; blockNumber: number }>> {
    return this.http.post<ApiResponse<{ txHash: string; blockNumber: number }>>(`${this.baseUrl}/${marketAddress}/participant-registry`, { registryAddress });
  }
}
