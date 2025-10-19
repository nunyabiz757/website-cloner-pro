import crypto from 'crypto';
import { AppLogger } from '../services/logger.service.js';

/**
 * Pre-signed URL Utility
 * Generates secure, time-limited URLs for file access
 */

export interface PreSignedUrlOptions {
  expiresIn?: number; // Expiration time in seconds (default: 3600)
  maxDownloads?: number; // Maximum number of downloads (default: unlimited)
  allowedIpAddress?: string; // Restrict to specific IP
  userId?: string; // User who generated the URL
  contentType?: string; // Expected content type
  contentDisposition?: 'inline' | 'attachment'; // How to display the file
  filename?: string; // Custom filename for download
}

export interface PreSignedUrlData {
  url: string;
  token: string;
  expiresAt: Date;
  filePath: string;
  metadata?: Record<string, any>;
}

export interface TokenPayload {
  filePath: string;
  expiresAt: number;
  maxDownloads?: number;
  allowedIpAddress?: string;
  userId?: string;
  contentType?: string;
  contentDisposition?: string;
  filename?: string;
  nonce: string; // Random value to prevent token reuse
}

export class PreSignedUrlUtil {
  private signingKey: Buffer;
  private algorithm: string = 'aes-256-gcm';
  private defaultExpiration: number = 3600; // 1 hour

  constructor(signingKey?: string) {
    // Use provided key or generate from environment
    const key = signingKey || process.env.PRESIGNED_URL_SECRET || crypto.randomBytes(32).toString('hex');

    if (key.length !== 64) {
      throw new Error('Signing key must be 64 hex characters (32 bytes)');
    }

    this.signingKey = Buffer.from(key, 'hex');
  }

  /**
   * Generate a pre-signed URL for file access
   */
  generatePresignedUrl(
    filePath: string,
    baseUrl: string,
    options: PreSignedUrlOptions = {}
  ): PreSignedUrlData {
    const expiresIn = options.expiresIn || this.defaultExpiration;
    const expiresAt = new Date(Date.now() + expiresIn * 1000);

    // Create token payload
    const payload: TokenPayload = {
      filePath,
      expiresAt: expiresAt.getTime(),
      maxDownloads: options.maxDownloads,
      allowedIpAddress: options.allowedIpAddress,
      userId: options.userId,
      contentType: options.contentType,
      contentDisposition: options.contentDisposition,
      filename: options.filename,
      nonce: crypto.randomBytes(16).toString('hex'),
    };

    // Encrypt and sign the token
    const token = this.encryptToken(payload);

    // Build URL
    const url = `${baseUrl}?token=${encodeURIComponent(token)}`;

    AppLogger.debug('Pre-signed URL generated', {
      filePath,
      expiresAt,
      maxDownloads: options.maxDownloads,
      userId: options.userId,
    });

    return {
      url,
      token,
      expiresAt,
      filePath,
      metadata: {
        maxDownloads: options.maxDownloads,
        allowedIpAddress: options.allowedIpAddress,
        userId: options.userId,
      },
    };
  }

  /**
   * Validate and decode a pre-signed URL token
   */
  validateToken(
    token: string,
    context: {
      ipAddress?: string;
      userId?: string;
    } = {}
  ): TokenPayload | null {
    try {
      // Decrypt token
      const payload = this.decryptToken(token);

      if (!payload) {
        AppLogger.warn('Invalid pre-signed URL token - decryption failed');
        return null;
      }

      // Check expiration
      if (Date.now() > payload.expiresAt) {
        AppLogger.warn('Pre-signed URL token expired', {
          expiresAt: new Date(payload.expiresAt),
          filePath: payload.filePath,
        });
        return null;
      }

      // Check IP address restriction
      if (payload.allowedIpAddress && payload.allowedIpAddress !== context.ipAddress) {
        AppLogger.logSecurityEvent('presigned_url.ip_mismatch', 'medium', {
          expectedIp: payload.allowedIpAddress,
          actualIp: context.ipAddress,
          filePath: payload.filePath,
        });
        return null;
      }

      // Check user restriction
      if (payload.userId && payload.userId !== context.userId) {
        AppLogger.logSecurityEvent('presigned_url.user_mismatch', 'medium', {
          expectedUser: payload.userId,
          actualUser: context.userId,
          filePath: payload.filePath,
        });
        return null;
      }

      return payload;
    } catch (error) {
      AppLogger.error('Failed to validate pre-signed URL token', error as Error);
      return null;
    }
  }

  /**
   * Encrypt token payload
   */
  private encryptToken(payload: TokenPayload): string {
    try {
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipheriv(this.algorithm, this.signingKey, iv);

      const payloadString = JSON.stringify(payload);
      let encrypted = cipher.update(payloadString, 'utf8', 'hex');
      encrypted += cipher.final('hex');

      const authTag = cipher.getAuthTag();

      // Combine IV, encrypted data, and auth tag
      const combined = {
        iv: iv.toString('hex'),
        data: encrypted,
        tag: authTag.toString('hex'),
      };

      return Buffer.from(JSON.stringify(combined)).toString('base64url');
    } catch (error) {
      AppLogger.error('Failed to encrypt token', error as Error);
      throw new Error('Token encryption failed');
    }
  }

