import { HttpClient, HttpParams, HttpResponse } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { FileIngestionEntry } from '../models/file-ingestion-entry.interface';
import { catchError, map, Observable } from 'rxjs';
import { HateoasService } from './hateoas.service';
import { HateoasCollection } from '../models/hateoas.interface';
import { StatusHistoryItem } from '../models/status-history-item.interface';
import { environment } from '../../../environments/environment.development';
import { UpdateStatusRequest } from '../models/update-status-request.interface';

@Injectable({
  providedIn: 'root'
})
export class FileIngestionEntriesService extends HateoasService<FileIngestionEntry> {

  constructor(http: HttpClient) {
    super(http, 'file-ingestion-entries');
  }

  apiUrl = environment.apiUrl;

  getAllItems(): Observable<FileIngestionEntry[]> {
    return this.getAll().pipe(
      map(collection => this.extractItems(collection, 'file-ingestion-entries'))
    );
  }

  private readonly sortFieldMap: Record<string, string> = {
    entryId: 'entry_id',
    offeringName: 'offering_name',
    originalFileName: 'original_filename',
    entryCreationTimestamp: 'entry_creation_timestamp'
  };

  getStatusHistoryItems(entryId: string): Observable<StatusHistoryItem[]> {
    return this.http.get<any>(
      `${this.baseUrl}/file-ingestion-entries/${entryId}/statusHistoryItems`
    ).pipe(
      map(response => response._embedded?.statusHistoryItems ?? [])
    );
  }

  getStatusHistoryItemsFromUrl(url: string): Observable<StatusHistoryItem[]> {
    return this.http.get<HateoasCollection<StatusHistoryItem>>(
      url
    ).pipe(
      map(response => response._embedded['status-history-items'] ?? [])
    )
  }

  downloadOriginalFile(entryId: string): Observable<HttpResponse<Blob>> {
    return this.http.get(
      `${this.apiUrl}/api/file-ingestion-entries/${entryId}/download/original`,
      { responseType: 'blob', observe: 'response' }
    );
  }

  downloadTranslatedFile(entryId: string): Observable<HttpResponse<Blob>> {
    return this.http.get(
      `${this.apiUrl}/api/file-ingestion-entries/${entryId}/download/translated`,
      { responseType: 'blob', observe: 'response' }
    );
  }

  updateStatus(entryId: string, request: UpdateStatusRequest): Observable<FileIngestionEntry> {
    return this.http.patch<FileIngestionEntry>(
      `${this.apiUrl}/api/file-ingestion-entries/${entryId}/status`,
      request
    );
  }

  searchByFilters(
    page: number,
    size: number,
    filename?: string,
    status?: string,
    fromDate?: string,
    toDate?: string,
    sortField?: string,
    sortDirection?: 'asc' | 'desc',
    offeringName?: string
  ): Observable<HateoasCollection<FileIngestionEntry>> {
    const params: { [key: string]: any } = { page, size };

    if (filename) params['originalFileName'] = filename;
    if (status && status !== 'all') params['status'] = status.toUpperCase();
    if (fromDate) params['entryCreationTimestampFrom'] = `${fromDate}T00:00:00`;
    if (toDate) params['entryCreationTimestampTo'] = `${toDate}T23:59:59`;
    if (offeringName) params['offeringName'] = offeringName;

    if (sortField) {
      const dbColumn = this.sortFieldMap[sortField] ?? 'entry_creation_timestamp';
      params['sortField'] = dbColumn;
      params['sortDirection'] = sortDirection ?? 'desc';
    }

    return this.search('findByFilters', params);
  }

}
