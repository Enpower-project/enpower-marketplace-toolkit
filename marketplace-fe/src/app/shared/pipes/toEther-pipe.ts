import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'toEther',
  standalone: true,
})
export class ToEtherPipe implements PipeTransform {

  transform(value: string | number, decimals: number = 6): string {
    if (value === null || value === undefined) return '0 ETH';

    const ether = Number(value) / 1e18;

    return `${ether.toFixed(decimals)} ETH`;
  }
}
