import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import {
  HourlyOffer,
  CreateHourlyOfferRequest,
  HourlyOfferResponse,
  HourlyOfferListResponse,
  SessionWithBids,
  SessionWithBidsResponse
} from '../../../shared/models/hourly-offer.model';
import { Session, SessionListResponse } from '../../../shared/models/session.model';

@Injectable({
  providedIn: 'root'
})
export class HourlyOfferService {
  private readonly baseUrl = `${environment.apiGatewayUrl}`;

  constructor(private http: HttpClient) {}

  // Obtener sesiones publicadas
  getPublishedSessions(): Observable<SessionListResponse> {
    return this.http.get<SessionListResponse>(`${this.baseUrl}/sessions/published/list`);
  }

  // Obtener sesiones activas (offers period abierto)
  getActiveSessions(): Observable<SessionListResponse> {
    return this.http.get<SessionListResponse>(`${this.baseUrl}/sessions/active/list`);
  }

  // Crear una nueva offer
  createOffer(offer: CreateHourlyOfferRequest): Observable<HourlyOfferResponse> {
    return this.http.post<HourlyOfferResponse>(`${this.baseUrl}/hourly-offers`, offer);
  }

  // Obtener mis offers
  getMyOffers(): Observable<HourlyOfferListResponse> {
    return this.http.get<HourlyOfferListResponse>(`${this.baseUrl}/hourly-offers/my-offers`);
  }

  // Obtener offers de una sesión
  getOffersBySession(sessionId: string): Observable<HourlyOffer[]> {
    return this.http.get<HourlyOffer[]>(`${this.baseUrl}/hourly-offers/session/${sessionId}`);
  }

  // Obtener sesión con bids y offers
  getSessionWithBidsAndOffers(sessionId: string): Observable<SessionWithBidsResponse> {
    return this.http.get<SessionWithBidsResponse>(
      `${this.baseUrl}/hourly-offers/session/${sessionId}/with-bids`
    );
  }

  // Cancelar una offer
  cancelOffer(offerId: string): Observable<HourlyOfferResponse> {
    return this.http.delete<HourlyOfferResponse>(`${this.baseUrl}/hourly-offers/${offerId}`);
  }

  // Publicar offer en blockchain
  publishOffer(offerId: string, pin: string): Observable<HourlyOfferResponse> {
    return this.http.post<HourlyOfferResponse>(
      `${this.baseUrl}/hourly-offers/${offerId}/publish`,
      { pin }
    );
  }
}
