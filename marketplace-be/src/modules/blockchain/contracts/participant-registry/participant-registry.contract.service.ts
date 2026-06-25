import { Injectable, Logger } from '@nestjs/common';
import { ethers, Signer } from 'ethers';
import { ContractFactoryService } from '../../core/contract-factory.service';
import { ParticipantType } from '../../types/blockchain.types';
import { ParticipantInfoDto } from './dto/participant-info.dto';
import * as ParticipantRegistryABI from '../../../../contracts/ParticipantRegistry.json';

/**
 * ParticipantRegistryContractService
 *
 * Service for interacting with the ParticipantRegistry smart contract.
 * Manages participant registration, qualification, and role verification.
 */
@Injectable()
export class ParticipantRegistryContractService {
  private readonly logger = new Logger(ParticipantRegistryContractService.name);
  private contract: ethers.Contract;

  // Role hash
  private readonly REGISTRAR_ROLE = ethers.keccak256(ethers.toUtf8Bytes('REGISTRAR_ROLE'));

  constructor(private contractFactory: ContractFactoryService) {
    this.initializeContract();
  }

  private initializeContract(): void {
    try {
      this.contract = this.contractFactory.createContract(
        'PARTICIPANT_REGISTRY',
        ParticipantRegistryABI.abi,
      );
      this.logger.log('ParticipantRegistry contract initialized');
    } catch (error) {
      this.logger.error('Failed to initialize ParticipantRegistry contract', error);      
      // Mensaje genérico para todos los errores de blockchain
      throw new Error('The blockchain transaction could not be completed. Please contact the administrator.');
    }
  }

  /**
   * Register a new participant
   * @param participantAddress - Address of the participant
   * @param participantType - Type of participant (MARKETPLACE_ADMIN, FMO_LMO, FRP, FSP)
   * @param credentialsReference - Hash or reference to KYC/credentials documents
   * @param region - Geographic region
   * @returns Transaction object
   */
  async registerParticipant(
    participantAddress: string,
    participantType: ParticipantType,
    credentialsReference: string,
    region: string,
): Promise<ethers.ContractTransactionResponse> {
  try {
    this.logger.log(
      `Registering participant ${participantAddress} …`,
    );

    // cast/narrow the runner to a Signer before using getAddress()
    const runner = this.contract.runner as Signer;
    if ('getAddress' in runner) {               // runtime guard
      const signerAddr = await runner.getAddress();
      this.logger.debug(`ParticipantRegistry signer address: ${signerAddr}`);
    }

    const tx = await this.contract.registerParticipant(
      participantAddress,
      participantType,
      credentialsReference,
      region,
    );
    this.logger.log(`Register participant transaction sent: ${tx.hash}`);
    return tx;
  } catch (error) {
    this.logger.error(`Failed to register participant ${participantAddress}`, error);
    throw error;
  }
}

  /**
   * Qualify a registered participant
   * @param participantAddress - Address of the participant
   * @returns Transaction object
   */
  async qualifyParticipant(
  participantAddress: string,
): Promise<ethers.ContractTransactionResponse> {
  try {
    this.logger.log(`Qualifying participant ${participantAddress}`);

    // get the signer out of the runner (or store it separately when you
    // instantiate the contract)
    const runner = this.contract.runner as ethers.Signer;
    if ('getAddress' in runner) {               // runtime guard, optional
      const signerAddr = await runner.getAddress();
      this.logger.debug(`ParticipantRegistry signer address: ${signerAddr}`);
    }

    const tx = await this.contract.qualifyParticipant(participantAddress);
    this.logger.log(`Qualify participant transaction sent: ${tx.hash}`);
    return tx;
  } catch (error) {
    this.logger.error(`Failed to qualify participant ${participantAddress}`, error);
    throw error;
  }
}

  /**
   * Suspend a participant
   * @param participantAddress - Address of the participant
   * @param reason - Reason for suspension
   * @returns Transaction object
   */
  async suspendParticipant(
    participantAddress: string,
    reason: string,
  ): Promise<ethers.ContractTransactionResponse> {
    try {
      this.logger.log(`Suspending participant ${participantAddress}. Reason: ${reason}`);
      const tx = await this.contract.suspendParticipant(participantAddress, reason);
      this.logger.log(`Suspend participant transaction sent: ${tx.hash}`);
      return tx;
    } catch (error) {
      this.logger.error(`Failed to suspend participant ${participantAddress}`, error);      
      // Mensaje genérico para todos los errores de blockchain
      throw new Error('The blockchain transaction could not be completed. Please contact the administrator.');
    }
  }

