import { Injectable, Logger } from '@nestjs/common';
import { ethers } from 'ethers';
import { ContractFactoryService } from '../../core/contract-factory.service';
import * as FlexibilityNFTABI from '../../../../contracts/FlexibilityNFT.json';

/**
 * FlexibilityNFTContractService
 *
 * Service for interacting with the FlexibilityNFT (ERC1155) smart contract.
 * NFTs represent flexibility offers with complete lifecycle tracking.
 */
@Injectable()
export class FlexibilityNFTContractService {
  private readonly logger = new Logger(FlexibilityNFTContractService.name);
  private contract: ethers.Contract;

  // Role hashes
  private readonly MINTER_ROLE = ethers.keccak256(ethers.toUtf8Bytes('MINTER_ROLE'));
  private readonly UPDATER_ROLE = ethers.keccak256(ethers.toUtf8Bytes('UPDATER_ROLE'));

  constructor(private contractFactory: ContractFactoryService) {
    this.initializeContract();
  }

  private initializeContract(): void {
    try {
      this.contract = this.contractFactory.createContract(
        'FLEXIBILITY_NFT',
        FlexibilityNFTABI.abi,
      );
      this.logger.log('FlexibilityNFT contract initialized');
    } catch (error) {
      this.logger.error('Failed to initialize FlexibilityNFT contract', error);      
      // Mensaje genérico para todos los errores de blockchain
      throw new Error('The blockchain transaction could not be completed. Please contact the administrator.');
    }
  }

  // NFT Metadata getters
  /** Returns the session ID encoded in the NFT metadata. */
  async getSessionId(tokenId: number): Promise<number> {
    const sessionId: bigint = await this.contract.getSessionId(tokenId);
    return Number(sessionId);
  }

  /** Returns the offer ID encoded in the NFT metadata. */
  async getOfferId(tokenId: number): Promise<number> {
    const offerId: bigint = await this.contract.getOfferId(tokenId);
    return Number(offerId);
  }

  /** Returns the hour slot (0–23) associated with the NFT. */
  async getHourSlot(tokenId: number): Promise<number> {
    return Number(await this.contract.getHourSlot(tokenId));
  }

  /** Returns the FSP address encoded in the NFT metadata. */
  async getFsp(tokenId: number): Promise<string> {
    return await this.contract.getFsp(tokenId);
  }

  /** Returns the originally offered quantity (in wei) as a string. */
  async getOfferedQuantity(tokenId: number): Promise<string> {
    const quantity: bigint = await this.contract.getOfferedQuantity(tokenId);
    return quantity.toString();
  }

  /** Returns the offer price (in wei) as a string. */
  async getPrice(tokenId: number): Promise<string> {
    const price: bigint = await this.contract.getPrice(tokenId);
    return price.toString();
  }

  /** Returns the collateral amount locked for this NFT (in wei) as a string. */
  async getCollateralAmount(tokenId: number): Promise<string> {
    const collateral: bigint = await this.contract.getCollateralAmount(tokenId);
    return collateral.toString();
  }

  /** Returns the FMO/LMO address associated with this NFT. */
  async getFmoLmo(tokenId: number): Promise<string> {
    return await this.contract.getFmoLmo(tokenId);
  }

  /** Returns the quantity accepted after offer matching (in wei) as a string. */
  async getAcceptedQuantity(tokenId: number): Promise<string> {
    const quantity: bigint = await this.contract.getAcceptedQuantity(tokenId);
    return quantity.toString();
  }

  /** Returns the quantity actually delivered during settlement (in wei) as a string. */
  async getDeliveredQuantity(tokenId: number): Promise<string> {
    const quantity: bigint = await this.contract.getDeliveredQuantity(tokenId);
    return quantity.toString();
  }

  /** Returns the address of the final buyer after settlement. */
  async getFinalBuyer(tokenId: number): Promise<string> {
    return await this.contract.getFinalBuyer(tokenId);
  }

  /** Returns the actual payment made at settlement (in wei) as a string. */
  async getActualPayment(tokenId: number): Promise<string> {
    const payment: bigint = await this.contract.getActualPayment(tokenId);
    return payment.toString();
  }

  /** Returns the numeric lifecycle status of the NFT (maps to offer/settlement states). */
  async getStatus(tokenId: number): Promise<number> {
    return Number(await this.contract.getStatus(tokenId));
  }

  /** Returns true if the NFT is soulbound (non-transferable). */
  async getIsSoulbound(tokenId: number): Promise<boolean> {
    return await this.contract.isSoulbound(tokenId);
  }

  /**
   * Returns the number of tokens of type `tokenId` owned by `account`.
   * Wraps the ERC1155 `balanceOf` function.
   */
  async balanceOf(account: string, tokenId: number): Promise<number> {
    const balance: bigint = await this.contract.balanceOf(account, tokenId);
    return Number(balance);
  }

  /** Returns the ERC1155 metadata URI for the given token ID. */
  async uri(tokenId: number): Promise<string> {
    return await this.contract.uri(tokenId);
  }

  // Role management
  /** Grant the MINTER_ROLE on the FlexibilityNFT contract to the given address. */
  async grantMinterRole(address: string): Promise<ethers.ContractTransactionResponse> {
    try {
      this.logger.log(`Granting MINTER_ROLE to ${address}`);
      const tx = await this.contract.grantRole(this.MINTER_ROLE, address);
      this.logger.log(`Grant MINTER_ROLE transaction sent: ${tx.hash}`);
      return tx;
    } catch (error) {
      this.logger.error(`Failed to grant MINTER_ROLE to ${address}`, error);      
      // Mensaje genérico para todos los errores de blockchain
      throw new Error('The blockchain transaction could not be completed. Please contact the administrator.');
    }
  }

