import crypto from 'crypto';
import { AppLogger } from '../services/logger.service.js';

/**
 * Cookie Encryption and Security Utilities
 * Provides secure cookie handling with encryption, signing, and validation
 */

export interface CookieOptions {
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: 'strict' | 'lax' | 'none';
  maxAge?: number; // in milliseconds
  domain?: string;
  path?: string;
  signed?: boolean;
  encrypted?: boolean;
}

export interface SecureCookieConfig {
  encryptionKey: string; // 32-byte key for AES-256
  signingSecret: string; // Secret for HMAC signing
  defaultOptions: CookieOptions;
}

export interface EncryptedCookieData {
  iv: string; // Initialization vector
  data: string; // Encrypted data
  tag: string; // Authentication tag
}

export class CookieUtil {
  private encryptionKey: Buffer;
  private signingSecret: string;
  private defaultOptions: CookieOptions;
  private algorithm: string = 'aes-256-gcm';

  constructor(config: SecureCookieConfig) {
    // Validate encryption key
    if (!config.encryptionKey || config.encryptionKey.length !== 64) {
      throw new Error('Encryption key must be 64 hex characters (32 bytes)');
    }

    // Validate signing secret
    if (!config.signingSecret || config.signingSecret.length < 32) {
      throw new Error('Signing secret must be at least 32 characters');
    }

    this.encryptionKey = Buffer.from(config.encryptionKey, 'hex');
    this.signingSecret = config.signingSecret;
    this.defaultOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
      ...config.defaultOptions,
    };
  }

  /**
   * Encrypt cookie value using AES-256-GCM
   */
  encrypt(value: string): string {
    try {
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipheriv(this.algorithm, this.encryptionKey, iv);

      let encrypted = cipher.update(value, 'utf8', 'hex');
      encrypted += cipher.final('hex');

      const authTag = cipher.getAuthTag();

      const cookieData: EncryptedCookieData = {
        iv: iv.toString('hex'),
        data: encrypted,
        tag: authTag.toString('hex'),
      };

      return Buffer.from(JSON.stringify(cookieData)).toString('base64');
    } catch (error) {
      AppLogger.error('Failed to encrypt cookie value', error as Error);
      throw new Error('Cookie encryption failed');
    }
  }

  /**
   * Decrypt cookie value
   */
  decrypt(encryptedValue: string): string | null {
    try {
      const cookieData: EncryptedCookieData = JSON.parse(
        Buffer.from(encryptedValue, 'base64').toString('utf8')
      );

      const decipher = crypto.createDecipheriv(
        this.algorithm,
        this.encryptionKey,
        Buffer.from(cookieData.iv, 'hex')
      );

      decipher.setAuthTag(Buffer.from(cookieData.tag, 'hex'));

      let decrypted = decipher.update(cookieData.data, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      return decrypted;
    } catch (error) {
      AppLogger.warn('Failed to decrypt cookie value', {
        error: (error as Error).message,
      });
      return null;
    }
  }

  /**
   * Sign cookie value using HMAC-SHA256
   */
  sign(value: string): string {
    const hmac = crypto.createHmac('sha256', this.signingSecret);
    hmac.update(value);
    const signature = hmac.digest('hex');
    return `${value}.${signature}`;
  }

  /**
   * Verify signed cookie value
   */
  verify(signedValue: string): string | null {
    try {
      const lastDotIndex = signedValue.lastIndexOf('.');
      if (lastDotIndex === -1) {
        return null;
      }

      const value = signedValue.substring(0, lastDotIndex);
      const signature = signedValue.substring(lastDotIndex + 1);

      const hmac = crypto.createHmac('sha256', this.signingSecret);
      hmac.update(value);
      const expectedSignature = hmac.digest('hex');

      // Timing-safe comparison
      if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
        AppLogger.warn('Cookie signature verification failed');
        return null;
      }

      return value;
    } catch (error) {
      AppLogger.warn('Failed to verify cookie signature', {
        error: (error as Error).message,
      });
      return null;
    }
  }

  /**
   * Set secure cookie with optional encryption and signing
   */
  setSecureCookie(
    name: string,
    value: string,
    options: CookieOptions = {}
  ): { name: string; value: string; options: CookieOptions } {
    const mergedOptions = { ...this.defaultOptions, ...options };

    let processedValue = value;

    // Encrypt if requested
    if (mergedOptions.encrypted) {
      processedValue = this.encrypt(processedValue);
    }

    // Sign if requested
    if (mergedOptions.signed) {
      processedValue = this.sign(processedValue);
    }

    return {
      name,
      value: processedValue,
      options: mergedOptions,
    };
  }

  /**
   * Get secure cookie with automatic decryption and verification
   */
  getSecureCookie(
    value: string | undefined,
    options: { signed?: boolean; encrypted?: boolean } = {}
  ): string | null {
    if (!value) {
      return null;
    }

    let processedValue = value;

    // Verify signature if signed
    if (options.signed) {
      const verified = this.verify(processedValue);
      if (!verified) {
        AppLogger.warn('Cookie signature verification failed');
        return null;
      }
      processedValue = verified;
    }

    // Decrypt if encrypted
    if (options.encrypted) {
      const decrypted = this.decrypt(processedValue);
      if (!decrypted) {
        AppLogger.warn('Cookie decryption failed');
        return null;
      }
      processedValue = decrypted;
    }

    return processedValue;
  }

  /**
   * Serialize cookie value to JSON (with optional encryption/signing)
   */
  serializeJson(
    name: string,
    data: any,
    options: CookieOptions = {}
  ): { name: string; value: string; options: CookieOptions } {
    const jsonString = JSON.stringify(data);
    return this.setSecureCookie(name, jsonString, options);
  }

  /**
   * Deserialize cookie value from JSON (with automatic decryption/verification)
   */
  deserializeJson<T = any>(
    value: string | undefined,
    options: { signed?: boolean; encrypted?: boolean } = {}
  ): T | null {
    const processedValue = this.getSecureCookie(value, options);
    if (!processedValue) {
      return null;
    }

    try {
      return JSON.parse(processedValue) as T;
    } catch (error) {
      AppLogger.warn('Failed to parse JSON cookie value');
      return null;
    }
  }

  /**
   * Validate cookie name (prevent injection)
   */
  isValidCookieName(name: string): boolean {
    // Cookie name must be alphanumeric with underscores/hyphens
    const validNamePattern = /^[a-zA-Z0-9_-]+$/;
    return validNamePattern.test(name) && name.length <= 256;
  }

  /**
   * Validate cookie value (prevent injection)
   */
  isValidCookieValue(value: string): boolean {
    // Check for control characters and special characters
    const invalidChars = /[\x00-\x1F\x7F;,\s]/;
    return !invalidChars.test(value) && value.length <= 4096;
  }

  /**
   * Sanitize cookie value
   */
  sanitizeCookieValue(value: string): string {
    // Remove control characters and trim
    return value.replace(/[\x00-\x1F\x7F]/g, '').trim();
  }

  /**
   * Generate secure random cookie value
   */
  generateSecureCookieValue(length: number = 32): string {
    return crypto.randomBytes(length).toString('hex');
  }

  /**
   * Check if cookie is expired
   */
  isExpired(cookieMaxAge: number, cookieSetTime: number): boolean {
    const currentTime = Date.now();
    const expiryTime = cookieSetTime + cookieMaxAge;
    return currentTime >= expiryTime;
  }

  /**
   * Create cookie expiry date
   */
  createExpiryDate(maxAge: number): Date {
    return new Date(Date.now() + maxAge);
  }

  /**
   * Parse cookie string into object
   */
  parseCookieString(cookieString: string): Record<string, string> {
    const cookies: Record<string, string> = {};

    if (!cookieString) {
      return cookies;
    }

    const pairs = cookieString.split(';');

    for (const pair of pairs) {
      const [name, ...valueParts] = pair.split('=');
      const trimmedName = name.trim();
      const value = valueParts.join('=').trim();

      if (trimmedName && this.isValidCookieName(trimmedName)) {
        cookies[trimmedName] = value;
      }
    }

    return cookies;
  }

  /**
   * Serialize cookie options to Set-Cookie header format
   */
  serializeCookieHeader(name: string, value: string, options: CookieOptions = {}): string {
    const mergedOptions = { ...this.defaultOptions, ...options };
    const parts: string[] = [`${name}=${value}`];

    if (mergedOptions.maxAge !== undefined) {
      parts.push(`Max-Age=${Math.floor(mergedOptions.maxAge / 1000)}`);
      parts.push(`Expires=${this.createExpiryDate(mergedOptions.maxAge).toUTCString()}`);
    }

    if (mergedOptions.domain) {
      parts.push(`Domain=${mergedOptions.domain}`);
    }

    if (mergedOptions.path) {
      parts.push(`Path=${mergedOptions.path}`);
    }

    if (mergedOptions.secure) {
      parts.push('Secure');
    }

    if (mergedOptions.httpOnly) {
      parts.push('HttpOnly');
    }

    if (mergedOptions.sameSite) {
      parts.push(`SameSite=${mergedOptions.sameSite.charAt(0).toUpperCase() + mergedOptions.sameSite.slice(1)}`);
    }

    return parts.join('; ');
  }

  /**
   * Create cookie deletion header
   */
  createDeleteCookieHeader(name: string, options: Partial<CookieOptions> = {}): string {
    return this.serializeCookieHeader(name, '', {
      ...options,
      maxAge: 0,
      expires: new Date(0),
    } as any);
  }

  /**
   * Validate cookie size (prevent abuse)
   */
  validateCookieSize(name: string, value: string): boolean {
    const totalSize = name.length + value.length;
    const maxSize = 4096; // 4KB limit per cookie

    if (totalSize > maxSize) {
      AppLogger.warn('Cookie size exceeds limit', {
        name,
        size: totalSize,
        maxSize,
      });
      return false;
    }

    return true;
  }

  /**
   * Get cookie security score
   */
  getCookieSecurityScore(options: CookieOptions): {
    score: number;
    recommendations: string[];
  } {
    let score = 0;
    const recommendations: string[] = [];

    // HttpOnly
    if (options.httpOnly) {
      score += 25;
    } else {
      recommendations.push('Enable HttpOnly flag to prevent XSS attacks');
    }

    // Secure
    if (options.secure) {
      score += 25;
    } else {
      recommendations.push('Enable Secure flag to enforce HTTPS');
    }

    // SameSite
    if (options.sameSite === 'strict') {
      score += 30;
    } else if (options.sameSite === 'lax') {
      score += 20;
      recommendations.push('Consider using SameSite=Strict for better CSRF protection');
    } else {
      recommendations.push('Set SameSite attribute to prevent CSRF attacks');
    }

    // Signed
    if (options.signed) {
      score += 10;
    } else {
      recommendations.push('Consider signing cookies to prevent tampering');
    }

    // Encrypted
    if (options.encrypted) {
      score += 10;
    } else {
      recommendations.push('Consider encrypting sensitive cookie data');
    }

    return { score, recommendations };
  }
}

