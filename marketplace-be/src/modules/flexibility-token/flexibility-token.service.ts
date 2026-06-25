import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { ethers } from 'ethers';
import FlexibilityTokenABI from '../../contracts/FlexibilityToken.json';
import { BlockchainProviderService } from '../blockchain/core/blockchain-provider.service';

@Injectable()
export class FlexibilityTokenService {
    private readonly logger = new Logger(FlexibilityTokenService.name);
  private readonly flexibilityTokenABI = FlexibilityTokenABI.abi;

  constructor(
    @Inject(forwardRef(() => BlockchainProviderService))
    private readonly providerService: BlockchainProviderService,
  ) {}

  /**
   * Grant the MINTER_ROLE on a FlexibilityToken contract to a market address.
   * @param tokenAddress - Address of the FlexibilityToken contract
   * @param marketAddress - Address to receive the MINTER_ROLE
   * @returns Transaction receipt
   */
  async grantMinterRole(tokenAddress: string, marketAddress: string): Promise<string> {
    const flexibilityTokenContract = this.getTokenContract(tokenAddress);
    // MINTER_ROLE = keccak256("MINTER_ROLE")
    const MINTER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("MINTER_ROLE"));

    const tx = await flexibilityTokenContract.grantRole(MINTER_ROLE, marketAddress);
    this.logger.log(`Transacción enviada para otorgar rol de minter. Hash: ${tx.hash}`);

    const receipt = await tx.wait();
    this.logger.log(`Transacción confirmada. Bloque: ${receipt.blockNumber}`);

    return receipt;
  }

    private getTokenContract(address: string): ethers.Contract {
        const signer = this.providerService.getAdminSigner();
        return new ethers.Contract(address, this.flexibilityTokenABI, signer);
    }
}
