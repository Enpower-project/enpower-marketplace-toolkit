import { IsEthereumAddress } from 'class-validator';

export class GrantRoleDto {
  @IsEthereumAddress()
  address: string;
}
