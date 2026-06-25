import { Injectable, NotFoundException, BadRequestException, ForbiddenException, UnauthorizedException, Logger, Inject, forwardRef } from '@nestjs/common';
import { ethers } from 'ethers';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import { User, UserDocument, UserRole } from '../../schemas/User.schema';
import { Market, MarketDocument, MarketState } from '../../schemas/Market.schema';
import { EncryptionService } from './encryption.service';
import { WalletBinding, WalletCreationResult, UserWalletRole, WalletInvitationData } from '../../utils/WalletTypes';
import { ParticipantRegistryContractService } from '../blockchain/contracts/participant-registry/participant-registry.contract.service';
import { FlexibilityTokenContractService } from '../blockchain/contracts/flexibility-token/flexibility-token.contract.service';
import { TreasuryContractService } from '../blockchain/contracts/treasury/treasury.contract.service';
import { BlockchainProviderService } from '../blockchain/core/blockchain-provider.service';
import { ParticipantType } from '../blockchain/types/blockchain.types';
import { TransactionCache, TransactionCacheDocument, TransactionStatus } from 'src/schemas/TransactionCache.schema';
import { SessionService } from '../session/session.service';
import { UserStatus } from '../../enums/user-status.enum';

@Injectable()
export class WalletService {
    private readonly logger = new Logger(WalletService.name);
    private provider: ethers.JsonRpcProvider;
    private adminWallet: ethers.Wallet;

    constructor(
        @InjectModel(User.name) private userModel: Model<UserDocument>,
        @InjectModel(Market.name) private marketModel: Model<MarketDocument>,
        @InjectModel(TransactionCache.name) private transactionCacheModel: Model<TransactionCacheDocument>,
        private readonly encryptionService: EncryptionService,
        private readonly configService: ConfigService,
        private readonly participantRegistryService: ParticipantRegistryContractService,
        private readonly flexibilityTokenContractService: FlexibilityTokenContractService,
        private readonly treasuryContractService: TreasuryContractService,
        private readonly providerService: BlockchainProviderService,
        @Inject(forwardRef(() => SessionService))
        private readonly sessionService: SessionService
    ) {
        const rpcUrl = this.configService.get<string>('RPC_PROVIDER_URL');
        this.provider = new ethers.JsonRpcProvider(rpcUrl);

        const adminPk = this.configService.get<string>('ADMIN_PK');
        if (adminPk) {
            // use queued signer from provider service to avoid nonce collisions
            this.adminWallet = this.providerService.getSigner(adminPk);
        }
    }

    /**
     * Gets wallet address for a user based on their binding type
     * @param userId User ID
     * @param marketId Market ID (required for market binding)
     * @returns Wallet public address or null if not found
     */
    async getWallet(userId: string, marketId?: string): Promise<string | null> {
        const user = await this.userModel.findById(userId);
        if (!user) {
            throw new NotFoundException(`User with id ${userId} not found`);
        }

        if (user.walletBinding === WalletBinding.SELF) {
            return user.publicAddress || null;
        }

        if (user.walletBinding === WalletBinding.MARKET) {
            if (!marketId) {
                throw new BadRequestException('Market ID is required for market binding users');
            }

            const market = await this.marketModel.findById(marketId);
            if (!market) {
                throw new NotFoundException(`Market with id ${marketId} not found`);
            }

            if (!market.publicAddress) {
                throw new NotFoundException('Wallet not found for this market');
            }

            return market.publicAddress;
        }

        return null;
    }

    /**
     * Creates a new wallet for a user - Unified method for both SELF and MARKET types
     * @param userId User ID
     * @param walletBinding Type of wallet binding (SELF or MARKET)
     * @param marketId Market ID (required for MARKET binding)
     * @returns Wallet creation result with PIN and encrypted data
     */
    async createWallet(userId: string, walletBinding: WalletBinding, marketId?: string): Promise<WalletCreationResult> {
        const user = await this.userModel.findById(userId);
        if (!user) {
            throw new NotFoundException(`User with id ${userId} not found`);
        }

        // Validate input parameters
        if (walletBinding === WalletBinding.MARKET && !marketId) {
            throw new BadRequestException('Market ID is required for MARKET wallet binding');
        }

        // Check if user already has a wallet
        if (user.walletBinding && user.publicAddress) {
            throw new BadRequestException('User already has a wallet');
        }

        if (walletBinding === WalletBinding.MARKET) {
            return this.createMarketWallet(userId, marketId!);
        } else {
            return this.createSelfWallet(userId);
        }
    }

