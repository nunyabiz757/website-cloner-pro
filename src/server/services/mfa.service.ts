import { Pool } from 'pg';
import speakeasy from 'speakeasy';
import QRCode from 'qrcode';
import crypto from 'crypto';
import { PasswordUtil } from '../utils/password.util.js';

export interface MFASetupResponse {
  secret: string;
  qrCodeUrl: string;
  backupCodes: string[];
  manualEntryKey: string;
}

export interface BackupCode {
  code: string;
  hash: string;
  used: boolean;
}

/**
 * Multi-Factor Authentication Service
 * Implements TOTP (Time-based One-Time Password) 2FA
 */
export class MFAService {
  private pool: Pool;
  private issuer: string;

  constructor(pool: Pool) {
    this.pool = pool;
    this.issuer = process.env.MFA_ISSUER || 'Website Cloner Pro';
  }

  /**
   * Generate MFA secret and QR code for user
   * @param userId User ID
   * @param userEmail User email
   * @returns MFA setup data
   */
  async setupMFA(userId: string, userEmail: string): Promise<MFASetupResponse> {
    // Check if MFA is already enabled
    const result = await this.pool.query('SELECT mfa_enabled FROM users WHERE id = $1', [userId]);
    if (result.rows[0]?.mfa_enabled) {
      throw new Error('MFA is already enabled for this account');
    }

    // Generate secret
    const secret = speakeasy.generateSecret({
      name: `${this.issuer} (${userEmail})`,
      issuer: this.issuer,
      length: 32,
    });

    if (!secret.otpauth_url) {
      throw new Error('Failed to generate OTP auth URL');
    }

    // Generate QR code
    const qrCodeUrl = await QRCode.toDataURL(secret.otpauth_url);

    // Generate backup codes
    const backupCodes = this.generateBackupCodes(
      parseInt(process.env.BACKUP_CODES_COUNT || '10')
    );
    const backupCodesHashed = backupCodes.map((code) => ({
      hash: PasswordUtil.hashToken(code),
      used: false,
    }));

    // Store secret temporarily (not enabled until verified)
    await this.pool.query(
      `UPDATE users
       SET mfa_secret = $1,
           mfa_backup_codes = $2,
           updated_at = NOW()
       WHERE id = $3`,
      [secret.base32, JSON.stringify(backupCodesHashed), userId]
    );

    return {
      secret: secret.base32,
      qrCodeUrl,
      backupCodes,
      manualEntryKey: secret.base32,
    };
  }

  /**
   * Verify TOTP code and enable MFA
   * @param userId User ID
   * @param token TOTP token
   * @returns Success status
   */
  async enableMFA(userId: string, token: string): Promise<boolean> {
    // Get user's MFA secret
    const result = await this.pool.query('SELECT mfa_secret, mfa_enabled FROM users WHERE id = $1', [
      userId,
    ]);

    if (!result.rows[0]) {
      throw new Error('User not found');
    }

    if (result.rows[0].mfa_enabled) {
      throw new Error('MFA is already enabled');
    }

    const secret = result.rows[0].mfa_secret;
    if (!secret) {
      throw new Error('MFA setup not initiated. Please call setupMFA first');
    }

    // Verify token
    const verified = speakeasy.totp.verify({
      secret,
      encoding: 'base32',
      token,
      window: parseInt(process.env.TOTP_WINDOW || '1'),
    });

    if (!verified) {
      throw new Error('Invalid verification code');
    }

    // Enable MFA
    await this.pool.query(
      'UPDATE users SET mfa_enabled = TRUE, updated_at = NOW() WHERE id = $1',
      [userId]
    );

    return true;
  }

  /**
   * Disable MFA for user
   * @param userId User ID
   * @param token TOTP token or backup code
   * @returns Success status
   */
  async disableMFA(userId: string, token: string): Promise<boolean> {
    // Get user's MFA settings
    const result = await this.pool.query(
      'SELECT mfa_enabled, mfa_secret, mfa_backup_codes FROM users WHERE id = $1',
      [userId]
    );

    if (!result.rows[0]) {
      throw new Error('User not found');
    }

    if (!result.rows[0].mfa_enabled) {
      throw new Error('MFA is not enabled');
    }

    // Verify token (can be TOTP or backup code)
    const verified = await this.verifyMFAToken(userId, token);
    if (!verified) {
      throw new Error('Invalid verification code');
    }

    // Disable MFA
    await this.pool.query(
      `UPDATE users
       SET mfa_enabled = FALSE,
           mfa_secret = NULL,
           mfa_backup_codes = NULL,
           updated_at = NOW()
       WHERE id = $1`,
      [userId]
    );

    return true;
  }

