import {
    Controller,
    Post,
    Get,
    Param,
    Body,
    Req,
    HttpException,
    HttpStatus,
    BadRequestException,
    ForbiddenException,
    UseGuards,
    Query
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WalletService } from './wallet.service';
import { UserService } from '../user/user.service';
import { MarketFactoryService } from '../market-factory/market-factory.service';
import { EmailService } from '../email/email.service';
import { Request } from 'express';
import { UserDocument } from '../../schemas/User.schema';
import { MarketDocument } from '../../schemas/Market.schema';
import { Roles } from 'nest-keycloak-connect';
import { WalletBinding, WalletCreationResult, WalletInvitationData } from '../../utils/WalletTypes';
import { ApiOAuth2, ApiTags } from '@nestjs/swagger';

interface ApiResponse<T> {
    success: boolean;
    message: string;
    data?: T;
}

interface CreateWalletRequest {
    walletBinding: WalletBinding;
    marketId?: string;
}

interface CreateSelfWalletRequest {
    // No additional parameters needed for SELF wallet
}

interface CreateMarketWalletRequest {
    marketId: string;
}

interface InviteUserRequest {
    marketId: string;
    invitedUserId: string;
    ownerPin: string;
}

interface VerifyPinRequest {
    pin: string;
    marketId?: string;
}

@ApiTags('wallet')
@ApiOAuth2(['openid'], 'keycloak')
@Controller('wallet')
export class WalletController {
    constructor(
        private readonly walletService: WalletService,
        private readonly userService: UserService,
        private readonly marketFactoryService: MarketFactoryService,
        private readonly emailService: EmailService,
        private readonly configService: ConfigService
    ) { }

    /**
     * Get wallet for authenticated user
     */
    @Get()
    @Roles({ roles: ['realm:FSP', 'realm:FMO_LMO', 'realm:FRP', 'realm:prosumer', 'realm:bid_editor', 'realm:offer_approver'] })
    async getWallet(@Req() req: Request & { user?: { sub: string } }): Promise<ApiResponse<any>> {
        try {
            if (!req.user?.sub) {
                throw new BadRequestException('User not authenticated');
            }

            const keycloakId = req.user.sub;
            const user: UserDocument = await this.userService.getUserByKeycloakId(keycloakId);
            if (!user || !user._id) {
                throw new BadRequestException('User not found');
            }

            // For market binding users, we need the market ID from query params or user's assigned market
            const marketId = user.walletBinding === WalletBinding.MARKET ?
                user.assignedMarket?.toString() : undefined;

            const walletAddress = await this.walletService.getWallet(user._id.toString(), marketId);

            return {
                success: true,
                message: 'Wallet retrieved successfully',
                data: {
                    address: walletAddress,
                    binding: user.walletBinding,
                    hasWallet: walletAddress !== null
                }
            };
        } catch (error) {
            throw new HttpException(
                {
                    success: false,
                    message: `Failed to retrieve wallet: ${error.message}`,
                    data: null
                },
                error instanceof BadRequestException ? HttpStatus.BAD_REQUEST : HttpStatus.INTERNAL_SERVER_ERROR
            );
        }
    }

    /**
     * Create a new SELF wallet for authenticated user (FSP and FRP users)
     */
    @Post('self')
    @Roles({ roles: ['realm:FSP', 'realm:FRP'] })
    async createSelfWallet(
        @Body() createWalletRequest: CreateSelfWalletRequest,
        @Req() req: Request & { user?: { sub: string } }
    ): Promise<ApiResponse<WalletCreationResult>> {
        try {
            if (!req.user?.sub) {
                throw new BadRequestException('User not authenticated');
            }

            const keycloakId = req.user.sub;
            const user: UserDocument = await this.userService.getUserByKeycloakId(keycloakId);
            if (!user || !user._id) {
                throw new BadRequestException('User not found');
            }

            const walletResult = await this.walletService.createWallet(
                user._id.toString(),
                WalletBinding.SELF
            );

            // Send PIN notification email to user
            try {
                await this.emailService.sendWalletPinNotification({
                    email: user.email,
                    username: user.username,
                    pin: walletResult.pin,
                    walletType: 'SELF',
                    language: 'en' // You can add language detection later
                });
            } catch (emailError) {
                // Don't fail wallet creation if email fails
            }

            return {
                success: true,
                message: 'SELF wallet created successfully',
                data: walletResult
            };
        } catch (error) {
            const statusCode = error instanceof BadRequestException || error instanceof ForbiddenException
                ? HttpStatus.BAD_REQUEST
                : HttpStatus.INTERNAL_SERVER_ERROR;

            throw new HttpException(
                {
                    success: false,
                    message: `Failed to create SELF wallet: ${error.message}`,
                    data: null
                },
                statusCode
            );
        }
    }

