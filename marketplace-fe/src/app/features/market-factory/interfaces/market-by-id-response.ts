import { Market } from "../../../shared/models/market-place/market-model"

export interface MarketByIdResponse{
    
        success: boolean,
        data: {
          market: Market
        },
        message: string
      
}