  /**
   * Verify MFA token (TOTP or backup code)
   * @param userId User ID
   * @param token TOTP token or backup code
   * @returns Verification result
   */
  async verifyMFAToken(userId: string, token: string): Promise<boolean> {
    // Get user's MFA settings
    const result = await this.pool.query(
      'SELECT mfa_enabled, mfa_secret, mfa_backup_codes FROM users WHERE id = $1',
      [userId]
    );

    if (!result.rows[0]) {
      return false;
    }

    const { mfa_enabled, mfa_secret, mfa_backup_codes } = result.rows[0];

    if (!mfa_enabled || !mfa_secret) {
      return false;
    }

    // Try TOTP verification first
    const totpVerified = speakeasy.totp.verify({
      secret: mfa_secret,
      encoding: 'base32',
      token,
      window: parseInt(process.env.TOTP_WINDOW || '1'),
    });

    if (totpVerified) {
      return true;
    }

    // Try backup code verification
    if (mfa_backup_codes) {
      const backupCodes: BackupCode[] = JSON.parse(mfa_backup_codes);
      const tokenHash = PasswordUtil.hashToken(token);

      const matchingCode = backupCodes.find(
        (code: BackupCode) => code.hash === tokenHash && !code.used
      );

      if (matchingCode) {
        // Mark backup code as used
        matchingCode.used = true;
        await this.pool.query(
          'UPDATE users SET mfa_backup_codes = $1, updated_at = NOW() WHERE id = $2',
          [JSON.stringify(backupCodes), userId]
        );
        return true;
      }
    }

    return false;
  }

  /**
   * Check if user has MFA enabled
   * @param userId User ID
   * @returns MFA status
   */
  async isMFAEnabled(userId: string): Promise<boolean> {
    const result = await this.pool.query('SELECT mfa_enabled FROM users WHERE id = $1', [userId]);
    return result.rows[0]?.mfa_enabled || false;
  }

  /**
   * Regenerate backup codes
   * @param userId User ID
   * @param token TOTP token for verification
   * @returns New backup codes
   */
  async regenerateBackupCodes(userId: string, token: string): Promise<string[]> {
    // Verify current MFA token
    const verified = await this.verifyMFAToken(userId, token);
    if (!verified) {
      throw new Error('Invalid verification code');
    }

    // Generate new backup codes
    const backupCodes = this.generateBackupCodes(
      parseInt(process.env.BACKUP_CODES_COUNT || '10')
    );
    const backupCodesHashed = backupCodes.map((code) => ({
      hash: PasswordUtil.hashToken(code),
      used: false,
    }));

    // Update backup codes
    await this.pool.query(
      'UPDATE users SET mfa_backup_codes = $1, updated_at = NOW() WHERE id = $2',
      [JSON.stringify(backupCodesHashed), userId]
    );

    return backupCodes;
  }

  /**
   * Get remaining backup codes count
   * @param userId User ID
   * @returns Count of unused backup codes
   */
  async getBackupCodesCount(userId: string): Promise<{ total: number; used: number; remaining: number }> {
    const result = await this.pool.query('SELECT mfa_backup_codes FROM users WHERE id = $1', [
      userId,
    ]);

    if (!result.rows[0]?.mfa_backup_codes) {
      return { total: 0, used: 0, remaining: 0 };
    }

    const backupCodes: BackupCode[] = JSON.parse(result.rows[0].mfa_backup_codes);
    const used = backupCodes.filter((code) => code.used).length;
    const total = backupCodes.length;

    return {
      total,
      used,
      remaining: total - used,
    };
  }

  /**
   * Create MFA session for two-step login
   * @param userId User ID
   * @param ipAddress IP address
   * @param userAgent User agent
   * @returns Session token
   */
  async createMFASession(
    userId: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<string> {
    const sessionToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    await this.pool.query(
      `INSERT INTO mfa_sessions (user_id, session_token, expires_at, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5)`,
      [userId, sessionToken, expiresAt, ipAddress, userAgent]
    );

    return sessionToken;
  }

  /**
   * Verify MFA session and mark as verified
   * @param sessionToken Session token
   * @param userId User ID
   * @returns Success status
   */
  async verifyMFASession(sessionToken: string, userId: string): Promise<boolean> {
    const result = await this.pool.query(
      `UPDATE mfa_sessions
       SET verified = TRUE
       WHERE session_token = $1
       AND user_id = $2
       AND expires_at > NOW()
       AND verified = FALSE
       RETURNING id`,
      [sessionToken, userId]
    );

    return result.rows.length > 0;
  }

  /**
   * Check if MFA session is verified
   * @param sessionToken Session token
   * @returns Verification status
   */
  async isMFASessionVerified(sessionToken: string): Promise<boolean> {
    const result = await this.pool.query(
      `SELECT verified FROM mfa_sessions
       WHERE session_token = $1
       AND expires_at > NOW()`,
      [sessionToken]
    );

    return result.rows[0]?.verified || false;
  }

  /**
   * Delete MFA session
   * @param sessionToken Session token
   */
  async deleteMFASession(sessionToken: string): Promise<void> {
    await this.pool.query('DELETE FROM mfa_sessions WHERE session_token = $1', [sessionToken]);
  }

  /**
   * Clean up expired MFA sessions
   */
  async cleanupExpiredSessions(): Promise<number> {
    const result = await this.pool.query('DELETE FROM mfa_sessions WHERE expires_at < NOW()');
    return result.rowCount || 0;
  }

  /**
   * Generate backup codes
   * @param count Number of codes to generate
   * @returns Array of backup codes
   */
  private generateBackupCodes(count: number): string[] {
    const codes: string[] = [];

    for (let i = 0; i < count; i++) {
      // Generate 8-character alphanumeric code
      const code = crypto
        .randomBytes(4)
        .toString('hex')
        .toUpperCase()
        .match(/.{1,4}/g)!
        .join('-'); // Format: XXXX-XXXX
      codes.push(code);
    }

    return codes;
  }
}
