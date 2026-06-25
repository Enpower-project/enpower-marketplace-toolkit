import { Pipe, type PipeTransform } from '@angular/core';

@Pipe({
  name: 'capitalize',
})
export class CapitalizePipe implements PipeTransform {

  transform(value: string): string {
    if (!value) return value;
    return value[0].toUpperCase() + value.slice(1);
  }

}
