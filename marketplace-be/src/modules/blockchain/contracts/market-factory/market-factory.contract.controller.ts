import { Controller, Post, Get, Body, Param, ParseIntPipe, HttpStatus, Req, HttpException } from '@nestjs/common';
import { MarketFactoryContractService } from './market-factory.contract.service';
import { CreateMarketDto } from './dto/market-factory.dto';
import { WalletService } from '../../../wallet/wallet.service';
import { ParticipantRegistryContractService } from '../participant-registry/participant-registry.contract.service';
import { FlexibilityTokenContractService } from '../flexibility-token/flexibility-token.contract.service';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Market, MarketDocument, MarketState } from '../../../../schemas/Market.schema';
import { User, UserDocument } from '../../../../schemas/User.schema';
import { Request } from 'express';
import { Logger } from '@nestjs/common';

@Controller('blockchain/market-factory')
export class MarketFactoryContractController {
  private readonly logger = new Logger(MarketFactoryContractController.name);

  constructor(
    private readonly marketFactoryService: MarketFactoryContractService,
    private readonly walletService: WalletService,
    private readonly participantRegistryService: ParticipantRegistryContractService,
    private readonly flexibilityTokenContractService: FlexibilityTokenContractService,
    @InjectModel(Market.name) private marketModel: Model<MarketDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
  ) {}

  /** Create a new market on the MarketFactory contract using the admin wallet. */
  @Post('markets')
  async createMarket(@Body() dto: CreateMarketDto) {
    const { marketId, tx } = await this.marketFactoryService.createMarket(
      dto.communityId,
      dto.region,
      dto.ownerAddress,
    );

    const receipt = await tx.wait();

    return {
      statusCode: HttpStatus.CREATED,
      data: {
        marketId,
        txHash: tx.hash,
        blockNumber: receipt?.blockNumber,
      },
    };
  }

  /** Return on-chain market information for the given market ID. */
  @Get('markets/:marketId')
  async getMarket(@Param('marketId', ParseIntPipe) marketId: number) {
    const market = await this.marketFactoryService.getMarket(marketId);
    return {
      statusCode: HttpStatus.OK,
      data: market,
    };
  }

  /** Return the total number of markets created via the MarketFactory contract. */
  @Get('markets/count')
  async getMarketCount() {
    const count = await this.marketFactoryService.getMarketCount();
    return {
      statusCode: HttpStatus.OK,
      data: { count },
    };
  }

  /** Deactivate a market on the blockchain by market ID. */
  @Post('markets/:marketId/deactivate')
  async deactivateMarket(@Param('marketId', ParseIntPipe) marketId: number) {
    const tx = await this.marketFactoryService.deactivateMarket(marketId);
    const receipt = await tx.wait();

    return {
      statusCode: HttpStatus.OK,
      data: {
        txHash: tx.hash,
        blockNumber: receipt?.blockNumber,
      },
    };
  }

  /** Reactivate a previously deactivated market on the blockchain by market ID. */
  @Post('markets/:marketId/reactivate')
  async reactivateMarket(@Param('marketId', ParseIntPipe) marketId: number) {
    const tx = await this.marketFactoryService.reactivateMarket(marketId);
    const receipt = await tx.wait();

    return {
      statusCode: HttpStatus.OK,
      data: {
        txHash: tx.hash,
        blockNumber: receipt?.blockNumber,
      },
    };
  }

  /** Grant the MARKETPLACE_ADMIN role to the specified address on the MarketFactory contract. */
  @Post('roles/marketplace-admin/grant')
  async grantMarketplaceAdmin(@Body('address') address: string) {
    const tx = await this.marketFactoryService.grantMarketplaceAdmin(address);
    const receipt = await tx.wait();

    return {
      statusCode: HttpStatus.OK,
      data: {
        txHash: tx.hash,
        blockNumber: receipt?.blockNumber,
      },
    };
  }

  /** Return the deployed MarketFactory contract address. */
  @Get('contract-address')
  async getContractAddress() {
    const address = this.marketFactoryService.getContractAddress();
    return {
      statusCode: HttpStatus.OK,
      data: { address },
    };
  }

