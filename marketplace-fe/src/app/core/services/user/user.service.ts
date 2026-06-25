import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { environment } from '../../../../environments/environment';

export interface User {
  _id: string;
  username: string;
  email: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  role?: string;
}

export interface UserResponse {
  success: boolean;
  data?: {
    user: User;
  };
  message?: string;
}

@Injectable({
  providedIn: 'root'
})
export class UserService {
  private readonly baseUrl = `${environment.apiGatewayUrl}/users`;
  private readonly seedBaseUrl = `${environment.apiGatewayUrl}`;

  constructor(private readonly http: HttpClient) {}

  /**
   * Get user information by their MongoDB _id
   */
  getUserById(userId: string): Observable<User | null> {
    return this.http.get<UserResponse>(`${this.baseUrl}/${userId}`).pipe(
      map(response => {
        if (response.success && response.data?.user) {
          return response.data.user;
        }
        return null;
      }),
      catchError(error => {
        return of(null);
      })
    );
  }

  seedFlexibilityData(fspId: string, marketId: string) {
    const body = {
      market: marketId,
      fsp: fspId 
    }
    return this.http.post(`${this.seedBaseUrl}/seed-flexibility/seed-flexibility-data`, body)
  }

  calculateTheoreticalConpsumptionData(userId: string) {
    return this.http.post(`${this.seedBaseUrl}/api/flexibility/flexibility-data/theoretical/${userId}/calculate`, {});
  }

  calculateActualConsumptionData(userId: string, testDate: string) {
    return this.http.post(`${this.seedBaseUrl}/api/flexibility/flexibility-data/actual/${userId}/${testDate}/calculate`, {});
  }

  /**
   * Get user information by email
   */
  getUserByEmail(email: string): Observable<User | null> {
    return this.http.get<UserResponse>(`${this.baseUrl}/by-email/${email}`).pipe(
      map(response => {
        if (response.success && response.data?.user) {
          return response.data.user;
        }
        return null;
      }),
      catchError(error => {
        return of(null);
      })
    );
  }

  /**
   * Get all users (MARKETPLACE_ADMIN only)
   */
  getAllUsers(): Observable<any> {
    return this.http.get<any>(`${this.baseUrl}`);
  }

  /**
   * Delete user by ID (MARKETPLACE_ADMIN only)
   */
  deleteUser(userId: string): Observable<any> {
    return this.http.delete<any>(`${this.baseUrl}/${userId}`);
  }

  /**
   * Get user by Keycloak ID
   */
  getUserByKeycloakId(keycloakId: string): Observable<User> {
    return this.http.get<any>(`${this.baseUrl}/keycloak/${keycloakId}`).pipe(
      map(response => response.data || response)
    );
  }
}