    /**
     * Creates a SELF wallet for a user (prosumer)
     * @param userId User ID
     * @returns Wallet creation result
     */
    private async createSelfWallet(userId: string): Promise<WalletCreationResult> {
        const user = await this.userModel.findById(userId);

        if (!user) {
            throw new NotFoundException(`User with id ${userId} not found`);
        }

        if (user.walletBinding && user.walletBinding !== WalletBinding.SELF) {
            throw new BadRequestException('User already has a different wallet binding type');
        }

        if (user.publicAddress) {
            throw new BadRequestException('User already has a wallet');
        }

        // Create encrypted wallet
        const walletData = this.encryptionService.createEncryptedWallet();

        // Generate Ethereum address from public key
        const publicAddress = this.generateAddressFromPublicKey(walletData.publicKey);

        // Update user with SELF wallet data and set status to ACTIVE
        // Note: findByIdAndUpdate doesn't trigger pre-save hooks, so we set all fields manually
        await this.userModel.findByIdAndUpdate(userId, {
            walletBinding: WalletBinding.SELF,
            privateKeyEncrypted: walletData.privateKeyEncrypted,
            publicAddress: publicAddress,
            personalPinHash: this.encryptionService.hashPin(walletData.pin),
            commonSecretEncrypted: walletData.commonSecretEncrypted,
            status: UserStatus.ACTIVE,
            // Manually sync all boolean flags for ACTIVE status (pre-save hook doesn't run with findByIdAndUpdate)
            temporaryPassword: false,
            firstLoginCompleted: true,
            profileCompleted: true,
            walletCreated: true,
            isVerified: true
        });

        this.logger.log(`✅ User ${user.email} status updated to ACTIVE after SELF wallet creation`);

        // Fund wallet for development
        await this.fundWalletForDevelopment(publicAddress);

        // 🆕 BLOCKCHAIN REGISTRATION for FRP/FSP users
        // Register, Qualify, and Mint FLEX tokens
        if (user.role === UserRole.FRP || user.role === UserRole.FSP) {
            this.logger.log(`🔗 Starting blockchain registration for ${user.role} user: ${user.email} (${publicAddress})`);

            try {
                // Determine ParticipantType based on user role
                // enum ParticipantType { NONE=0, MARKETPLACE_ADMIN=1, FMO_LMO=2, FRP=3, FSP=4 }
                const participantType = user.role === UserRole.FRP ? ParticipantType.FRP : ParticipantType.FSP;
                const participantTypeNumber = participantType === ParticipantType.FRP ? 3 : 4;

                // STEP 1: Register participant in ParticipantRegistry
                this.logger.log(`📝 Registering ${user.role} in ParticipantRegistry...`);
                const registerTx = await this.participantRegistryService.registerParticipant(
                    publicAddress,
                    participantTypeNumber,
                    `ipfs://user-${user.keycloakId}-${Date.now()}`,
                    user.assignedMarket ? 'assigned-market' : 'default'
                );
                await registerTx.wait();
                this.logger.log(`✅ User registered in ParticipantRegistry. TX: ${registerTx.hash}`);

                // STEP 2: Qualify participant
                this.logger.log(`✅ Qualifying ${user.role} participant...`);
                const qualifyTx = await this.participantRegistryService.qualifyParticipant(publicAddress);
                await qualifyTx.wait();
                this.logger.log(`✅ User qualified in ParticipantRegistry. TX: ${qualifyTx.hash}`);

                // STEP 3: Mint initial FLEX tokens (50,000 FLEX)
                const initialTokenAmount = FlexibilityTokenContractService.toWei('50000');
                this.logger.log(`💰 Minting 50,000 FLEX tokens to ${publicAddress}...`);
                const mintTx = await this.flexibilityTokenContractService.mint(publicAddress, initialTokenAmount);
                await mintTx.wait();
                this.logger.log(`✅ FLEX tokens minted successfully. TX: ${mintTx.hash}`);

                // STEP 4: Grant FRP_ROLE on Treasury for FRP users
                // This allows FRP to deposit payments for settlements
                if (user.role === UserRole.FRP) {
                    this.logger.log(`🔑 Granting FRP_ROLE on Treasury to FRP wallet ${publicAddress}...`);
                    const grantTx = await this.treasuryContractService.grantFRPRole(publicAddress);
                    await grantTx.wait();
                    this.logger.log(`✅ FRP_ROLE granted on Treasury. TX: ${grantTx.hash}`);
                }

                this.logger.log(`🎉 Blockchain registration completed successfully for ${user.email}`);
            } catch (blockchainError) {
                this.logger.error(`❌ Blockchain registration failed for ${user.email}:`, blockchainError);

                // Provide detailed error information
                const errorMessage = blockchainError.message || 'Unknown blockchain error';
                const errorDetails = {
                    step: blockchainError.message?.includes('register') ? 'Registration' :
                        blockchainError.message?.includes('qualify') ? 'Qualification' :
                            blockchainError.message?.includes('mint') ? 'Token Minting' : 'Unknown',
                    publicAddress,
                    userRole: user.role,
                    error: errorMessage
                };

                this.logger.error(`Error details:`, errorDetails);

                // Don't throw - wallet is created, but user needs manual blockchain registration
                this.logger.warn(`⚠️  Wallet created successfully, but blockchain registration failed. Manual intervention may be required.`);
            }
        }

        return {
            pin: walletData.pin,
            commonSecretEncrypted: walletData.commonSecretEncrypted,
            privateKeyEncrypted: walletData.privateKeyEncrypted,
            publicAddress: publicAddress
        };
    }

