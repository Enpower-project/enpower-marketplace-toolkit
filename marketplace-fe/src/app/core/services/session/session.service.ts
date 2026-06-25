import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, BehaviorSubject, throwError, of } from 'rxjs';
import { tap, catchError, switchMap } from 'rxjs/operators';
import { environment } from '../../../../environments/environment';
import {
  Session,
  CreateSessionRequest,
  UpdateSessionRequest,
  CreateBidRequest,
  SessionResponse,
  SessionListResponse,
  SessionDraft,
  TimeSlot,
  BidType
} from '../../../shared/models/session.model';
import { MarketHttpService } from '../blockchain/contracts/market/market.http.service';
import { CacheService } from '../cache/cache.service';

@Injectable({
  providedIn: 'root'
})
export class SessionService {
  private readonly apiUrl = `${environment.apiUrl}/sessions`;
  private readonly CACHE_NAMESPACE = 'sessions';

  // State management
  private sessionsSubject = new BehaviorSubject<Session[]>([]);
  public sessions$ = this.sessionsSubject.asObservable();

  private currentSessionSubject = new BehaviorSubject<Session | null>(null);
  public currentSession$ = this.currentSessionSubject.asObservable();

  constructor(
    private http: HttpClient,
    private marketHttpService: MarketHttpService,
    private cacheService: CacheService
  ) { }

  // API Methods
  getSessions(): Observable<SessionListResponse> {
    const key = 'sessions-cache'

    const source$ =  this.http.get<SessionListResponse>(this.apiUrl).pipe(
      tap(response => {
        if (response.success) {
          this.sessionsSubject.next(response.data);
        }
      }),
      catchError(error => {
        if (error.status === 428) {
          return throwError(() => ({
            ...error,
            isMarketSelectionRequired: true,
            availableMarkets: error.error?.availableMarkets
          }));
        }
        return throwError(() => error);
      })
    );

    return this.cacheService.get(
      this.CACHE_NAMESPACE,
      key,
      source$
    )
  }

  //Get the sessions where the FSP has created offers
  getMySessions() : Observable<SessionListResponse> {
    const key = 'my-sessions'

    const source$ = this.http.get<SessionListResponse>(`${this.apiUrl}/my-sessions`).pipe(
      tap(response => {
        if(response.success){
          this.sessionsSubject.next(response.data);
        }
      }),
      catchError(error => {
        return throwError(() => error)
      })
    )

    return this.cacheService.get(
      this.CACHE_NAMESPACE,
      key,
      source$
    )
  }

  getActiveSessions(): Observable<SessionListResponse> {
    const key = 'active-sessions';

    const source$ = this.http.get<SessionListResponse>(`${this.apiUrl}/active/list`).pipe(
      tap(response => {
        if (response.success) {
          this.sessionsSubject.next(response.data);
        }
      }),
      catchError(error => {
        return throwError(() => error);
      })
    );

    return this.cacheService.get(
      this.CACHE_NAMESPACE,
      key,
      source$
    )
  }

  getSessionById(sessionId: string): Observable<SessionResponse> {
    const key = `SessionId-${sessionId}`;

    const source$ = this.http.get<SessionResponse>(`${this.apiUrl}/${sessionId}`).pipe(
      tap(response => {
        if (response.success) {
          this.currentSessionSubject.next(response.data);
        }
      })
    );

    return this.cacheService.get(
      this.CACHE_NAMESPACE,
      key,
      source$
    )
  }

  getSessionByAddress(sessionAdress: string): Observable<SessionResponse> {
    const key = `SessionAddress-${sessionAdress}`

    const source$ = this.http.get<SessionResponse>(`${this.apiUrl}/${sessionAdress}`).pipe(
      tap(response => {
        if (response.success) {
          this.currentSessionSubject.next(response.data)
        }
      })
    )

    return this.cacheService.get(
      this.CACHE_NAMESPACE,
      key,
      source$
    )
  }

  createSession(sessionData: CreateSessionRequest): Observable<SessionResponse> {
    return this.http.post<SessionResponse>(this.apiUrl, sessionData).pipe(
      tap(response => {
        if (response.success) {
          this.refreshSessions();
          this.currentSessionSubject.next(response.data);
          this.cacheService.clearNamespace(this.CACHE_NAMESPACE);
        }
      }),
      catchError(error => {
        if (error.status === 428) {
          return throwError(() => ({
            ...error,
            isMarketSelectionRequired: true,
            availableMarkets: error.error?.availableMarkets
          }));
        }
        return throwError(() => error);
      })
    );
  }

  