    /**
     * Create a new MARKET wallet for authenticated user (market owners)
     * This endpoint creates a wallet for a specific market
     */
    @Post('market')
    @Roles({ roles: ['realm:FMO_LMO'] })
    async createMarketWallet(
        @Body() createWalletRequest: CreateMarketWalletRequest,
        @Req() req: Request & { user?: { sub: string } }
    ): Promise<ApiResponse<WalletCreationResult>> {
        try {
            if (!req.user?.sub) {
                throw new BadRequestException('User not authenticated');
            }

            const keycloakId = req.user.sub;
            const user: UserDocument = await this.userService.getUserByKeycloakId(keycloakId);
            if (!user || !user._id) {
                throw new BadRequestException('User not found');
            }

            const walletResult = await this.walletService.createWallet(
                user._id.toString(),
                WalletBinding.MARKET,
                createWalletRequest.marketId
            );

            // Get market name for email
            let marketName = 'Unknown Market';
            try {
                const market: MarketDocument | null = await this.marketFactoryService.findMarketById(createWalletRequest.marketId);
                if (market) {
                    marketName = market.name;
                }
            } catch (error) {
            }

            // Send PIN notification email to user
            try {
                await this.emailService.sendWalletPinNotification({
                    email: user.email,
                    username: user.username,
                    pin: walletResult.pin,
                    walletType: 'MARKET',
                    marketName: marketName,
                    language: 'en' // You can add language detection later
                });
            } catch (emailError) {
                // Don't fail wallet creation if email fails
            }

            return {
                success: true,
                message: 'MARKET wallet created successfully',
                data: walletResult
            };
        } catch (error) {
            const statusCode = error instanceof BadRequestException || error instanceof ForbiddenException
                ? HttpStatus.BAD_REQUEST
                : HttpStatus.INTERNAL_SERVER_ERROR;

            throw new HttpException(
                {
                    success: false,
                    message: `Failed to create MARKET wallet: ${error.message}`,
                    data: null
                },
                statusCode
            );
        }
    }

    /**
     * Invite user to access market wallet
     */
    @Post('invite')
    @Roles({ roles: ['realm:FMO_LMO'] })
    async inviteUserToMarketWallet(
        @Body() inviteRequest: InviteUserRequest,
        @Req() req: Request & { user?: { sub: string } }
    ): Promise<ApiResponse<WalletInvitationData>> {
        try {
            if (!req.user?.sub) {
                throw new BadRequestException('User not authenticated');
            }

            const keycloakId = req.user.sub;
            const owner: UserDocument = await this.userService.getUserByKeycloakId(keycloakId);
            if (!owner || !owner._id) {
                throw new BadRequestException('Owner not found');
            }

            // ✅ Validar PIN del owner ANTES de proceder
            const isPinValid = await this.walletService.verifyPin(owner._id.toString(), inviteRequest.ownerPin);
            if (!isPinValid) {
                throw new BadRequestException('Invalid PIN');
            }

            const invitationResult = await this.walletService.inviteUserToMarketWallet(
                owner._id.toString(),
                inviteRequest.marketId,
                inviteRequest.invitedUserId,
                inviteRequest.ownerPin  // ✅ Pasar PIN validado
            );

            return {
                success: true,
                message: 'User invited to market wallet successfully',
                data: invitationResult
            };
        } catch (error) {
            const statusCode = error instanceof BadRequestException || error instanceof ForbiddenException
                ? HttpStatus.BAD_REQUEST
                : HttpStatus.INTERNAL_SERVER_ERROR;

            throw new HttpException(
                {
                    success: false,
                    message: `Failed to invite user: ${error.message}`,
                    data: null
                },
                statusCode
            );
        }
    }

