import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { EncryptionService } from './encryption.service';
import * as crypto from 'crypto';

describe('EncryptionService', () => {
  let service: EncryptionService;
  let configService: ConfigService;

  const mockConfigService = {
    get: jest.fn().mockReturnValue(undefined),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EncryptionService,
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<EncryptionService>(EncryptionService);
    configService = module.get<ConfigService>(ConfigService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('generateCommonSecret', () => {
    it('should generate a 64-character hex string', () => {
      const secret = service.generateCommonSecret();
      expect(typeof secret).toBe('string');
      expect(secret.length).toBe(64); // 32 bytes = 64 hex characters
      expect(/^[0-9a-f]+$/.test(secret)).toBe(true);
    });

    it('should generate unique secrets', () => {
      const secret1 = service.generateCommonSecret();
      const secret2 = service.generateCommonSecret();
      expect(secret1).not.toBe(secret2);
    });
  });

  describe('generateRandomPin', () => {
    it('should generate a 6-digit PIN', () => {
      const pin = service.generateRandomPin();
      expect(typeof pin).toBe('string');
      expect(pin.length).toBe(6);
      expect(/^\d{6}$/.test(pin)).toBe(true);
    });

    it('should generate different PINs', () => {
      const pin1 = service.generateRandomPin();
      const pin2 = service.generateRandomPin();
      // While it's possible they could be the same, it's extremely unlikely
      expect(pin1).not.toBe(pin2);
    });
  });

  describe('encryptPrivateKeyWithSecret', () => {
    it('should encrypt and decrypt private key successfully', () => {
      const privateKey = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
      const secret = service.generateCommonSecret();

      const encrypted = service.encryptPrivateKeyWithSecret(privateKey, secret);
      expect(typeof encrypted).toBe('string');
      expect(encrypted.length).toBeGreaterThan(0);

      // Test decryption using private method access
      const decrypted = (service as any).decryptPrivateKeyWithSecret(encrypted, secret);
      expect(decrypted).toBe(privateKey);
    });

    it('should produce different encrypted results for same input', () => {
      const privateKey = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
      const secret = service.generateCommonSecret();

      const encrypted1 = service.encryptPrivateKeyWithSecret(privateKey, secret);
      const encrypted2 = service.encryptPrivateKeyWithSecret(privateKey, secret);
      expect(encrypted1).not.toBe(encrypted2);
    });
  });

  describe('encryptWithPin', () => {
    it('should encrypt and decrypt data successfully', () => {
      const data = 'sensitive data';
      const pin = '123456';

      const encrypted = service.encryptWithPin(data, pin);
      expect(typeof encrypted).toBe('string');
      expect(encrypted.length).toBeGreaterThan(0);

      const decrypted = service.decryptWithPin(encrypted, pin);
      expect(decrypted).toBe(data);
    });

    it('should fail decryption with wrong PIN', () => {
      const data = 'sensitive data';
      const correctPin = '123456';
      const wrongPin = '654321';

      const encrypted = service.encryptWithPin(data, correctPin);

      expect(() => {
        service.decryptWithPin(encrypted, wrongPin);
      }).toThrow();
    });

    it('should produce different encrypted results for same input', () => {
      const data = 'sensitive data';
      const pin = '123456';

      const encrypted1 = service.encryptWithPin(data, pin);
      const encrypted2 = service.encryptWithPin(data, pin);
      expect(encrypted1).not.toBe(encrypted2);
    });
  });

  describe('createEncryptedWallet', () => {
    it('should create encrypted wallet with all required fields', () => {
      const wallet = service.createEncryptedWallet();

      expect(wallet).toHaveProperty('pin');
      expect(wallet).toHaveProperty('commonSecretEncrypted');
      expect(wallet).toHaveProperty('privateKeyEncrypted');
      expect(wallet).toHaveProperty('publicKey');

      expect(typeof wallet.pin).toBe('string');
      expect(wallet.pin.length).toBe(6);
      expect(/^\d{6}$/.test(wallet.pin)).toBe(true);

      expect(typeof wallet.commonSecretEncrypted).toBe('string');
      expect(typeof wallet.privateKeyEncrypted).toBe('string');
      expect(typeof wallet.publicKey).toBe('string');
    });

    it('should create unique wallets', () => {
      const wallet1 = service.createEncryptedWallet();
      const wallet2 = service.createEncryptedWallet();

      expect(wallet1.pin).not.toBe(wallet2.pin);
      expect(wallet1.commonSecretEncrypted).not.toBe(wallet2.commonSecretEncrypted);
      expect(wallet1.privateKeyEncrypted).not.toBe(wallet2.privateKeyEncrypted);
      expect(wallet1.publicKey).not.toBe(wallet2.publicKey);
    });
  });

  describe('decryptPrivateKeyWithPin', () => {
    it('should decrypt private key using PIN and encrypted secret', () => {
      const wallet = service.createEncryptedWallet();

      const decryptedKey = service.decryptPrivateKeyWithPin(
        wallet.privateKeyEncrypted,
        wallet.commonSecretEncrypted,
        wallet.pin
      );

      expect(typeof decryptedKey).toBe('string');
      expect(decryptedKey.length).toBeGreaterThan(0);
    });

    it('should fail decryption with wrong PIN', () => {
      const wallet = service.createEncryptedWallet();
      const wrongPin = '000000';

      expect(() => {
        service.decryptPrivateKeyWithPin(
          wallet.privateKeyEncrypted,
          wallet.commonSecretEncrypted,
          wrongPin
        );
      }).toThrow();
    });
  });

  describe('legacy methods', () => {
    describe('encryptPrivateKey', () => {
      it('should encrypt and decrypt private key successfully', () => {
        const privateKey = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
        const pin = '123456';

        const encrypted = service.encryptPrivateKey(privateKey, pin);
        expect(typeof encrypted).toBe('string');
        expect(encrypted.length).toBeGreaterThan(0);

        const decrypted = service.decryptPrivateKey(encrypted, pin);
        expect(decrypted).toBe(privateKey);
      });
    });

    describe('generatePin', () => {
      it('should generate PIN with default length 6', () => {
        const pin = service.generatePin();
        expect(pin.length).toBe(6);
        expect(/^\d{6}$/.test(pin)).toBe(true);
      });

      it('should generate PIN with custom length', () => {
        const pin = service.generatePin(4);
        expect(pin.length).toBe(4);
        expect(/^\d{4}$/.test(pin)).toBe(true);
      });
    });

    describe('hashPin and verifyPin', () => {
      it('should hash and verify PIN correctly', () => {
        const pin = '123456';
        const hashedPin = service.hashPin(pin);

        expect(typeof hashedPin).toBe('string');
        expect(hashedPin).toContain(':');

        const isValid = service.verifyPin(pin, hashedPin);
        expect(isValid).toBe(true);

        const isInvalid = service.verifyPin('654321', hashedPin);
        expect(isInvalid).toBe(false);
      });
    });

    describe('validatePin', () => {
      it('should validate PIN against encrypted data', () => {
        const privateKey = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
        const pin = '123456';

        const encrypted = service.encryptPrivateKey(privateKey, pin);
        
        const isValid = service.validatePin(encrypted, pin);
        expect(isValid).toBe(true);

        const isInvalid = service.validatePin(encrypted, '654321');
        expect(isInvalid).toBe(false);
      });
    });
  });

  describe('error handling', () => {
    it('should handle invalid encrypted data gracefully', () => {
      const invalidData = 'invalid-data';
      const pin = '123456';

      expect(() => {
        service.decryptWithPin(invalidData, pin);
      }).toThrow();
    });

    it('should handle empty PIN gracefully', () => {
      const data = 'test data';
      const emptyPin = '';

      expect(() => {
        service.encryptWithPin(data, emptyPin);
      }).toThrow();
    });
  });
});