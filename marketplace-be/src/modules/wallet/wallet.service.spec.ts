import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { WalletService } from './wallet.service';
import { EncryptionService } from './encryption.service';
import { User } from '../../schemas/User.schema';
import { Market } from '../../schemas/Market.schema';
import { WalletBinding } from '../../utils/WalletTypes';
import { Model } from 'mongoose';

describe('WalletService', () => {
  let service: WalletService;
  let userModel: Model<User>;
  let marketModel: Model<Market>;
  let encryptionService: EncryptionService;
  let configService: ConfigService;

  const mockUser = {
    _id: 'user123',
    username: 'testuser',
    email: 'test@example.com',
    walletBinding: null,
    publicAddress: null,
    privateKeyEncrypted: null,
    personalPin: null,
    commonSecretEncrypted: null,
  };

  const mockMarket = {
    _id: 'market123',
    name: 'Test Market',
    marketOwner: 'user123',
    publicAddress: null,
    privateKeyEncrypted: null,
  };

  const mockEncryptedWallet = {
    pin: '123456',
    commonSecretEncrypted: 'encrypted_common_secret',
    privateKeyEncrypted: 'encrypted_private_key',
    publicKey: 'public_key_hex',
  };

  const mockUserModel = {
    findById: jest.fn(),
    findByIdAndUpdate: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };

  const mockMarketModel = {
    findById: jest.fn(),
    findByIdAndUpdate: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };

  const mockEncryptionService = {
    createEncryptedWallet: jest.fn(),
    encryptWithPin: jest.fn(),
    decryptWithPin: jest.fn(),
    decryptPrivateKeyWithPin: jest.fn(),
    generateRandomPin: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WalletService,
        { provide: getModelToken(User.name), useValue: mockUserModel },
        { provide: getModelToken(Market.name), useValue: mockMarketModel },
        { provide: EncryptionService, useValue: mockEncryptionService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<WalletService>(WalletService);
    userModel = module.get<Model<User>>(getModelToken(User.name));
    marketModel = module.get<Model<Market>>(getModelToken(Market.name));
    encryptionService = module.get<EncryptionService>(EncryptionService);
    configService = module.get<ConfigService>(ConfigService);

    // Setup default mock returns
    mockConfigService.get.mockImplementation((key: string) => {
      switch (key) {
        case 'RPC_PROVIDER_URL':
          return 'http://localhost:8545';
        case 'ADMIN_PK':
          return null;
        case 'FLEXIBILITY_TOKEN_ADDRESS':
          return '0x1234567890123456789012345678901234567890';
        default:
          return undefined;
      }
    });

    mockEncryptionService.createEncryptedWallet.mockReturnValue(mockEncryptedWallet);
    mockEncryptionService.generateRandomPin.mockReturnValue('789012');
    mockEncryptionService.encryptWithPin.mockReturnValue('encrypted_with_pin');
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getWallet', () => {
    it('should return null for user with self binding and no wallet', async () => {
      const user = { ...mockUser, walletBinding: WalletBinding.SELF };
      mockUserModel.findById.mockResolvedValue(user);

      const result = await service.getWallet('user123');

      expect(result).toBeNull();
      expect(mockUserModel.findById).toHaveBeenCalledWith('user123');
    });

    it('should return wallet address for user with self binding and wallet', async () => {
      const user = { 
        ...mockUser, 
        walletBinding: WalletBinding.SELF,
        publicAddress: '0xabcdef123456'
      };
      mockUserModel.findById.mockResolvedValue(user);

      const result = await service.getWallet('user123');

      expect(result).toBe('0xabcdef123456');
    });

    it('should return market wallet address for market binding user', async () => {
      const user = { ...mockUser, walletBinding: WalletBinding.MARKET };
      const market = { ...mockMarket, publicAddress: '0xmarket123456' };
      
      mockUserModel.findById.mockResolvedValue(user);
      mockMarketModel.findById.mockResolvedValue(market);

      const result = await service.getWallet('user123', 'market123');

      expect(result).toBe('0xmarket123456');
    });

    it('should throw error if market binding user has no market ID', async () => {
      const user = { ...mockUser, walletBinding: WalletBinding.MARKET };
      mockUserModel.findById.mockResolvedValue(user);

      await expect(service.getWallet('user123')).rejects.toThrow(BadRequestException);
    });

    it('should throw error if user not found', async () => {
      mockUserModel.findById.mockResolvedValue(null);

      await expect(service.getWallet('user123')).rejects.toThrow(NotFoundException);
    });
  });

  describe('createWallet', () => {
    it('should create self wallet successfully', async () => {
      const user = { ...mockUser };
      mockUserModel.findById.mockResolvedValue(user);
      mockUserModel.findByIdAndUpdate.mockResolvedValue(user);

      const result = await service.createWallet('user123', WalletBinding.SELF);

      expect(result).toEqual({
        pin: mockEncryptedWallet.pin,
        commonSecretEncrypted: mockEncryptedWallet.commonSecretEncrypted,
        privateKeyEncrypted: mockEncryptedWallet.privateKeyEncrypted,
        publicAddress: expect.any(String),
      });

      expect(mockEncryptionService.createEncryptedWallet).toHaveBeenCalled();
      expect(mockUserModel.findByIdAndUpdate).toHaveBeenCalledWith('user123', {
        walletBinding: WalletBinding.SELF,
        privateKeyEncrypted: mockEncryptedWallet.privateKeyEncrypted,
        publicAddress: expect.any(String),
        personalPin: mockEncryptedWallet.pin,
        commonSecretEncrypted: mockEncryptedWallet.commonSecretEncrypted,
      });
    });

    it('should create market wallet successfully', async () => {
      const user = { ...mockUser };
      const market = { ...mockMarket };
      
      mockUserModel.findById.mockResolvedValue(user);
      mockMarketModel.findById.mockResolvedValue(market);
      mockMarketModel.findByIdAndUpdate.mockResolvedValue(market);
      mockUserModel.findByIdAndUpdate.mockResolvedValue(user);

      const result = await service.createWallet('user123', WalletBinding.MARKET, 'market123');

      expect(result).toEqual({
        pin: mockEncryptedWallet.pin,
        commonSecretEncrypted: mockEncryptedWallet.commonSecretEncrypted,
        privateKeyEncrypted: mockEncryptedWallet.privateKeyEncrypted,
        publicAddress: expect.any(String),
      });

      expect(mockMarketModel.findByIdAndUpdate).toHaveBeenCalledWith('market123', {
        privateKeyEncrypted: mockEncryptedWallet.privateKeyEncrypted,
        publicAddress: expect.any(String),
      });

      expect(mockUserModel.findByIdAndUpdate).toHaveBeenCalledWith('user123', {
        walletBinding: WalletBinding.MARKET,
        personalPin: mockEncryptedWallet.pin,
        commonSecretEncrypted: mockEncryptedWallet.commonSecretEncrypted,
      });
    });

    it('should throw error if user is not market owner', async () => {
      const user = { ...mockUser, _id: 'user123' };
      const market = { ...mockMarket, marketOwner: 'other_user' };
      
      mockUserModel.findById.mockResolvedValue(user);
      mockMarketModel.findById.mockResolvedValue(market);

      await expect(
        service.createWallet('user123', WalletBinding.MARKET, 'market123')
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw error if user already has wallet', async () => {
      const user = { ...mockUser, publicAddress: '0xexisting' };
      mockUserModel.findById.mockResolvedValue(user);

      await expect(
        service.createWallet('user123', WalletBinding.SELF)
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('inviteUserToMarketWallet', () => {
    it('should invite user successfully', async () => {
      const owner = { 
        ...mockUser, 
        _id: 'owner123',
        commonSecretEncrypted: 'owner_secret',
        personalPin: '123456'
      };
      const market = { ...mockMarket, marketOwner: 'owner123' };
      const invitedUser = { ...mockUser, _id: 'invited123', walletBinding: null };

      mockUserModel.findById
        .mockResolvedValueOnce(owner)
        .mockResolvedValueOnce(invitedUser);
      mockMarketModel.findById.mockResolvedValue(market);
      mockUserModel.findByIdAndUpdate.mockResolvedValue(invitedUser);

      mockEncryptionService.decryptWithPin.mockReturnValue('common_secret');
      mockEncryptionService.generateRandomPin.mockReturnValue('789012');
      mockEncryptionService.encryptWithPin.mockReturnValue('new_encrypted_secret');

      const result = await service.inviteUserToMarketWallet('owner123', 'market123', 'invited123');

      expect(result).toEqual({
        randomPin: '789012',
        commonSecretEncrypted: 'new_encrypted_secret',
      });

      expect(mockUserModel.findByIdAndUpdate).toHaveBeenCalledWith('invited123', {
        walletBinding: WalletBinding.MARKET,
        personalPin: '789012',
        commonSecretEncrypted: 'new_encrypted_secret',
      });
    });

    it('should throw error if owner is not market owner', async () => {
      const owner = { ...mockUser, _id: 'owner123' };
      const market = { ...mockMarket, marketOwner: 'other_owner' };
      const invitedUser = { ...mockUser, _id: 'invited123' };

      mockUserModel.findById
        .mockResolvedValueOnce(owner)
        .mockResolvedValueOnce(invitedUser);
      mockMarketModel.findById.mockResolvedValue(market);

      await expect(
        service.inviteUserToMarketWallet('owner123', 'market123', 'invited123')
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw error if invited user already has wallet binding', async () => {
      const owner = { 
        ...mockUser, 
        _id: 'owner123',
        commonSecretEncrypted: 'owner_secret'
      };
      const market = { ...mockMarket, marketOwner: 'owner123' };
      const invitedUser = { 
        ...mockUser, 
        _id: 'invited123', 
        walletBinding: WalletBinding.SELF 
      };

      mockUserModel.findById
        .mockResolvedValueOnce(owner)
        .mockResolvedValueOnce(invitedUser);
      mockMarketModel.findById.mockResolvedValue(market);

      await expect(
        service.inviteUserToMarketWallet('owner123', 'market123', 'invited123')
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('getDecryptedPrivateKey', () => {
    it('should decrypt private key for self wallet', async () => {
      const user = {
        ...mockUser,
        walletBinding: WalletBinding.SELF,
        privateKeyEncrypted: 'encrypted_key',
        commonSecretEncrypted: 'encrypted_secret',
      };

      mockUserModel.findById.mockResolvedValue(user);
      mockEncryptionService.decryptPrivateKeyWithPin.mockReturnValue('decrypted_private_key');

      const result = await service.getDecryptedPrivateKey('user123', '123456');

      expect(result).toBe('decrypted_private_key');
      expect(mockEncryptionService.decryptPrivateKeyWithPin).toHaveBeenCalledWith(
        'encrypted_key',
        'encrypted_secret',
        '123456'
      );
    });

    it('should decrypt private key for market wallet', async () => {
      const user = {
        ...mockUser,
        walletBinding: WalletBinding.MARKET,
        commonSecretEncrypted: 'encrypted_secret',
      };
      const market = {
        ...mockMarket,
        privateKeyEncrypted: 'market_encrypted_key',
      };

      mockUserModel.findById.mockResolvedValue(user);
      mockMarketModel.findById.mockResolvedValue(market);
      mockEncryptionService.decryptPrivateKeyWithPin.mockReturnValue('decrypted_private_key');

      const result = await service.getDecryptedPrivateKey('user123', '123456', 'market123');

      expect(result).toBe('decrypted_private_key');
      expect(mockEncryptionService.decryptPrivateKeyWithPin).toHaveBeenCalledWith(
        'market_encrypted_key',
        'encrypted_secret',
        '123456'
      );
    });

    it('should throw error if market wallet user has no market ID', async () => {
      const user = {
        ...mockUser,
        walletBinding: WalletBinding.MARKET,
      };

      mockUserModel.findById.mockResolvedValue(user);

      await expect(
        service.getDecryptedPrivateKey('user123', '123456')
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('verifyPin', () => {
    it('should verify PIN correctly', async () => {
      const user = { ...mockUser, personalPin: '123456' };
      mockUserModel.findById.mockResolvedValue(user);

      const result = await service.verifyPin('user123', '123456');
      expect(result).toBe(true);

      const resultWrong = await service.verifyPin('user123', '654321');
      expect(resultWrong).toBe(false);
    });

    it('should return false for user without PIN', async () => {
      const user = { ...mockUser, personalPin: null };
      mockUserModel.findById.mockResolvedValue(user);

      const result = await service.verifyPin('user123', '123456');
      expect(result).toBe(false);
    });

    it('should return false for non-existent user', async () => {
      mockUserModel.findById.mockResolvedValue(null);

      const result = await service.verifyPin('user123', '123456');
      expect(result).toBe(false);
    });
  });

  describe('getWalletBalance', () => {
    it('should get wallet balance successfully', async () => {
      const user = { 
        ...mockUser, 
        walletBinding: WalletBinding.SELF,
        publicAddress: '0xwallet123'
      };
      
      mockUserModel.findById.mockResolvedValue(user);

      // Mock ethers provider
      const mockProvider = {
        getBalance: jest.fn().mockResolvedValue(BigInt('1000000000000000000')), // 1 ETH in wei
      };
      
      // Access private provider through service
      (service as any).provider = mockProvider;

      const result = await service.getWalletBalance('user123');

      expect(result).toBe('1.0');
      expect(mockProvider.getBalance).toHaveBeenCalledWith('0xwallet123');
    });

    it('should throw error if wallet not found', async () => {
      const user = { 
        ...mockUser, 
        walletBinding: WalletBinding.SELF,
        publicAddress: null
      };
      
      mockUserModel.findById.mockResolvedValue(user);

      await expect(service.getWalletBalance('user123')).rejects.toThrow(NotFoundException);
    });
  });

  describe('getNetworkInfo', () => {
    it('should get network info successfully', async () => {
      const mockNetwork = {
        name: 'hardhat',
        chainId: BigInt(31337),
      };

      const mockProvider = {
        getNetwork: jest.fn().mockResolvedValue(mockNetwork),
        getBlockNumber: jest.fn().mockResolvedValue(12345),
      };

      (service as any).provider = mockProvider;

      const result = await service.getNetworkInfo();

      expect(result).toEqual({
        name: 'hardhat',
        chainId: '31337',
        blockNumber: 12345,
        rpcUrl: 'http://localhost:8545',
      });
    });

    it('should throw error if network info fails', async () => {
      const mockProvider = {
        getNetwork: jest.fn().mockRejectedValue(new Error('Network error')),
      };

      (service as any).provider = mockProvider;

      await expect(service.getNetworkInfo()).rejects.toThrow(BadRequestException);
    });
  });
});