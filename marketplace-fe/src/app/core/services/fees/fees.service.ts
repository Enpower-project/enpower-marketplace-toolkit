import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { map, tap } from 'rxjs/operators';
import { environment } from '../../../../environments/environment';
import { CacheService } from '../cache/cache.service';

export interface SessionFees {
  sessionId: string;
  sessionName?: string;
  sessionAddress: string;
  totalFees: string;
  settlementsCount: number;
}

export interface MarketFeesSummary {
  marketId: string;
  totalFees: string;
  totalSettlements: number;
  executedSettlements: number;
  feesBySession: SessionFees[];
}

@Injectable({
  providedIn: 'root'
})
export class FeesService {
  private readonly baseUrl = `${environment.apiUrl}/settlements`;
  private readonly CACHE_NAMESPACE = 'fees';

  constructor(private http: HttpClient, private cacheService: CacheService) { }

 getMarketFeesSummary(
    marketId: string
  ): Observable<MarketFeesSummary> {
    const cacheKey = `market_${marketId}`;
    
    const source$ = this.http.get<{ statusCode: number; data: MarketFeesSummary }>(
      `${this.baseUrl}/market/${marketId}/fees-summary`
    ).pipe(
      map(response => response.data)
    );

    return this.cacheService.get(
      this.CACHE_NAMESPACE,
      cacheKey,
      source$
    );
  }
}
