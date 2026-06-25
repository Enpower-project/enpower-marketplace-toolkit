import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { map, Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { FlexibilityDataDto, MeasurementType } from '../../../shared/models/flexibility.model';

@Injectable({
  providedIn: 'root'
})
export class FlexibilityService {
    private readonly baseUrl = `${environment.apiUrl}/api/flexibility`;

    constructor(private readonly http: HttpClient) {}

    getTheoreticalFlexibility(): Observable<FlexibilityDataDto> {
        const url = `${this.baseUrl}/flexibility-data/me/theoretical`;
        return this.http.get<FlexibilityDataDto>(url);
    }

    getHourlyTheoreticalFlexibility(direction: MeasurementType): Observable<number[]> {
    return this.getTheoreticalFlexibility().pipe(
      map((dto) => {
        const m = dto.measurements.find(
          (x) => x.periodInMinutes === 60 && x.type === direction,
        );

        if (!m) {
          throw new Error(
            `do not exist period=60 to measurement=${direction}`,
          );
        }

        if (m.values.length !== 24) {
          throw new Error(
            `invalid: it was expected 24 values not: ${m.values.length}`,
          );
        }
        return m.values.map(value => value / 1000);
      }),
    );
  }
}
