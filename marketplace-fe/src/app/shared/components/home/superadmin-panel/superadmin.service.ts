import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class SuperadminService {
  private apiUrl = environment.apiGatewayUrl;

  constructor(private http: HttpClient) {}

  getAllUsers(): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/users`);
  }

  assignRole(userId: string, role: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/users/assign-role`, { userId, role });
  }

  getWallet(userId: string): Observable<any> {
    return this.http.get(`${this.apiUrl}/wallet/user/${userId}`);
  }

  createWallet(userId: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/wallet/create/${userId}`, {});
  }
}
