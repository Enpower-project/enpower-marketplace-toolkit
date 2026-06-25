import { Injectable, Logger } from '@nestjs/common';
import { ethers } from 'ethers';
import { ContractFactoryService } from '../../core/contract-factory.service';
import {
  OfferInfoDto,
  FlexibilityRequestInfoDto,
  SettlementDataDto,
} from './dto/market-session.dto';
import * as MarketSessionABI from '../../../../contracts/MarketSession.json';

/**
 * MarketSessionContractService
 *
 * Service for interacting with MarketSession smart contracts.
 * Handles offers, settlements, and session lifecycle management.
 */
@Injectable()
export class MarketSessionContractService {
  private readonly logger = new Logger(MarketSessionContractService.name);

  // Role hashes
  private readonly FSP = ethers.keccak256(ethers.toUtf8Bytes('FSP'));
  private readonly FMO_LMO = ethers.keccak256(ethers.toUtf8Bytes('FMO_LMO'));
  private readonly ORACLE = ethers.keccak256(ethers.toUtf8Bytes('ORACLE'));

  constructor(private contractFactory: ContractFactoryService) {}

  /**
   * Get a MarketSession contract instance at a specific address
   * @param sessionAddress - Address of the deployed MarketSession contract
   * @param userWallet - Optional user wallet for signing transactions
   */
  private getSessionContract(sessionAddress: string, userWallet?: ethers.Wallet): ethers.Contract {
    if (userWallet) {
      // Create contract with user's wallet as signer
      return new ethers.Contract(sessionAddress, MarketSessionABI.abi, userWallet);
    }
    // Use default admin signer
    return this.contractFactory.createContractAt(MarketSessionABI.abi, sessionAddress);
  }

  /**
   * Set NFT contract for a session
   */
  async setNFTContract(
    sessionAddress: string,
    nftAddress: string,
    userWallet?: ethers.Wallet,
  ): Promise<ethers.ContractTransactionResponse> {
    try {
      const contract = this.getSessionContract(sessionAddress, userWallet);
      this.logger.log(`Setting NFT contract ${nftAddress} for session ${sessionAddress}`);
      const tx = await contract.setNFTContract(nftAddress);
      this.logger.log(`Set NFT contract transaction sent: ${tx.hash}`);
      return tx;
    } catch (error) {
      this.logger.error(`Failed to set NFT contract for session ${sessionAddress}`, error);      
      // Mensaje genérico para todos los errores de blockchain
      throw new Error('The blockchain transaction could not be completed. Please contact the administrator.');
    }
  }

  /**
   * Set participant registry for a session
   */
  async setParticipantRegistry(
    sessionAddress: string,
    registryAddress: string,
    userWallet?: ethers.Wallet,
  ): Promise<ethers.ContractTransactionResponse> {
    try {
      const contract = this.getSessionContract(sessionAddress, userWallet);
      this.logger.log(
        `Setting participant registry ${registryAddress} for session ${sessionAddress}`,
      );
      const tx = await contract.setParticipantRegistry(registryAddress);
      this.logger.log(`Set participant registry transaction sent: ${tx.hash}`);
      return tx;
    } catch (error) {
      this.logger.error(
        `Failed to set participant registry for session ${sessionAddress}`,
        error,
      );      
      // Mensaje genérico para todos los errores de blockchain
      throw new Error('The blockchain transaction could not be completed. Please contact the administrator.');
    }
  }

  /**
   * Open offers period
   */
  async openOffers(sessionAddress: string, userWallet?: ethers.Wallet): Promise<ethers.ContractTransactionResponse> {
    try {
      const contract = this.getSessionContract(sessionAddress, userWallet);
      this.logger.log(`Opening offers for session ${sessionAddress}`);
      const tx = await contract.openOffers();
      this.logger.log(`Open offers transaction sent: ${tx.hash}`);
      return tx;
    } catch (error) {
      this.logger.error(`Failed to open offers for session ${sessionAddress}`, error);      
      // Mensaje genérico para todos los errores de blockchain
      throw new Error('The blockchain transaction could not be completed. Please contact the administrator.');
    }
  }

