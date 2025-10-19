import { Pool } from 'pg';
import { PasswordUtil } from '../utils/password.util.js';
import { JWTUtil } from '../utils/jwt.util.js';
import emailService from './email.service.js';
import { securityConfig } from '../config/security.config.js';

export interface User {
  id: string;
  email: string;
  password_hash: string;
  first_name?: string;
  last_name?: string;
  email_verified: boolean;
  email_verification_token?: string;
  email_verification_expires?: Date;
  password_reset_token?: string;
  password_reset_expires?: Date;
  failed_login_attempts: number;
  account_locked_until?: Date;
  last_login?: Date;
  created_at: Date;
  updated_at: Date;
}

export interface RegisterData {
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
}

export interface LoginData {
  email: string;
  password: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface RefreshTokenData {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: Date;
  created_at: Date;
  last_used?: Date;
  ip_address?: string;
  user_agent?: string;
  device_fingerprint?: string;
}

/**
 * User service for authentication and user management
 */
export class UserService {
  private pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  /**
   * Register a new user
   * @param data Registration data
   * @returns User object
   */
  async register(data: RegisterData): Promise<User> {
    // Validate password strength
    const validation = PasswordUtil.validate(data.password);
    if (!validation.valid) {
      throw new Error(`Password validation failed: ${validation.errors.join(', ')}`);
    }

    // Check if user already exists
    const existingUser = await this.findByEmail(data.email);
    if (existingUser) {
      throw new Error('User with this email already exists');
    }

    // Hash password
    const passwordHash = await PasswordUtil.hash(data.password);

    // Generate email verification token
    const verificationToken = PasswordUtil.generateToken();
    const tokenHash = PasswordUtil.hashToken(verificationToken);
    const verificationExpires = new Date(Date.now() + securityConfig.email.verificationExpiry);

    // Create user
    const result = await this.pool.query(
      `INSERT INTO users (
        email,
        password_hash,
        first_name,
        last_name,
        email_verification_token,
        email_verification_expires
      ) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [
        data.email.toLowerCase(),
        passwordHash,
        data.firstName,
        data.lastName,
        tokenHash,
        verificationExpires,
      ]
    );

    const user = result.rows[0];

    // Send verification email
    try {
      await emailService.sendVerificationEmail({
        email: user.email,
        token: verificationToken,
        firstName: user.first_name,
      });
    } catch (error) {
      console.error('Failed to send verification email:', error);
      // Don't fail registration if email fails
    }

    return user;
  }

  /**
   * Login user
   * @param data Login data
   * @returns Token pair and user
   */
  async login(data: LoginData): Promise<{ tokens: TokenPair; user: Omit<User, 'password_hash'> }> {
    const user = await this.findByEmail(data.email);
    if (!user) {
      throw new Error('Invalid email or password');
    }

    // Check if account is locked
    if (user.account_locked_until && user.account_locked_until > new Date()) {
      const minutesLeft = Math.ceil((user.account_locked_until.getTime() - Date.now()) / 60000);
      throw new Error(`Account is locked. Try again in ${minutesLeft} minutes`);
    }

    // Verify password
    const isValid = await PasswordUtil.compare(data.password, user.password_hash);
    if (!isValid) {
      await this.handleFailedLogin(user.id);
      throw new Error('Invalid email or password');
    }

    // Check if email is verified
    if (!user.email_verified) {
      throw new Error('Please verify your email before logging in');
    }

    // Reset failed login attempts
    await this.pool.query(
      'UPDATE users SET failed_login_attempts = 0, account_locked_until = NULL, last_login = NOW() WHERE id = $1',
      [user.id]
    );

    // Generate tokens
    const tokens = await this.generateTokenPair(user, data.ipAddress, data.userAgent);

    // Remove sensitive data
    const { password_hash, ...userWithoutPassword } = user;

    return {
      tokens,
      user: userWithoutPassword,
    };
  }

  /**
   * Verify email with token
   * @param token Verification token
   */
  async verifyEmail(token: string): Promise<void> {
    const tokenHash = PasswordUtil.hashToken(token);

    const result = await this.pool.query(
      `UPDATE users
       SET email_verified = TRUE,
           email_verification_token = NULL,
           email_verification_expires = NULL,
           updated_at = NOW()
       WHERE email_verification_token = $1
       AND email_verification_expires > NOW()
       RETURNING id`,
      [tokenHash]
    );

    if (result.rows.length === 0) {
      throw new Error('Invalid or expired verification token');
    }
  }

  /**
   * Request password reset
   * @param email User email
   */
  async requestPasswordReset(email: string): Promise<void> {
    const user = await this.findByEmail(email);
    if (!user) {
      // Don't reveal if user exists
      return;
    }

    // Generate reset token
    const resetToken = PasswordUtil.generateToken();
    const tokenHash = PasswordUtil.hashToken(resetToken);
    const resetExpires = new Date(Date.now() + securityConfig.email.resetExpiry);

    // Save reset token
    await this.pool.query(
      `UPDATE users
       SET password_reset_token = $1,
           password_reset_expires = $2,
           updated_at = NOW()
       WHERE id = $3`,
      [tokenHash, resetExpires, user.id]
    );

    // Send reset email
    try {
      await emailService.sendPasswordResetEmail({
        email: user.email,
        token: resetToken,
        firstName: user.first_name,
      });
    } catch (error) {
      console.error('Failed to send password reset email:', error);
      throw new Error('Failed to send password reset email');
    }
  }

  /**
   * Reset password with token
   * @param token Reset token
   * @param newPassword New password
   */
  async resetPassword(token: string, newPassword: string): Promise<void> {
    // Validate password strength
    const validation = PasswordUtil.validate(newPassword);
    if (!validation.valid) {
      throw new Error(`Password validation failed: ${validation.errors.join(', ')}`);
    }

    const tokenHash = PasswordUtil.hashToken(token);

    // Find user with valid reset token
    const result = await this.pool.query(
      `SELECT id, email, first_name
       FROM users
       WHERE password_reset_token = $1
       AND password_reset_expires > NOW()`,
      [tokenHash]
    );

    if (result.rows.length === 0) {
      throw new Error('Invalid or expired reset token');
    }

    const user = result.rows[0];

    // Hash new password
    const passwordHash = await PasswordUtil.hash(newPassword);

    // Update password and clear reset token
    await this.pool.query(
      `UPDATE users
       SET password_hash = $1,
           password_reset_token = NULL,
           password_reset_expires = NULL,
           failed_login_attempts = 0,
           account_locked_until = NULL,
           updated_at = NOW()
       WHERE id = $2`,
      [passwordHash, user.id]
    );

    // Revoke all refresh tokens
    await this.pool.query('DELETE FROM refresh_tokens WHERE user_id = $1', [user.id]);

    // Send confirmation email
    try {
      await emailService.sendPasswordChangedEmail(user.email, user.first_name);
    } catch (error) {
      console.error('Failed to send password changed email:', error);
    }
  }

  /**
   * Change password (authenticated user)
   * @param userId User ID
   * @param currentPassword Current password
   * @param newPassword New password
   */
  async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
    const user = await this.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    // Verify current password
    const isValid = await PasswordUtil.compare(currentPassword, user.password_hash);
    if (!isValid) {
      throw new Error('Current password is incorrect');
    }

    // Validate new password strength
    const validation = PasswordUtil.validate(newPassword);
    if (!validation.valid) {
      throw new Error(`Password validation failed: ${validation.errors.join(', ')}`);
    }

    // Hash new password
    const passwordHash = await PasswordUtil.hash(newPassword);

    // Update password
    await this.pool.query(
      'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
      [passwordHash, userId]
    );

    // Revoke all refresh tokens except current session
    await this.pool.query('DELETE FROM refresh_tokens WHERE user_id = $1', [userId]);

    // Send confirmation email
    try {
      await emailService.sendPasswordChangedEmail(user.email, user.first_name);
    } catch (error) {
      console.error('Failed to send password changed email:', error);
    }
  }

  /**
   * Refresh access token
   * @param refreshToken Refresh token
   * @returns New token pair
   */
  async refreshAccessToken(refreshToken: string): Promise<TokenPair> {
    // Verify refresh token
    const payload = JWTUtil.verifyRefreshToken(refreshToken);
    if (!payload) {
      throw new Error('Invalid refresh token');
    }

    // Check if token exists in database
    const tokenHash = JWTUtil.hashToken(refreshToken);
    const result = await this.pool.query(
      'SELECT * FROM refresh_tokens WHERE token_hash = $1 AND expires_at > NOW()',
      [tokenHash]
    );

    if (result.rows.length === 0) {
      throw new Error('Refresh token not found or expired');
    }

    const tokenData: RefreshTokenData = result.rows[0];

    // Get user
    const user = await this.findById(tokenData.user_id);
    if (!user) {
      throw new Error('User not found');
    }

    // Update last used
    await this.pool.query(
      'UPDATE refresh_tokens SET last_used = NOW() WHERE id = $1',
      [tokenData.id]
    );

    // Generate new access token (keep same refresh token)
    const accessToken = JWTUtil.generateAccessToken({
      userId: user.id,
      email: user.email,
    });

    return {
      accessToken,
      refreshToken, // Return same refresh token
    };
  }

  /**
   * Logout user (revoke refresh token)
   * @param refreshToken Refresh token to revoke
   */
  async logout(refreshToken: string): Promise<void> {
    const tokenHash = JWTUtil.hashToken(refreshToken);
    await this.pool.query('DELETE FROM refresh_tokens WHERE token_hash = $1', [tokenHash]);
  }

  /**
   * Generate token pair
   * @param user User object
   * @param ipAddress IP address
   * @param userAgent User agent
   * @returns Token pair
   */
  private async generateTokenPair(
    user: User,
    ipAddress?: string,
    userAgent?: string
  ): Promise<TokenPair> {
    const accessToken = JWTUtil.generateAccessToken({
      userId: user.id,
      email: user.email,
    });

    const refreshToken = JWTUtil.generateRefreshToken({
      userId: user.id,
      email: user.email,
    });

    // Store refresh token
    const tokenHash = JWTUtil.hashToken(refreshToken);
    const expiresAt = new Date(Date.now() + this.parseExpiry(securityConfig.jwt.refreshExpiry));

    await this.pool.query(
      `INSERT INTO refresh_tokens (
        user_id,
        token_hash,
        expires_at,
        ip_address,
        user_agent
      ) VALUES ($1, $2, $3, $4, $5)`,
      [user.id, tokenHash, expiresAt, ipAddress, userAgent]
    );

    return {
      accessToken,
      refreshToken,
    };
  }

  /**
   * Handle failed login attempt
   * @param userId User ID
   */
  private async handleFailedLogin(userId: string): Promise<void> {
    const result = await this.pool.query(
      'UPDATE users SET failed_login_attempts = failed_login_attempts + 1 WHERE id = $1 RETURNING failed_login_attempts',
      [userId]
    );

    const attempts = result.rows[0].failed_login_attempts;

    if (attempts >= securityConfig.lockout.maxAttempts) {
      const lockUntil = new Date(Date.now() + securityConfig.lockout.duration);
      await this.pool.query(
        'UPDATE users SET account_locked_until = $1 WHERE id = $2',
        [lockUntil, userId]
      );
    }
  }

  /**
   * Find user by email
   * @param email User email
   * @returns User or null
   */
  async findByEmail(email: string): Promise<User | null> {
    const result = await this.pool.query('SELECT * FROM users WHERE email = $1', [
      email.toLowerCase(),
    ]);
    return result.rows[0] || null;
  }

  /**
   * Find user by ID
   * @param id User ID
   * @returns User or null
   */
  async findById(id: string): Promise<User | null> {
    const result = await this.pool.query('SELECT * FROM users WHERE id = $1', [id]);
    return result.rows[0] || null;
  }

  /**
   * Parse JWT expiry string to milliseconds
   * @param expiry Expiry string (e.g., '7d', '15m')
   * @returns Milliseconds
   */
  private parseExpiry(expiry: string): number {
    const unit = expiry.slice(-1);
    const value = parseInt(expiry.slice(0, -1));

    switch (unit) {
      case 's':
        return value * 1000;
      case 'm':
        return value * 60 * 1000;
      case 'h':
        return value * 60 * 60 * 1000;
      case 'd':
        return value * 24 * 60 * 60 * 1000;
      default:
        throw new Error(`Invalid expiry format: ${expiry}`);
    }
  }
}
