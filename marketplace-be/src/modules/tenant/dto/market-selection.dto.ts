import { IsString, IsNotEmpty } from 'class-validator';

export class MarketSelectionDto {
  @IsString()
  @IsNotEmpty()
  selectedMarketId: string;
}


export interface MarketSelectionResponse {
  success: boolean;
  message: string;
  marketId?: string;
  requiresTokenRefresh?: boolean; // 🎯 NUOVO CAMPO
  // 🎯 RIMOSSO: enhancedJwt, fallbackMarketId
}

export interface MarketInfo {
  id: string;
  name: string;
}

export class MultipleMarketsResponse {
  availableMarkets: string[];
  availableMarketsWithNames?: MarketInfo[];
  requiresSelection: boolean;
  message: string;
  selectedMarket?: string; // 🎯 Campo opcional para market ya seleccionado
  selectedMarketName?: string; // 🎯 Nombre del market seleccionado
}
