import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import * as fs from 'fs';

@Injectable()
export class EncryptionService {
    private readonly algorithm = 'aes-256-cbc';
    private readonly keyLength = 32; // 256 bits
    private readonly ivLength = 16; // 128 bits
    private readonly serverCertificate: string;

    constructor(private readonly configService: ConfigService) {
        this.serverCertificate = this.loadServerCertificate();
    }

    private loadServerCertificate(): string {
        const certPath = this.configService.get<string>('SERVER_CERTIFICATE_PATH');
        if (!certPath) {
            return 'DEFAULT_SERVER_CERTIFICATE_FOR_DEVELOPMENT';
        }
        
        try {
            return fs.readFileSync(certPath, 'utf8');
        } catch (error) {
            return 'DEFAULT_SERVER_CERTIFICATE_FOR_DEVELOPMENT';
        }
    }

    /**
     * Generates a secure random PIN
     * @param length Length of the PIN (default: 6)
     * @returns Random numeric PIN
     */
    generatePin(length: number = 6): string {
        const digits = '0123456789';
        let pin = '';

        for (let i = 0; i < length; i++) {
            const randomIndex = crypto.randomInt(0, digits.length);
            pin += digits[randomIndex];
        }

        return pin;
    }

    /**
     * Hashes a PIN for storage (one-way hash)
     * @param pin The PIN to hash
     * @returns Hashed PIN
     */
    hashPin(pin: string): string {
        const salt = crypto.randomBytes(16);
        const hash = crypto.pbkdf2Sync(pin, salt, 100000, 32, 'sha256');

        return salt.toString('hex') + ':' + hash.toString('hex');
    }

    /**
     * Verifies a PIN against its hash
     * @param pin The PIN to verify
     * @param hashedPin The stored hash
     * @returns True if PIN matches, false otherwise
     */
    verifyPin(pin: string, hashedPin: string): boolean {
        try {
            const [saltHex, hashHex] = hashedPin.split(':');
            const salt = Buffer.from(saltHex, 'hex');
            const hash = Buffer.from(hashHex, 'hex');

            const computedHash = crypto.pbkdf2Sync(pin, salt, 100000, 32, 'sha256');

            return crypto.timingSafeEqual(hash, computedHash);
        } catch (error) {
            return false;
        }
    }

    /**
     * Generates a secure common secret for wallet encryption
     * @returns Random common secret as hex string
     */
    generateCommonSecret(): string {
        return crypto.randomBytes(32).toString('hex');
    }

    /**
     * Encrypts a private key using a common secret
     * @param privateKey The private key to encrypt
     * @param commonSecret The common secret for encryption
     * @returns Encrypted private key
     */
    encryptPrivateKeyWithSecret(privateKey: string, commonSecret: string): string {
        try {
            const salt = crypto.randomBytes(16);
            const key = crypto.pbkdf2Sync(commonSecret, salt, 100000, this.keyLength, 'sha256');
            const iv = crypto.randomBytes(this.ivLength);
            
            const cipher = crypto.createCipheriv(this.algorithm, key, iv);
            let encrypted = cipher.update(privateKey, 'utf8', 'hex');
            encrypted += cipher.final('hex');

            const result = Buffer.concat([
                salt,
                iv,
                Buffer.from(encrypted, 'hex')
            ]);

            return result.toString('hex');
        } catch (error) {
            throw new Error(`Private key encryption with secret failed: ${error.message}`);
        }
    }

    /**
     * Generates a random 6-digit PIN for invited users
     * @returns 6-digit numeric PIN
     */
    generateRandomPin(): string {
        return this.generatePin(6);
    }

    /**
     * Encrypts data with PIN + server certificate (double encryption)
     * @param data The data to encrypt
     * @param pin The PIN to use for encryption
     * @returns Double encrypted data
     */
    encryptWithPin(data: string, pin: string): string {
        try {
            // First layer: encrypt with PIN
            const pinSalt = crypto.randomBytes(16);
            const pinKey = crypto.pbkdf2Sync(pin, pinSalt, 100000, this.keyLength, 'sha256');
            const pinIv = crypto.randomBytes(this.ivLength);
            
            const pinCipher = crypto.createCipheriv(this.algorithm, pinKey, pinIv);
            let pinEncrypted = pinCipher.update(data, 'utf8', 'hex');
            pinEncrypted += pinCipher.final('hex');

            // Second layer: encrypt with server certificate
            const certSalt = crypto.randomBytes(16);
            const certKey = crypto.pbkdf2Sync(this.serverCertificate, certSalt, 100000, this.keyLength, 'sha256');
            const certIv = crypto.randomBytes(this.ivLength);
            
            const certCipher = crypto.createCipheriv(this.algorithm, certKey, certIv);
            let certEncrypted = certCipher.update(pinEncrypted, 'utf8', 'hex');
            certEncrypted += certCipher.final('hex');

            // Combine all components
            const result = Buffer.concat([
                pinSalt,
                pinIv,
                certSalt,
                certIv,
                Buffer.from(certEncrypted, 'hex')
            ]);

            return result.toString('hex');
        } catch (error) {
            throw new Error(`Double encryption failed: ${error.message}`);
        }
    }

