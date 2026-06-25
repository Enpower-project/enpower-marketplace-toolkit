import { Injectable, Logger } from '@nestjs/common';
import { ethers } from 'ethers';
import { ContractFactoryService } from '../../core/contract-factory.service';
import { BlockchainConfigService } from '../../core/blockchain-config.service';
import * as DisputeResolutionABI from '../../../../contracts/DisputeResolution.json';

/**
 * DisputeResolutionContractService
 *
 * Service for interacting with the DisputeResolution smart contract.
 * Note: DisputeResolution contract might not be deployed. This service checks availability.
 */
@Injectable()
export class DisputeResolutionContractService {
  private readonly logger = new Logger(DisputeResolutionContractService.name);
  private contract: ethers.Contract | null = null;

  private readonly ARBITRATOR_ROLE = ethers.keccak256(ethers.toUtf8Bytes('ARBITRATOR_ROLE'));

  constructor(
    private contractFactory: ContractFactoryService,
    private configService: BlockchainConfigService,
  ) {
    this.initializeContract();
  }

  private initializeContract(): void {
    try {
      // Check if DisputeResolution address is configured
      if (!this.configService.hasAddress('DISPUTE_RESOLUTION_ADDRESS')) {
        this.logger.warn('DisputeResolution contract address not configured - service unavailable');
        return;
      }

      this.contract = this.contractFactory.createContract(
        'DISPUTE_RESOLUTION',
        DisputeResolutionABI.abi,
      );
      this.logger.log('DisputeResolution contract initialized');
    } catch (error) {
      this.logger.warn('DisputeResolution contract not available', error);
    }
  }

  private ensureContract(): ethers.Contract {
    if (!this.contract) {
      throw new Error('DisputeResolution contract is not available');
    }
    return this.contract;
  }

  /**
   * Open a new dispute for a specific offer in a session.
   * @param sessionId - ID of the market session
   * @param offerId - ID of the offer being disputed
   * @param disputeType - Numeric dispute type code
   * @param description - Human-readable dispute description
   * @param evidenceHash - Hash of the evidence data
   * @returns Assigned dispute ID and the transaction object
   */
  async openDispute(
    sessionId: number,
    offerId: number,
    disputeType: number,
    description: string,
    evidenceHash: string,
  ): Promise<{ disputeId: number; tx: ethers.ContractTransactionResponse }> {
    const contract = this.ensureContract();
    const tx = await contract.openDispute(sessionId, offerId, disputeType, description, evidenceHash);
    const receipt = await tx.wait();

    const event = receipt.logs.find((log: any) => {
      try {
        const parsed = contract.interface.parseLog(log);
        return parsed && parsed.name === 'DisputeOpened';
      } catch {
        return false;
      }
    });

    const parsedEvent = contract.interface.parseLog(event);
    const disputeId = Number(parsedEvent?.args[0]);

    return { disputeId, tx };
  }

  /** Retrieve raw dispute data by ID from the contract. */
  async getDispute(disputeId: number): Promise<any> {
    const contract = this.ensureContract();
    return await contract.disputes(disputeId);
  }

  /** Grant the ARBITRATOR_ROLE to an address on the DisputeResolution contract. */
  async grantArbitratorRole(address: string): Promise<ethers.ContractTransactionResponse> {
    const contract = this.ensureContract();
    return await contract.grantRole(this.ARBITRATOR_ROLE, address);
  }

  /** Returns true if the DisputeResolution contract was successfully initialised. */
  isAvailable(): boolean {
    return this.contract !== null;
  }

  /** Returns the deployed contract address, or null if the contract is unavailable. */
  getContractAddress(): string | null {
    return this.contract ? (this.contract.target as string) : null;
  }
}