    /**
     * Creates a MARKET wallet for a user (market owner, admin, or operator)
     * @param userId User ID
     * @param marketId Market ID
     * @returns Wallet creation result
     */
    private async createMarketWallet(userId: string, marketId: string): Promise<WalletCreationResult> {
        const user = await this.userModel.findById(userId);
        const market = await this.marketModel.findById(marketId);

        if (!user) {
            throw new NotFoundException(`User with id ${userId} not found`);
        }

        if (!market) {
            throw new NotFoundException(`Market with id ${marketId} not found`);
        }

        // Verify user is market owner
        if (market.marketOwner.toString() !== userId) {
            throw new ForbiddenException('Only market owner can create market wallet');
        }

        // Check if market is accepted before allowing wallet creation
        if (market.state === MarketState.CREATED_OFFLINE_PENDING_ACCEPTATION) {
            throw new BadRequestException('Market must be accepted before creating a wallet. Please activate the market first.');
        }

        if (market.publicAddress) {
            throw new BadRequestException('Market already has a wallet');
        }

        // Create encrypted wallet
        const walletData = this.encryptionService.createEncryptedWallet();

        // Generate Ethereum address from public key
        const publicAddress = this.generateAddressFromPublicKey(walletData.publicKey);

        // Update market with wallet data (private key and public address stored in Market)
        // Also update state to WALLET_CREATED_PENDING_ACTIVATION
        await this.marketModel.findByIdAndUpdate(marketId, {
            privateKeyEncrypted: walletData.privateKeyEncrypted,
            publicAddress: publicAddress,
            state: MarketState.WALLET_CREATED_PENDING_ACTIVATION
        });

        // Update user with MARKET wallet binding and personal data (PIN and secret stored in User)
        // Also set status to ACTIVE after successful wallet creation
        // Note: findByIdAndUpdate doesn't trigger pre-save hooks, so we set all fields manually
        await this.userModel.findByIdAndUpdate(userId, {
            walletBinding: WalletBinding.MARKET,
            personalPinHash: this.encryptionService.hashPin(walletData.pin),
            commonSecretEncrypted: walletData.commonSecretEncrypted,
            assignedMarket: marketId,
            status: UserStatus.ACTIVE,
            // Manually sync all boolean flags for ACTIVE status (pre-save hook doesn't run with findByIdAndUpdate)
            temporaryPassword: false,
            firstLoginCompleted: true,
            profileCompleted: true,
            walletCreated: true,
            isVerified: true
        });

        // ✅ FIX: Update market.users array for bidirectional relationship
        await this.marketModel.findByIdAndUpdate(marketId, {
            $addToSet: { users: userId }  // $addToSet prevents duplicates
        });
        this.logger.log(`✅ Market owner ${user.email} status updated to ACTIVE after MARKET wallet creation`);

        // Fund wallet for development
        await this.fundWalletForDevelopment(publicAddress);

        // NOTE: Registration in ParticipantRegistry is now handled in the activation flow
        // (in market-factory.controller.ts -> activateMarketWithPin)
        // This ensures registration happens BEFORE creating the market, which is required
        // for the MarketFactory smart contract to validate permissions

        // Note: FRP_ROLE on Treasury is granted when FRP creates their own wallet
        // (in createSelfWallet), not here on the market wallet

        return {
            pin: walletData.pin,
            commonSecretEncrypted: walletData.commonSecretEncrypted,
            privateKeyEncrypted: walletData.privateKeyEncrypted,
            publicAddress: publicAddress
        };
    }