  updateSession(sessionId: string, sessionData: UpdateSessionRequest): Observable<SessionResponse> {
    return this.http.put<SessionResponse>(`${this.apiUrl}/${sessionId}`, sessionData).pipe(
      tap(response => {
        if (response.success) {
          this.refreshSessions();
          this.currentSessionSubject.next(response.data);
          this.cacheService.clearNamespace(this.CACHE_NAMESPACE);
        }
      })
    );
  }

  addBidToSession(sessionId: string, bid: CreateBidRequest): Observable<SessionResponse> {
    return this.http.post<SessionResponse>(`${this.apiUrl}/${sessionId}/bids`, bid).pipe(
      tap(response => {
        if (response.success) {
          this.currentSessionSubject.next(response.data);
        }
      })
    );
  }

  removeBidFromSession(sessionId: string, hour: number): Observable<SessionResponse> {
    return this.http.delete<SessionResponse>(`${this.apiUrl}/${sessionId}/bids/${hour}`).pipe(
      tap(response => {
        if (response.success) {
          this.currentSessionSubject.next(response.data);
        }
      })
    );
  }

  approveSession(sessionId: string): Observable<SessionResponse> {
    return this.http.post<SessionResponse>(`${this.apiUrl}/${sessionId}/approve`, {}).pipe(
      tap(response => {
        if (response.success) {
          this.refreshSessions();
          this.currentSessionSubject.next(response.data);
          this.cacheService.clearNamespace(this.CACHE_NAMESPACE);
        }
      }),
      catchError(error => {
        return throwError(() => error);
      })
    );
  }

  publishSession(sessionId: string): Observable<SessionResponse> {
    return this.http.post<SessionResponse>(`${this.apiUrl}/${sessionId}/publish`, {}).pipe(
      switchMap(response => {
        if (response.success && response.data.marketAddress) {
          // Crear session en blockchain después de publicar en DB
          return this.createBlockchainSession(response.data).pipe(
            tap(() => {
              this.refreshSessions();
              this.currentSessionSubject.next(response.data);
              this.cacheService.clearNamespace(this.CACHE_NAMESPACE);
            }),
            catchError(blockchainError => {
              // Aunque falle el blockchain, la sesión ya está publicada en DB
              this.refreshSessions();
              this.currentSessionSubject.next(response.data);
              return throwError(() => blockchainError);
            }),
            // Devolver la respuesta original de la BD
            switchMap(() => [response])
          );
        } else {
          this.refreshSessions();
          this.currentSessionSubject.next(response.data);
          return [response];
        }
      })
    );
  }

  /**
   * Publica una sesión usando el PIN del usuario para firmar la transacción
   * @param sessionId ID de la sesión
   * @param pin PIN de 6 dígitos del usuario
   */
  publishSessionWithPin(sessionId: string, pin: string): Observable<SessionResponse> {
    return this.http.post<SessionResponse>(`${this.apiUrl}/${sessionId}/publish-with-pin`, { pin }).pipe(
      tap(response => {
        if (response.success) {
          this.refreshSessions();
          this.currentSessionSubject.next(response.data);
          this.cacheService.clearNamespace(this.CACHE_NAMESPACE);
        }
      }),
      catchError(error => {
        return throwError(() => error);
      })
    );
  }

  /**
   * Abre el período de offers con PIN (PUBLISHED -> ACTIVE)
   * @param sessionId ID de la sesión
   * @param pin PIN de 6 dígitos del usuario FMO_LMO
   */
  openOffersPeriod(sessionId: string, pin: string): Observable<SessionResponse> {
    return this.http.post<SessionResponse>(`${this.apiUrl}/${sessionId}/open-offers`, { pin }).pipe(
      tap(response => {
        if (response.success) {
          this.refreshSessions();
          this.currentSessionSubject.next(response.data);
          this.cacheService.clearNamespace(this.CACHE_NAMESPACE);
        }
      }),
      catchError(error => {
        return throwError(() => error);
      })
    );
  }

