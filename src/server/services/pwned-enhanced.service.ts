import axios from 'axios';
import crypto from 'crypto';
import { getRedisCacheService } from './redis-cache.service.js';
import { AppLogger } from '../utils/logger.util.js';

/**
 * Enhanced Password Breach Detection Service with Redis Caching
 *
 * Features:
 * - HaveIBeenPwned API integration with k-anonymity
 * - Redis caching layer (30-day TTL)
 * - Cache invalidation strategies
 * - Password strength scoring
 * - Strong password generation
 * - Comprehensive feedback
 */

export interface PasswordCheckResult {
  isPwned: boolean;
  breachCount: number;
  cached: boolean;
}

export interface PasswordStrength {
  score: number;
  feedback: string[];
}

export interface ComprehensiveCheckResult {
  isPwned: boolean;
  breachCount: number;
  cached: boolean;
  strength: PasswordStrength;
  recommendation: string;
}

export class EnhancedPwnedPasswordService {
  private readonly API_URL = 'https://api.pwnedpasswords.com/range/';
  private readonly TIMEOUT = 5000; // 5 seconds
  private readonly CACHE_TTL = 86400 * 30; // 30 days
  private logger: AppLogger;
  private cacheService: ReturnType<typeof getRedisCacheService> | null = null;
  private cacheEnabled: boolean = false;

  constructor() {
    this.logger = AppLogger.getInstance();
  }

  /**
   * Initialize service with cache
   */
  async initialize(): Promise<void> {
    try {
      this.cacheService = getRedisCacheService();
      this.cacheEnabled = this.cacheService.isConnected();

      if (this.cacheEnabled) {
        await this.logger.info('Enhanced Pwned Password Service initialized with cache', {
          component: 'EnhancedPwnedPasswordService',
        });
      } else {
        await this.logger.warn('Cache not connected, running without cache', {
          component: 'EnhancedPwnedPasswordService',
        });
      }
    } catch (error) {
      await this.logger.warn('Failed to initialize cache, running without cache', {
        component: 'EnhancedPwnedPasswordService',
        error: error instanceof Error ? error.message : String(error),
      });
      this.cacheEnabled = false;
    }
  }

  /**
   * Hash password with SHA-1 (required by HIBP API)
   */
  private hashPassword(password: string): string {
    return crypto.createHash('sha1').update(password).digest('hex').toUpperCase();
  }