  /**
   * Create an offer (FSP creates and auto-accepts via FIFO)
   */
  async createOffer(
    sessionAddress: string,
    hourSlot: number,
    quantity: string,
  ): Promise<{ offerId: number; tx: ethers.ContractTransactionResponse }> {
    try {
      const contract = this.getSessionContract(sessionAddress);
      this.logger.log(
        `Creating offer for session ${sessionAddress}, hour ${hourSlot}, quantity ${quantity}`,
      );
      const tx = await contract.createOffer(hourSlot, quantity);
      this.logger.log(`Create offer transaction sent: ${tx.hash}`);

      // Wait and extract offerId from events
      const receipt = await tx.wait();
      const event = receipt.logs.find((log: any) => {
        try {
          const parsed = contract.interface.parseLog(log);
          return parsed && parsed.name === 'OfferCreated';
        } catch {
          return false;
        }
      });

      if (!event) {
        throw new Error('OfferCreated event not found');
      }

      const parsedEvent = contract.interface.parseLog(event);
      const offerId = Number(parsedEvent?.args[0]);

      this.logger.log(`Offer created with ID: ${offerId}`);
      return { offerId, tx };
    } catch (error) {
      this.logger.error(`Failed to create offer for session ${sessionAddress}`, error);      
      // Mensaje genérico para todos los errores de blockchain
      throw new Error('The blockchain transaction could not be completed. Please contact the administrator.');
    }
  }

  /**
   * Close offers period
   */
  async closeOffers(sessionAddress: string, userWallet?: ethers.Wallet): Promise<ethers.ContractTransactionResponse> {
    try {
      const contract = this.getSessionContract(sessionAddress, userWallet);
      this.logger.log(`Closing offers for session ${sessionAddress}`);
      const tx = await contract.closeOffers();
      this.logger.log(`Close offers transaction sent: ${tx.hash}`);
      return tx;
    } catch (error) {
      this.logger.error(`Failed to close offers for session ${sessionAddress}`, error);      
      // Mensaje genérico para todos los errores de blockchain
      throw new Error('The blockchain transaction could not be completed. Please contact the administrator.');
    }
  }

  /**
   * Submit measurement data (Oracle role)
   */
  async submitMeasurementData(
    sessionAddress: string,
    measurementHash: string,
  ): Promise<ethers.ContractTransactionResponse> {
    try {
      const contract = this.getSessionContract(sessionAddress);
      this.logger.log(`Submitting measurement data for session ${sessionAddress}`);
      const tx = await contract.submitMeasurementData(measurementHash);
      this.logger.log(`Submit measurement data transaction sent: ${tx.hash}`);
      return tx;
    } catch (error) {
      this.logger.error(
        `Failed to submit measurement data for session ${sessionAddress}`,
        error,
      );      
      // Mensaje genérico para todos los errores de blockchain
      throw new Error('The blockchain transaction could not be completed. Please contact the administrator.');
    }
  }

  /**
   * Submit settlement for an offer (Oracle role)
   */
  async submitSettlement(
    sessionAddress: string,
    offerId: number,
    deliveredQuantity: string,
    penaltyAmount: string,
    meterReadingsHash: string,
  ): Promise<ethers.ContractTransactionResponse> {
    try {
      const contract = this.getSessionContract(sessionAddress);
      this.logger.log(`Submitting settlement for offer ${offerId} in session ${sessionAddress}`);
      const tx = await contract.submitSettlement(
        offerId,
        deliveredQuantity,
        penaltyAmount,
        meterReadingsHash,
      );
      this.logger.log(`Submit settlement transaction sent: ${tx.hash}`);
      return tx;
    } catch (error) {
      this.logger.error(
        `Failed to submit settlement for offer ${offerId} in session ${sessionAddress}`,
        error,
      );      
      // Mensaje genérico para todos los errores de blockchain
      throw new Error('The blockchain transaction could not be completed. Please contact the administrator.');
    }
  }

  /**
   * Execute settlement (Oracle role)
   */
  async executeSettlement(
    sessionAddress: string,
    offerId: number,
  ): Promise<ethers.ContractTransactionResponse> {
    try {
      const contract = this.getSessionContract(sessionAddress);
      this.logger.log(`Executing settlement for offer ${offerId} in session ${sessionAddress}`);
      const tx = await contract.executeSettlement(offerId);
      this.logger.log(`Execute settlement transaction sent: ${tx.hash}`);
      return tx;
    } catch (error) {
      this.logger.error(
        `Failed to execute settlement for offer ${offerId} in session ${sessionAddress}`,
        error,
      );      
      // Mensaje genérico para todos los errores de blockchain
      throw new Error('The blockchain transaction could not be completed. Please contact the administrator.');
    }
  }