  /**
   * Cierra el periodo de ofertas (ACTIVE -> OFFERS_CLOSED)
   * @param sessionId ID de la sesión
   * @param pin PIN de 6 dígitos del usuario FMO_LMO
   */
  closeOffersPeriod(sessionId: string, pin: string): Observable<SessionResponse> {
    return this.http.post<SessionResponse>(`${this.apiUrl}/${sessionId}/close-offers`, { pin }).pipe(
      tap(response => {
        if (response.success) {
          this.refreshSessions();
          this.currentSessionSubject.next(response.data);
          this.cacheService.clearNamespace(this.CACHE_NAMESPACE);
        }
      }),
      catchError(error => {
        return throwError(() => error);
      })
    );
  }

  /**
   * Revierte una sesión de APPROVED a DRAFT
   */
  revertSessionToDraft(sessionId: string): Observable<SessionResponse> {
    return this.http.post<SessionResponse>(
      `${this.apiUrl}/${sessionId}/revert-to-draft`,
      {}
    ).pipe(
      tap(response => {
        if (response.success) {
          this.refreshSessions();
          this.cacheService.clearNamespace(this.CACHE_NAMESPACE);
        }
      }),
      catchError(error => {
        return throwError(() => error);
      })
    );
  }

  /**
   * FSP devuelve sus tokens de una sesión CANCELLED
   * @param sessionId ID de la sesión
   * @param pin PIN del usuario para autenticación blockchain
   */
  returnTokens(sessionId: string, pin: string): Observable<SessionResponse> {
    return this.http.post<SessionResponse>(
      `${this.apiUrl}/${sessionId}/return-tokens`,
      { pin }
    ).pipe(
      tap(response => {
        if (response.success) {
          this.refreshSessions();
          this.cacheService.clearNamespace(this.CACHE_NAMESPACE);
        }
      }),
      catchError(error => {
        return throwError(() => error);
      })
    );
  }

  /**
   * Crea una session en el blockchain (smart contract)
   * @private
   */
  private createBlockchainSession(session: Session): Observable<any> {
    if (!session.marketAddress) {
      return throwError(() => new Error('Market address is required to create blockchain session'));
    }

    // Preparar flexibility requests desde los bids
    const requests = session.bids.map(bid => ({
      hourSlot: bid.hour,
      quantity: this.convertMWhToWei(bid.powerMw), // Convertir MW a wei
      price: this.convertPriceToWei(bid.pricePerMwh), // Convertir Flex/MWh a wei
      flexType: bid.bidType === BidType.UPWARD ? 0 : 1, // 0 = UPWARD, 1 = DOWNWARD
    }));

    // Delivery day (timestamp de la fecha de la sesión)
    const deliveryDay = Math.floor(new Date(session.sessionDate).getTime() / 1000);

    const createSessionDto = {
      deliveryDay,
      treasuryAddress: environment.contracts.TREASURY,
      fmoLmoAddress: session.fmoLmoAddress || '0x0000000000000000000000000000000000000000', // TODO: obtener del contexto
      frpAddress: session.frpAddress || '0x0000000000000000000000000000000000000000', // TODO: obtener del contexto
      requests,
    };
    return this.marketHttpService.createSession(session.marketAddress, createSessionDto);
  }

  /**
   * Convierte MW a wei (1 MWh = 1e18 wei)
   * @private
   */
  private convertMWhToWei(mwh: number): string {
    // 1 MWh = 1e18 wei
    return (BigInt(Math.floor(mwh * 1e6)) * BigInt(1e12)).toString();
  }

  /**
   * Convierte Flex/MWh a wei de token FLEX
   * @private
   */
  private convertPriceToWei(pricePerMwh: number): string {
    // 1 FLEX = 1e18 wei
    return (BigInt(Math.floor(pricePerMwh * 1e6)) * BigInt(1e12)).toString();
  }

  deleteSession(sessionId: string): Observable<{ success: boolean; message: string }> {
    return this.http.delete<{ success: boolean; message: string }>(`${this.apiUrl}/${sessionId}`).pipe(
      tap(response => {
        if (response.success) {
          this.refreshSessions();
          this.currentSessionSubject.next(null);
          this.cacheService.clearNamespace(this.CACHE_NAMESPACE)
        }
      })
    );
  }

  // Helper Methods
  refreshSessions(): void {
    this.getSessions().subscribe();
  }

  clearCurrentSession(): void {
    this.currentSessionSubject.next(null);
  }