  /**
   * Revoke a participant's access
   * @param participantAddress - Address of the participant
   * @param reason - Reason for revocation
   * @returns Transaction object
   */
  async revokeParticipant(
    participantAddress: string,
    reason: string,
  ): Promise<ethers.ContractTransactionResponse> {
    try {
      this.logger.log(`Revoking participant ${participantAddress}. Reason: ${reason}`);
      const tx = await this.contract.revokeParticipant(participantAddress, reason);
      this.logger.log(`Revoke participant transaction sent: ${tx.hash}`);
      return tx;
    } catch (error) {
      this.logger.error(`Failed to revoke participant ${participantAddress}`, error);      
      // Mensaje genérico para todos los errores de blockchain
      throw new Error('The blockchain transaction could not be completed. Please contact the administrator.');
    }
  }

  /**
   * Update participant credentials
   * @param participantAddress - Address of the participant
   * @param newCredentialsReference - New credentials hash/reference
   * @returns Transaction object
   */
  async updateCredentials(
    participantAddress: string,
    newCredentialsReference: string,
  ): Promise<ethers.ContractTransactionResponse> {
    try {
      this.logger.log(`Updating credentials for participant ${participantAddress}`);
      const tx = await this.contract.updateCredentials(
        participantAddress,
        newCredentialsReference,
      );
      this.logger.log(`Update credentials transaction sent: ${tx.hash}`);
      return tx;
    } catch (error) {
      this.logger.error(`Failed to update credentials for ${participantAddress}`, error);      
      // Mensaje genérico para todos los errores de blockchain
      throw new Error('The blockchain transaction could not be completed. Please contact the administrator.');
    }
  }

  /**
   * Check if a participant is qualified
   * @param participantAddress - Address to check
   * @returns True if participant is qualified and active
   */
  async isQualified(participantAddress: string): Promise<boolean> {
    try {
      return await this.contract.isQualified(participantAddress);
    } catch (error) {
      this.logger.error(`Failed to check qualification for ${participantAddress}`, error);      
      // Mensaje genérico para todos los errores de blockchain
      throw new Error('The blockchain transaction could not be completed. Please contact the administrator.');
    }
  }

  /**
   * Get participant information
   * @param participantAddress - Address to query
   * @returns Participant information
   */
  async getParticipant(participantAddress: string): Promise<ParticipantInfoDto> {
    try {
      const participant = await this.contract.participants(participantAddress);
      return {
        participantAddress: participant.participantAddress,
        pType: Number(participant.pType),
        status: Number(participant.status),
        credentialsReference: participant.credentialsReference,
        region: participant.region,
        registrationDate: Number(participant.registrationDate),
        isActive: participant.isActive,
      };
    } catch (error) {
      this.logger.error(`Failed to get participant info for ${participantAddress}`, error);      
      // Mensaje genérico para todos los errores de blockchain
      throw new Error('The blockchain transaction could not be completed. Please contact the administrator.');
    }
  }

  /**
   * Get all participants by region
   * @param region - Region to filter by
   * @returns Array of participant addresses
   */
  async getParticipantsByRegion(region: string): Promise<string[]> {
    try {
      return await this.contract.getParticipantsByRegion(region);
    } catch (error) {
      this.logger.error(`Failed to get participants for region ${region}`, error);      
      // Mensaje genérico para todos los errores de blockchain
      throw new Error('The blockchain transaction could not be completed. Please contact the administrator.');
    }
  }

  /**
   * Get all registered participants
   * @returns Array of all participant addresses
   */
  async getAllParticipants(): Promise<string[]> {
    try {
      return await this.contract.getAllParticipants();
    } catch (error) {
      this.logger.error('Failed to get all participants', error);      
      // Mensaje genérico para todos los errores de blockchain
      throw new Error('The blockchain transaction could not be completed. Please contact the administrator.');
    }
  }

  /**
   * Check if an address has a specific role and is qualified
   * @param address - Address to check
   * @param participantType - Role type to verify
   * @returns True if participant has the role and is qualified
   */
  async hasRole(address: string, participantType: ParticipantType): Promise<boolean> {
    try {
      return await this.contract.hasRole(address, participantType);
    } catch (error) {
      this.logger.error(`Failed to check role for ${address}`, error);      
      // Mensaje genérico para todos los errores de blockchain
      throw new Error('The blockchain transaction could not be completed. Please contact the administrator.');
    }
  }

  /**
   * Grant REGISTRAR_ROLE to an address
   * @param address - Address to grant role
   * @returns Transaction object
   */
  async grantRegistrarRole(address: string): Promise<ethers.ContractTransactionResponse> {
    try {
      this.logger.log(`Granting REGISTRAR_ROLE to ${address}`);
      const tx = await this.contract.grantRole(this.REGISTRAR_ROLE, address);
      this.logger.log(`Grant REGISTRAR_ROLE transaction sent: ${tx.hash}`);
      return tx;
    } catch (error) {
      this.logger.error(`Failed to grant REGISTRAR_ROLE to ${address}`, error);      
      // Mensaje genérico para todos los errores de blockchain
      throw new Error('The blockchain transaction could not be completed. Please contact the administrator.');
    }
  }

  /**
   * Get contract address
   */
  getContractAddress(): string {
    return this.contract.target as string;
  }
}