    /**
     * Verify user's PIN
     */
    @Post('verify-pin')
    @Roles({ roles: ['realm:FSP', 'realm:FMO_LMO', 'realm:user_manager', 'realm:bid_editor', 'realm:offer_approver'] })
    async verifyPin(
        @Body() verifyRequest: VerifyPinRequest,
        @Req() req: Request & { user?: { sub: string } }
    ): Promise<ApiResponse<{ valid: boolean }>> {
        try {
            if (!req.user?.sub) {
                throw new BadRequestException('User not authenticated');
            }

            const keycloakId = req.user.sub;
            const user: UserDocument = await this.userService.getUserByKeycloakId(keycloakId);
            if (!user || !user._id) {
                throw new BadRequestException('User not found');
            }

            const isValid = await this.walletService.verifyPin(user._id.toString(), verifyRequest.pin);

            if (!isValid) {
                throw new HttpException(
                    {
                        success: false,
                        message: 'Invalid PIN',
                        data: { valid: false }
                    },
                    HttpStatus.UNAUTHORIZED
                );
            }

            return {
                success: true,
                message: 'PIN verified successfully',
                data: { valid: true }
            };
        } catch (error) {
            // If it's already an HttpException (like our UNAUTHORIZED), re-throw it
            if (error instanceof HttpException) {
                throw error;
            }

            // For other errors, throw INTERNAL_SERVER_ERROR
            throw new HttpException(
                {
                    success: false,
                    message: `Failed to verify PIN: ${error.message}`,
                    data: null
                },
                HttpStatus.INTERNAL_SERVER_ERROR
            );
        }
    }

    /**
     * Get wallet balance
     */
    @Get('balance')
    @Roles({ roles: ['realm:FSP', 'realm:FMO_LMO', 'realm:FRP', 'realm:user_manager', 'realm:bid_editor', 'realm:offer_approver'] })
    async getWalletBalance(@Req() req: Request & { user?: { sub: string } }): Promise<ApiResponse<any>> {
        try {
            if (!req.user?.sub) {
                throw new BadRequestException('User not authenticated');
            }

            const keycloakId = req.user.sub;
            const user: UserDocument = await this.userService.getUserByKeycloakId(keycloakId);
            if (!user || !user._id) {
                throw new BadRequestException('User not found');
            }

            const marketId = user.walletBinding === WalletBinding.MARKET ?
                user.assignedMarket?.toString() : undefined;

            const balance = await this.walletService.getWalletBalance(user._id.toString(), marketId);
            const address = await this.walletService.getWallet(user._id.toString(), marketId);

            return {
                success: true,
                message: 'Wallet balance retrieved successfully',
                data: {
                    address: address,
                    balance: balance,
                    unit: 'ETH'
                }
            };
        } catch (error) {
            throw new HttpException(
                {
                    success: false,
                    message: `Failed to retrieve wallet balance: ${error.message}`,
                    data: null
                },
                HttpStatus.INTERNAL_SERVER_ERROR
            );
        }
    }

    /**
     * Get flexibility token balance
     */
    @Get('token-balance')
    @Roles({ roles: ['realm:FSP', 'realm:FMO_LMO', 'realm:FRP'] })
    async getTokenBalance(@Req() req: Request & { user?: { sub: string } }): Promise<ApiResponse<any>> {
        try {
            if (!req.user?.sub) {
                throw new BadRequestException('User not authenticated');
            }

            const keycloakId = req.user.sub;
            const user: UserDocument = await this.userService.getUserByKeycloakId(keycloakId);
            if (!user || !user._id) {
                throw new BadRequestException('User not found');
            }

            // Check if user has MARKET binding but no assigned market
            if (user.walletBinding === WalletBinding.MARKET && !user.assignedMarket) {
                return {
                    success: false,
                    message: 'No market assigned to user. Please select a market first.',
                    data: {
                        address: null,
                        tokenBalance: null,
                        tokenSymbol: 'FLEX'
                    }
                };
            }

            const marketId = user.walletBinding === WalletBinding.MARKET ?
                user.assignedMarket?.toString() : undefined;

            const tokenBalance = await this.walletService.getFlexibilityTokenBalance(user._id.toString(), marketId);
            const address = await this.walletService.getWallet(user._id.toString(), marketId);

            return {
                success: true,
                message: 'Token balance retrieved successfully',
                data: {
                    address: address,
                    tokenBalance: tokenBalance,
                    tokenSymbol: 'FLEX'
                }
            };
        } catch (error) {
            throw new HttpException(
                {
                    success: false,
                    message: `Failed to retrieve token balance: ${error.message}`,
                    data: null
                },
                HttpStatus.INTERNAL_SERVER_ERROR
            );
        }
    }

