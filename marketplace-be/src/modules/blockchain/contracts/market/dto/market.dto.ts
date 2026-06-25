import { IsEthereumAddress, IsString, IsInt, Min, Max, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { SessionStatus } from '../../../types/blockchain.types';

export class FlexibilityRequestInputDto {
  @IsInt()
  @Min(0)
  @Max(23)
  hourSlot: number;

  @IsString()
  quantity: string; // in wei

  @IsString()
  price: string; // in wei

  @IsInt()
  @Min(0)
  @Max(1)
  flexType: number; // 0=UPWARD (DEMAND), 1=DOWNWARD (SUPPLY)
}

export class CreateSessionDto {
  @IsInt()
  deliveryDay: number; // timestamp

  @IsEthereumAddress()
  treasuryAddress: string;

  @IsEthereumAddress()
  fmoLmoAddress: string;

  @IsEthereumAddress()
  frpAddress: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FlexibilityRequestInputDto)
  requests: FlexibilityRequestInputDto[];
}

export class SessionInfoDto {
  sessionAddress: string;
  deliveryDay: number;
  createdAt: number;
  status: SessionStatus;
}
