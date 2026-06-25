import { Body, Controller, Post, Get, Put, Param, UseInterceptors, Req, HttpException, HttpStatus } from '@nestjs/common';
import { MarketFactoryService, CreateMarketWithOwnerDto, MarketActivationResult } from './market-factory.service';
import { UserService } from '../user/user.service';
import { Roles } from 'nest-keycloak-connect';
import { CreateMarketWithOwnerRequestDto } from './dto/create-market-with-owner.dto';
import { UpdateMarketRequestDto } from '../../dtos/update-market.dto';
import { I18nService } from 'nestjs-i18n';
import { Language } from '../../decorators/language.decorator';
import { NotFoundException, ConflictException, UnprocessableEntityException } from '../../exceptions/http-exception';
import { RateLimitInterceptor } from '../../interceptors/rate-limit.interceptor';
import { Market, MarketDocument, MarketState } from '../../schemas/Market.schema';
import { Request } from 'express';
import { User, UserDocument } from '../../schemas/User.schema';
import { Public } from '../../decorators/public.decorator';
import { Unprotected } from 'nest-keycloak-connect';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BlockchainService } from '../blockchain/blockchain.service';
import { FlexibilityTokenService } from '../flexibility-token/flexibility-token.service';
import { WalletService } from '../wallet/wallet.service';
import { ParticipantRegistryContractService } from '../blockchain/contracts/participant-registry/participant-registry.contract.service';
import { MarketFactoryContractService } from '../blockchain/contracts/market-factory/market-factory.contract.service';
import { FlexibilityTokenContractService } from '../blockchain/contracts/flexibility-token/flexibility-token.contract.service';
import { MarketContractService } from '../blockchain/contracts/market/market.contract.service';
import { ContractFactoryService } from '../blockchain/core/contract-factory.service';
import * as MarketFactoryABI from '../../contracts/MarketFactory.json';
import { ApiOAuth2, ApiTags } from '@nestjs/swagger';

@ApiTags('market-factory')
@ApiOAuth2(['openid'], 'keycloak')
@Controller('market-factory')
@UseInterceptors(RateLimitInterceptor)
export class MarketFactoryController {
  constructor(
    private readonly marketFactoryService: MarketFactoryService,
    private readonly userService: UserService,
    private readonly i18n: I18nService,
    private readonly blockchainService: BlockchainService,
    private readonly flexibilityTokenService: FlexibilityTokenService,
    private readonly walletService: WalletService,
    private readonly participantRegistryService: ParticipantRegistryContractService,
    private readonly marketFactoryContractService: MarketFactoryContractService,
    private readonly flexibilityTokenContractService: FlexibilityTokenContractService,
    private readonly marketContractService: MarketContractService,
    private readonly contractFactoryService: ContractFactoryService,
    @InjectModel(Market.name) private marketModel: Model<MarketDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>
  ) { }

  /** Health check endpoint — returns service status without authentication. */
  @Get('health')
  @Unprotected()
  getHealth() {
    return {
      success: true,
      status: 'OK',
      message: 'Market service is running',
      timestamp: new Date().toISOString()
    };
  }