    /**
     * Get network information
     */
    @Get('network-info')
    async getNetworkInfo(): Promise<ApiResponse<any>> {
        try {
            const networkInfo = await this.walletService.getNetworkInfo();
            return {
                success: true,
                message: 'Network information retrieved successfully',
                data: networkInfo
            };
        } catch (error) {
            throw new HttpException(
                {
                    success: false,
                    message: `Failed to retrieve network information: ${error.message}`,
                    data: null
                },
                HttpStatus.INTERNAL_SERVER_ERROR
            );
        }
    }

    /**
     * Get wallet address by market ID (for market binding users)
     */
    @Get('market/:marketId')
    @Roles({ roles: ['realm:FSP', 'realm:FMO_LMO', 'realm:user_manager', 'realm:bid_editor', 'realm:offer_approver'] })
    async getMarketWallet(
        @Param('marketId') marketId: string,
        @Req() req: Request & { user?: { sub: string } }
    ): Promise<ApiResponse<any>> {
        try {
            if (!req.user?.sub) {
                throw new BadRequestException('User not authenticated');
            }

            const keycloakId = req.user.sub;
            const user: UserDocument = await this.userService.getUserByKeycloakId(keycloakId);
            if (!user || !user._id) {
                throw new BadRequestException('User not found');
            }

            const walletAddress = await this.walletService.getWallet(user._id.toString(), marketId);

            return {
                success: true,
                message: 'Market wallet retrieved successfully',
                data: {
                    marketId: marketId,
                    address: walletAddress,
                    binding: user.walletBinding,
                    hasWallet: walletAddress !== null
                }
            };
        } catch (error) {
            throw new HttpException(
                {
                    success: false,
                    message: `Failed to retrieve market wallet: ${error.message}`,
                    data: null
                },
                error instanceof BadRequestException ? HttpStatus.BAD_REQUEST : HttpStatus.INTERNAL_SERVER_ERROR
            );
        }
    }

    /** Returns paginated blockchain transaction history for the authenticated user's wallet. */
    @Get('transactions')
    @Roles({ roles: ['realm:FSP', 'realm:FMO_LMO', 'realm:FRP'] })
    async getWalletTransactions(
        @Req() req: Request & { user?: { sub: string } },
        @Query('page') page?: string,
        @Query('limit') limit?: string,
        @Query('status') status?: string,
        @Query('search') search?: string
    ): Promise<ApiResponse<any>> {
        try {
            if (!req.user?.sub) {
                throw new BadRequestException('User not authenticated');
            }

            const keycloakId = req.user.sub;
            const user: UserDocument = await this.userService.getUserByKeycloakId(keycloakId);
            if (!user || !user._id) {
                throw new BadRequestException('User not found');
            }

            const marketId = user.walletBinding === WalletBinding.MARKET ?
                user.assignedMarket?.toString() : undefined;

            // Parse pagination parameters
            const pageNum = page ? parseInt(page, 10) : 1;
            const limitNum = limit ? parseInt(limit, 10) : 20;

            // ✅ Parse filter parameters
            const statusFilter = status?.trim() || '';
            const searchTerm = search?.trim() || '';

            // Validate pagination parameters
            if (pageNum < 1) {
                throw new BadRequestException('Page number must be greater than 0');
            }
            if (limitNum < 1 || limitNum > 100) {
                throw new BadRequestException('Limit must be between 1 and 100');
            }

            // ✅ Pass filters to service
            const result = await this.walletService.getWalletTransactions(
                user._id.toString(),
                marketId,
                pageNum,
                limitNum,
                statusFilter,
                searchTerm
            );

            const address = await this.walletService.getWallet(user._id.toString(), marketId);

            return {
                success: true,
                message: 'Wallet transactions retrieved successfully',
                data: {
                    address: address,
                    transactions: result.transactions,
                    pagination: result.pagination
                }
            };
        } catch (error) {
            throw new HttpException(
                {
                    success: false,
                    message: `Failed to retrieve wallet transactions: ${error.message}`,
                    data: null
                },
                error instanceof BadRequestException ? HttpStatus.BAD_REQUEST : HttpStatus.INTERNAL_SERVER_ERROR
            );
        }
    }

