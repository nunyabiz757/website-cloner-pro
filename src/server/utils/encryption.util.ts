import crypto from 'crypto';
import { securityConfig } from '../config/security.config.js';

/**
 * Encryption Utilities
 * AES-256-GCM encryption, HMAC signing, key derivation
 */

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const SALT_LENGTH = 32;
const KEY_LENGTH = 32;
const ITERATIONS = 100000; // PBKDF2 iterations

/**
 * Encrypt data using AES-256-GCM
 * @param plaintext Data to encrypt
 * @param key Encryption key (32 bytes)
 * @returns Encrypted data with IV and auth tag
 */
export const encrypt = (plaintext: string, key?: Buffer): string => {
  try {
    const encryptionKey = key || Buffer.from(securityConfig.encryption.key, 'utf8');

    if (encryptionKey.length !== KEY_LENGTH) {
      throw new Error('Encryption key must be exactly 32 bytes');
    }

    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, encryptionKey, iv);

    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag();

    // Return: iv:authTag:encrypted
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
  } catch (error) {
    throw new Error(`Encryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

/**
 * Decrypt data using AES-256-GCM
 * @param encryptedData Encrypted data with IV and auth tag
 * @param key Decryption key (32 bytes)
 * @returns Decrypted plaintext
 */
export const decrypt = (encryptedData: string, key?: Buffer): string => {
  try {
    const encryptionKey = key || Buffer.from(securityConfig.encryption.key, 'utf8');

    if (encryptionKey.length !== KEY_LENGTH) {
      throw new Error('Decryption key must be exactly 32 bytes');
    }

    const parts = encryptedData.split(':');
    if (parts.length !== 3) {
      throw new Error('Invalid encrypted data format');
    }

    const iv = Buffer.from(parts[0], 'hex');
    const authTag = Buffer.from(parts[1], 'hex');
    const encrypted = parts[2];

    const decipher = crypto.createDecipheriv(ALGORITHM, encryptionKey, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch (error) {
    throw new Error(`Decryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

/**
 * Encrypt object (converts to JSON)
 * @param obj Object to encrypt
 * @param key Encryption key
 * @returns Encrypted string
 */
export const encryptObject = (obj: any, key?: Buffer): string => {
  const json = JSON.stringify(obj);
  return encrypt(json, key);
};

/**
 * Decrypt object (parses JSON)
 * @param encryptedData Encrypted data
 * @param key Decryption key
 * @returns Decrypted object
 */
export const decryptObject = (encryptedData: string, key?: Buffer): any => {
  const json = decrypt(encryptedData, key);
  return JSON.parse(json);
};

/**
 * Derive key from password using PBKDF2
 * @param password Password to derive key from
 * @param salt Salt (optional, generates if not provided)
 * @returns Derived key and salt
 */
export const deriveKey = (
  password: string,
  salt?: Buffer
): { key: Buffer; salt: Buffer } => {
  const keySalt = salt || crypto.randomBytes(SALT_LENGTH);
  const key = crypto.pbkdf2Sync(password, keySalt, ITERATIONS, KEY_LENGTH, 'sha256');
  return { key, salt: keySalt };
};

/**
 * Generate random encryption key
 * @returns Random 32-byte key
 */
export const generateKey = (): Buffer => {
  return crypto.randomBytes(KEY_LENGTH);
};

/**
 * Generate random IV
 * @returns Random 16-byte IV
 */
export const generateIV = (): Buffer => {
  return crypto.randomBytes(IV_LENGTH);
};

/**
 * Hash data using SHA-256
 * @param data Data to hash
 * @returns Hex-encoded hash
 */
export const hash = (data: string): string => {
  return crypto.createHash('sha256').update(data).digest('hex');
};

/**
 * Hash data using SHA-512
 * @param data Data to hash
 * @returns Hex-encoded hash
 */
export const hashSHA512 = (data: string): string => {
  return crypto.createHash('sha512').update(data).digest('hex');
};

/**
 * Create HMAC signature
 * @param data Data to sign
 * @param secret Secret key
 * @returns Hex-encoded HMAC
 */
export const createHMAC = (data: string, secret?: string): string => {
  const hmacSecret = secret || securityConfig.encryption.key;
  return crypto.createHmac('sha256', hmacSecret).update(data).digest('hex');
};

/**
 * Verify HMAC signature
 * @param data Data to verify
 * @param signature HMAC signature
 * @param secret Secret key
 * @returns True if valid
 */
export const verifyHMAC = (data: string, signature: string, secret?: string): boolean => {
  const hmacSecret = secret || securityConfig.encryption.key;
  const expectedSignature = createHMAC(data, hmacSecret);
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
};

/**
 * Generate secure random token
 * @param length Token length in bytes
 * @returns Hex-encoded token
 */
export const generateToken = (length: number = 32): string => {
  return crypto.randomBytes(length).toString('hex');
};

/**
 * Generate secure random string with specific charset
 * @param length String length
 * @param charset Character set to use
 * @returns Random string
 */
export const generateRandomString = (
  length: number,
  charset: string = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
): string => {
  let result = '';
  const charsetLength = charset.length;
  const randomBytes = crypto.randomBytes(length);

  for (let i = 0; i < length; i++) {
    result += charset[randomBytes[i] % charsetLength];
  }

  return result;
};

/**
 * Generate UUID v4
 * @returns UUID string
 */
export const generateUUID = (): string => {
  return crypto.randomUUID();
};

/**
 * Constant-time string comparison
 * @param a First string
 * @param b Second string
 * @returns True if equal
 */
export const constantTimeEqual = (a: string, b: string): boolean => {
  if (a.length !== b.length) {
    return false;
  }
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
};

/**
 * Encrypt data for storage
 * Adds metadata and versioning
 */
export class SecureStorage {
  private static VERSION = 1;

  static encrypt(data: any, key?: Buffer): string {
    const payload = {
      version: this.VERSION,
      timestamp: Date.now(),
      data,
    };
    return encryptObject(payload, key);
  }

  static decrypt(encryptedData: string, key?: Buffer): any {
    const payload = decryptObject(encryptedData, key);

    if (payload.version !== this.VERSION) {
      throw new Error(`Unsupported storage version: ${payload.version}`);
    }

    return payload.data;
  }
}

/**
 * Encrypt field in database
 * @param fieldValue Value to encrypt
 * @returns Encrypted value with metadata
 */
export const encryptField = (fieldValue: string): string => {
  return `enc:${encrypt(fieldValue)}`;
};

/**
 * Decrypt field from database
 * @param fieldValue Encrypted value
 * @returns Decrypted value
 */
export const decryptField = (fieldValue: string): string => {
  if (!fieldValue.startsWith('enc:')) {
    throw new Error('Field is not encrypted');
  }
  return decrypt(fieldValue.substring(4));
};

/**
 * Check if field is encrypted
 * @param fieldValue Field value
 * @returns True if encrypted
 */
export const isFieldEncrypted = (fieldValue: string): boolean => {
  return fieldValue.startsWith('enc:');
};

/**
 * Encrypt multiple fields in an object
 * @param obj Object with fields to encrypt
 * @param fields Fields to encrypt
 * @returns Object with encrypted fields
 */
export const encryptFields = (obj: any, fields: string[]): any => {
  const encrypted = { ...obj };
  for (const field of fields) {
    if (encrypted[field] !== undefined && encrypted[field] !== null) {
      encrypted[field] = encryptField(String(encrypted[field]));
    }
  }
  return encrypted;
};

/**
 * Decrypt multiple fields in an object
 * @param obj Object with encrypted fields
 * @param fields Fields to decrypt
 * @returns Object with decrypted fields
 */
export const decryptFields = (obj: any, fields: string[]): any => {
  const decrypted = { ...obj };
  for (const field of fields) {
    if (decrypted[field] && isFieldEncrypted(decrypted[field])) {
      decrypted[field] = decryptField(decrypted[field]);
    }
  }
  return decrypted;
};

/**
 * Key rotation helper
 * Re-encrypts data with a new key
 */
export class KeyRotation {
  static reencrypt(encryptedData: string, oldKey: Buffer, newKey: Buffer): string {
    const decrypted = decrypt(encryptedData, oldKey);
    return encrypt(decrypted, newKey);
  }

  static reencryptObject(encryptedData: string, oldKey: Buffer, newKey: Buffer): string {
    const decrypted = decryptObject(encryptedData, oldKey);
    return encryptObject(decrypted, newKey);
  }

  static reencryptField(fieldValue: string, oldKey: Buffer, newKey: Buffer): string {
    const decrypted = decryptField(fieldValue);
    return encryptField(decrypted);
  }
}

/**
 * Encryption utilities export
 */
export const EncryptionUtil = {
  encrypt,
  decrypt,
  encryptObject,
  decryptObject,
  deriveKey,
  generateKey,
  generateIV,
  hash,
  hashSHA512,
  createHMAC,
  verifyHMAC,
  generateToken,
  generateRandomString,
  generateUUID,
  constantTimeEqual,
  encryptField,
  decryptField,
  isFieldEncrypted,
  encryptFields,
  decryptFields,
  SecureStorage,
  KeyRotation,
};

export default EncryptionUtil;
