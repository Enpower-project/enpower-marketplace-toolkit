import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { config, Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';


@Injectable({
  providedIn: 'root'  // Singleton global
})
export class BlockchainService {
  private apiUrl = environment.apiGatewayUrl;


  constructor(private http: HttpClient) { }


  createMarket(/* description: string, region: string, */ dsoAddress: string): Observable<{ data: any; }> {
    return this.http.post<{ data: string }>(`${this.apiUrl}/market-factory/market`, { /* description, region, */ dsoAddress });
  }

  getMarkets() {
    return this.http.get<{ markets: string[] }>(`${this.apiUrl}/market-factory/list`);
  }

  createMarketSession(marketAddress: string): Observable<{ data: any; }> {
    return this.http.post<{ data: string }>(`${this.apiUrl}/market/session`, { marketAddress });
  }


  // Obtener el mercado asociado a un dso
  getMarketDso(dso: string): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/users/market/${dso}`);
  }

  // Obtener las sesiones de un mercado
  getMarketSessions(marketId: string): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/markets/${marketId}/sessions`);
  }


  // Crear un bid en una sesión
  createBid(
    sessionId: string,
    data: {
      quantity: number,
      price: number,
      startDTime: number,
      endDTime: number,
      flexType: string
    }
  ): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/sessions/${sessionId}/bids`, data);
  }

  // Crear una offer en una sesión
  createOffer(
    sessionId: string,
    data: {
      quantity: number,
      price: number,
      startDTime: number,
      endDTime: number,
      flexType: string
    }
  ): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/sessions/${sessionId}/offers`, data);
  }


  //SESSIONS MANAGEMENT

  openBidSession(sessionId: string): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/sessions/${sessionId}/open-bid-session`, {});
  }
  openOfferSession(sessionId: string): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/sessions/${sessionId}/open-offer-session`, {});
  }
  closeBidSession(sessionId: string): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/sessions/${sessionId}/close-bid-session`, {});
  }
  closeOfferSession(sessionId: string): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/sessions/${sessionId}/close-offer-session`, {});
  }
  stopTrading(sessionId: string): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/sessions/${sessionId}/stop-trading`, {});
  }
  doMatch(sessionId: string): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/sessions/${sessionId}/do-match`, {});
  }
  verifyOffers(sessionId: string): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/sessions/${sessionId}/verify-offers`, {});
  }
  executeContract(sessionId: string): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/sessions/${sessionId}/execute-contract`, {});
  }
  closeSession(sessionId: string): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/sessions/${sessionId}/close-session`, {});
  }

}