    /**
     * Invites a user to access a market wallet (for admins/operators)
     * @param ownerId Market owner ID
     * @param marketId Market ID
     * @param invitedUserId User ID to invite
     * @returns Invitation data with random PIN
     */
    async inviteUserToMarketWallet(
        ownerId: string,
        marketId: string,
        invitedUserId: string,
        ownerPin: string  // ✅ Recibir PIN como parámetro
    ): Promise<WalletInvitationData> {
        // Validar que el owner existe y tiene wallet de mercado
        const owner = await this.userModel.findById(ownerId);
        if (!owner) {
            throw new BadRequestException('Owner not found');
        }

        if (owner.walletBinding !== WalletBinding.MARKET) {
            throw new BadRequestException('Owner does not have a market wallet');
        }

        // Validar que el mercado existe y pertenece al owner
        const market = await this.marketModel.findById(marketId);
        if (!market) {
            throw new BadRequestException('Market not found');
        }

        if (market.marketOwner.toString() !== ownerId) {
            throw new ForbiddenException('You can only invite users to your own market');
        }

        // Validar que el usuario invitado existe
        const invitedUser = await this.userModel.findById(invitedUserId);
        if (!invitedUser) {
            throw new BadRequestException('Invited user not found');
        }

        if (invitedUser.walletBinding) {
            throw new BadRequestException('User already has a wallet binding');
        }

        // ✅ NUEVA LÓGICA: Usar PIN validado para desencriptar
        const commonSecret = this.encryptionService.decryptWithPin(owner.commonSecretEncrypted, ownerPin);

        // Generate new PIN for invited user
        const randomPin = this.encryptionService.generateRandomPin();

        // Encrypt common secret with invited user's new PIN
        const newCommonSecretEncrypted = this.encryptionService.encryptWithPin(commonSecret, randomPin);

        // Update invited user with market wallet binding
        await this.userModel.findByIdAndUpdate(invitedUserId, {
            walletBinding: WalletBinding.MARKET,
            personalPinHash: this.encryptionService.hashPin(randomPin),  // ✅ Guardar hash del PIN
            commonSecretEncrypted: newCommonSecretEncrypted,
            assignedMarket: marketId
        });

        // ✅ FIX: Update market.users array for bidirectional relationship
        await this.marketModel.findByIdAndUpdate(marketId, {
            $addToSet: { users: invitedUserId }  // $addToSet prevents duplicates
        });

        return {
            randomPin: randomPin,
            commonSecretEncrypted: newCommonSecretEncrypted
        };
    }
    /**
     * Gets decrypted private key for transactions
     * @param userId User ID (keycloakId)
     * @param pin User's PIN
     * @param marketId Market ID (optional, for market binding)
     * @returns Decrypted private key
     */
    async getDecryptedPrivateKey(userId: string, pin: string, marketId?: string): Promise<string> {
        const user = await this.userModel.findById(userId);
        if (!user) {
            throw new NotFoundException(`User with ID ${userId} not found`);
        }

        this.logger.log(`🔑 Attempting to decrypt private key for user ${user.email} (${userId})`);
        this.logger.log(`   Wallet Binding: ${user.walletBinding}`);
        this.logger.log(`   Market ID provided: ${marketId || 'none'}`);

        if (user.walletBinding === WalletBinding.SELF) {
            if (!user.privateKeyEncrypted || !user.commonSecretEncrypted) {
                this.logger.error(`❌ Missing wallet data for SELF wallet user ${user.email}`);
                this.logger.error(`   Has privateKeyEncrypted: ${!!user.privateKeyEncrypted}`);
                this.logger.error(`   Has commonSecretEncrypted: ${!!user.commonSecretEncrypted}`);
                throw new NotFoundException('User wallet data not found');
            }

            this.logger.log(`   ✅ Wallet data found for SELF binding`);
            this.logger.log(`   Public Address: ${user.publicAddress}`);
            this.logger.log(`   Attempting decryption with provided PIN...`);

            try {
                const privateKey = this.encryptionService.decryptPrivateKeyWithPin(
                    user.privateKeyEncrypted,
                    user.commonSecretEncrypted,
                    pin
                );
                this.logger.log(`   ✅ Private key decrypted successfully`);
                return privateKey;
            } catch (error) {
                this.logger.error(`   ❌ Decryption failed: ${error.message}`);
                throw error;
            }
        }

        if (user.walletBinding === WalletBinding.MARKET) {
            if (!marketId) {
                throw new BadRequestException('Market ID is required for market binding users');
            }

            const market = await this.marketModel.findById(marketId);
            if (!market) {
                throw new NotFoundException(`Market with id ${marketId} not found`);
            }

            if (!market.privateKeyEncrypted || !user.commonSecretEncrypted) {
                throw new NotFoundException('Market wallet data not found');
            }

            this.logger.log(`   ✅ Wallet data found for MARKET binding`);
            this.logger.log(`   Market ID: ${marketId}`);
            this.logger.log(`   Attempting decryption with provided PIN...`);

            try {
                const privateKey = this.encryptionService.decryptPrivateKeyWithPin(
                    market.privateKeyEncrypted,
                    user.commonSecretEncrypted,
                    pin
                );
                this.logger.log(`   ✅ Private key decrypted successfully`);
                return privateKey;
            } catch (error) {
                this.logger.error(`   ❌ Decryption failed: ${error.message}`);
                throw error;
            }
        }

        throw new BadRequestException('Invalid wallet binding type');
    }

    /**
     * Creates a connected ethers wallet instance for transactions
     * @param userId User ID
     * @param pin User's PIN
     * @param marketId Market ID (optional, for market binding)
     * @returns Connected ethers wallet
     */
    async getConnectedWallet(userId: string, pin: string, marketId?: string): Promise<ethers.Wallet> {
        // Check if user is currently locked due to PIN failures for this specific market
        await this.checkPinLockStatus(userId, marketId);

        try {
            const privateKey = await this.getDecryptedPrivateKey(userId, pin, marketId);
            // Reset failed attempts on successful PIN verification for this market
            await this.resetPinFailedAttempts(userId, marketId);
            return this.providerService.getSigner(privateKey);
        } catch (error) {
            // Handle PIN verification failure - this will throw a more specific error
            await this.handlePinFailure(userId, marketId);
            // This line will never be reached due to the throw in handlePinFailure
            throw new Error('Unreachable code');
        }
    }

