import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../../../environments/environment';

export interface OpenDisputeDto {
  sessionId: number;
  offerId: number;
  disputeType: number;
  description: string;
  evidenceHash: string;
}

export interface GrantRoleDto {
  address: string;
}

export interface DisputeCreationResult {
  disputeId: number;
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
export class DisputeResolutionHttpService {
  private readonly baseUrl = `${environment.apiUrl}/blockchain/dispute-resolution`;

  constructor(private http: HttpClient) {}

  checkAvailability(): Observable<ApiResponse<{ isAvailable: boolean }>> {
    return this.http.get<ApiResponse<{ isAvailable: boolean }>>(`${this.baseUrl}/available`);
  }

  openDispute(dto: OpenDisputeDto): Observable<ApiResponse<DisputeCreationResult>> {
    return this.http.post<ApiResponse<DisputeCreationResult>>(`${this.baseUrl}/disputes`, dto);
  }

  getDispute(disputeId: number): Observable<ApiResponse<any>> {
    return this.http.get<ApiResponse<any>>(`${this.baseUrl}/disputes/${disputeId}`);
  }

  grantArbitratorRole(dto: GrantRoleDto): Observable<ApiResponse<{ txHash: string; blockNumber: number }>> {
    return this.http.post<ApiResponse<{ txHash: string; blockNumber: number }>>(`${this.baseUrl}/roles/arbitrator/grant`, dto);
  }

  getContractAddress(): Observable<ApiResponse<{ address: string | null }>> {
    return this.http.get<ApiResponse<{ address: string | null }>>(`${this.baseUrl}/contract-address`);
  }
}
