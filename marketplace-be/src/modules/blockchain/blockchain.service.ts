import { Injectable, Logger } from '@nestjs/common';
import { BlockchainException } from '../../exceptions/blockchain.exception';
import { ErrorCode } from '../../enums/error-code.enum';
import { ethers } from 'ethers';
import MarketFactory from '../../contracts/MarketFactory.json';
import Market from '../../contracts/Market.json';
import * as path from 'path';
import * as fs from 'fs';
import * as contractsInfo from '../../contracts/contractsInfo';
import { FlexibilityTokenService } from '../flexibility-token/flexibility-token.service';
import { BlockchainProviderService } from './core/blockchain-provider.service';


@Injectable()
export class BlockchainService {
  readonly logger = new Logger(BlockchainService.name);

  private MarketFactoryContract: ethers.Contract;

  private contractsPath = path.resolve(__dirname, '../../contracts');
  private marketFactoryAddress: string;
  private marketFactoryAbi: any;

  constructor(
    private readonly flexibilityTokenService: FlexibilityTokenService,
    private readonly providerService: BlockchainProviderService,
  ) {
    const rpcUrl = process.env.RPC_PROVIDER_URL;
    const privateKey = process.env.ADMIN_PK;
    const factoryAddress = process.env.MARKET_FACTORY_ADDRESS;

    if (!rpcUrl || !privateKey || !factoryAddress) {
      throw new Error('Necessary environment variables are missing: RPC_PROVIDER_URL, ADMIN_PK, MARKET_FACTORY_ADDRESS');
    }

    const signer = this.providerService.getAdminSigner();
    this.MarketFactoryContract = new ethers.Contract(
      factoryAddress,
      MarketFactory.abi,
      signer
    );

    this.marketFactoryAddress = process.env.MARKET_FACTORY_ADDRESS!;
    this.marketFactoryAbi = JSON.parse(fs.readFileSync(path.join(this.contractsPath, 'MarketFactory.json'), 'utf-8'));
  }

  async getBalance(address: string): Promise<bigint> {
    try {
      if (!ethers.isAddress(address)) {
        throw new BlockchainException(
          ErrorCode.WALLET_ERROR,
          'Invalid wallet address'
        );
      }

      const balance = await this.providerService.getProvider().getBalance(address);
      return balance;
    } catch (error) {
      this.logger.error(`Error obtaining balance of ${address}: ${error.message}`, error.stack);

      if (error instanceof BlockchainException) {
        throw error;
      }

      throw new BlockchainException(
        ErrorCode.CONTRACT_ERROR,
        `Error obtaining balance: ${error.message}`
      );
    }
  }