  /**
   * Activate a market on blockchain with PIN verification
   * This endpoint:
   * 1. Verifies the user's PIN and gets their wallet
   * 2. Registers the user in ParticipantRegistry as FMO_LMO (if needed)
   * 3. Creates the market on blockchain using the user's wallet
   * 4. Grants MINTER_ROLE to the new market (optional)
   */
  @Post(':marketId/activate-market-with-pin')
  async activateMarketWithPin(
    @Param('marketId') marketId: string,
    @Body('pin') pin: string,
    @Req() req: Request,
  ) {
    try {
      this.logger.log(`Activating market ${marketId} with PIN verification`);

      // Get user from JWT (contains Keycloak ID in 'sub' field)
      const user = (req as any).user;
      const userKeycloakId = user?.sub; // Keycloak ID is in 'sub' field from JWT

      this.logger.log(`User Keycloak ID (sub): ${userKeycloakId}`);

      if (!userKeycloakId) {
        throw new HttpException(
          { success: false, message: 'User not authenticated' },
          HttpStatus.UNAUTHORIZED,
        );
      }

      // Find the authenticated user in MongoDB by Keycloak ID
      const authenticatedUser = await this.userModel.findOne({ keycloakId: userKeycloakId }).exec();
      if (!authenticatedUser) {
        throw new HttpException(
          { success: false, message: 'User not found in database' },
          HttpStatus.NOT_FOUND,
        );
      }

      // Get MongoDB user ID from the authenticated user document
      const userId = (authenticatedUser._id as any).toString();
      this.logger.log(`User MongoDB ID: ${userId}`);

      // Get market from database
      const market = await this.marketModel.findById(marketId).exec();
      if (!market) {
        throw new HttpException(
          { success: false, message: 'Market not found' },
          HttpStatus.NOT_FOUND,
        );
      }

      // Verify user is the market owner (compare MongoDB IDs)
      const marketOwnerId = typeof market.marketOwner === 'object' && market.marketOwner !== null
        ? (market.marketOwner as any)._id?.toString()
        : String(market.marketOwner || '');

      this.logger.log(`Market owner ID: ${marketOwnerId}`);
      this.logger.log(`Authenticated user ID: ${userId}`);

      if (marketOwnerId !== userId) {
        throw new HttpException(
          { success: false, message: 'You are not the owner of this market' },
          HttpStatus.FORBIDDEN,
        );
      }

      // Check if market is in the correct state
      if (market.state !== MarketState.WALLET_CREATED_PENDING_ACTIVATION) {
        throw new HttpException(
          { success: false, message: 'Market must be accepted before activation' },
          HttpStatus.BAD_REQUEST,
        );
      }

      // STEP 1: Get user's wallet by verifying PIN
      this.logger.log(`Getting user wallet with PIN verification for user ${userId}`);
      const userWallet = await this.walletService.getConnectedWallet(userId, pin, marketId);

      // STEP 2: Register user in ParticipantRegistry as FMO_LMO (if not already registered)
      this.logger.log(`Registering user ${userKeycloakId} in ParticipantRegistry as FMO_LMO`);
      try {
        const registerTx = await this.participantRegistryService.registerParticipant(
          userWallet.address,
          2, // ParticipantType.FMO_LMO
          userKeycloakId,
          market.region || 'default'
        );
        await registerTx.wait();
        this.logger.log(`User registered in ParticipantRegistry. TX: ${registerTx.hash}`);
      } catch (regError: any) {
        this.logger.warn(`Registration warning (user may already be registered): ${regError.message}`);
      }

      // STEP 2b: Qualify user (separate try/catch so it runs even if register failed)
      try {
        const qualifyTx = await this.participantRegistryService.qualifyParticipant(userWallet.address);
        await qualifyTx.wait();
        this.logger.log(`User qualified in ParticipantRegistry. TX: ${qualifyTx.hash}`);
      } catch (qualifyError: any) {
        this.logger.warn(`Qualification warning (user may already be qualified): ${qualifyError.message}`);
      }

      // STEP 3: Create market on blockchain using NEW architecture
      this.logger.log(`Creating market on blockchain with user wallet ${userWallet.address}`);
      const { marketId: blockchainMarketId, marketAddress, txHash } =
        await this.marketFactoryService.createMarketWithUserWallet(
          marketId, // communityId
          market.region || 'default',
          userWallet.address,
          userWallet // User's wallet for signing
        );

      // STEP 4: Grant MINTER_ROLE to the new market (optional)
      try {
        this.logger.log(`Attempting to grant MINTER_ROLE to market ${marketAddress}...`);
        const grantTx = await this.flexibilityTokenContractService.grantMinterRole(marketAddress);
        await grantTx.wait();
        this.logger.log(`✅ MINTER_ROLE granted to market ${marketAddress}`);
      } catch (roleError: any) {
        this.logger.warn(`⚠️  Could not grant MINTER_ROLE: ${roleError.message}`);
      }

      // STEP 5: Update market in database
      await this.marketModel.findByIdAndUpdate(marketId, {
        state: MarketState.ACTIVE_ONCHAIN,
        activatedAt: new Date(),
        txHash: txHash,
        marketAddress: marketAddress,
        blockchainMarketId: blockchainMarketId
      });

      this.logger.log(`Market ${marketId} activated successfully. Tx: ${txHash}`);

      return {
        success: true,
        message: 'Market activated successfully on blockchain',
        data: {
          marketId: market._id,
          marketName: market.name,
          marketAddress: marketAddress,
          transactionHash: txHash,
          activatedAt: new Date()
        }
      };
    } catch (error: any) {
      this.logger.error('Error activating market with PIN', error.stack);

      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        { success: false, message: error.message },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
