import { Market } from "../../../shared/models/market-place/market-model"

export interface MarketActivateResponse {
    success: boolean,
    data: {
        market: Market,
        blockchain: {
            txHash: string,
            marketAddress: string,
            success: boolean
        },
        message: string
    }
}

