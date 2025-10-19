import { Pool } from 'pg';
import { AppLogger } from '../utils/logger.util.js';
import { RedisCacheService } from './redis-cache.service.js';

/**
 * Credit Management Service
 *
 * Manages credit operations for GHL cloning features:
 * - Credit balance tracking
 * - Credit consumption with race condition protection
 * - Credit purchases and additions
 * - Transaction history
 * - Subscription credit management
 * - Redis caching for performance
 *
 * Features:
 * - Atomic credit operations via database functions
 * - FOR UPDATE locking to prevent race conditions
 * - Redis caching for balance lookups
 * - Comprehensive transaction logging
 * - Subscription credit refresh support
 */

export interface CreditBalance {
  userId: string;
  creditsAvailable: number;
  creditsUsed: number;
  subscriptionType: string;
  subscriptionStatus: string;
  subscriptionCreditsPerMonth: number;
  lastRefreshDate?: Date;
  nextRefreshDate?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreditTransaction {
  id: string;
  userId: string;
  transactionType: 'purchase' | 'consumption' | 'refund' | 'subscription_refresh' | 'admin_adjustment' | 'bonus';
  creditsChange: number;
  creditsBefore: number;
  creditsAfter: number;
  description?: string;
  referenceType?: string;
  referenceId?: string;
  amountUsd?: number;
  stripePaymentIntentId?: string;
  stripeSubscriptionId?: string;
  metadata?: Record<string, any>;
  createdAt: Date;
}

export interface CreditPackage {
  id: string;
  name: string;
  credits: number;
  priceUsd: number;
  pricePerCredit: number;
  packageType: 'one_time' | 'subscription';
  isActive: boolean;
  description?: string;
  features?: string[];
  stripePriceId?: string;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ConsumeCreditsResult {
  success: boolean;
  creditsBefore: number;
  creditsAfter: number;
  transactionId: string;
}

export interface AddCreditsResult {
  success: boolean;
  creditsBefore: number;
  creditsAfter: number;
  transactionId: string;
}

export interface CreditStatistics {
  totalClones: number;
  totalCreditsUsed: number;
  totalCreditsRemaining: number;
  averageCreditsPerClone: number;
  totalSpentUsd: number;
  clonesByPeriod: Array<{ period: string; count: number; credits: number }>;
  topOperations: Array<{ operation: string; count: number; credits: number }>;
}

export class CreditService {
  private pool: Pool;
  private logger: AppLogger;
  private cache: RedisCacheService;
  private readonly CACHE_TTL = 300; // 5 minutes
  private readonly CACHE_NAMESPACE = 'credits';

  constructor(pool: Pool, cache: RedisCacheService) {
    this.pool = pool;
    this.cache = cache;
    this.logger = AppLogger.getInstance();
  }