  /**
   * Finalize session
   */
  async finalizeSession(
    sessionAddress: string,
  ): Promise<ethers.ContractTransactionResponse> {
    try {
      const contract = this.getSessionContract(sessionAddress);
      this.logger.log(`Finalizing session ${sessionAddress}`);
      const tx = await contract.finalizeSession();
      this.logger.log(`Finalize session transaction sent: ${tx.hash}`);
      return tx;
    } catch (error) {
      this.logger.error(`Failed to finalize session ${sessionAddress}`, error);      
      // Mensaje genérico para todos los errores de blockchain
      throw new Error('The blockchain transaction could not be completed. Please contact the administrator.');
    }
  }

  /**
   * Get offer information
   */
  async getOffer(sessionAddress: string, offerId: number): Promise<OfferInfoDto> {
    try {
      const contract = this.getSessionContract(sessionAddress);
      const offer = await contract.getOffer(offerId);

      return {
        offerId: Number(offer.offerId),
        hourSlot: Number(offer.hourSlot),
        fsp: offer.fsp,
        quantity: offer.quantity.toString(),
        price: offer.price.toString(),
        timestamp: Number(offer.timestamp),
        status: Number(offer.status),
        nftTokenId: Number(offer.nftTokenId),
        collateralAmount: offer.collateralAmount.toString(),
        feeAmount: offer.feeAmount.toString(),
        nftTransferredToBuyer: offer.nftTransferredToBuyer,
      };
    } catch (error) {
      this.logger.error(
        `Failed to get offer ${offerId} from session ${sessionAddress}`,
        error,
      );      
      // Mensaje genérico para todos los errores de blockchain
      throw new Error('The blockchain transaction could not be completed. Please contact the administrator.');
    }
  }

  /**
   * Get flexibility request information
   */
  async getFlexibilityRequest(
    sessionAddress: string,
    hourSlot: number,
  ): Promise<FlexibilityRequestInfoDto> {
    try {
      const contract = this.getSessionContract(sessionAddress);
      const request = await contract.flexibilityRequests(hourSlot);

      return {
        hourSlot: Number(request.hourSlot),
        quantity: request.quantity.toString(),
        quantityFilled: request.quantityFilled.toString(),
        price: request.price.toString(),
        flexType: Number(request.flexType),
        active: request.active,
        completed: request.completed,
      };
    } catch (error) {
      this.logger.error(
        `Failed to get flexibility request for hour ${hourSlot} from session ${sessionAddress}`,
        error,
      );      
      // Mensaje genérico para todos los errores de blockchain
      throw new Error('The blockchain transaction could not be completed. Please contact the administrator.');
    }
  }

  /**
   * Get remaining quantity for a flexibility request
   */
  async getRemainingQuantity(sessionAddress: string, hourSlot: number): Promise<string> {
    try {
      const contract = this.getSessionContract(sessionAddress);
      const remaining: bigint = await contract.getRemainingQuantity(hourSlot);
      return remaining.toString();
    } catch (error) {
      this.logger.error(
        `Failed to get remaining quantity for hour ${hourSlot} from session ${sessionAddress}`,
        error,
      );      
      // Mensaje genérico para todos los errores de blockchain
      throw new Error('The blockchain transaction could not be completed. Please contact the administrator.');
    }
  }

  /**
   * Get offer count
   */
  async getOfferCount(sessionAddress: string): Promise<number> {
    try {
      const contract = this.getSessionContract(sessionAddress);
      const count: bigint = await contract.offerCount();
      return Number(count);
    } catch (error) {
      this.logger.error(`Failed to get offer count for session ${sessionAddress}`, error);      
      // Mensaje genérico para todos los errores de blockchain
      throw new Error('The blockchain transaction could not be completed. Please contact the administrator.');
    }
  }

  /**
   * Get total platform fees accumulated
   */
  async getTotalPlatformFees(sessionAddress: string): Promise<string> {
    try {
      const contract = this.getSessionContract(sessionAddress);
      const fees: bigint = await contract.totalPlatformFees();
      return fees.toString();
    } catch (error) {
      this.logger.error(`Failed to get platform fees for session ${sessionAddress}`, error);      
      // Mensaje genérico para todos los errores de blockchain
      throw new Error('The blockchain transaction could not be completed. Please contact the administrator.');
    }
  }