  /** Grant the UPDATER_ROLE on the FlexibilityNFT contract to the given address. */
  async grantUpdaterRole(address: string): Promise<ethers.ContractTransactionResponse> {
    try {
      this.logger.log(`Granting UPDATER_ROLE to ${address}`);
      const tx = await this.contract.grantRole(this.UPDATER_ROLE, address);
      this.logger.log(`Grant UPDATER_ROLE transaction sent: ${tx.hash}`);
      return tx;
    } catch (error) {
      this.logger.error(`Failed to grant UPDATER_ROLE to ${address}`, error);      
      // Mensaje genérico para todos los errores de blockchain
      throw new Error('The blockchain transaction could not be completed. Please contact the administrator.');
    }
  }

  /**
   * Mint a new FlexibilityNFT using a specific signer.
   * @param signer - Wallet that holds MINTER_ROLE
   * @param sessionId - Market session ID
   * @param offerId - Offer ID within the session
   * @param hourSlot - Delivery hour slot (0–23)
   * @param fsp - FSP address
   * @param offeredQuantity - Offered energy quantity in wei
   * @param price - Offer price in wei
   * @param collateralAmount - Collateral amount in wei
   * @returns Mined transaction receipt
   */
  async mintWithSigner(
    signer: ethers.Signer,
    sessionId: number,
    offerId: number,
    hourSlot: number,
    fsp: string,
    offeredQuantity: string,
    price: string,
    collateralAmount: string,
  ): Promise<ethers.ContractTransactionReceipt> {
    try {
      this.logger.log(`Minting NFT for offer ${offerId} in session ${sessionId}`);
      const contractWithSigner = this.contract.connect(signer) as any;

      const timestamp = Math.floor(Date.now() / 1000);

      const tx = await contractWithSigner.mint(
        fsp,
        sessionId,
        offerId,
        hourSlot,
        offeredQuantity,
        price,
        timestamp,
        collateralAmount,
      );
      this.logger.log(`Mint NFT transaction sent: ${tx.hash}`);
      const receipt = await tx.wait();
      return receipt;
    } catch (error) {
      this.logger.error(`Failed to mint NFT for offer ${offerId}`, error);      
      // Mensaje genérico para todos los errores de blockchain
      throw new Error('The blockchain transaction could not be completed. Please contact the administrator.');
    }
  }

  /**
   * Update NFT metadata after settlement using a specific signer (requires UPDATER_ROLE).
   * @param signer - Wallet that holds UPDATER_ROLE
   * @param tokenId - NFT token ID to update
   * @param deliveredQuantity - Actual delivered quantity in wei
   * @param finalBuyer - Address of the final buyer
   * @param actualPayment - Actual payment amount in wei
   * @returns Mined transaction receipt
   */
  async updateAfterSettlement(
    signer: ethers.Signer,
    tokenId: number,
    deliveredQuantity: string,
    finalBuyer: string,
    actualPayment: string,
  ): Promise<ethers.ContractTransactionReceipt> {
    try {
      this.logger.log(`Updating settlement for NFT ${tokenId}`);
      const contractWithSigner = this.contract.connect(signer) as any;

      const settlementTimestamp = Math.floor(Date.now() / 1000);
      const meterReadingsHash = ethers.ZeroHash;

      const tx = await contractWithSigner.updateAfterSettlement(
        tokenId,
        deliveredQuantity,
        settlementTimestamp,
        meterReadingsHash,
        finalBuyer,
        actualPayment,
      );
      this.logger.log(`Update settlement transaction sent: ${tx.hash}`);
      const receipt = await tx.wait();
      return receipt;
    } catch (error) {
      this.logger.error(`Failed to update settlement for NFT ${tokenId}`, error);      
      // Mensaje genérico para todos los errores de blockchain
      throw new Error('The blockchain transaction could not be completed. Please contact the administrator.');
    }
  }

  /**
   * Execute an ERC1155 safeTransferFrom using a specific signer.
   * @param signer - Wallet authorised to transfer the token
   * @param from - Current token holder address
   * @param to - Recipient address
   * @param tokenId - NFT token ID
   * @param amount - Number of tokens to transfer
   * @param data - Optional calldata (defaults to '0x')
   * @returns Transaction response
   */
  async safeTransferFromWithSigner(
    signer: ethers.Signer,
    from: string,
    to: string,
    tokenId: number,
    amount: number,
    data: string = '0x',
  ): Promise<ethers.ContractTransactionResponse> {
    try {
      this.logger.log(`Transferring NFT ${tokenId} from ${from} to ${to}`);
      const contractWithSigner = this.contract.connect(signer) as any;
      const tx = await contractWithSigner.safeTransferFrom(from, to, tokenId, amount, data);
      this.logger.log(`Transfer NFT transaction sent: ${tx.hash}`);
      return tx;
    } catch (error) {
      this.logger.error(`Failed to transfer NFT ${tokenId}`, error);      
      // Mensaje genérico para todos los errores de blockchain
      throw new Error('The blockchain transaction could not be completed. Please contact the administrator.');
    }
  }

  /** Returns the deployed FlexibilityNFT contract address. */
  getContractAddress(): string {
    return this.contract.target as string;
  }
}
