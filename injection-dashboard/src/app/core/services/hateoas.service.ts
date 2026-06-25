// src/app/core/services/hateoas.service.ts
import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { HateoasCollection } from '../models/hateoas.interface';
import { environment } from '../../../environments/environment';

export abstract class HateoasService<T> {
  protected baseUrl: string;

  constructor(
    protected http: HttpClient,
    protected resourcePath: string
  ) {
    this.baseUrl = `${environment.apiUrl}/${resourcePath}`;
  }

  getAll(page?: number, size?: number, sort?: string): Observable<HateoasCollection<T>> {
    let params = new HttpParams();
    
    if (page !== undefined) {
      params = params.set('page', page.toString());
    }
    if (size !== undefined) {
      params = params.set('size', size.toString());
    }
    if (sort) {
      params = params.set('sort', sort);
    }

    return this.http.get<HateoasCollection<T>>(this.baseUrl, { params })
      .pipe(catchError(this.handleError.bind(this)));
  }

  getById(id: string | number): Observable<T> {
    return this.http.get<T>(`${this.baseUrl}/${id}`)
      .pipe(catchError(this.handleError.bind(this)));
  }

  create(resource: Partial<T>): Observable<T> {
    return this.http.post<T>(this.baseUrl, resource)
      .pipe(catchError(this.handleError.bind(this)));
  }

  update(id: string | number, resource: Partial<T>): Observable<T> {
    return this.http.put<T>(`${this.baseUrl}/${id}`, resource)
      .pipe(catchError(this.handleError.bind(this)));
  }

  patch(id: string | number, resource: Partial<T>): Observable<T> {
    return this.http.patch<T>(`${this.baseUrl}/${id}`, resource)
      .pipe(catchError(this.handleError.bind(this)));
  }

  delete(id: string | number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}`)
      .pipe(catchError(this.handleError.bind(this)));
  }

  search(searchMethod: string, params: { [key: string]: any }): Observable<HateoasCollection<T>> {
    let httpParams = new HttpParams();
    
    Object.keys(params).forEach(key => {
      if (params[key] !== null && params[key] !== undefined) {
        httpParams = httpParams.set(key, params[key].toString());
      }
    });

    return this.http.get<HateoasCollection<T>>(
      `${this.baseUrl}/search/${searchMethod}`,
      { params: httpParams }
    ).pipe(catchError(this.handleError.bind(this)));
  }

  extractItems<R>(collection: HateoasCollection<R>, resourceName: string): R[] {
    return collection._embedded?.[resourceName] || [];
  }

  protected handleError(error: HttpErrorResponse): Observable<never> {
    console.error(`${this.resourcePath} service error:`, error);
    
    let message = 'An unexpected error occurred';
    
    if (error.error?.detail) {
      message = error.error.detail;
    } else if (error.error?.message) {
      message = error.error.message;
    } else if (error.message) {
      message = error.message;
    }

    return throwError(() => ({ 
      status: error.status, 
      message 
    }));
  }
}