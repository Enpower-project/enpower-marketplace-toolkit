import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';

export interface ChangePasswordDto {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

export interface CompleteProfileDto {
  firstName?: string;
  lastName?: string;
  phone?: string;
  address?: string;
  city?: string;
  country?: string;
  postalCode?: string;
}

export interface FirstLoginResponse {
  success: boolean;
  message: string;
  data?: any;
}

@Injectable({ providedIn: 'root' })
export class FirstLoginService {
  private readonly apiUrl = `${environment.apiGatewayUrl}/auth/first-login`;

  constructor(private readonly http: HttpClient) {}

  /**
   * Cambia la contraseña del usuario después del primer login
   * y actualiza el estado en MongoDB
   */
  changePassword(userId: string, dto: ChangePasswordDto): Observable<FirstLoginResponse> {
    return this.http.put<FirstLoginResponse>(`${this.apiUrl}/change-password/${userId}`, dto);
  }

  /**
   * Completa el perfil del usuario después del primer login
   * y actualiza el estado en MongoDB
   */
  completeProfile(userId: string, dto: CompleteProfileDto): Observable<FirstLoginResponse> {
    return this.http.put<FirstLoginResponse>(`${this.apiUrl}/complete-profile/${userId}`, dto);
  }

  /**
   * Inicia el proceso de primer login
   */
  initiateFirstLogin(email: string): Observable<FirstLoginResponse> {
    return this.http.post<FirstLoginResponse>(`${this.apiUrl}/initiate`, { email });
  }
}
