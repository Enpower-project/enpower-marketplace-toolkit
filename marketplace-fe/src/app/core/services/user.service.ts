import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, of, tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import { CacheService } from './cache/cache.service';

export interface User {
  id: string;
  username: string;
  email: string;
  firstName?: string;
  lastName?: string;
  role: string;
  status: string;
  accessibleMarkets: string[];
  assignedMarket?: string;
}

export interface Measurement {
  periodInMinutes: number,
  unit: string,
  type: string
}

enum FlexibilityType {
  THEORETICAL = "THEORETICAL",
  ACTUAL = "ACTUAL"
}

export interface ReferenceStandard {
  createdAt: Date,
  date: Date,
  fspUserId: string,
  market: string,
  measurement: Measurement[],
  profileType: string,
  updatedAt: Date,
  validFrom: Date,
  validTo: Date,
  _v: number,
  _id: string
}

export interface TheoreticalResponse {
  calculatedAt: Date,
  createdAt: Date,
  date: Date,
  flexibilityType: FlexibilityType,
  fspUserId: string,
  market: string,
  measurements: Measurement[],
  updatedAt: Date,
  _v: number,
  _id: string
}

@Injectable({
  providedIn: 'root'
})
export class UserService {
  private readonly baseUrl = `${environment.apiGatewayUrl}/users`;
  private readonly seedBaseUrl = `${environment.apiGatewayUrl}`;
  private readonly CACHE_NAMESPACE = 'users';

  constructor(private readonly http: HttpClient, private cacheService: CacheService) { }

  hasConsumptionData(userId: string) {
    const key = `${userId}-UserId`

    const source$ = this.http.get<ReferenceStandard>(`${this.seedBaseUrl}/api/flexibility/consumption-data/reference/${userId}/REFERENCE_STANDARD`)

    return this.cacheService.get(
      this.CACHE_NAMESPACE,
      key,
      source$
    )
  }

  hasTheoreticalData(userId: string) {
    const key = `${userId}-theoretical`;

    const source$ = this.http.get<TheoreticalResponse>(`${this.seedBaseUrl}/api/flexibility/flexibility-data/theoretical/${userId}`)

    return this.cacheService.get(
      this.CACHE_NAMESPACE,
      key,
      source$
    )
  }

  seedFlexibilityData(fspId: string, marketId: string) {
    const body = {
      market: marketId,
      fsp: fspId
    }
    return this.http.post(`${this.seedBaseUrl}/seed-flexibility/seed-flexibility-data`, body)
  }

  uploadFlexibilityData(file: File, fspId: string, marketId: string) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('fsp', fspId);
    formData.append('market', marketId);
    return this.http.post(`${this.seedBaseUrl}/seed-flexibility/upload`, formData);
  }

  calculateTheoreticalFlexibilityData(userId: string, accessToken: string) {
    const headers = new HttpHeaders({
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    });
    return this.http.post(`${this.seedBaseUrl}/api/flexibility/flexibility-data/theoretical/${userId}/calculate`, {}, { headers });
  }

  calculateActualConsumptionData(userId: string, testDate: string) {
    return this.http.post(`${this.seedBaseUrl}/api/flexibility/flexibility-data/actual/${userId}/${testDate}/calculate`, {});
  }

  // Get all users (optionally filtered by role)
  getAllUsers(role?: string): Observable<{ success: boolean; data: { users: User[]; count: number } }> {

    let key;

    if (role) {
      key = `${role}-users`
    } else {
      key = 'all-users'
    }

    const options = role ? { params: { role } } : {};

    const source$ = this.http.get<{ success: boolean; data: { users: User[]; count: number } }>(
      `${this.baseUrl}/list`,
      options
    )

    return this.cacheService.get(
      this.CACHE_NAMESPACE,
      key,
      source$
    )
  }

  // Delete a user by ID
  deleteUser(userId: string): Observable<{ success: boolean; message: string }> {
    return this.http.delete<{ success: boolean; message: string }>(`${this.baseUrl}/${userId}`).pipe(
      tap(response => {
        if(response.success){
          this.cacheService.clearNamespace(this.CACHE_NAMESPACE)
        }
      }
      )
    );
  }

  // Get current user's assigned market from database
  getMyAssignedMarket(): Observable<{ success: boolean; data: { assignedMarket: string | null } }> {
    return this.http.get<{ success: boolean; data: { assignedMarket: string | null } }>(
      `${this.baseUrl}/me/assigned-market`
    );
  }

  getCurrentUser(): Observable<{ success: boolean; data: User }> {
    return this.http.get<{ success: boolean; data: User }>(
      `${this.baseUrl}/me`
    );
  }

  getUserByWalletAddress(walletAddress: string) : Observable<{ success: boolean; data: User }> {
    const key = walletAddress;

    const source$ = this.http.get<{ success: boolean; data: User }>(
      `${this.baseUrl}/address/${walletAddress}`
    );

    return this.cacheService.get(
      this.CACHE_NAMESPACE,
      key,
      source$
    )
  }

  getSessionPlateByAddress(address:string): Observable<{success: boolean; data: any}>{
    const key = address;

    const source$ = this.http.get<{ success: boolean; data: User }>(
      `${this.baseUrl}/address/session/${address}`
    );

    return this.cacheService.get(
      this.CACHE_NAMESPACE,
      key,
      source$
    )
  }
}