  async createMarket(dsoAddress: string, region: string = "", description: string = "", wallet?: ethers.Wallet): Promise<{ txHash: string, newContractAddress: string, marketId: number }> {
    try {
      if (!ethers.isAddress(dsoAddress)) {
        throw new BlockchainException(
          ErrorCode.INVALID_DATA,
          'Invalid DSO address'
        );
      }

      // Use the provided wallet or fallback to the default admin signer
      const contractSigner = wallet ? (this.MarketFactoryContract.connect(wallet) as ethers.Contract) : this.MarketFactoryContract;

      // createMarket now requires: communityId, region, owner address
      const communityId = description || "Default Community";
      const tx = await (contractSigner as any).createMarket(communityId, region, dsoAddress);
      const receipt = await tx.wait();


      // Note: Algunos contratos pueden no emitir logs, usaremos estrategia de fallback si es necesario
      if (!receipt.logs || receipt.logs.length === 0) {
      }

      // Buscar eventos relevantes en los logs
      let newContractAddress: string | null = null;
      let marketId: number | null = null;

      for (const log of receipt.logs) {
        try {
          // Parse log usando la interface del contrato
          const parsedLog = this.MarketFactoryContract.interface.parseLog(log);

          if (parsedLog && parsedLog.name && parsedLog.args) {
            // Buscar evento MarketCreated
            // Event: MarketCreated(uint256 indexed marketId, address indexed marketAddress, address indexed owner)
            if (parsedLog.name === 'MarketCreated') {
              marketId = Number(parsedLog.args.marketId || parsedLog.args[0]);
              newContractAddress = parsedLog.args.marketAddress || parsedLog.args[1];
              break;
            }
          }
        } catch (e) {
          // Log no es de este contrato, continuar
          continue;
        }
      }

      // Si no se encontró la información en los eventos
      if (!newContractAddress || marketId === null) {
        throw new BlockchainException(
          ErrorCode.CONTRACT_ERROR,
          'The information for the new Market contract could not be obtained. Please verify that the MarketFactory contract is functioning correctly.'
        );
      }
      // Verificar que la dirección obtenida es un contrato válido
      const code = await this.providerService.getProvider().getCode(newContractAddress);
      if (code === '0x') {
        throw new BlockchainException(
          ErrorCode.CONTRACT_ERROR,
          `The obtained address (${newContractAddress}) do not have a valid address`
        );
      }
      // Grant MINTER_ROLE to the new market (if admin has permissions)
      // This is optional - if it fails, market creation still succeeds
      try {
        this.logger.log(`Attempting to grant MINTER_ROLE to new market ${newContractAddress}...`);
        const roleReceipt = await this.flexibilityTokenService.grantMinterRole(
          process.env.FLEXIBILITY_TOKEN_ADDRESS!,
          newContractAddress
        );
        this.logger.log(`✅ MINTER_ROLE granted to market ${newContractAddress}. Receipt: ${JSON.stringify(roleReceipt)}`);
      } catch (roleError) {
        // Log warning but don't fail the market creation
        this.logger.warn(`⚠️  Could not grant MINTER_ROLE to market ${newContractAddress}: ${roleError.message}`);
        this.logger.warn(`Market was created successfully, but you may need to manually grant MINTER_ROLE`);
      }

      return { txHash: receipt.hash, newContractAddress, marketId };
    } catch (error) {
      this.logger.error('Error en createMarket', error.stack);

      if (error instanceof BlockchainException) {
        throw error;
      }

      // Mensaje genérico para todos los errores de blockchain
      // Esto incluye errores de permisos, gas, transacciones revertidas, etc.
      throw new BlockchainException(
        ErrorCode.CONTRACT_ERROR,
        'The blockchain transaction could not be completed. Please contact the administrator.'
      );
    }
  }

  async deactivateMarket(blockchainMarketId: number): Promise<{ txHash: string }> {
    try {
      const tx = await this.MarketFactoryContract.deactivateMarket(blockchainMarketId);
      const receipt = await tx.wait();
      this.logger.log(`Market ${blockchainMarketId} deactivated. TX: ${receipt.hash}`);
      return { txHash: receipt.hash };
    } catch (error) {
      this.logger.error(`Error deactivating market ${blockchainMarketId}`, error.stack);
      if (error instanceof BlockchainException) throw error;
      throw new BlockchainException(
        ErrorCode.CONTRACT_ERROR,
        `Failed to deactivate market on blockchain: ${error.message}`
      );
    }
  }

  async showMethods(): Promise<string[]> {
    const methods = Object.keys(this.MarketFactoryContract.functions);
    this.logger.log(`Method availables: ${methods}`);
    return methods;
  }

  async getAllMarkets(): Promise<string[]> {
    // Asegúrate de que el ABI sea un array, extraído del JSON
    const abi = this.marketFactoryAbi.abi;

    // Asegúrate de usar la dirección del contrato, no la instancia
    const contract = new ethers.Contract(this.marketFactoryAddress, abi, this.providerService.getProvider());

    const filter = contract.filters.lastMarket(); // Asumiendo que tienes este evento

    const events = await contract.queryFilter(filter);

    const addresses = events.map(event => {
      return ethers.getAddress(`0x${event.data.slice(26)}`);
    });

    return addresses;
  }

  async createWallet(): Promise<string> {
    try {
      const wallet = ethers.Wallet.createRandom();
      const walletAddress = await wallet.getAddress();
      this.logger.log(`New wallet created: ${walletAddress}`);
      //Asignar la wallet al usuario o guardarla en la base de datos si es necesario

      return walletAddress;
    } catch (error) {
      this.logger.error('Error creating wallet', error.stack);
      throw error;
    }
  }

