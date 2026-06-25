import { Pipe, type PipeTransform } from '@angular/core';
import { SessionStatus } from '../models/session.model';

@Pipe({
  name: 'statusdisplayname',
})
export class StatusDisplaynamePipe implements PipeTransform {

  transform(value: SessionStatus): string {
    switch (value) {
      case SessionStatus.DRAFT:
        return 'Draft';
      case SessionStatus.APPROVED:
        return 'Approved';
      case SessionStatus.PUBLISHED:
        return 'Published';
      case SessionStatus.ACTIVE:
        return 'Active-Offers Open';
      case SessionStatus.OFFERS_CLOSED:
        return 'Offers Closed';
      case SessionStatus.COMPLETED:
        return 'Completed';
      case SessionStatus.CANCELLED:
        return 'Cancelled';
      case SessionStatus.IN_DELIVERY:
        return 'In Delivery';
      case SessionStatus.SETTLEMENT_PENDING:
        return 'Settlement Pending';
      case SessionStatus.SETTLED:
        return 'Settled';
      default:
        return 'Status error';
    }
  }

}
