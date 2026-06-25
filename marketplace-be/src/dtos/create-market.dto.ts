import { IsEthereumAddress, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateMarketDto {
  @IsEthereumAddress({ message: 'debe ser una dirección Ethereum válida' })
  dsoAddress: string;

  @IsOptional()
  @IsString({ message: 'debe ser una cadena de texto' })
  @MaxLength(100, { message: 'no puede exceder los 100 caracteres' })
  region?: string;

  @IsOptional()
  @IsString({ message: 'debe ser una cadena de texto' })
  @MaxLength(500, { message: 'no puede exceder los 500 caracteres' })
  description?: string;
}