    /**
     * Gets wallet balance
     * @param userId User ID
     * @param marketId Market ID (optional, for market binding)
     * @returns Balance in ETH
     */
    async getWalletBalance(userId: string, marketId?: string): Promise<string> {
        const address = await this.getWallet(userId, marketId);
        if (!address) {
            throw new NotFoundException('Wallet not found');
        }

        const balance = await this.provider.getBalance(address);
        return ethers.formatEther(balance);
    }

    /**
 * Gets paginated wallet transaction history from cache
 * @param userId User ID
 * @param marketId Market ID (optional, for market binding)
 * @param page Page number (starting from 1)
 * @param limit Number of transactions per page
 * @returns Paginated transactions with metadata
 */
    async getWalletTransactions(
        userId: string,
        marketId?: string,
        page: number = 1,
        limit: number = 20,
        status: string = '',
        search: string = ''
    ): Promise<{
        transactions: any[];
        pagination: {
            currentPage: number;
            totalPages: number;
            totalTransactions: number;
            hasNextPage: boolean;
            hasPreviousPage: boolean;
        };
    }> {
        const walletAddress = await this.getWallet(userId, marketId);
        if (!walletAddress) {
            throw new NotFoundException('Wallet not found');
        }

        try {
            // Calculate skip value for pagination
            const skip = (page - 1) * limit;

            // Build query to find transactions where wallet is sender or receiver
            const query: any = {
                $or: [
                    { from: walletAddress.toLowerCase() },
                    { to: walletAddress.toLowerCase() }
                ]
            };

            if (status === 'success') {
                query.status = TransactionStatus.ACCEPTED;
            } else if (status === 'reverted') {
                query.status = TransactionStatus.REVERTED;
            }

            if (search) {
                const searchLower = search.toLowerCase();
                query.$and = [
                    {
                        $or: [
                            { transactionHash: { $regex: searchLower, $options: 'i' } },
                            { transactionLog: { $regex: searchLower, $options: 'i' } },
                            { from: { $regex: searchLower, $options: 'i' } },
                            { to: { $regex: searchLower, $options: 'i' } }
                        ]
                    }
                ];
            }


            // Get total count for pagination
            const totalTransactions = await this.transactionCacheModel.countDocuments(query);
            const totalPages = Math.ceil(totalTransactions / limit);

            // Fetch transactions with pagination
            const transactions = await this.transactionCacheModel
                .find(query)
                .sort({ timestamp: -1, txHash: -1 }) // Most recent first
                .skip(skip)
                .limit(limit)
                .lean()
                .exec();

            // Format transactions
            const formattedTransactions = transactions.map(tx => ({
                hash: tx.transactionHash,
                from: tx.from,
                to: tx.to,
                gasUsed: tx.gasUsed,
                gasPrice: tx.gasPrice ? ethers.formatUnits(tx.gasPrice, 'gwei') : null,
                transactionLog: tx.transactionLog,
                timestamp: tx.timestamp,
                date: new Date(tx.timestamp * 1000).toISOString(),
                status: tx.status === TransactionStatus.ACCEPTED ? 'success' : 'reverted',
                direction: tx.from.toLowerCase() === walletAddress.toLowerCase() ? 'outgoing' : 'incoming',
                // Calculate net value for the wallet
                netValue: tx.from.toLowerCase() === walletAddress.toLowerCase()
            }));

            return {
                transactions: formattedTransactions,
                pagination: {
                    currentPage: page,
                    totalPages,
                    totalTransactions,
                    hasNextPage: page < totalPages,
                    hasPreviousPage: page > 1
                }
            };

        } catch (error) {
            this.logger.error(`Failed to get transactions for wallet ${walletAddress}:`, error);
            throw new BadRequestException(`Failed to get wallet transactions: ${error.message}`);
        }
    }

