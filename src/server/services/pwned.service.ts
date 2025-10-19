import axios from 'axios';
import crypto from 'crypto';

/**
 * Password Breach Detection Service
 * Uses HaveIBeenPwned API with k-anonymity model
 */

export class PwnedPasswordService {
  private readonly API_URL = 'https://api.pwnedpasswords.com/range/';
  private readonly TIMEOUT = 5000; // 5 seconds

  /**
   * Check if password has been pwned
   * Uses k-anonymity: only sends first 5 chars of SHA-1 hash
   * @param password Password to check
   * @returns Number of times password has been breached (0 if not pwned)
   */
  async checkPassword(password: string): Promise<{ isPwned: boolean; breachCount: number }> {
    try {
      // Hash password with SHA-1
      const hash = crypto.createHash('sha1').update(password).digest('hex').toUpperCase();

      // Split into prefix (first 5 chars) and suffix (remaining)
      const prefix = hash.substring(0, 5);
      const suffix = hash.substring(5);

      // Query API with prefix only (k-anonymity)
      const response = await axios.get(`${this.API_URL}${prefix}`, {
        timeout: this.TIMEOUT,
        headers: {
          'Add-Padding': 'true', // Request padded response for additional privacy
          'User-Agent': 'Website-Cloner-Pro-Security',
        },
      });

      // Parse response (format: "SUFFIX:COUNT\r\n")
      const hashes = response.data.split('\r\n');

      for (const line of hashes) {
        const [hashSuffix, count] = line.split(':');
        if (hashSuffix === suffix) {
          const breachCount = parseInt(count, 10);
          return {
            isPwned: true,
            breachCount,
          };
        }
      }

      // Password not found in breached database
      return {
        isPwned: false,
        breachCount: 0,
      };
    } catch (error) {
      // If API is unavailable, fail open (allow password)
      console.error('HIBP API error:', error);
      return {
        isPwned: false,
        breachCount: 0,
      };
    }
  }

  /**
   * Get password strength score
   * @param password Password to score
   * @returns Score from 0-100
   */
  getPasswordStrength(password: string): {
    score: number;
    feedback: string[];
  } {
    let score = 0;
    const feedback: string[] = [];

    // Length scoring (max 40 points)
    if (password.length >= 12) {
      score += 20;
    } else if (password.length >= 8) {
      score += 10;
      feedback.push('Password could be longer');
    } else {
      feedback.push('Password is too short');
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
      feedback.push('Avoid repeated characters');
    }

    if (/^[0-9]+$/.test(password)) {
      score -= 20;
      feedback.push('Password is only numbers');
    }

    if (/^[a-zA-Z]+$/.test(password)) {
      score -= 10;
      feedback.push('Add numbers or special characters');
    }

    // Sequential characters
    if (/abc|bcd|cde|def|123|234|345|456/.test(password.toLowerCase())) {
      score -= 10;
      feedback.push('Avoid sequential characters');
    }

    // Common words
    const commonWords = ['password', 'admin', 'user', 'login', 'welcome', '123456', 'qwerty'];
    for (const word of commonWords) {
      if (password.toLowerCase().includes(word)) {
        score -= 20;
        feedback.push('Avoid common words');
        break;
      }
    }

    // Ensure score is between 0-100
    score = Math.max(0, Math.min(100, score));

    if (score >= 80 && feedback.length === 0) {
      feedback.push('Strong password');
    }

    return { score, feedback };
  }

  /**
   * Check password and provide comprehensive feedback
   * @param password Password to check
   * @returns Comprehensive check result
   */
  async checkPasswordComprehensive(password: string): Promise<{
    isPwned: boolean;
    breachCount: number;
    strength: { score: number; feedback: string[] };
    recommendation: string;
  }> {
    const [pwnedResult, strengthResult] = await Promise.all([
      this.checkPassword(password),
      Promise.resolve(this.getPasswordStrength(password)),
    ]);

    let recommendation = '';

    if (pwnedResult.isPwned) {
      if (pwnedResult.breachCount > 100000) {
        recommendation =
          'This password has been compromised in many data breaches. DO NOT USE IT.';
      } else if (pwnedResult.breachCount > 10000) {
        recommendation =
          'This password has been compromised in data breaches. Consider using a different password.';
      } else {
        recommendation =
          'This password has been found in data breaches. We recommend using a different password.';
      }
    } else if (strengthResult.score < 50) {
      recommendation =
        'While this password has not been found in breaches, it is weak. Consider using a stronger password.';
    } else if (strengthResult.score < 80) {
      recommendation = 'Password is acceptable but could be stronger.';
    } else {
      recommendation = 'Password is strong and has not been found in data breaches.';
    }

    return {
      ...pwnedResult,
      strength: strengthResult,
      recommendation,
    };
  }

  /**
   * Generate strong password
   * @param length Password length
   * @returns Generated password
   */
  generateStrongPassword(length: number = 16): string {
    const lowercase = 'abcdefghijklmnopqrstuvwxyz';
    const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const numbers = '0123456789';
    const special = '!@#$%^&*()_+-=[]{}|;:,.<>?';

    const allChars = lowercase + uppercase + numbers + special;

    let password = '';

    // Ensure at least one character from each category
    password += lowercase[Math.floor(Math.random() * lowercase.length)];
    password += uppercase[Math.floor(Math.random() * uppercase.length)];
    password += numbers[Math.floor(Math.random() * numbers.length)];
    password += special[Math.floor(Math.random() * special.length)];

    // Fill the rest with random characters
    for (let i = password.length; i < length; i++) {
      const randomIndex = Math.floor(Math.random() * allChars.length);
      password += allChars[randomIndex];
    }

    // Shuffle password
    return password
      .split('')
      .sort(() => Math.random() - 0.5)
      .join('');
  }
}

export default new PwnedPasswordService();
