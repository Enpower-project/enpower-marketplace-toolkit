import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../../../environments/environment';

export interface NftCertificate {
  tokenId: number;
  sessionId: string;
  sessionName: string;
  sessionDate: Date;
  offerId: number;
  hourSlot: number;
  deliveryDate: Date;
  status: string;
  nftMetadata?: {
    promisedFlexibility: string;
    deliveredFlexibility: string;
    deliveryDate: Date;
    hourSlot: number;
    deviationPercentage: number;
    penaltyApplied: boolean;
  };
  // Owner information
  fspAddress: string;
  fspUsername?: string;
  currentOwner: string;
  finalBuyer?: string | null;
  createdAt: Date;
}

export interface NftCertificateDetail {
  tokenId: number;
  blockchain: {
    sessionId: number;
    offerId: number;
    hourSlot: number;
    fspAddress: string;
    offeredQuantity: string;
    price: string;
    collateralAmount: string;
    fmoLmoAddress: string;
    acceptedQuantity: string;
    deliveredQuantity: string;
    finalBuyer: string;
    actualPayment: string;
    status: string;
    statusCode: number;
    isSoulbound: boolean;
    uri: string;
  };
  offChain?: {
    settlementId: string;
    sessionName: string;
    sessionDate: Date;
    fspUsername: string;
    fspEmail: string;
    deliveryDate: Date;
    committedQuantity: string;
    deviationPercentage: number;
    deviationType: string;
    penaltyAmount: string;
    platformFee: string;
    collateralReturned: string;
    collateralForfeited: string;
    submitTxHash: string;
    executeTxHash: string;
    nftMetadata?: any;
  };
}

export interface NftCertificatesResponse {
  total: number;
  certificates: NftCertificate[];
}

@Injectable({
  providedIn: 'root'
})
export class NftService {
  private readonly baseUrl = `${environment.apiUrl}/blockchain/flexibility-nft`;

  constructor(private http: HttpClient) {}

  /**
   * Get all NFT certificates for the authenticated user
   */
  getMyCertificates(): Observable<NftCertificatesResponse> {
    return this.http.get<{ statusCode: number; data: NftCertificatesResponse }>(
      `${this.baseUrl}/my-certificates`
    ).pipe(
      map(response => response.data)
    );
  }

  /**
   * Get detailed information for a specific NFT certificate
   */
  getCertificateDetail(tokenId: number): Observable<NftCertificateDetail> {
    return this.http.get<{ statusCode: number; data: NftCertificateDetail }>(
      `${this.baseUrl}/certificate/${tokenId}`
    ).pipe(
      map(response => response.data)
    );
  }

  /**
   * Get NFT contract address
   */
  getContractAddress(): Observable<string> {
    return this.http.get<{ statusCode: number; data: { address: string } }>(
      `${this.baseUrl}/contract-address`
    ).pipe(
      map(response => response.data.address)
    );
  }
}