    /**
     * Returns paginated transaction history for all wallets (admin view).
     * @param page Page number starting from 1
     * @param limit Results per page (1–100)
     * @param status Optional status filter: `'success'` or `'reverted'`
     * @param search Optional text search against hash, log, from, or to fields
     */
    async getAllTransactions(
        page: number = 1,
        limit: number = 20,
        status: string = '',
        search: string = ''
    ): Promise<{
        transactions: any[];
        pagination: {
            currentPage: number;
            totalPages: number;
            totalTransactions: number;
            hasNextPage: boolean;
            hasPreviousPage: boolean;
        };
    }> {
        try {
            // Calculate skip value for pagination
            const skip = (page - 1) * limit;

            // Build query to find transactions where wallet is sender or receiver
            const query: any = {};

            if (status === 'success') {
                query.status = TransactionStatus.ACCEPTED;
            } else if (status === 'reverted') {
                query.status = TransactionStatus.REVERTED;
            }


            if (search) {
                const searchLower = search.toLowerCase();
                query.$or = [
                    { transactionHash: { $regex: searchLower, $options: 'i' } },
                    { transactionLog: { $regex: searchLower, $options: 'i' } },
                    { from: { $regex: searchLower, $options: 'i' } },
                    { to: { $regex: searchLower, $options: 'i' } }
                ];
            }

            // Get total count for pagination
            const totalTransactions = await this.transactionCacheModel.countDocuments(query);
            const totalPages = Math.ceil(totalTransactions / limit);

            // Fetch transactions with pagination
            const transactions = await this.transactionCacheModel
                .find(query)
                .sort({ timestamp: -1, txHash: -1 }) // Most recent first
                .skip(skip)
                .limit(limit)
                .lean()
                .exec();

            // Format transactions
            const formattedTransactions = transactions.map(tx => ({
                hash: tx.transactionHash,
                from: tx.from,
                to: tx.to,
                gasUsed: tx.gasUsed,
                gasPrice: tx.gasPrice ? ethers.formatUnits(tx.gasPrice, 'gwei') : null,
                transactionLog: tx.transactionLog,
                timestamp: tx.timestamp,
                date: new Date(tx.timestamp * 1000).toISOString(),
                status: tx.status === TransactionStatus.ACCEPTED ? 'success' : 'reverted',
            }));

            return {
                transactions: formattedTransactions,
                pagination: {
                    currentPage: page,
                    totalPages,
                    totalTransactions,
                    hasNextPage: page < totalPages,
                    hasPreviousPage: page > 1
                }
            };

        } catch (error) {
            this.logger.error(`Failed to get transactions:`, error);
            throw new BadRequestException(`Failed to get wallet transactions: ${error.message}`);
        }
    }

    /**
     * Returns paginated transaction history for a market owner's wallet, including
     * all transactions involving session contract addresses for their market.
     * @param userId User ID (MongoDB ObjectId)
     * @param marketId Market ID for MARKET-bound users
     * @param page Page number starting from 1
     * @param limit Results per page (1–100)
     * @param status Optional status filter: `'success'` or `'reverted'`
     * @param search Optional text search against hash, log, from, or to fields
     */
    async getMarketTransactions(
        userId: string,
        marketId?: string,
        page: number = 1,
        limit: number = 20,
        status: string = '',
        search: string = ''
    ): Promise<{
        transactions: any[];
        pagination: {
            currentPage: number;
            totalPages: number;
            totalTransactions: number;
            hasNextPage: boolean;
            hasPreviousPage: boolean;
        };
    }> {
        const walletAddress = await this.getWallet(userId, marketId);
        if (!walletAddress) {
            throw new NotFoundException('Wallet not found');
        }
        const walletLc = walletAddress.toLowerCase();

        const sessions = await this.sessionService.getSessionsByMarket()
        const sessionAddresses = (sessions ?? [])
            .map(s => s.contractAddress)
            .filter((a): a is string => !!a)
            .map(a => a.toLowerCase());

        const uniqueSessionAddresses = Array.from(new Set(sessionAddresses));

        const orConditions: any[] = [
            { from: walletLc },
            { to: walletLc },
        ];

        if (uniqueSessionAddresses.length > 0) {
            orConditions.push({ to: { $in: uniqueSessionAddresses } });
            orConditions.push({ from: { $in: uniqueSessionAddresses } });
        }

        try {
            // Calculate skip value for pagination
            const skip = (page - 1) * limit;

            // Build query to find transactions where wallet is sender or receiver
            const query: any = { $or: orConditions };

            if (status === 'success') {
                query.status = TransactionStatus.ACCEPTED;
            } else if (status === 'reverted') {
                query.status = TransactionStatus.REVERTED;
            }

            if (search) {
                const searchLower = search.toLowerCase();
                query.$and = [
                    {
                        $or: [
                            { transactionHash: { $regex: searchLower, $options: 'i' } },
                            { transactionLog: { $regex: searchLower, $options: 'i' } },
                            { from: { $regex: searchLower, $options: 'i' } },
                            { to: { $regex: searchLower, $options: 'i' } }
                        ]
                    }
                ];
            }

            // Get total count for pagination
            const totalTransactions = await this.transactionCacheModel.countDocuments(query);
            const totalPages = Math.ceil(totalTransactions / limit);

            // Fetch transactions with pagination
            const transactions = await this.transactionCacheModel
                .find(query)
                .sort({ timestamp: -1, txHash: -1 }) // Most recent first
                .skip(skip)
                .limit(limit)
                .lean()
                .exec();

            // Format transactions
            const formattedTransactions = transactions.map(tx => ({
                hash: tx.transactionHash,
                from: tx.from,
                to: tx.to,
                gasUsed: tx.gasUsed,
                gasPrice: tx.gasPrice ? ethers.formatUnits(tx.gasPrice, 'gwei') : null,
                transactionLog: tx.transactionLog,
                timestamp: tx.timestamp,
                date: new Date(tx.timestamp * 1000).toISOString(),
                status: tx.status === TransactionStatus.ACCEPTED ? 'success' : 'reverted',
                direction: tx.from.toLowerCase() === walletAddress.toLowerCase() ? 'outgoing' : 'incoming',
                // Calculate net value for the wallet
                netValue: tx.from.toLowerCase() === walletAddress.toLowerCase()
            }));

            return {
                transactions: formattedTransactions,
                pagination: {
                    currentPage: page,
                    totalPages,
                    totalTransactions,
                    hasNextPage: page < totalPages,
                    hasPreviousPage: page > 1
                }
            };

        } catch (error) {
            this.logger.error(`Failed to get transactions for wallet ${walletAddress}:`, error);
            throw new BadRequestException(`Failed to get wallet transactions: ${error.message}`);
        }
    }