  /**
   * Grant FSP role to an address
   */
  async grantFSPRole(
    sessionAddress: string,
    fspAddress: string,
    userWallet?: ethers.Wallet,
  ): Promise<ethers.ContractTransactionResponse> {
    try {
      const contract = this.getSessionContract(sessionAddress, userWallet);
      this.logger.log(`Granting FSP role to ${fspAddress} in session ${sessionAddress}`);
      const tx = await contract.grantRole(this.FSP, fspAddress);
      this.logger.log(`Grant FSP role transaction sent: ${tx.hash}`);
      return tx;
    } catch (error) {
      this.logger.error(
        `Failed to grant FSP role to ${fspAddress} in session ${sessionAddress}`,
        error,
      );      
      // Mensaje genérico para todos los errores de blockchain
      throw new Error('The blockchain transaction could not be completed. Please contact the administrator.');
    }
  }

  /**
   * Grant FMO_LMO role to an address
   */
  async grantFMOLMORole(
    sessionAddress: string,
    fmoLmoAddress: string,
    userWallet?: ethers.Wallet,
  ): Promise<ethers.ContractTransactionResponse> {
    try {
      const contract = this.getSessionContract(sessionAddress, userWallet);
      this.logger.log(`Granting FMO_LMO role to ${fmoLmoAddress} in session ${sessionAddress}`);
      const tx = await contract.grantRole(this.FMO_LMO, fmoLmoAddress);
      this.logger.log(`Grant FMO_LMO role transaction sent: ${tx.hash}`);
      return tx;
    } catch (error) {
      this.logger.error(
        `Failed to grant FMO_LMO role to ${fmoLmoAddress} in session ${sessionAddress}`,
        error,
      );      
      // Mensaje genérico para todos los errores de blockchain
      throw new Error('The blockchain transaction could not be completed. Please contact the administrator.');
    }
  }

  /**
   * Grant Oracle role to an address
   */
  async grantOracleRole(
    sessionAddress: string,
    oracleAddress: string,
    userWallet?: ethers.Wallet,
  ): Promise<ethers.ContractTransactionResponse> {
    try {
      const contract = this.getSessionContract(sessionAddress, userWallet);
      this.logger.log(`Granting ORACLE role to ${oracleAddress} in session ${sessionAddress}`);
      const tx = await contract.grantRole(this.ORACLE, oracleAddress);
      this.logger.log(`Grant ORACLE role transaction sent: ${tx.hash}`);
      return tx;
    } catch (error) {
      this.logger.error(
        `Failed to grant ORACLE role to ${oracleAddress} in session ${sessionAddress}`,
        error,
      );      
      // Mensaje genérico para todos los errores de blockchain
      throw new Error('The blockchain transaction could not be completed. Please contact the administrator.');
    }
  }

  /**
   * Get settlement data for an offer
   */
  async getSettlement(sessionAddress: string, offerId: number): Promise<SettlementDataDto> {
    try {
      const contract = this.getSessionContract(sessionAddress);
      const settlement = await contract.settlements(offerId);

      return {
        deliveredQuantity: settlement.deliveredQuantity.toString(),
        penalty: settlement.penalty.toString(),
        payment: settlement.payment.toString(),
        platformFee: settlement.platformFee.toString(),
        meterReadingsHash: settlement.meterReadingsHash,
        validated: settlement.validated,
        executed: settlement.executed,
      };
    } catch (error) {
      this.logger.error(
        `Failed to get settlement for offer ${offerId} in session ${sessionAddress}`,
        error,
      );      
      // Mensaje genérico para todos los errores de blockchain
      throw new Error('The blockchain transaction could not be completed. Please contact the administrator.');
    }
  }

  /**
   * Cancel the session and return locked tokens to FSPs if offers are still open
   * within two hours before the delivery window.
   * @param sessionAddress - Address of the MarketSession contract
   * @param userWallet - Optional user wallet for signing; defaults to admin signer
   * @returns Transaction response, or undefined if the call fails
   */
  async returnTokensCancelSession(sessionAddress: string, userWallet?: ethers.Wallet): Promise<any> {
    try {
      const contract = this.getSessionContract(sessionAddress, userWallet);
      const tokenReturned = await contract.cancelIfOffersStillOpenTwoHoursBefore();

      this.logger.log(`Close offers transaction sent: ${tokenReturned.hash}`);
      return tokenReturned;
    } catch (error) {
      this.logger.error(
        `Failed to return the tokens for cancelled session ${sessionAddress}`,
        error
      )
    }
  }
}