    /** Returns paginated blockchain transaction history scoped to all sessions of the authenticated market owner's market. */
    @Get('transactions/market')
    @Roles({ roles: ['realm:FMO_LMO'] })
    async getMarketTransactions(
        @Req() req: Request & { user?: { sub: string } },
        @Query('page') page?: string,
        @Query('limit') limit?: string,
        @Query('status') status?: string,
        @Query('search') search?: string
    ): Promise<ApiResponse<any>> {
        try {
            if (!req.user?.sub) {
                throw new BadRequestException('User not authenticated');
            }

            const keycloakId = req.user.sub;
            const user: UserDocument = await this.userService.getUserByKeycloakId(keycloakId);
            if (!user || !user._id) {
                throw new BadRequestException('User not found');
            }

            const marketId = user.walletBinding === WalletBinding.MARKET ?
                user.assignedMarket?.toString() : undefined;

            const pageNum = page ? parseInt(page, 10) : 1;
            const limitNum = limit ? parseInt(limit, 10) : 20;

            // ✅ Parse filters
            const statusFilter = status?.trim() || '';
            const searchTerm = search?.trim() || '';

            if (pageNum < 1) {
                throw new BadRequestException('Page number must be greater than 0');
            }
            if (limitNum < 1 || limitNum > 100) {
                throw new BadRequestException('Limit must be between 1 and 100');
            }

            // ✅ Pass filters to service
            const result = await this.walletService.getMarketTransactions(
                user._id.toString(),
                marketId,
                pageNum,
                limitNum,
                statusFilter,
                searchTerm
            );

            const address = await this.walletService.getWallet(user._id.toString(), marketId);

            return {
                success: true,
                message: 'Wallet transactions retrieved successfully',
                data: {
                    address: address,
                    transactions: result.transactions,
                    pagination: result.pagination
                }
            };
        } catch (error) {
            throw new HttpException(
                {
                    success: false,
                    message: `Failed to retrieve wallet transactions: ${error.message}`,
                    data: null
                },
                error instanceof BadRequestException ? HttpStatus.BAD_REQUEST : HttpStatus.INTERNAL_SERVER_ERROR
            );
        }
    }

    /** Returns all paginated blockchain transactions across the platform (admin only). */
    @Get('transactions/admin')
    @Roles({ roles: ['realm:MARKETPLACE_ADMIN'] })
    async getTransactions(
        @Query('page') page?: string,
        @Query('limit') limit?: string,
        @Query('status') status?: string,
        @Query('search') search?: string
    ): Promise<ApiResponse<any>> {
        try {
            const pageNum = page ? Number.parseInt(page, 10) : 1;
            const limitNum = limit ? Number.parseInt(limit, 10) : 20;

            // ✅ Parse filters
            const statusFilter = status?.trim() || '';
            const searchTerm = search?.trim() || '';

            if (pageNum < 1) {
                throw new BadRequestException('Page number must be greater than 0');
            }
            if (limitNum < 1 || limitNum > 100) {
                throw new BadRequestException('Limit must be between 1 and 100');
            }

            // ✅ Pass filters to service
            const result = await this.walletService.getAllTransactions(
                pageNum,
                limitNum,
                statusFilter,
                searchTerm
            );

            return {
                success: true,
                message: 'Wallet transactions retrieved successfully',
                data: {
                    transactions: result.transactions,
                    pagination: result.pagination
                }
            };
        } catch (error) {
            throw new HttpException(
                {
                    success: false,
                    message: `Failed to retrieve wallet transactions: ${error.message}`,
                    data: null
                },
                error instanceof BadRequestException ? HttpStatus.BAD_REQUEST : HttpStatus.INTERNAL_SERVER_ERROR
            );
        }
    }


}