    /**
     * Verifies user's PIN against hashed PIN
     * @param userId User ID
     * @param pin PIN to verify
     * @returns True if PIN is correct
     */
    async verifyPin(userId: string, pin: string): Promise<boolean> {
        const user = await this.userModel.findById(userId);
        if (!user || !user.personalPinHash) {
            return false;
        }
        return this.encryptionService.verifyPin(pin, user.personalPinHash);  // ✅ Usando hash
    }

    /**
     * Gets network information
     * @returns Network information
     */
    async getNetworkInfo(): Promise<any> {
        try {
            const network = await this.provider.getNetwork();
            const blockNumber = await this.provider.getBlockNumber();

            return {
                name: network.name,
                chainId: network.chainId.toString(),
                blockNumber,
                rpcUrl: this.configService.get<string>('RPC_PROVIDER_URL')
            };
        } catch (error) {
            throw new BadRequestException(`Failed to get network info: ${error.message}`);
        }
    }

    /**
     * Gets flexibility token balance
     * @param userId User ID
     * @param marketId Market ID (optional, for market binding)
     * @returns Token balance
     */
    async getFlexibilityTokenBalance(userId: string, marketId?: string): Promise<string> {
        const tokenAddress = this.configService.get<string>('FLEXIBILITY_TOKEN_ADDRESS');
        if (!tokenAddress) {
            throw new BadRequestException('Flexibility token address not configured');
        }

        const address = await this.getWallet(userId, marketId);
        if (!address) {
            throw new NotFoundException('Wallet not found');
        }

        const erc20Abi = [
            'function balanceOf(address owner) view returns (uint256)',
            'function decimals() view returns (uint8)',
            'function symbol() view returns (string)'
        ];

        try {
            const contract = new ethers.Contract(tokenAddress, erc20Abi, this.provider);
            const balance = await contract.balanceOf(address);
            const decimals = await contract.decimals();

            return ethers.formatUnits(balance, decimals);
        } catch (error) {
            throw new BadRequestException(`Failed to get token balance: ${error.message}`);
        }
    }

    /**
     * Generates Ethereum address from private key
     * @param publicKey The private key (hex format) - currently misnamed but contains the private key
     * @returns Ethereum address
     */
    private generateAddressFromPublicKey(publicKey: string): string {
        try {
            // publicKey parameter actually contains the private key from the encryption service
            const wallet = new ethers.Wallet(publicKey);
            return wallet.address;
        } catch (error) {
            // Fallback to random address if something goes wrong
            return ethers.Wallet.createRandom().address;
        }
    }

    /**
     * Creates a wallet when a new market is created
     * This method should be called during market creation process
     * @param marketId Market ID
     * @param marketOwnerId Market owner user ID
     * @returns Wallet creation result with PIN for the market owner
     */
    async createWalletForNewMarket(marketId: string, marketOwnerId: string): Promise<WalletCreationResult> {
        const user = await this.userModel.findById(marketOwnerId);
        const market = await this.marketModel.findById(marketId);

        if (!user) {
            throw new NotFoundException(`Market owner with id ${marketOwnerId} not found`);
        }

        if (!market) {
            throw new NotFoundException(`Market with id ${marketId} not found`);
        }

        // Verify user is the market owner
        if (market.marketOwner.toString() !== marketOwnerId) {
            throw new ForbiddenException('User must be the market owner');
        }

        // Check if market is accepted before allowing wallet creation
        if (market.state === MarketState.CREATED_OFFLINE_PENDING_ACCEPTATION) {
            throw new BadRequestException('Market must be accepted before creating a wallet. Please activate the market first.');
        }

        // Create the market wallet
        return this.createMarketWallet(marketOwnerId, marketId);
    }

    /**
     * Funds wallet for development purposes
     * @param walletAddress Wallet address to fund
     */
    private async fundWalletForDevelopment(walletAddress: string): Promise<void> {
        if (!this.adminWallet) {
            return;
        }

        try {
            const fundingAmount = ethers.parseEther('1.0');
            const tx = await this.adminWallet.sendTransaction({
                to: walletAddress,
                value: fundingAmount,
                gasLimit: 21000
            });

            await tx.wait();
        } catch (error) {
        }
    }