  /** Returns all on-chain active markets available for FSP prosumers to subscribe to. */
  @Get('public-markets')
  @Roles({ roles: ['realm:FSP'] })
  async getPublicMarkets(@Language() lang: string) {
    try {
      const markets = await this.marketModel
        .find({ state: MarketState.ACTIVE_ONCHAIN, isActive: true })
        .select('name description region state createdAt')
        .sort({ createdAt: -1 });

      const successMessage = await this.i18n.translate('market.public.list.success', {
        lang,
        args: { count: markets.length }
      });

      return {
        success: true,
        data: markets,
        message: successMessage || `Found ${markets.length} active markets`
      };
    } catch (error) {
      throw new HttpException(
        'Failed to retrieve public markets',
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  /** Subscribes the authenticated FSP user to the specified market, adding it to their accessible markets list. */
  @Post('subscribe/:marketId')
  @Roles({ roles: ['realm:FSP'] })
  async subscribeToMarket(
    @Param('marketId') marketId: string,
    @Req() req: Request,
    @Language() lang: string
  ) {
    try {
      const keycloakUserId = (req as any).user?.sub;
      if (!keycloakUserId) {
        throw new HttpException('User context required', HttpStatus.UNAUTHORIZED);
      }

      // Get user from database
      const user = await this.userModel.findOne({ keycloakId: keycloakUserId });
      if (!user) {
        throw new NotFoundException('user', keycloakUserId);
      }

      // Verify market exists and is active
      const market = await this.marketModel.findById(marketId);
      if (!market) {
        throw new NotFoundException('market', marketId);
      }

      if (market.state !== MarketState.ACTIVE_ONCHAIN || !market.isActive) {
        throw new HttpException(
          'Cannot subscribe to inactive market',
          HttpStatus.BAD_REQUEST
        );
      }

      // Check if already subscribed
      const alreadySubscribed = user.accessibleMarkets.some(
        m => m.toString() === marketId
      );

      if (alreadySubscribed) {
        const message = await this.i18n.translate('market.subscribe.already', {
          lang,
          args: { marketName: market.name }
        });

        return {
          success: true,
          message: message || 'Already subscribed to this market',
          marketId: market._id,
          marketName: market.name
        };
      }

      // Add market to accessible markets
      user.accessibleMarkets.push(market._id as any);

      // If user has no assigned market, set this as assigned
      if (!user.assignedMarket) {
        user.assignedMarket = market._id as any;
      }

      await user.save();

      // ✅ FIX: Update market.users array for bidirectional relationship
      await this.marketModel.findByIdAndUpdate(market._id, {
        $addToSet: { users: user._id }  // $addToSet prevents duplicates
      });

      const successMessage = await this.i18n.translate('market.subscribe.success', {
        lang,
        args: { marketName: market.name }
      });

      return {
        success: true,
        message: successMessage || `Successfully subscribed to ${market.name}`,
        marketId: market._id,
        marketName: market.name,
        requiresTokenRefresh: true // User needs to refresh token to get market context
      };

    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'Failed to subscribe to market',
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  /** Creates a new market together with its owner user (F01-UC01). Creates the user account if the owner email does not yet exist. */
  @Post('market-with-owner')
  @Roles({ roles: ['realm:MARKETPLACE_ADMIN'] })
  async createMarketWithOwner(@Body() createMarketDto: CreateMarketWithOwnerRequestDto, @Language() lang: string) {
    try {
      // Always use English for emails regardless of request language
      const result = await this.marketFactoryService.createMarketWithOwner(createMarketDto, 'en');

      const message1 = await this.i18n.translate('market.owner.created', { lang });
      const message2 = await this.i18n.translate('market.market.created', { lang });
      const successMessage = result.isNewUser
        ? `${message1}
        ${message2}`
        : message2;

      return {
        success: true,
        data: {
          market: {
            id: result.market._id,
            name: result.market.name,
            description: result.market.description,
            state: result.market.state,
            marketOwner: result.market.marketOwner,
            createdAt: result.market.createdAt || new Date()
          },
          isNewUser: result.isNewUser,
          userCreated: result.userCreated,
          walletCreated: result.walletCreated,
          walletPin: result.walletPin, // Include PIN for market owner wallet
          message: successMessage
        }
      };
    } catch (error) {
      if (error.name === 'MarketNotFound') {
        throw new NotFoundException('market', createMarketDto.name);
      } else if (error.name === 'MarketExists') {
        throw new ConflictException('market', 'name', createMarketDto.name);
      } else if (error.name === 'InvalidConfiguration') {
        throw new UnprocessableEntityException('market', error.message, createMarketDto);
      }
      throw error;
    }
  }

  /** Checks whether the user identified by email currently owns any market (F01-UC04). */
  @Get('users/check-market-ownership/:email')
  @Roles({ roles: ['realm:MARKETPLACE_ADMIN'] })
  async checkMarketOwnership(@Param('email') email: string, @Language() lang: string) {
    try {
      const ownership = await this.userService.checkMarketOwnership(email);
      return {
        success: true,
        data: ownership
      };
    } catch (error) {
      if (error.name === 'UserNotFound') {
        throw new NotFoundException('user', email);
      }
      throw error;
    }
  }

  /** Returns all markets (including inactive ones) for the marketplace admin. */
  @Get('list')
  @Roles({ roles: ['realm:MARKETPLACE_ADMIN'] })
  async listAll(): Promise<MarketDocument[]> {
    return this.marketFactoryService.listAll();
  }

  /** Returns detailed information for a single market by its MongoDB ID (F01-UC05). */
  @Get('markets/:id')
  @Roles({ roles: ['realm:FMO_LMO', 'realm:MARKETPLACE_ADMIN', 'realm:FSP', 'realm:FRP'] })
  async getMarketById(@Param('id') marketId: string, @Language() lang: string) {
    try {
      const market = await this.marketFactoryService.findMarketById(marketId);

      if (!market) {
        throw new NotFoundException('market', marketId);
      }

      return {
        success: true,
        data: {
          market: {
            id: market._id,
            name: market.name,
            description: market.description,
            dso: market.dso,
            region: market.region,
            isActive: market.isActive,
            state: market.state,
            marketAddress: market.marketAddress,
            txHash: market.txHash,
            publicAddress: market.publicAddress,
            marketOwner: market.marketOwner,
            createdAt: market.createdAt,
            updatedAt: market.updatedAt,
            activatedAt: market.activatedAt
          }
        },
        message: 'Market retrieved successfully'
      };
    } catch (error) {
      if (error.name === 'CastError' || error.message?.includes('Cast to ObjectId failed')) {
        throw new NotFoundException('market', marketId);
      }
      throw error;
    }
  }


  /**
   * Returns the markets accessible to the authenticated user (F01-UC05).
   * FMO_LMO users receive markets they own; FSP/FRP users receive their accessible markets list.
   */
  @Get('my-markets')
  @Roles({ roles: ['realm:FMO_LMO', 'realm:FSP', 'realm:FRP'] })
  async getMyMarkets(@Req() req: Request & { user?: { sub: string } }, @Language() lang: string) {
    try {
      let user: UserDocument | null = null;

      // Intentar obtener el usuario autenticado
      if (req.user?.sub) {
        const keycloakId = req.user.sub;
        try {
          user = await this.userService.getUserByKeycloakId(keycloakId);
        } catch (error) {
        }
      }

      // Si no hay usuario autenticado o no se encuentra, buscar por email demo
      if (!user) {
        user = await this.userService.findUserByEmail('demo@example.com');
      }

      // Si aún no hay usuario, devolver todos los markets (para propósitos de demo)
      if (!user) {
        const allMarkets = await this.marketFactoryService.listAll();

        return {
          success: true,
          data: {
            markets: allMarkets.map(market => ({
              id: market._id,
              name: market.name,
              description: market.description,
              state: market.state,
              region: market.region,
              isActive: market.isActive,
              createdAt: market.createdAt,
              activatedAt: market.activatedAt,
              // Blockchain fields needed for "Blockchain Information" section
              marketAddress: market.marketAddress,
              txHash: market.txHash,
              publicAddress: market.publicAddress,
              marketOwner: market.marketOwner
            })),
            count: allMarkets.length,
            note: 'Demo mode: showing all markets'
          },
          message: 'Markets retrieved successfully (demo mode)'
        };
      }

      // Usuario encontrado, obtener sus markets
      // Para FMO_LMO: markets donde es owner
      // Para FSP/FRP: markets en su array accessibleMarkets
      let markets: MarketDocument[] = [];
      
      if (user.role === 'FMO_LMO') {
        // Market owner - get markets they own
        markets = await this.marketFactoryService.findMarketsByOwner((user._id as any).toString());
      } else if (user.accessibleMarkets && user.accessibleMarkets.length > 0) {
        // FSP/FRP - get markets from accessibleMarkets array
        const marketIds = user.accessibleMarkets.map(id => id.toString());
        markets = await this.marketFactoryService.findMarketsByIds(marketIds);
      }

      return {
        success: true,
        data: {
          markets: markets.map(market => ({
            id: market._id,
            name: market.name,
            description: market.description,
            state: market.state,
            region: market.region,
            isActive: market.isActive,
            createdAt: market.createdAt,
            activatedAt: market.activatedAt,
            // Blockchain fields needed for "Blockchain Information" section
            marketAddress: market.marketAddress,
            txHash: market.txHash,
            publicAddress: market.publicAddress,
            marketOwner: market.marketOwner
          })),
          count: markets.length,
          userId: (user._id as any).toString(),
          userEmail: user.email,
          userRole: user.role
        },
        message: 'Markets retrieved successfully'
      };
    } catch (error) {
      return {
        success: false,
        message: 'Error retrieving markets',
        error: error.message
      };
    }
  }

  /** Updates mutable market fields (name, description, region, etc.). Market owners may only update their own market (F01-UC06). */
  @Put('markets/:id')
  @Roles({ roles: ['realm:FMO_LMO', 'realm:MARKETPLACE_ADMIN'] })
  async updateMarket(
    @Param('id') marketId: string,
    @Body() updateMarketDto: UpdateMarketRequestDto,
    @Req() req: Request & { user?: { sub: string } },
    @Language() lang: string
  ) {
    try {
      let requestingUserId: string | undefined;

      // Intentar obtener el usuario autenticado
      if (req.user?.sub) {
        requestingUserId = req.user.sub;
      }

      const updatedMarket = await this.marketFactoryService.updateMarket(marketId, updateMarketDto, requestingUserId);

      const successMessage = this.i18n.translate('market.updated.success', {
        lang,
        args: { marketName: updatedMarket.name }
      });

      return {
        success: true,
        data: {
          market: {
            id: updatedMarket._id,
            name: updatedMarket.name,
            description: updatedMarket.description,
            dso: updatedMarket.dso,
            region: updatedMarket.region,
            isActive: updatedMarket.isActive,
            state: updatedMarket.state,
            marketAddress: updatedMarket.marketAddress,
            txHash: updatedMarket.txHash,
            marketOwner: updatedMarket.marketOwner,
            createdAt: updatedMarket.createdAt,
            updatedAt: updatedMarket.updatedAt,
            activatedAt: updatedMarket.activatedAt
          },
          message: successMessage || 'Market updated successfully'
        }
      };
    } catch (error) {
      if (error.name === 'MarketNotFound') {
        throw new NotFoundException('market', marketId);
      } else if (error.name === 'MarketExists') {
        throw new ConflictException('market', 'name', updateMarketDto.name || 'unknown');
      } else if (error.message?.includes('permission')) {
        throw new NotFoundException('permission', 'You do not have permission to update this market');
      }
      throw error;
    }
  }

  /** Deploys and activates the market contract on-chain using the admin wallet (F01-UC07). */
  @Post('activate-market/:marketId')
  @Roles({ roles: ['realm:FMO_LMO', 'realm:MARKETPLACE_ADMIN'] })
  async activateMarketOnBlockchain(
    @Param('marketId') marketId: string,
    @Req() req: Request & { user?: { sub: string } },
    @Language() lang: string
  ) {
    try {
      let requestingUserId: string | undefined;

      // Get authenticated user ID
      if (req.user?.sub) {
        requestingUserId = req.user.sub;
      }

      const activationResult: MarketActivationResult = await this.marketFactoryService.activateMarketOnBlockchain(
        marketId,
        requestingUserId
      );

      const successMessage = await this.i18n.translate('market.activated.success', {
        lang,
        args: { marketName: activationResult.market.name }
      });

      return {
        success: true,
        data: {
          market: {
            id: activationResult.market._id,
            name: activationResult.market.name,
            description: activationResult.market.description,
            dso: activationResult.market.dso,
            region: activationResult.market.region,
            state: activationResult.market.state,
            isActive: activationResult.market.isActive,
            marketOwner: activationResult.market.marketOwner,
            createdAt: activationResult.market.createdAt,
            updatedAt: activationResult.market.updatedAt,
            activatedAt: activationResult.market.activatedAt
          },
          blockchain: {
            txHash: activationResult.txHash,
            marketAddress: activationResult.marketAddress,
            success: activationResult.success
          },
          message: successMessage || 'Market activated on blockchain successfully'
        }
      };
    } catch (error) {
      if (error.name === 'MarketNotFound') {
        throw new NotFoundException('market', marketId);
      } else if (error.message?.includes('already active')) {
        throw new ConflictException('market', 'state', 'Market is already active on blockchain');
      } else if (error.message?.includes('wallet')) {
        throw new NotFoundException('wallet', 'Market owner must have a wallet before activating market');
      } else if (error.message?.includes('permission')) {
        throw new NotFoundException('permission', 'You do not have permission to activate this market');
      }
      throw error;
    }
  }

  /** Deactivates an active on-chain market contract (admin only). */
  @Post('deactivate-market/:marketId')
  @Roles({ roles: ['realm:MARKETPLACE_ADMIN'] })
  async deactivateMarketOnBlockchain(
    @Param('marketId') marketId: string,
    @Req() req: Request & { user?: { sub: string } },
    @Language() lang: string
  ) {
    try {
      let requestingUserId: string | undefined;

      // Get authenticated user ID
      if (req.user?.sub) {
        requestingUserId = req.user.sub;
      }

      const deactivationResult: MarketActivationResult = await this.marketFactoryService.deactivateMarketOnBlockchain(
        marketId,
        requestingUserId
      );

      const successMessage = await this.i18n.translate('market.deactivated.success', {
        lang,
        args: { marketName: deactivationResult.market.name }
      });

      return {
        success: true,
        data: {
          market: {
            id: deactivationResult.market._id,
            name: deactivationResult.market.name,
            description: deactivationResult.market.description,
            dso: deactivationResult.market.dso,
            region: deactivationResult.market.region,
            state: deactivationResult.market.state,
            isActive: deactivationResult.market.isActive,
            marketOwner: deactivationResult.market.marketOwner,
            createdAt: deactivationResult.market.createdAt,
            updatedAt: deactivationResult.market.updatedAt,
            deactivatedAt: deactivationResult.market.deactivatedAt
          },
          blockchain: {
            txHash: deactivationResult.txHash,
            marketAddress: deactivationResult.marketAddress,
            success: deactivationResult.success
          },
          message: successMessage || 'Market deactivated on blockchain successfully'
        }
      };
    } catch (error) {
      if (error.name === 'MarketNotFound') {
        throw new NotFoundException('market', marketId);
      } else if (error.message?.includes('Market already inactive')) {
        throw new ConflictException('market', 'state', 'Market is already deactivated on blockchain');
      } else if (error.message?.includes('wallet')) {
        throw new NotFoundException('wallet', 'Market owner must have a wallet before deactivating market');
      } else if (error.message?.includes('permission')) {
        throw new NotFoundException('permission', 'You do not have permission to deactivate this market');
      }
      throw error;
    }
  }

  /** Returns markets awaiting acceptance for the given owner email, filtering out expired ones. */
  @Get('pending-acceptance/:email')
  @Unprotected()
  async getPendingMarketsByEmail(
    @Param('email') email: string,
    @Language() lang: string = 'en'
  ) {
    try {
      const markets = await this.marketFactoryService.getPendingMarketsByOwnerEmailWithExpirationCheck(email);
      markets.forEach(market => {

      });

      const result = {
        success: true,
        data: {
          markets: markets.map(market => ({
            id: market._id,
            name: market.name,
            description: market.description,
            state: market.state,
            createdAt: market.createdAt
          })),
          count: markets.length
        }
      };
      return result;
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Removed fix-market-tokens endpoint - replaced with expiration-based system

  /** Accepts a pending market invitation, transitioning its state to CREATED_OFFLINE_ACCEPTED. */
  @Post('market-acceptation/:id')
  @Roles({ roles: ['realm:FMO_LMO', 'realm:DSO'] })
  async acceptMarket(
    @Param('id') marketId: string,
    @Req() req: Request & { user?: { sub: string } },
    @Language() lang: string = 'en'
  ) {
    try {
      let user: UserDocument | null = null;

      // Get authenticated user
      if (req.user?.sub) {
        const keycloakId = req.user.sub;
        try {
          user = await this.userService.getUserByKeycloakId(keycloakId);
        } catch (error) {
        }
      }

      // If no authenticated user, try demo user for testing
      if (!user) {
        user = await this.userService.findUserByEmail('demo@example.com');
      }

      if (!user) {
        return {
          success: false,
          message: 'User not found',
          error: 'USER_NOT_FOUND'
        };
      }

      // Accept the market
      const result = await this.marketFactoryService.acceptMarketSimplified(marketId, (user._id as any).toString());

      const message = await this.i18n.translate('market.accepted', { lang });

      return {
        success: true,
        data: {
          market: {
            id: result._id,
            name: result.name,
            state: result.state,
            acceptedAt: result.updatedAt
          },
          message: message || 'Market accepted successfully'
        }
      };
    } catch (error) {
      if (error.name === 'MarketNotFound') {
        throw new NotFoundException('market', marketId);
      } else if (error.message?.includes('already accepted') || error.message?.includes('already activated')) {
        return {
          success: false,
          error: 'ALREADY_ACCEPTED',
          message: await this.i18n.translate('market.alreadyAccepted', { lang }) || 'Market is already accepted or activated'
        };
      } else if (error.message?.includes('permission') || error.message?.includes('owner')) {
        return {
          success: false,
          error: 'PERMISSION_DENIED',
          message: 'You do not have permission to accept this market'
        };
      }
      throw error;
    }
  }

  /** Rejects a pending market invitation, transitioning its state to CREATED_OFFLINE_REJECTED. */
  @Post('market-rejection/:id')
  @Roles({ roles: ['realm:FMO_LMO'] })
  async rejectMarket(
    @Param('id') marketId: string,
    @Req() req: Request & { user?: { sub: string } },
    @Language() lang: string = 'en'
  ) {
    try {
      let user: UserDocument | null = null;

      // Get authenticated user
      if (req.user?.sub) {
        const keycloakId = req.user.sub;
        try {
          user = await this.userService.getUserByKeycloakId(keycloakId);
        } catch (error) {
        }
      }

      // If no authenticated user, try demo user for testing
      if (!user) {
        user = await this.userService.findUserByEmail('demo@example.com');
      }

      if (!user) {
        return {
          success: false,
          message: 'User not found',
          error: 'USER_NOT_FOUND'
        };
      }

      // Reject the market
      const result = await this.marketFactoryService.rejectMarketSimplified(marketId, (user._id as any).toString());

      const message = await this.i18n.translate('market.rejected', { lang });

      return {
        success: true,
        data: {
          market: {
            id: result._id,
            name: result.name,
            state: result.state,
            rejectedAt: result.updatedAt
          },
          message: message || 'Market rejected successfully'
        }
      };
    } catch (error) {
      if (error.name === 'MarketNotFound') {
        throw new NotFoundException('market', marketId);
      } else if (error.message?.includes('already accepted') || error.message?.includes('can only be rejected')) {
        return {
          success: false,
          error: 'INVALID_STATE',
          message: 'Market can only be rejected when in pending acceptation state'
        };
      } else if (error.message?.includes('permission') || error.message?.includes('owner')) {
        return {
          success: false,
          error: 'PERMISSION_DENIED',
          message: 'You do not have permission to reject this market'
        };
      }
      throw error;
    }
  }

  /** Returns the list of callable methods on the blockchain service (audit role only). */
  @Get('methods')
  @Roles({ roles: ['realm:market_audit'] })
  async getMethods() {
    try {
      const methods = await this.blockchainService.showMethods();
      return { success: true, methods };
    } catch (error) {
      this.blockchainService.logger.error('Error en getMethods', error.stack);
      throw new HttpException(
        { success: false, message: error.message },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /** Grants the MINTER role on the FlexibilityToken contract to the given market address. */
  @Post('grant-minter-role')
  @Roles({ roles: ['realm:FMO_LMO'] })
  async grantMinterRole(
    @Body('tokenAddress') tokenAddress: string,
    @Body('marketAddress') marketAddress: string
  ) {
    try {
      const result = await this.flexibilityTokenService.grantMinterRole(tokenAddress, marketAddress);
      return {
        success: true,
        data: result,
        message: 'Minter role granted successfully'
      };
    } catch (error) {
      this.blockchainService.logger.error('Error granting minter role', error.stack);
      throw new HttpException(
        { success: false, message: error.message },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /** Validates that the authenticated user is the market owner and prompts them to provide their wallet PIN for activation. */
  @Post('request-activation-pin/:marketId')
  @Roles({ roles: ['realm:FMO_LMO'] })
  async requestActivationPin(
    @Param('marketId') marketId: string,
    @Req() request: any
  ) {
    try {
      // Get user ID from request (set by Keycloak auth)
      const userId = request.user?.sub;
      if (!userId) {
        throw new HttpException(
          { success: false, message: 'User not authenticated' },
          HttpStatus.UNAUTHORIZED,
        );
      }

      // Find the market and verify ownership
      const market = await this.marketModel.findById(marketId).populate('marketOwner');
      if (!market) {
        throw new HttpException(
          { success: false, message: 'Market not found' },
          HttpStatus.NOT_FOUND,
        );
      }

      // Find the user
      const user = await this.userModel.findOne({ keycloakId: userId });
      if (!user) {
        throw new HttpException(
          { success: false, message: 'User not found' },
          HttpStatus.NOT_FOUND,
        );
      }

      // Verify market ownership
      if ((market.marketOwner as any)._id.toString() !== (user as any)._id.toString()) {
        throw new HttpException(
          { success: false, message: 'You are not the owner of this market' },
          HttpStatus.FORBIDDEN,
        );
      }

      // Check if market is in the correct state for activation
      if (market.state !== MarketState.WALLET_CREATED_PENDING_ACTIVATION) {
        throw new HttpException(
          { success: false, message: 'Market must be accepted before requesting activation PIN' },
          HttpStatus.BAD_REQUEST,
        );
      }

      // For simplification, we'll use the wallet PIN instead of generating a new one
      // The PIN needed is the same one used to encrypt the user's wallet
      this.blockchainService.logger.log(`Activation PIN requested for market ${marketId} by user ${userId}`);

      return {
        success: true,
        message: 'Please enter your wallet PIN to activate the market',
        data: {
          marketId: market._id,
          marketName: market.name,
          instruction: 'Use the same PIN you used when creating your wallet'
        }
      };
    } catch (error) {
      this.blockchainService.logger.error('Error requesting activation PIN', error.stack);

      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        { success: false, message: error.message },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Activates the market on-chain using the market owner's wallet PIN.
   * Registers and qualifies the owner in the ParticipantRegistry, mints initial FLEX tokens,
   * deploys the market contract via MarketFactory, and sets the ParticipantRegistry on the market contract.
   */
  @Post('activate-market-with-pin/:marketId')
  @Roles({ roles: ['realm:FMO_LMO'] })
  async activateMarketWithPin(
    @Param('marketId') marketId: string,
    @Body('pin') pin: string,
    @Req() request: any
  ) {
    try {
      // Get user ID from request (set by Keycloak auth)
      const userId = request.user?.sub;
      if (!userId) {
        throw new HttpException(
          { success: false, message: 'User not authenticated' },
          HttpStatus.UNAUTHORIZED,
        );
      }

      // Validate PIN input
      if (!pin || pin.length !== 6) {
        throw new HttpException(
          { success: false, message: 'PIN must be 6 digits' },
          HttpStatus.BAD_REQUEST,
        );
      }

      // Find the market and verify ownership
      const market = await this.marketModel.findById(marketId).populate('marketOwner');
      if (!market) {
        throw new HttpException(
          { success: false, message: 'Market not found' },
          HttpStatus.NOT_FOUND,
        );
      }

      // Find the user
      const user = await this.userModel.findOne({ keycloakId: userId });
      if (!user) {
        throw new HttpException(
          { success: false, message: 'User not found' },
          HttpStatus.NOT_FOUND,
        );
      }

      // Verify market ownership
      if ((market.marketOwner as any)._id.toString() !== (user as any)._id.toString()) {
        throw new HttpException(
          { success: false, message: 'You are not the owner of this market' },
          HttpStatus.FORBIDDEN,
        );
      }

      // Check if market is in the correct state for activation
      if (market.state !== MarketState.WALLET_CREATED_PENDING_ACTIVATION) {
        throw new HttpException(
          { success: false, message: 'Market must be accepted before activation' },
          HttpStatus.BAD_REQUEST,
        );
      }

      // Get the user's wallet to verify the PIN and use it for signing transactions
      const userWallet = await this.walletService.getConnectedWallet((user as any)._id.toString(), pin, marketId);

      // STEP 1: Register user in ParticipantRegistry as FMO_LMO (if not already registered)
      // This is required before creating the market because MarketFactory checks ParticipantRegistry
      this.blockchainService.logger.log(`Registering user ${userId} in ParticipantRegistry as FMO_LMO`);

      try {
        // Register participant
        const registerTx = await this.participantRegistryService.registerParticipant(
          userWallet.address,
          2, // ParticipantType.FMO_LMO
          `ipfs://user-${userId}`,
          market.region || 'default'
        );
        await registerTx.wait();
        this.blockchainService.logger.log(`User registered in ParticipantRegistry. TX: ${registerTx.hash}`);
      } catch (regError: any) {
        this.blockchainService.logger.warn(`Registration warning (user may already be registered): ${regError.message}`);
      }

      // Qualify participant (separate try/catch so it runs even if register failed)
      try {
        const qualifyTx = await this.participantRegistryService.qualifyParticipant(userWallet.address);
        await qualifyTx.wait();
        this.blockchainService.logger.log(`User qualified in ParticipantRegistry. TX: ${qualifyTx.hash}`);
      } catch (qualifyError: any) {
        this.blockchainService.logger.warn(`Qualification warning (user may already be qualified): ${qualifyError.message}`);
      }

      // Mint initial FLEX tokens to the user (50,000 FLEX)
      try {
        const initialTokenAmount = FlexibilityTokenContractService.toWei('50000');
        this.blockchainService.logger.log(`Minting 50,000 FLEX tokens to ${userWallet.address}`);
        const mintTx = await this.flexibilityTokenContractService.mint(userWallet.address, initialTokenAmount);
        await mintTx.wait();
        this.blockchainService.logger.log(`FLEX tokens minted successfully. TX: ${mintTx.hash}`);
      } catch (mintError: any) {
        this.blockchainService.logger.warn(`Mint warning (user may already have tokens): ${mintError.message}`);
      }

      // STEP 2: Create the market on blockchain using the USER'S wallet
      // Now the user has FMO_LMO permissions in ParticipantRegistry, so they can create markets
      const txResult = await this.blockchainService.createMarket(
        userWallet.address, // DSO/owner address (the market owner's address)
        market.region || '', // region
        market.description || '', // description
        userWallet // PASS user wallet - they now have permissions via ParticipantRegistry
      );

      this.blockchainService.logger.log(`Market created successfully. Tx: ${txResult.txHash}, Address: ${txResult.newContractAddress}`);

      // STEP 3: Configure ParticipantRegistry in the Market contract
      try {
        const participantRegistryAddress = process.env.PARTICIPANT_REGISTRY_ADDRESS;
        if (!participantRegistryAddress) {
          throw new Error('PARTICIPANT_REGISTRY_ADDRESS not configured in environment');
        }

        this.blockchainService.logger.log(`Setting ParticipantRegistry ${participantRegistryAddress} in Market ${txResult.newContractAddress}`);
        const setRegistryTx = await this.marketContractService.setParticipantRegistry(
          txResult.newContractAddress,
          participantRegistryAddress
        );
        await setRegistryTx.wait();
        this.blockchainService.logger.log(`ParticipantRegistry configured successfully. TX: ${setRegistryTx.hash}`);
      } catch (configError) {
        this.blockchainService.logger.error(`Failed to configure ParticipantRegistry in Market: ${configError.message}`);
        // Don't throw - market is created, but configuration failed
        this.blockchainService.logger.warn(`⚠️  Market created but ParticipantRegistry configuration failed. Manual intervention required.`);
      }

      // Update market state and blockchain data
      await this.marketModel.findByIdAndUpdate(marketId, {
        state: MarketState.ACTIVE_ONCHAIN,
        activatedAt: new Date(),
        txHash: txResult.txHash,
        marketAddress: txResult.newContractAddress
      });

      this.blockchainService.logger.log(`Market ${marketId} activated successfully. Tx: ${txResult.txHash}`);

      return {
        success: true,
        message: 'Market activated successfully on blockchain',
        data: {
          marketId: market._id,
          marketName: market.name,
          marketAddress: txResult.newContractAddress,
          transactionHash: txResult.txHash,
          activatedAt: new Date()
        }
      };
    } catch (error) {
      this.blockchainService.logger.error('Error activating market with PIN', error.stack);

      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        { success: false, message: error.message },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /** Adds one or more users to a market, granting them access (updates both Market.users and User.accessibleMarkets). */
  @Post('markets/:id/users')
  @Roles({ roles: ['realm:FMO_LMO', 'realm:MARKETPLACE_ADMIN'] })
  async assignUsersToMarket(
    @Param('id') marketId: string,
    @Body('userIds') userIds: string[],
    @Language() lang: string
  ) {
    try {
      const updatedMarket = await this.marketFactoryService.assignUsersToMarket(marketId, userIds);

      return {
        success: true,
        data: {
          market: updatedMarket,
          message: `Successfully assigned ${userIds.length} user(s) to market`
        }
      };
    } catch (error) {
      if (error.name === 'MarketNotFound') {
        throw new NotFoundException('market', marketId);
      } else if (error.name === 'UserNotFound' || error.message?.includes('users not found')) {
        throw new NotFoundException('user', 'One or more users not found');
      }
      throw error;
    }
  }

  /** Removes one or more users from a market, revoking their access and reassigning their active market if needed. */
  @Post('markets/:id/users/remove')
  @Roles({ roles: ['realm:FMO_LMO', 'realm:MARKETPLACE_ADMIN'] })
  async removeUsersFromMarket(
    @Param('id') marketId: string,
    @Body('userIds') userIds: string[],
    @Language() lang: string
  ) {
    try {
      const updatedMarket = await this.marketFactoryService.removeUsersFromMarket(marketId, userIds);

      return {
        success: true,
        data: {
          market: updatedMarket,
          message: `Successfully removed ${userIds.length} user(s) from market`
        }
      };
    } catch (error) {
      if (error.name === 'MarketNotFound') {
        throw new NotFoundException('market', marketId);
      }
      throw error;
    }
  }

  /** Returns the list of users currently assigned to the specified market. */
  @Get('markets/:id/users')
  @Roles({ roles: ['realm:FMO_LMO', 'realm:MARKETPLACE_ADMIN', 'realm:FSP', 'realm:FRP'] })
  async getUsersInMarket(
    @Param('id') marketId: string,
    @Language() lang: string
  ) {
    try {
      const users = await this.marketFactoryService.getUsersInMarket(marketId);

      return {
        success: true,
        data: {
          users: users.map(user => ({
            id: user._id,
            username: user.username,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            role: user.role,
            status: user.status
          })),
          count: users.length
        }
      };
    } catch (error) {
      if (error.name === 'MarketNotFound') {
        throw new NotFoundException('market', marketId);
      }
      throw error;
    }
  }

  /** Replaces the entire user list for a market, synchronizing Market.users and User.accessibleMarkets for added and removed users. */
  @Put('markets/:id/users')
  @Roles({ roles: ['realm:FMO_LMO', 'realm:MARKETPLACE_ADMIN'] })
  async setUsersInMarket(
    @Param('id') marketId: string,
    @Body('userIds') userIds: string[],
    @Language() lang: string
  ) {
    try {
      const updatedMarket = await this.marketFactoryService.setUsersInMarket(marketId, userIds);

      return {
        success: true,
        data: {
          market: updatedMarket,
          message: `Successfully set ${userIds.length} user(s) in market`
        }
      };
    } catch (error) {
      if (error.name === 'MarketNotFound') {
        throw new NotFoundException('market', marketId);
      } else if (error.name === 'UserNotFound' || error.message?.includes('users not found')) {
        throw new NotFoundException('user', 'One or more users not found');
      }
      throw error;
    }
  }
}