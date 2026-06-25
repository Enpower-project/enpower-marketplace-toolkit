import { Pipe, type PipeTransform } from '@angular/core';
import { SessionStatus } from '../models/session.model';

@Pipe({
  name: 'sessionstatus',
})
export class SessionStatusPipe implements PipeTransform {

  transform(value: SessionStatus): String {
    switch (value) {
      case SessionStatus.DRAFT:
        return '#ff9800e6';
      case SessionStatus.APPROVED:
        return '#03a9f4e6';
      case SessionStatus.PUBLISHED:
        return '#9c27b0e6';
      case SessionStatus.ACTIVE:
        return '#4caf50e6';
      case SessionStatus.OFFERS_CLOSED:
        return '#607d8be6';
      case SessionStatus.COMPLETED:
        return '#1b5e20';
      case SessionStatus.CANCELLED:
        return '#e65100';
      case SessionStatus.IN_DELIVERY:
        return '#ffc107e6';
      case SessionStatus.SETTLEMENT_PENDING:
        return '#ff5722e6';
      case SessionStatus.SETTLED:
        return '#4caf50e6';              
      default:
        return '#607d8be6';
    }
  }

}