  /**
   * Check if password has been pwned (with caching)
   * @param password Password to check
   * @returns Password check result with cache status
   */
  async checkPassword(password: string): Promise<PasswordCheckResult> {
    try {
      // Hash password
      const hash = this.hashPassword(password);
      const prefix = hash.substring(0, 5);
      const suffix = hash.substring(5);

      // Try to get from cache first
      if (this.cacheEnabled && this.cacheService) {
        const cached = await this.cacheService.getCachedPasswordBreachResult(hash);

        if (cached !== null) {
          await this.logger.debug('Password breach check - cache hit', {
            component: 'EnhancedPwnedPasswordService',
            cached: true,
          });

          return {
            ...cached,
            cached: true,
          };
        }
      }

      // Cache miss - query HIBP API
      await this.logger.debug('Password breach check - cache miss, querying API', {
        component: 'EnhancedPwnedPasswordService',
      });

      const response = await axios.get(`${this.API_URL}${prefix}`, {
        timeout: this.TIMEOUT,
        headers: {
          'Add-Padding': 'true', // Request padded response for additional privacy
          'User-Agent': 'Website-Cloner-Pro-Security',
        },
      });

      // Parse response (format: "SUFFIX:COUNT\r\n")
      const hashes = response.data.split('\r\n');
      let result: PasswordCheckResult = {
        isPwned: false,
        breachCount: 0,
        cached: false,
      };

      for (const line of hashes) {
        if (!line) continue;

        const [hashSuffix, count] = line.split(':');
        if (hashSuffix === suffix) {
          const breachCount = parseInt(count, 10);
          result = {
            isPwned: true,
            breachCount,
            cached: false,
          };
          break;
        }
      }

      // Cache the result
      if (this.cacheEnabled && this.cacheService) {
        await this.cacheService.cachePasswordBreachResult(hash, {
          isPwned: result.isPwned,
          breachCount: result.breachCount,
        });

        await this.logger.debug('Password breach result cached', {
          component: 'EnhancedPwnedPasswordService',
          isPwned: result.isPwned,
        });
      }

      return result;
    } catch (error) {
      // If API is unavailable, fail open (allow password)
      await this.logger.error('HIBP API error', {
        component: 'EnhancedPwnedPasswordService',
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        isPwned: false,
        breachCount: 0,
        cached: false,
      };
    }
  }

  /**
   * Check multiple passwords in batch
   * @param passwords Array of passwords to check
   * @returns Array of results
   */
  async checkPasswordsBatch(passwords: string[]): Promise<PasswordCheckResult[]> {
    const results = await Promise.all(passwords.map((pwd) => this.checkPassword(pwd)));
    return results;
  }

  /**
   * Get password strength score
   * @param password Password to score
   * @returns Score from 0-100 with feedback
   */
  getPasswordStrength(password: string): PasswordStrength {
    let score = 0;
    const feedback: string[] = [];

    // Length scoring (max 40 points)
    if (password.length >= 12) {
      score += 20;
    } else if (password.length >= 8) {
      score += 10;
      feedback.push('Password could be longer');
    } else {
      feedback.push('Password is too short (minimum 8 characters)');
    }

    if (password.length >= 16) {
      score += 10;
    }

    if (password.length >= 20) {
      score += 10;
    }

    // Character variety (max 40 points)
    if (/[a-z]/.test(password)) {
      score += 10;
    } else {
      feedback.push('Add lowercase letters');
    }

    if (/[A-Z]/.test(password)) {
      score += 10;
    } else {
      feedback.push('Add uppercase letters');
    }

    if (/\d/.test(password)) {
      score += 10;
    } else {
      feedback.push('Add numbers');
    }

    if (/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
      score += 10;
    } else {
      feedback.push('Add special characters');
    }

    // Entropy (max 20 points)
    const uniqueChars = new Set(password).size;
    const entropyScore = Math.min((uniqueChars / password.length) * 20, 20);
    score += entropyScore;

    if (entropyScore < 10) {
      feedback.push('Password has too many repeated characters');
    }

    // Deductions
    // Common patterns
    if (/(.)\1{2,}/.test(password)) {
      score -= 10;
      feedback.push('Avoid repeated characters (e.g., "aaa", "111")');
    }

    if (/^[0-9]+$/.test(password)) {
      score -= 20;
      feedback.push('Password is only numbers - add letters and special characters');
    }

    if (/^[a-zA-Z]+$/.test(password)) {
      score -= 10;
      feedback.push('Password is only letters - add numbers or special characters');
    }

    // Sequential characters
    if (/abc|bcd|cde|def|123|234|345|456|789/.test(password.toLowerCase())) {
      score -= 10;
      feedback.push('Avoid sequential characters (e.g., "abc", "123")');
    }

    // Common words and patterns
    const commonWords = [
      'password',
      'admin',
      'user',
      'login',
      'welcome',
      '123456',
      'qwerty',
      'letmein',
      'monkey',
      'dragon',
    ];

    for (const word of commonWords) {
      if (password.toLowerCase().includes(word)) {
        score -= 20;
        feedback.push(`Avoid common words like "${word}"`);
        break;
      }
    }

    // Keyboard patterns
    if (/qwerty|asdfgh|zxcvbn/.test(password.toLowerCase())) {
      score -= 15;
      feedback.push('Avoid keyboard patterns');
    }

    // Ensure score is between 0-100
    score = Math.max(0, Math.min(100, score));

    if (score >= 80 && feedback.length === 0) {
      feedback.push('Strong password!');
    } else if (score >= 60 && feedback.length === 0) {
      feedback.push('Good password, but could be stronger');
    }

    return { score, feedback };
  }

  /**
   * Check password and provide comprehensive feedback
   * @param password Password to check
   * @returns Comprehensive check result
   */
  async checkPasswordComprehensive(password: string): Promise<ComprehensiveCheckResult> {
    const [pwnedResult, strengthResult] = await Promise.all([
      this.checkPassword(password),
      Promise.resolve(this.getPasswordStrength(password)),
    ]);

    let recommendation = '';

    if (pwnedResult.isPwned) {
      if (pwnedResult.breachCount > 100000) {
        recommendation =
          '🚨 CRITICAL: This password has been compromised in over 100,000 data breaches. DO NOT USE IT under any circumstances.';
      } else if (pwnedResult.breachCount > 10000) {
        recommendation =
          '⚠️ WARNING: This password has been compromised in many data breaches. Strongly recommend using a different password.';
      } else if (pwnedResult.breachCount > 1000) {
        recommendation =
          '⚠️ This password has been found in multiple data breaches. We recommend using a different password.';
      } else {
        recommendation =
          'ℹ️ This password has been found in data breaches. Consider using a different password for better security.';
      }
    } else if (strengthResult.score < 50) {
      recommendation =
        '⚠️ While this password has not been found in breaches, it is weak. Consider using a stronger password with more variety.';
    } else if (strengthResult.score < 80) {
      recommendation =
        '✓ Password is acceptable but could be stronger. Consider adding more length or character variety.';
    } else {
      recommendation =
        '✅ Excellent! Password is strong and has not been found in data breaches.';
    }

    // Add cache status to recommendation
    if (pwnedResult.cached) {
      recommendation += ' (Result from cache)';
    }

    return {
      isPwned: pwnedResult.isPwned,
      breachCount: pwnedResult.breachCount,
      cached: pwnedResult.cached,
      strength: strengthResult,
      recommendation,
    };
  }

  /**
   * Generate strong password
   * @param length Password length (default 16)
   * @param options Generation options
   * @returns Generated password
   */
  generateStrongPassword(
    length: number = 16,
    options?: {
      includeLowercase?: boolean;
      includeUppercase?: boolean;
      includeNumbers?: boolean;
      includeSpecial?: boolean;
      excludeSimilar?: boolean; // Exclude similar characters (0, O, l, 1, etc.)
    }
  ): string {
    const opts = {
      includeLowercase: true,
      includeUppercase: true,
      includeNumbers: true,
      includeSpecial: true,
      excludeSimilar: false,
      ...options,
    };

    let lowercase = 'abcdefghijklmnopqrstuvwxyz';
    let uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let numbers = '0123456789';
    let special = '!@#$%^&*()_+-=[]{}|;:,.<>?';

    if (opts.excludeSimilar) {
      lowercase = lowercase.replace(/[lo]/g, '');
      uppercase = uppercase.replace(/[IO]/g, '');
      numbers = numbers.replace(/[01]/g, '');
    }

    let allChars = '';
    let password = '';

    // Ensure at least one character from each enabled category
    if (opts.includeLowercase) {
      allChars += lowercase;
      password += lowercase[Math.floor(Math.random() * lowercase.length)];
    }

    if (opts.includeUppercase) {
      allChars += uppercase;
      password += uppercase[Math.floor(Math.random() * uppercase.length)];
    }

    if (opts.includeNumbers) {
      allChars += numbers;
      password += numbers[Math.floor(Math.random() * numbers.length)];
    }

    if (opts.includeSpecial) {
      allChars += special;
      password += special[Math.floor(Math.random() * special.length)];
    }

    // Fill the rest with random characters
    for (let i = password.length; i < length; i++) {
      const randomIndex = Math.floor(Math.random() * allChars.length);
      password += allChars[randomIndex];
    }

    // Shuffle password using Fisher-Yates algorithm
    const arr = password.split('');
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }

    return arr.join('');
  }

