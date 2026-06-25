import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import {
  Invitation,
  InvitationDetails,
  SendInvitationRequest,
  AcceptInvitationRequest,
  InvitationResponse,
  InvitationDetailsResponse,
  AcceptInvitationResponse
} from '../../../shared/models/invitation.model';

@Injectable({
  providedIn: 'root'
})
export class InvitationService {
  private readonly apiUrl = `${environment.apiGatewayUrl}/invitation`;

  constructor(private http: HttpClient) {}

  /**
   * Send an invitation to a user
   * Requires authentication and market_owner role
   */
  sendInvitation(request: SendInvitationRequest): Observable<InvitationResponse> {
    return this.http.post<InvitationResponse>(`${this.apiUrl}/send`, request);
  }

  /**
   * Get invitation details by token
   * Public endpoint - no authentication required
   */
  getInvitationByToken(token: string): Observable<InvitationDetailsResponse> {
    return this.http.get<InvitationDetailsResponse>(`${this.apiUrl}/token/${token}`);
  }

  /**
   * Get all invitations for a market
   * Requires authentication and market_owner role
   */
  getMarketInvitations(marketId: string): Observable<{ success: boolean; data: Invitation[] }> {
    return this.http.get<{ success: boolean; data: Invitation[] }>(`${this.apiUrl}/market/${marketId}`);
  }

  /**
   * Revoke an invitation
   * Requires authentication and market_owner role
   */
  revokeInvitation(invitationId: string): Observable<{ success: boolean; message: string }> {
    return this.http.delete<{ success: boolean; message: string }>(`${this.apiUrl}/${invitationId}`);
  }

  /**
   * Accept an invitation and create user account
   * Public endpoint - no authentication required
   */
  acceptInvitation(token: string, request: AcceptInvitationRequest): Observable<AcceptInvitationResponse> {
    return this.http.post<AcceptInvitationResponse>(`${this.apiUrl}/accept/${token}`, request);
  }

  /**
   * Resend invitation email
   * Requires authentication and market_owner role
   */
  resendInvitation(invitationId: string): Observable<{ success: boolean; message: string }> {
    return this.http.post<{ success: boolean; message: string }>(`${this.apiUrl}/resend/${invitationId}`, {});
  }

  /**
   * Check if a market already has an FRP assigned
   * Requires authentication and market_owner or market_crud role
   */
  checkMarketHasFRP(marketId: string): Observable<{ hasFRP: boolean; email?: string }> {
    return this.http.get<{ hasFRP: boolean; email?: string }>(`${this.apiUrl}/market/${marketId}/has-frp`);
  }

  /**
   * Check if a user already has access to a specific market
   * Requires authentication and market_owner or market_crud role
   */
  checkUserMarketAccess(marketId: string, email: string): Observable<{ hasAccess: boolean; userExists: boolean; message?: string }> {
    const encodedEmail = encodeURIComponent(email);
    return this.http.get<{ hasAccess: boolean; userExists: boolean; message?: string }>(
      `${this.apiUrl}/check-user-access/${marketId}/${encodedEmail}`
    );
  }

  /**
   * Remove FRP from a market
   * Requires authentication and market_owner or market_crud role
   */
  removeFRPFromMarket(marketId: string): Observable<{ success: boolean; message: string }> {
    return this.http.delete<{ success: boolean; message: string }>(`${this.apiUrl}/market/${marketId}/frp`);
  }
}