/**
 * Default cookie configuration
 */
export const defaultCookieConfig: SecureCookieConfig = {
  encryptionKey: process.env.COOKIE_ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex'),
  signingSecret: process.env.COOKIE_SIGNING_SECRET || crypto.randomBytes(32).toString('hex'),
  defaultOptions: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    signed: false,
    encrypted: false,
  },
};

/**
 * Singleton instance
 */
let cookieUtil: CookieUtil | null = null;

export function initializeCookieUtil(config?: Partial<SecureCookieConfig>): CookieUtil {
  const mergedConfig = {
    ...defaultCookieConfig,
    ...config,
    defaultOptions: {
      ...defaultCookieConfig.defaultOptions,
      ...config?.defaultOptions,
    },
  };

  cookieUtil = new CookieUtil(mergedConfig);
  return cookieUtil;
}

export function getCookieUtil(): CookieUtil {
  if (!cookieUtil) {
    // Auto-initialize with defaults if not explicitly initialized
    cookieUtil = new CookieUtil(defaultCookieConfig);
  }
  return cookieUtil;
}

/**
 * Cookie utility helper functions
 */

/**
 * Check if cookie is a session cookie (no maxAge)
 */
export function isSessionCookie(options: CookieOptions): boolean {
  return !options.maxAge && !('expires' in options);
}