  /**
   * Get user's credit balance
   * Cached for performance
   */
  async getBalance(userId: string): Promise<CreditBalance | null> {
    try {
      // Try cache first
      const cacheKey = `balance:${userId}`;
      const cached = await this.cache.get<CreditBalance>(cacheKey, {
        namespace: this.CACHE_NAMESPACE,
      });

      if (cached) {
        this.logger.debug('Credit balance cache hit', {
          component: 'CreditService',
          userId,
        });
        return cached;
      }

      // Query database
      const result = await this.pool.query(
        `SELECT
          user_id as "userId",
          credits_available as "creditsAvailable",
          credits_used as "creditsUsed",
          subscription_type as "subscriptionType",
          subscription_status as "subscriptionStatus",
          subscription_credits_per_month as "subscriptionCreditsPerMonth",
          last_refresh_date as "lastRefreshDate",
          next_refresh_date as "nextRefreshDate",
          created_at as "createdAt",
          updated_at as "updatedAt"
        FROM credits
        WHERE user_id = $1`,
        [userId]
      );

      if (result.rows.length === 0) {
        return null;
      }

      const balance = result.rows[0] as CreditBalance;

      // Cache the result
      await this.cache.set(cacheKey, balance, {
        ttl: this.CACHE_TTL,
        namespace: this.CACHE_NAMESPACE,
      });

      return balance;
    } catch (error) {
      this.logger.error('Failed to get credit balance', {
        component: 'CreditService',
        userId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Check if user has sufficient credits
   * Cached for performance
   */
  async hasCredits(userId: string, requiredCredits: number): Promise<boolean> {
    try {
      const balance = await this.getBalance(userId);
      return balance !== null && balance.creditsAvailable >= requiredCredits;
    } catch (error) {
      this.logger.error('Failed to check credit availability', {
        component: 'CreditService',
        userId,
        requiredCredits,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * Consume credits for an operation
   * Uses database function with FOR UPDATE locking to prevent race conditions
   * Invalidates cache on success
   */
  async consumeCredits(
    userId: string,
    credits: number,
    metadata?: {
      operation?: string;
      resourceType?: string;
      resourceId?: string;
      description?: string;
      [key: string]: any;
    }
  ): Promise<ConsumeCreditsResult> {
    try {
      this.logger.info('Consuming credits', {
        component: 'CreditService',
        userId,
        credits,
        metadata,
      });

      // Call database function that handles locking and transaction
      const result = await this.pool.query(
        `SELECT * FROM consume_credits($1, $2, $3::jsonb)`,
        [userId, credits, JSON.stringify(metadata || {})]
      );

      const row = result.rows[0];
      const consumeResult: ConsumeCreditsResult = {
        success: row.success,
        creditsBefore: row.credits_before,
        creditsAfter: row.credits_after,
        transactionId: row.transaction_id,
      };

      if (consumeResult.success) {
        // Invalidate cache
        await this.invalidateUserCache(userId);

        this.logger.info('Credits consumed successfully', {
          component: 'CreditService',
          userId,
          credits,
          transactionId: consumeResult.transactionId,
          creditsBefore: consumeResult.creditsBefore,
          creditsAfter: consumeResult.creditsAfter,
        });
      }

      return consumeResult;
    } catch (error) {
      this.logger.error('Failed to consume credits', {
        component: 'CreditService',
        userId,
        credits,
        error: error instanceof Error ? error.message : String(error),
      });

      // Check if it's an insufficient credits error
      if (error instanceof Error && error.message.includes('Insufficient credits')) {
        // Return unsuccessful result instead of throwing
        const balance = await this.getBalance(userId);
        return {
          success: false,
          creditsBefore: balance?.creditsAvailable || 0,
          creditsAfter: balance?.creditsAvailable || 0,
          transactionId: '',
        };
      }

      throw error;
    }
  }

  /**
   * Add credits to user account
   * Uses database function for transaction safety
   * Invalidates cache on success
   */
  async addCredits(
    userId: string,
    credits: number,
    transactionType: 'purchase' | 'refund' | 'subscription_refresh' | 'admin_adjustment' | 'bonus',
    amountUsd?: number,
    stripePaymentIntentId?: string,
    stripeSubscriptionId?: string,
    referenceId?: string,
    description?: string,
    metadata?: Record<string, any>
  ): Promise<AddCreditsResult> {
    try {
      this.logger.info('Adding credits', {
        component: 'CreditService',
        userId,
        credits,
        transactionType,
        amountUsd,
      });

      // Call database function
      const result = await this.pool.query(
        `SELECT * FROM add_credits($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)`,
        [
          userId,
          credits,
          transactionType,
          amountUsd || null,
          stripePaymentIntentId || null,
          stripeSubscriptionId || null,
          referenceId || null,
          description || null,
          JSON.stringify(metadata || {}),
        ]
      );

      const row = result.rows[0];
      const addResult: AddCreditsResult = {
        success: row.success,
        creditsBefore: row.credits_before,
        creditsAfter: row.credits_after,
        transactionId: row.transaction_id,
      };

      if (addResult.success) {
        // Invalidate cache
        await this.invalidateUserCache(userId);

        this.logger.info('Credits added successfully', {
          component: 'CreditService',
          userId,
          credits,
          transactionId: addResult.transactionId,
          creditsBefore: addResult.creditsBefore,
          creditsAfter: addResult.creditsAfter,
        });
      }

      return addResult;
    } catch (error) {
      this.logger.error('Failed to add credits', {
        component: 'CreditService',
        userId,
        credits,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Get user's credit transaction history
   * Supports pagination
   */
  async getTransactions(
    userId: string,
    limit: number = 50,
    offset: number = 0
  ): Promise<{ transactions: CreditTransaction[]; total: number }> {
    try {
      // Call database function
      const result = await this.pool.query(
        `SELECT * FROM get_credit_transactions($1, $2, $3)`,
        [userId, limit, offset]
      );

      const transactions = result.rows.map((row) => ({
        id: row.id,
        userId: row.user_id,
        transactionType: row.transaction_type,
        creditsChange: row.credits_change,
        creditsBefore: row.credits_before,
        creditsAfter: row.credits_after,
        description: row.description,
        referenceType: row.reference_type,
        referenceId: row.reference_id,
        amountUsd: row.amount_usd ? parseFloat(row.amount_usd) : undefined,
        stripePaymentIntentId: row.stripe_payment_intent_id,
        stripeSubscriptionId: row.stripe_subscription_id,
        metadata: row.metadata,
        createdAt: row.created_at,
      }));

      // Get total count
      const countResult = await this.pool.query(
        `SELECT COUNT(*) as total FROM credit_transactions WHERE user_id = $1`,
        [userId]
      );
      const total = parseInt(countResult.rows[0].total);

      return { transactions, total };
    } catch (error) {
      this.logger.error('Failed to get credit transactions', {
        component: 'CreditService',
        userId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Get credit statistics for user
   */
  async getStatistics(
    userId: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<CreditStatistics> {
    try {
      // Call database function
      const result = await this.pool.query(
        `SELECT * FROM get_credit_statistics($1, $2, $3)`,
        [userId, startDate || null, endDate || null]
      );

      const row = result.rows[0];
      return {
        totalClones: parseInt(row.total_clones) || 0,
        totalCreditsUsed: parseInt(row.total_credits_used) || 0,
        totalCreditsRemaining: parseInt(row.total_credits_remaining) || 0,
        averageCreditsPerClone: parseFloat(row.average_credits_per_clone) || 0,
        totalSpentUsd: parseFloat(row.total_spent_usd) || 0,
        clonesByPeriod: row.clones_by_period || [],
        topOperations: row.top_operations || [],
      };
    } catch (error) {
      this.logger.error('Failed to get credit statistics', {
        component: 'CreditService',
        userId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Initialize credits for new user
   * Creates credit record with starting balance
   */
  async initializeUserCredits(userId: string, startingCredits: number = 0): Promise<boolean> {
    try {
      // Call database function
      const result = await this.pool.query(
        `SELECT initialize_user_credits($1, $2) as success`,
        [userId, startingCredits]
      );

      const success = result.rows[0].success;

      if (success) {
        this.logger.info('User credits initialized', {
          component: 'CreditService',
          userId,
          startingCredits,
        });

        // Invalidate cache
        await this.invalidateUserCache(userId);
      }

      return success;
    } catch (error) {
      this.logger.error('Failed to initialize user credits', {
        component: 'CreditService',
        userId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Get all available credit packages
   * Cached for performance
   */
  async getCreditPackages(packageType?: 'one_time' | 'subscription'): Promise<CreditPackage[]> {
    try {
      const cacheKey = `packages:${packageType || 'all'}`;
      const cached = await this.cache.get<CreditPackage[]>(cacheKey, {
        namespace: this.CACHE_NAMESPACE,
      });

      if (cached) {
        return cached;
      }

      let query = `
        SELECT
          id,
          name,
          credits,
          price_usd as "priceUsd",
          price_per_credit as "pricePerCredit",
          package_type as "packageType",
          is_active as "isActive",
          description,
          features,
          stripe_price_id as "stripePriceId",
          sort_order as "sortOrder",
          created_at as "createdAt",
          updated_at as "updatedAt"
        FROM credit_packages
        WHERE is_active = true
      `;

      const params: any[] = [];
      if (packageType) {
        query += ` AND package_type = $1`;
        params.push(packageType);
      }

      query += ` ORDER BY sort_order ASC`;

      const result = await this.pool.query(query, params);
      const packages = result.rows as CreditPackage[];

      // Cache for 1 hour
      await this.cache.set(cacheKey, packages, {
        ttl: 3600,
        namespace: this.CACHE_NAMESPACE,
      });

      return packages;
    } catch (error) {
      this.logger.error('Failed to get credit packages', {
        component: 'CreditService',
        packageType,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Get credit package by ID
   */
  async getCreditPackageById(packageId: string): Promise<CreditPackage | null> {
    try {
      const result = await this.pool.query(
        `SELECT
          id,
          name,
          credits,
          price_usd as "priceUsd",
          price_per_credit as "pricePerCredit",
          package_type as "packageType",
          is_active as "isActive",
          description,
          features,
          stripe_price_id as "stripePriceId",
          sort_order as "sortOrder",
          created_at as "createdAt",
          updated_at as "updatedAt"
        FROM credit_packages
        WHERE id = $1`,
        [packageId]
      );

      return result.rows.length > 0 ? (result.rows[0] as CreditPackage) : null;
    } catch (error) {
      this.logger.error('Failed to get credit package by ID', {
        component: 'CreditService',
        packageId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Get credit package by Stripe Price ID
   */
  async getCreditPackageByStripePriceId(stripePriceId: string): Promise<CreditPackage | null> {
    try {
      const result = await this.pool.query(
        `SELECT
          id,
          name,
          credits,
          price_usd as "priceUsd",
          price_per_credit as "pricePerCredit",
          package_type as "packageType",
          is_active as "isActive",
          description,
          features,
          stripe_price_id as "stripePriceId",
          sort_order as "sortOrder",
          created_at as "createdAt",
          updated_at as "updatedAt"
        FROM credit_packages
        WHERE stripe_price_id = $1 AND is_active = true`,
        [stripePriceId]
      );

      return result.rows.length > 0 ? (result.rows[0] as CreditPackage) : null;
    } catch (error) {
      this.logger.error('Failed to get credit package by Stripe Price ID', {
        component: 'CreditService',
        stripePriceId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Update subscription info for user
   * Used when subscription is created/updated via Stripe
   */
  async updateSubscription(
    userId: string,
    subscriptionType: string,
    subscriptionStatus: string,
    creditsPerMonth: number
  ): Promise<void> {
    try {
      await this.pool.query(
        `UPDATE credits
        SET
          subscription_type = $2,
          subscription_status = $3,
          subscription_credits_per_month = $4,
          updated_at = CURRENT_TIMESTAMP
        WHERE user_id = $1`,
        [userId, subscriptionType, subscriptionStatus, creditsPerMonth]
      );

      // Invalidate cache
      await this.invalidateUserCache(userId);

      this.logger.info('Subscription updated', {
        component: 'CreditService',
        userId,
        subscriptionType,
        subscriptionStatus,
        creditsPerMonth,
      });
    } catch (error) {
      this.logger.error('Failed to update subscription', {
        component: 'CreditService',
        userId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Invalidate user's credit cache
   */
  async invalidateUserCache(userId: string): Promise<void> {
    try {
      await this.cache.delete(`balance:${userId}`, {
        namespace: this.CACHE_NAMESPACE,
      });

      this.logger.debug('Credit cache invalidated', {
        component: 'CreditService',
        userId,
      });
    } catch (error) {
      this.logger.warn('Failed to invalidate credit cache', {
        component: 'CreditService',
        userId,
        error: error instanceof Error ? error.message : String(error),
      });
      // Don't throw - cache invalidation failure is not critical
    }
  }

  /**
   * Invalidate all credit caches
   */
  async invalidateAllCaches(): Promise<void> {
    try {
      const count = await this.cache.clearNamespace(this.CACHE_NAMESPACE);
      this.logger.info('All credit caches invalidated', {
        component: 'CreditService',
        count,
      });
    } catch (error) {
      this.logger.warn('Failed to invalidate all credit caches', {
        component: 'CreditService',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Admin: Get all users with credit balances
   * For admin dashboard
   */
  async getAllUserBalances(
    limit: number = 50,
    offset: number = 0
  ): Promise<{ balances: CreditBalance[]; total: number }> {
    try {
      // Get total count
      const countResult = await this.pool.query(`SELECT COUNT(*) as total FROM credits`);
      const total = parseInt(countResult.rows[0].total);

      // Get balances
      const result = await this.pool.query(
        `SELECT
          user_id as "userId",
          credits_available as "creditsAvailable",
          credits_used as "creditsUsed",
          subscription_type as "subscriptionType",
          subscription_status as "subscriptionStatus",
          subscription_credits_per_month as "subscriptionCreditsPerMonth",
          last_refresh_date as "lastRefreshDate",
          next_refresh_date as "nextRefreshDate",
          created_at as "createdAt",
          updated_at as "updatedAt"
        FROM credits
        ORDER BY updated_at DESC
        LIMIT $1 OFFSET $2`,
        [limit, offset]
      );

      return {
        balances: result.rows as CreditBalance[],
        total,
      };
    } catch (error) {
      this.logger.error('Failed to get all user balances', {
        component: 'CreditService',
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Admin: Adjust user credits
   * For admin credit management
   */
  async adminAdjustCredits(
    userId: string,
    creditsChange: number,
    reason: string,
    adminUserId: string
  ): Promise<AddCreditsResult> {
    try {
      this.logger.info('Admin adjusting credits', {
        component: 'CreditService',
        userId,
        creditsChange,
        reason,
        adminUserId,
      });

      return await this.addCredits(
        userId,
        creditsChange,
        'admin_adjustment',
        undefined,
        undefined,
        undefined,
        adminUserId,
        reason,
        {
          adminUserId,
          adjustmentReason: reason,
        }
      );
    } catch (error) {
      this.logger.error('Failed to admin adjust credits', {
        component: 'CreditService',
        userId,
        creditsChange,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }
}

export default CreditService;