  /**
   * Invalidate password breach cache
   * Useful after HIBP database updates
   */
  async invalidateCache(): Promise<number> {
    if (!this.cacheEnabled || !this.cacheService) {
      return 0;
    }

    try {
      const count = await this.cacheService.invalidatePasswordBreachCache();

      await this.logger.info('Password breach cache invalidated', {
        component: 'EnhancedPwnedPasswordService',
        count,
      });

      return count;
    } catch (error) {
      await this.logger.error('Failed to invalidate cache', {
        component: 'EnhancedPwnedPasswordService',
        error: error instanceof Error ? error.message : String(error),
      });
      return 0;
    }
  }

  /**
   * Get cache statistics for password breach checks
   */
  async getCacheStats(): Promise<{
    enabled: boolean;
    totalKeys?: number;
    hitRate?: number;
  }> {
    if (!this.cacheEnabled || !this.cacheService) {
      return { enabled: false };
    }

    try {
      const stats = await this.cacheService.getStats();

      return {
        enabled: true,
        totalKeys: stats.keys,
        hitRate: stats.hitRate,
      };
    } catch (error) {
      await this.logger.error('Failed to get cache stats', {
        component: 'EnhancedPwnedPasswordService',
        error: error instanceof Error ? error.message : String(error),
      });

      return { enabled: true };
    }
  }

  /**
   * Warm up cache with common passwords
   * Pre-cache known breached passwords
   */
  async warmUpCache(commonPasswords: string[]): Promise<number> {
    if (!this.cacheEnabled) {
      return 0;
    }

    let cached = 0;
    for (const password of commonPasswords) {
      try {
        await this.checkPassword(password);
        cached++;
      } catch (error) {
        // Continue on error
      }
    }

    await this.logger.info('Cache warmed up', {
      component: 'EnhancedPwnedPasswordService',
      count: cached,
    });

    return cached;
  }
}

// Singleton instance
let enhancedPwnedServiceInstance: EnhancedPwnedPasswordService | null = null;

export async function initializeEnhancedPwnedService(): Promise<EnhancedPwnedPasswordService> {
  if (!enhancedPwnedServiceInstance) {
    enhancedPwnedServiceInstance = new EnhancedPwnedPasswordService();
    await enhancedPwnedServiceInstance.initialize();
  }
  return enhancedPwnedServiceInstance;
}

export function getEnhancedPwnedService(): EnhancedPwnedPasswordService {
  if (!enhancedPwnedServiceInstance) {
    throw new Error(
      'EnhancedPwnedPasswordService not initialized. Call initializeEnhancedPwnedService first.'
    );
  }
  return enhancedPwnedServiceInstance;
}

export default EnhancedPwnedPasswordService;