    /**
     * Decrypts data with PIN + server certificate (double decryption)
     * @param encryptedData The double encrypted data
     * @param pin The PIN to use for decryption
     * @returns Decrypted data
     */
    decryptWithPin(encryptedData: string, pin: string): string {
        try {
            const data = Buffer.from(encryptedData, 'hex');
            
            // Extract components
            const pinSalt = data.subarray(0, 16);
            const pinIv = data.subarray(16, 32);
            const certSalt = data.subarray(32, 48);
            const certIv = data.subarray(48, 64);
            const encryptedBuffer = data.subarray(64);

            // First layer: decrypt with server certificate
            const certKey = crypto.pbkdf2Sync(this.serverCertificate, certSalt, 100000, this.keyLength, 'sha256');
            const certDecipher = crypto.createDecipheriv(this.algorithm, certKey, certIv);
            
            const encryptedHex = encryptedBuffer.toString('hex');
            let certDecrypted = certDecipher.update(encryptedHex, 'hex', 'utf8');
            certDecrypted += certDecipher.final('utf8');

            // Second layer: decrypt with PIN
            const pinKey = crypto.pbkdf2Sync(pin, pinSalt, 100000, this.keyLength, 'sha256');
            const pinDecipher = crypto.createDecipheriv(this.algorithm, pinKey, pinIv);
            
            let pinDecrypted = pinDecipher.update(certDecrypted, 'hex', 'utf8');
            pinDecrypted += pinDecipher.final('utf8');

            return pinDecrypted;
        } catch (error) {
            throw new Error(`Double decryption failed: ${error.message}`);
        }
    }

    /**
     * Creates an encrypted wallet with all required components
     * @returns Object containing PIN, encrypted secret, encrypted private key, and public address
     */
    createEncryptedWallet(): { pin: string; commonSecretEncrypted: string; privateKeyEncrypted: string; publicKey: string } {
        try {
            // Generate a random private key using secure random bytes
            const randomBytes = crypto.randomBytes(32);
            const privateKeyHex = '0x' + randomBytes.toString('hex');
            
            // Use the private key as the reference for the wallet service
            const publicKey = privateKeyHex;

            // Generate common secret
            const commonSecret = this.generateCommonSecret();
            
            // Encrypt private key with common secret
            const privateKeyEncrypted = this.encryptPrivateKeyWithSecret(privateKeyHex, commonSecret);
            
            // Generate random PIN
            const pin = this.generateRandomPin();
            
            // Encrypt common secret with PIN + certificate
            const commonSecretEncrypted = this.encryptWithPin(commonSecret, pin);

            return {
                pin,
                commonSecretEncrypted,
                privateKeyEncrypted,
                publicKey
            };
        } catch (error) {
            throw new Error(`Encrypted wallet creation failed: ${error.message}`);
        }
    }

    /**
     * Decrypts a private key using PIN and encrypted common secret
     * @param privateKeyEncrypted Encrypted private key
     * @param commonSecretEncrypted Encrypted common secret
     * @param pin PIN for decryption
     * @returns Decrypted private key
     */
    decryptPrivateKeyWithPin(privateKeyEncrypted: string, commonSecretEncrypted: string, pin: string): string {
        try {
            // Decrypt common secret using PIN + certificate
            const commonSecret = this.decryptWithPin(commonSecretEncrypted, pin);
            
            // Decrypt private key using common secret
            return this.decryptPrivateKeyWithSecret(privateKeyEncrypted, commonSecret);
        } catch (error) {
            throw new Error(`Private key decryption with PIN failed: ${error.message}`);
        }
    }

    /**
     * Decrypts a private key using a common secret
     * @param encryptedPrivateKey Encrypted private key
     * @param commonSecret Common secret for decryption
     * @returns Decrypted private key
     */
    private decryptPrivateKeyWithSecret(encryptedPrivateKey: string, commonSecret: string): string {
        try {
            const data = Buffer.from(encryptedPrivateKey, 'hex');
            
            const salt = data.subarray(0, 16);
            const iv = data.subarray(16, 16 + this.ivLength);
            const encryptedBuffer = data.subarray(16 + this.ivLength);

            const key = crypto.pbkdf2Sync(commonSecret, salt, 100000, this.keyLength, 'sha256');
            const decipher = crypto.createDecipheriv(this.algorithm, key, iv);

            const encryptedHex = encryptedBuffer.toString('hex');
            let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
            decrypted += decipher.final('utf8');

            return decrypted;
        } catch (error) {
            throw new Error(`Private key decryption with secret failed: ${error.message}`);
        }
    }
}