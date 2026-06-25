import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../../../environments/environment';

export interface RegisterParticipantDto {
  participantAddress: string;
  participantType: number;
  credentialsReference: string;
  region: string;
}

export interface QualifyParticipantDto {
  participantAddress: string;
}

export interface SuspendParticipantDto {
  participantAddress: string;
  reason: string;
}

export interface RevokeParticipantDto {
  participantAddress: string;
  reason: string;
}

export interface UpdateCredentialsDto {
  participantAddress: string;
  newCredentialsReference: string;
}

export interface ParticipantInfo {
  participantAddress: string;
  pType: number;
  status: number;
  credentialsReference: string;
  region: string;
  registrationDate: number;
  isActive: boolean;
}

export interface ApiResponse<T = any> {
  statusCode: number;
  data: T;
}

@Injectable({
  providedIn: 'root'
})
export class ParticipantRegistryHttpService {
  private readonly baseUrl = `${environment.apiUrl}/blockchain/participant-registry`;

  constructor(private http: HttpClient) {}

  registerParticipant(dto: RegisterParticipantDto): Observable<ApiResponse<{ txHash: string; blockNumber: number }>> {
    return this.http.post<ApiResponse<{ txHash: string; blockNumber: number }>>(`${this.baseUrl}/participants`, dto);
  }

  qualifyParticipant(dto: QualifyParticipantDto): Observable<ApiResponse<{ txHash: string; blockNumber: number }>> {
    return this.http.post<ApiResponse<{ txHash: string; blockNumber: number }>>(`${this.baseUrl}/participants/qualify`, dto);
  }

  suspendParticipant(dto: SuspendParticipantDto): Observable<ApiResponse<{ txHash: string; blockNumber: number }>> {
    return this.http.post<ApiResponse<{ txHash: string; blockNumber: number }>>(`${this.baseUrl}/participants/suspend`, dto);
  }

  revokeParticipant(dto: RevokeParticipantDto): Observable<ApiResponse<{ txHash: string; blockNumber: number }>> {
    return this.http.post<ApiResponse<{ txHash: string; blockNumber: number }>>(`${this.baseUrl}/participants/revoke`, dto);
  }

  updateCredentials(dto: UpdateCredentialsDto): Observable<ApiResponse<{ txHash: string; blockNumber: number }>> {
    return this.http.post<ApiResponse<{ txHash: string; blockNumber: number }>>(`${this.baseUrl}/participants/credentials`, dto);
  }

  getParticipant(address: string): Observable<ApiResponse<ParticipantInfo>> {
    return this.http.get<ApiResponse<ParticipantInfo>>(`${this.baseUrl}/participants/${address}`);
  }

  isQualified(address: string): Observable<ApiResponse<{ isQualified: boolean }>> {
    return this.http.get<ApiResponse<{ isQualified: boolean }>>(`${this.baseUrl}/participants/${address}/qualified`);
  }

  hasRole(address: string, type: string): Observable<ApiResponse<{ hasRole: boolean }>> {
    return this.http.get<ApiResponse<{ hasRole: boolean }>>(`${this.baseUrl}/participants/${address}/role/${type}`);
  }

  getParticipantsByRegion(region: string): Observable<ApiResponse<{ participants: string[] }>> {
    return this.http.get<ApiResponse<{ participants: string[] }>>(`${this.baseUrl}/regions/${region}/participants`);
  }

  getAllParticipants(): Observable<ApiResponse<{ participants: string[] }>> {
    return this.http.get<ApiResponse<{ participants: string[] }>>(`${this.baseUrl}/participants`);
  }

  getContractAddress(): Observable<ApiResponse<{ address: string }>> {
    return this.http.get<ApiResponse<{ address: string }>>(`${this.baseUrl}/contract-address`);
  }
}