  /**
   * Decrypt token payload
   */
  private decryptToken(token: string): TokenPayload | null {
    try {
      const combined = JSON.parse(Buffer.from(token, 'base64url').toString('utf8'));

      const decipher = crypto.createDecipheriv(
        this.algorithm,
        this.signingKey,
        Buffer.from(combined.iv, 'hex')
      );

      decipher.setAuthTag(Buffer.from(combined.tag, 'hex'));

      let decrypted = decipher.update(combined.data, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      return JSON.parse(decrypted) as TokenPayload;
    } catch (error) {
      AppLogger.debug('Failed to decrypt token', {
        error: (error as Error).message,
      });
      return null;
    }
  }

  /**
   * Generate a short-lived token for immediate download
   */
  generateQuickDownloadToken(filePath: string, userId?: string): string {
    const payload: TokenPayload = {
      filePath,
      expiresAt: Date.now() + 300000, // 5 minutes
      userId,
      nonce: crypto.randomBytes(16).toString('hex'),
    };

    return this.encryptToken(payload);
  }

  /**
   * Generate a token with download limit
   */
  generateLimitedDownloadToken(
    filePath: string,
    maxDownloads: number,
    expiresIn: number = 86400,
    userId?: string
  ): string {
    const payload: TokenPayload = {
      filePath,
      expiresAt: Date.now() + expiresIn * 1000,
      maxDownloads,
      userId,
      nonce: crypto.randomBytes(16).toString('hex'),
    };

    return this.encryptToken(payload);
  }

  /**
   * Generate an IP-restricted token
   */
  generateIpRestrictedToken(
    filePath: string,
    allowedIpAddress: string,
    expiresIn: number = 3600,
    userId?: string
  ): string {
    const payload: TokenPayload = {
      filePath,
      expiresAt: Date.now() + expiresIn * 1000,
      allowedIpAddress,
      userId,
      nonce: crypto.randomBytes(16).toString('hex'),
    };

    return this.encryptToken(payload);
  }

  /**
   * Validate token and extract file path
   */
  getFilePathFromToken(token: string, context: { ipAddress?: string; userId?: string } = {}): string | null {
    const payload = this.validateToken(token, context);
    return payload ? payload.filePath : null;
  }

  /**
   * Check if token has expired
   */
  isTokenExpired(token: string): boolean {
    try {
      const payload = this.decryptToken(token);
      return payload ? Date.now() > payload.expiresAt : true;
    } catch {
      return true;
    }
  }

  /**
   * Get token expiration time
   */
  getTokenExpiration(token: string): Date | null {
    try {
      const payload = this.decryptToken(token);
      return payload ? new Date(payload.expiresAt) : null;
    } catch {
      return null;
    }
  }

  /**
   * Revoke token by generating a revocation hash
   */
  generateRevocationHash(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }
}

/**
 * URL-safe base64 encoding helper
 */
export function base64UrlEncode(str: string): string {
  return Buffer.from(str)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/**
 * URL-safe base64 decoding helper
 */
export function base64UrlDecode(str: string): string {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');

  // Add padding
  while (base64.length % 4) {
    base64 += '=';
  }

  return Buffer.from(base64, 'base64').toString('utf8');
}

/**
 * Validate file path for security
 */
export function validateFilePath(filePath: string): boolean {
  // Prevent directory traversal
  if (filePath.includes('..') || filePath.includes('~')) {
    return false;
  }

  // Must be absolute path or start with allowed prefix
  if (!filePath.startsWith('/') && !filePath.startsWith('uploads/')) {
    return false;
  }

  // No null bytes
  if (filePath.includes('\0')) {
    return false;
  }

  return true;
}

/**
 * Sanitize filename for Content-Disposition header
 */
export function sanitizeFilename(filename: string): string {
  // Remove path separators and control characters
  return filename
    .replace(/[\/\\]/g, '_')
    .replace(/[\x00-\x1F\x7F]/g, '')
    .substring(0, 255);
}

/**
 * Generate content disposition header
 */
export function generateContentDisposition(
  disposition: 'inline' | 'attachment',
  filename?: string
): string {
  if (!filename) {
    return disposition;
  }

  const sanitized = sanitizeFilename(filename);

  // RFC 5987 encoding for non-ASCII filenames
  const encoded = encodeURIComponent(sanitized);

  return `${disposition}; filename="${sanitized}"; filename*=UTF-8''${encoded}`;
}

/**
 * Singleton instance
 */
let preSignedUrlUtil: PreSignedUrlUtil | null = null;

export function initializePreSignedUrlUtil(signingKey?: string): PreSignedUrlUtil {
  preSignedUrlUtil = new PreSignedUrlUtil(signingKey);
  return preSignedUrlUtil;
}

export function getPreSignedUrlUtil(): PreSignedUrlUtil {
  if (!preSignedUrlUtil) {
    // Auto-initialize with default key
    preSignedUrlUtil = new PreSignedUrlUtil();
  }
  return preSignedUrlUtil;
}