  // Utility methods for UI
  generateTimeSlots(): TimeSlot[] {
    const slots: TimeSlot[] = [];

    for (let hour = 0; hour < 24; hour++) {
      const startTime = this.formatHour(hour);
      const endTime = this.formatHour((hour + 1) % 24);

      slots.push({
        hour,
        startTime,
        endTime,
        displayTime: `${startTime} - ${endTime}`,
        hasData: false
      });
    }

    return slots;
  }

  mapSessionToTimeSlots(session: Session): TimeSlot[] {
    const slots = this.generateTimeSlots();

    // Map existing bids to time slots
    session.bids.forEach(bid => {
      const slot = slots.find(s => s.hour === bid.hour);
      if (slot) {
        slot.bid = bid;
        slot.hasData = true;
      }
    });

    return slots;
  }

  createEmptySessionDraft(): SessionDraft {
    return {
      name: '',
      description: '',
      sessionDate: new Date(),
      bids: new Map<number, CreateBidRequest>()
    };
  }

  validateSessionDraft(draft: SessionDraft): string[] {
    const errors: string[] = [];

    if (!draft.name || draft.name.trim().length === 0) {
      errors.push('Session name is required');
    }

    if (!draft.sessionDate) {
      errors.push('Session date is required');
    } else {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const sessionDate = new Date(draft.sessionDate);
      sessionDate.setHours(0, 0, 0, 0);

      if (sessionDate < today) {
        errors.push('Session date cannot be in the past');
      }
    }

    if (draft.bids.size === 0) {
      errors.push('At least one bid is required');
    }

    // Validate individual bids
    draft.bids.forEach((bid, hour) => {
      if (bid.powerMw <= 0) {
        errors.push(`Power for hour ${hour} must be greater than 0`);
      }

      if (bid.pricePerMwh <= 0) {
        errors.push(`Price for hour ${hour} must be greater than 0`);
      }
    });

    return errors;
  }

  convertDraftToRequest(draft: SessionDraft): CreateSessionRequest {
    return {
      name: draft.name.trim(),
      description: draft.description?.trim() || undefined,
      sessionDate: draft.sessionDate.toISOString().split('T')[0], // YYYY-MM-DD
      bids: Array.from(draft.bids.values())
    };
  }

  getBidTypeName(bidType: BidType): string {
    switch (bidType) {
      case BidType.UPWARD:
        return 'Upward';
      case BidType.DOWNWARD:
        return 'Downward';
      default:
        return 'Unknown';
    }
  }

  getBidTypeColor(bidType: BidType): string {
    switch (bidType) {
      case BidType.UPWARD:
        return 'warn';
      case BidType.DOWNWARD:
        return 'primary';
      default:
        return 'accent';
    }
  }

  private formatHour(hour: number): string {
    return hour.toString().padStart(2, '0') + ':00';
  }

  getStatusDisplayName(status: string): string {
    switch (status) {
      case 'DRAFT':
        return 'Draft';
      case 'APPROVED':
        return 'Approved';
      case 'PUBLISHED':
        return 'Published';
      case 'ACTIVE':
        return 'Active-Offers Open';
      case 'OFFERS_CLOSED':
        return 'Offers Closed';
      case 'COMPLETED':
        return 'Completed';
      case 'CANCELLED':
        return 'Cancelled';
      case 'IN_DELIVERY':
        return 'In Delivery';
      case 'SETTLEMENT_PENDING':
        return 'Settlement Pending';
      case 'SETTLED':
        return 'Settled';
      default:
        return status;
    }
  }

  getStatusColor(status: string): string {
    switch (status) {
      case 'DRAFT':
        return 'orange';
      case 'APPROVED':
        return 'sky-blue';
      case 'PUBLISHED':
        return 'purple';
      case 'ACTIVE':
        return 'green';
      case 'OFFERS_CLOSED':
        return 'dark-gray';
      case 'COMPLETED':
        return 'primary';
      case 'CANCELLED':
        return 'warn';
      case 'IN_DELIVERY':
        return 'in-delivery';
      case 'SETTLEMENT_PENDING':
        return 'settlement-pending';
      case 'SETTLED':
        return 'settled';
      default:
        return 'basic';
    }
  }

  clearSessionCache(): void {
  this.cacheService.clearNamespace(this.CACHE_NAMESPACE);
}
}