    /**
     * Check if user is currently locked due to PIN failures for a specific market
     * @param userId User ID (MongoDB ObjectId)
     * @param marketId Market ID (optional for personal wallets)
     * @throws UnauthorizedException if user is locked
     */
    private async checkPinLockStatus(userId: string, marketId?: string): Promise<void> {
        const user = await this.userModel.findById(userId);
        if (!user) {
            throw new NotFoundException(`User with ID ${userId} not found`);
        }

        // Find market-specific PIN security
        const marketSecurity = user.marketPinSecurity?.find(
            security => security.marketId.toString() === marketId
        );

        if (marketSecurity?.pinLockedUntil && marketSecurity.pinLockedUntil > new Date()) {
            const lockTimeRemaining = Math.ceil((marketSecurity.pinLockedUntil.getTime() - Date.now()) / 60000); // minutes
            const lockTimeRemainingSeconds = Math.ceil((marketSecurity.pinLockedUntil.getTime() - Date.now()) / 1000); // seconds

            if (lockTimeRemaining > 1) {
                throw new UnauthorizedException(
                    `Wallet locked for security. Try again in ${lockTimeRemaining} minutes.`
                );
            } else {
                throw new UnauthorizedException(
                    `Wallet locked for security. Try again in ${lockTimeRemainingSeconds} seconds.`
                );
            }
        }
    }

    /**
     * Handle PIN verification failure and return detailed error information
     * @param userId User ID (MongoDB ObjectId)
     * @param marketId Market ID (optional for personal wallets)
     * @throws BadRequestException with detailed error message
     */
    private async handlePinFailure(userId: string, marketId?: string): Promise<void> {
        const user = await this.userModel.findById(userId);
        if (!user) return;

        const now = new Date();

        // Initialize marketPinSecurity array if it doesn't exist
        if (!user.marketPinSecurity) {
            user.marketPinSecurity = [];
        }

        // Find or create market-specific security entry
        let marketSecurity = user.marketPinSecurity.find(
            security => security.marketId.toString() === marketId
        );

        if (!marketSecurity && marketId) {
            // Create new market security entry
            marketSecurity = {
                marketId: marketId as any,
                pinFailedAttempts: 0,
                pinLockedUntil: undefined,
                lastPinFailureAt: undefined
            };
            user.marketPinSecurity.push(marketSecurity);
        }

        if (!marketSecurity) {
            // For personal wallets or when no marketId is provided, skip for now
            // Could implement a global fallback here if needed
            return;
        }

        const failedAttempts = (marketSecurity.pinFailedAttempts || 0) + 1;

        // Reset counter if last failure was more than 1 hour ago
        const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
        if (marketSecurity.lastPinFailureAt && marketSecurity.lastPinFailureAt < oneHourAgo) {
            marketSecurity.pinFailedAttempts = 1;
        } else {
            marketSecurity.pinFailedAttempts = failedAttempts;
        }

        marketSecurity.lastPinFailureAt = now;

        // Lock wallet if 3 or more failed attempts
        if (marketSecurity.pinFailedAttempts >= 3) {
            // Lock for 30 minutes
            marketSecurity.pinLockedUntil = new Date(now.getTime() + 30 * 60 * 1000);
            await user.save();

            const lockTimeRemaining = Math.ceil((marketSecurity.pinLockedUntil.getTime() - Date.now()) / 60000);
            throw new BadRequestException(
                `Incorrect PIN. Wallet locked for security. Try again in ${lockTimeRemaining} minutes.`
            );
        } else {
            await user.save();
            const remainingAttempts = 3 - marketSecurity.pinFailedAttempts;
            throw new BadRequestException(
                `Incorrect PIN. ${remainingAttempts} attempts remaining before wallet lockout.`
            );
        }
    }

    /**
     * Reset PIN failed attempts counter for a specific market
     * @param userId User ID (MongoDB ObjectId)
     * @param marketId Market ID (optional for personal wallets)
     */
    private async resetPinFailedAttempts(userId: string, marketId?: string): Promise<void> {
        if (!marketId) {
            // For personal wallets, could implement global reset if needed
            return;
        }

        const user = await this.userModel.findById(userId);
        if (!user || !user.marketPinSecurity) return;

        // Find market-specific security entry and reset it
        const marketSecurityIndex = user.marketPinSecurity.findIndex(
            security => security.marketId.toString() === marketId
        );

        if (marketSecurityIndex !== -1) {
            user.marketPinSecurity[marketSecurityIndex].pinFailedAttempts = 0;
            user.marketPinSecurity[marketSecurityIndex].pinLockedUntil = undefined;
            user.marketPinSecurity[marketSecurityIndex].lastPinFailureAt = undefined;
            await user.save();
        }
    }
}