/**
 * Check if cookie is persistent
 */
export function isPersistentCookie(options: CookieOptions): boolean {
  return !isSessionCookie(options);
}

/**
 * Get cookie age in milliseconds
 */
export function getCookieAge(cookieSetTime: number): number {
  return Date.now() - cookieSetTime;
}

/**
 * Get remaining cookie lifetime
 */
export function getRemainingLifetime(cookieMaxAge: number, cookieSetTime: number): number {
  const age = getCookieAge(cookieSetTime);
  return Math.max(0, cookieMaxAge - age);
}

/**
 * Generate cookie prefixes for enhanced security
 */
export function getCookiePrefix(options: CookieOptions): string {
  // __Secure- prefix: requires Secure flag
  if (options.secure && !options.domain) {
    return '__Secure-';
  }

  // __Host- prefix: requires Secure, no Domain, path=/
  if (options.secure && !options.domain && options.path === '/') {
    return '__Host-';
  }

  return '';
}

/**
 * Validate cookie against security best practices
 */
export function validateCookieSecurity(
  name: string,
  options: CookieOptions
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Check for security flags
  if (!options.httpOnly) {
    errors.push('HttpOnly flag should be set');
  }

  if (process.env.NODE_ENV === 'production' && !options.secure) {
    errors.push('Secure flag must be set in production');
  }

  if (!options.sameSite) {
    errors.push('SameSite attribute should be set');
  }

  // Check cookie name
  if (name.toLowerCase().includes('session') && !options.httpOnly) {
    errors.push('Session cookies must have HttpOnly flag');
  }

  if (name.toLowerCase().includes('token') && !options.encrypted) {
    errors.push('Token cookies should be encrypted');
  }

  // Check for __Secure- or __Host- prefix compliance
  if (name.startsWith('__Secure-') && !options.secure) {
    errors.push('__Secure- prefix requires Secure flag');
  }

  if (name.startsWith('__Host-')) {
    if (!options.secure) {
      errors.push('__Host- prefix requires Secure flag');
    }
    if (options.domain) {
      errors.push('__Host- prefix cannot have Domain attribute');
    }
    if (options.path !== '/') {
      errors.push('__Host- prefix requires Path=/');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