  async createSession(
    marketAddress: string,
    deliveryDay: number,
    treasury: string,
    fmoLmo: string,
    frp: string,
    requests: Array<{
      hourSlot: number;
      quantity: string;
      price: string;
      flexType: number;
    }>,
    wallet?: ethers.Wallet
  ): Promise<{ txHash: string, sessionAddress: string, sessionId: number }> {
    try {
      if (!ethers.isAddress(marketAddress)) {
        throw new BlockchainException(
          ErrorCode.INVALID_DATA,
          'Invalid market address'
        );
      }

      // Verificar que la dirección tiene código (es un contrato)
      const marketCode = await this.providerService.getProvider().getCode(marketAddress);
      if (marketCode === '0x') {
        throw new BlockchainException(
          ErrorCode.CONTRACT_ERROR,
          `Market address (${marketAddress}) do not have a valid contract`
        );
      }

      // Crear instancia del contrato Market
      // Use the provided wallet or fallback to the default admin signer
      const contractSigner = wallet || this.providerService.getAdminSigner();
      const marketContract = new ethers.Contract(
        marketAddress,
        Market.abi,
        contractSigner
      );

      // Llamar a la función createSession con todos los parámetros
      const tx = await marketContract.createSession(
        deliveryDay,
        treasury,
        fmoLmo,
        frp,
        requests
      );
      const receipt = await tx.wait();

      // Estrategia 1: Buscar el evento SessionCreated en los logs
      let sessionAddress: string | null = null;
      let sessionId: number | null = null;
      for (const log of receipt.logs) {
        try {
          const parsedLog = marketContract.interface.parseLog(log);
          if (parsedLog && parsedLog.name === 'SessionCreated') {
            // El evento SessionCreated tiene: (uint256 indexed sessionId, address indexed sessionAddress, uint256 deliveryDay)
            sessionId = Number(parsedLog.args[0]);
            sessionAddress = parsedLog.args[1];
            break;
          }
        } catch (e) {
          // El log no es de este contrato, continuar
          continue;
        }
      }

      // Estrategia 2: Si no se encontró en los eventos, intentar obtener del array allSessions
      if (!sessionAddress) {
        try {
          const allSessions = await marketContract.getAllSessions();
          if (allSessions.length > 0) {
            // La nueva sesión es la última en el array
            sessionAddress = allSessions[allSessions.length - 1];

          }
        } catch (getAllError) {
          // Si falla getAllSessions, intentar otra estrategia
        }
      }

      // Estrategia 3: Buscar cualquier log que contenga una dirección válida
      if (!sessionAddress && receipt.logs.length > 0) {
        for (const log of receipt.logs) {
          // Los logs de contratos desplegados suelen tener la dirección en el topics o data
          if (log.topics.length > 0) {
            // Intentar extraer dirección del primer topic (después del event signature)
            for (let i = 1; i < log.topics.length; i++) {
              try {
                const potentialAddress = ethers.getAddress('0x' + log.topics[i].slice(26));
                const code = await this.providerService.getProvider().getCode(potentialAddress);
                if (code !== '0x') {
                  sessionAddress = potentialAddress;
                  break;
                }
              } catch (e) {
                continue;
              }
            }
          }
          if (sessionAddress) break;
        }
      }

      if (!sessionAddress) {
        throw new BlockchainException(
          ErrorCode.CONTRACT_ERROR,
          'The session address could not be obtained. The transaction was completed, but no events were emitted. Check the Market contract.'
        );
      }

      // Verificar que la dirección es un contrato válido
      const code = await this.providerService.getProvider().getCode(sessionAddress);
      if (code === '0x') {
        throw new BlockchainException(
          ErrorCode.CONTRACT_ERROR,
          `The address obtained (${sessionAddress}) does not contain a valid contract`
        );
      }
      return {
        txHash: receipt.hash,
        sessionAddress,
        sessionId: sessionId || 0
      };
    } catch (error) {
      this.logger.error('Error creating session', error.stack);

      if (error instanceof BlockchainException) {
        throw error;
      }

      throw new BlockchainException(
        ErrorCode.CONTRACT_ERROR,
        `Error creating session: ${error.message}`
      );
    }
  }

}
