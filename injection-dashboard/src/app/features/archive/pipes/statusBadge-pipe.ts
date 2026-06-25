import { Pipe, type PipeTransform } from '@angular/core';
import { EntryStatus } from '../../../core/models/entry-status';

@Pipe({
  name: 'statusBadgePipe',
})
export class StatusBadgePipe implements PipeTransform {

  transform(value?: string, valueEnum?: EntryStatus): string {
    if (value) {
      switch (value) {
        case 'NEW':
          return 'badge-new';
        case 'TRANSLATED':
          return 'badge-translated';
        case 'SYNCHRONIZED':
          return 'badge-synchronized';
        case 'ERROR':
          return 'badge-error';
      }
    } else if (valueEnum) {
      switch (valueEnum) {
        case EntryStatus.NEW:
          return 'badge-new';
        case EntryStatus.TRANSLATED:
          return 'badge-translated';
        case EntryStatus.SYNCHRONIZED:
          return 'badge-synchronized';
        case EntryStatus.ERROR:
          return 'badge-error';
      }
    }

    return '';
  }

}
