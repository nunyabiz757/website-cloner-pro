import { Pool, PoolConfig } from 'pg';
import { AppLogger } from './logger.service.js';
import cron from 'node-cron';

/**
 * Database Connection Pool Monitoring Service
 * Monitors pool health, connections, and performance
 */

export interface PoolMonitorConfig {
  warningThreshold: number; // Connection utilization % to trigger warning
  criticalThreshold: number; // Connection utilization % to trigger alert
  checkInterval: number; // Interval in minutes to check pool health
  logMetrics: boolean; // Whether to log metrics periodically
  alertOnLeak: boolean; // Alert when potential connection leak detected
  maxIdleTime: number; // Max idle time in ms before warning
}

export interface PoolMetrics {
  timestamp: Date;
  totalConnections: number;
  idleConnections: number;
  activeConnections: number;
  waitingRequests: number;
  utilizationPercent: number;
  status: 'healthy' | 'warning' | 'critical';
}

export interface ConnectionLeakWarning {
  timestamp: Date;
  activeConnections: number;
  duration: number;
  suspectedLeak: boolean;
}

export class PoolMonitorService {
  private pool: Pool;
  private config: PoolMonitorConfig;
  private metrics: PoolMetrics[] = [];
  private maxMetricsHistory: number = 1000;
  private leakWarnings: ConnectionLeakWarning[] = [];
  private monitoringInterval: NodeJS.Timeout | null = null;
  private lastActiveCount: number = 0;
  private highActiveConnectionTime: number = 0;

  constructor(pool: Pool, config: Partial<PoolMonitorConfig> = {}) {
    this.pool = pool;
    this.config = {
      warningThreshold: config.warningThreshold || 70,
      criticalThreshold: config.criticalThreshold || 90,
      checkInterval: config.checkInterval || 5,
      logMetrics: config.logMetrics !== false,
      alertOnLeak: config.alertOnLeak !== false,
      maxIdleTime: config.maxIdleTime || 30000,
    };

    this.setupPoolEventListeners();
  }

  /**
   * Setup pool event listeners for real-time monitoring
   */
  private setupPoolEventListeners(): void {
    this.pool.on('connect', (client) => {
      AppLogger.debug('New database connection established', {
        totalCount: this.pool.totalCount,
        idleCount: this.pool.idleCount,
      });

      this.recordMetrics();
    });

    this.pool.on('acquire', (client) => {
      AppLogger.debug('Database connection acquired from pool', {
        totalCount: this.pool.totalCount,
        idleCount: this.pool.idleCount,
        waitingCount: this.pool.waitingCount,
      });

      this.recordMetrics();
    });

    this.pool.on('remove', (client) => {
      AppLogger.warn('Database connection removed from pool', {
        totalCount: this.pool.totalCount,
        idleCount: this.pool.idleCount,
        reason: 'Connection error or max lifetime reached',
      });

      this.recordMetrics();
    });

    this.pool.on('error', (err, client) => {
      AppLogger.error('Unexpected error in database pool', err, {
        totalCount: this.pool.totalCount,
        idleCount: this.pool.idleCount,
      });

      this.recordMetrics();

      // Log security event for pool errors
      AppLogger.logSecurityEvent('database.pool_error', 'high', {
        error: err.message,
        totalConnections: this.pool.totalCount,
      });
    });
  }

  /**
   * Start monitoring with periodic checks
   */
  startMonitoring(): void {
    if (this.monitoringInterval) {
      AppLogger.warn('Pool monitoring already started');
      return;
    }

    AppLogger.info('Starting database pool monitoring', {
      checkInterval: this.config.checkInterval,
      warningThreshold: this.config.warningThreshold,
      criticalThreshold: this.config.criticalThreshold,
    });

    // Initial metrics capture
    this.recordMetrics();

    // Setup periodic monitoring
    this.monitoringInterval = setInterval(() => {
      this.checkPoolHealth();
    }, this.config.checkInterval * 60 * 1000);

    // Setup cron jobs for logging
    if (this.config.logMetrics) {
      // Log metrics every hour
      cron.schedule('0 * * * *', () => {
        this.logPoolMetrics();
      });

      // Log detailed report every 6 hours
      cron.schedule('0 */6 * * *', () => {
        this.logDetailedReport();
      });
    }
  }

  /**
   * Stop monitoring
   */
  stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
      AppLogger.info('Database pool monitoring stopped');
    }
  }

  /**
   * Check pool health and alert if needed
   */
  private checkPoolHealth(): void {
    const metrics = this.recordMetrics();

    // Check utilization thresholds
    if (metrics.utilizationPercent >= this.config.criticalThreshold) {
      AppLogger.logSecurityEvent('database.pool_critical', 'critical', {
        utilization: metrics.utilizationPercent,
        activeConnections: metrics.activeConnections,
        totalConnections: metrics.totalConnections,
        waitingRequests: metrics.waitingRequests,
      });

      AppLogger.error('Database pool at critical utilization', new Error('Pool Critical'), {
        utilization: metrics.utilizationPercent,
        activeConnections: metrics.activeConnections,
        totalConnections: metrics.totalConnections,
      });
    } else if (metrics.utilizationPercent >= this.config.warningThreshold) {
      AppLogger.warn('Database pool utilization high', {
        utilization: metrics.utilizationPercent,
        activeConnections: metrics.activeConnections,
        totalConnections: metrics.totalConnections,
      });
    }

    // Check for connection leaks
    if (this.config.alertOnLeak) {
      this.checkForConnectionLeaks(metrics);
    }

    // Check for waiting requests
    if (metrics.waitingRequests > 0) {
      AppLogger.warn('Database connection requests waiting', {
        waitingCount: metrics.waitingRequests,
        activeConnections: metrics.activeConnections,
        idleConnections: metrics.idleConnections,
      });
    }
  }

  /**
   * Check for potential connection leaks
   */
  private checkForConnectionLeaks(metrics: PoolMetrics): void {
    const activeConnections = metrics.activeConnections;

    // If active connections haven't decreased for extended period
    if (activeConnections >= this.lastActiveCount && activeConnections > 0) {
      this.highActiveConnectionTime += this.config.checkInterval * 60 * 1000;

      // If connections have been high for more than 30 minutes
      if (this.highActiveConnectionTime > 30 * 60 * 1000) {
        const warning: ConnectionLeakWarning = {
          timestamp: new Date(),
          activeConnections,
          duration: this.highActiveConnectionTime,
          suspectedLeak: true,
        };

        this.leakWarnings.push(warning);

        AppLogger.logSecurityEvent('database.suspected_connection_leak', 'high', {
          activeConnections,
          duration: this.highActiveConnectionTime,
          totalConnections: metrics.totalConnections,
        });

        AppLogger.warn('Suspected database connection leak detected', {
          activeConnections,
          durationMinutes: this.highActiveConnectionTime / 60000,
          recommendation: 'Check for unclosed database connections in application code',
        });

        // Reset to avoid repeated warnings
        this.highActiveConnectionTime = 0;
      }
    } else {
      // Reset if connections decreased
      this.highActiveConnectionTime = 0;
    }

    this.lastActiveCount = activeConnections;
  }

  /**
   * Record current pool metrics
   */
  private recordMetrics(): PoolMetrics {
    const totalConnections = this.pool.totalCount;
    const idleConnections = this.pool.idleCount;
    const activeConnections = totalConnections - idleConnections;
    const waitingRequests = this.pool.waitingCount;

    const utilizationPercent =
      totalConnections > 0 ? (activeConnections / totalConnections) * 100 : 0;

    let status: 'healthy' | 'warning' | 'critical' = 'healthy';
    if (utilizationPercent >= this.config.criticalThreshold) {
      status = 'critical';
    } else if (utilizationPercent >= this.config.warningThreshold) {
      status = 'warning';
    }

    const metrics: PoolMetrics = {
      timestamp: new Date(),
      totalConnections,
      idleConnections,
      activeConnections,
      waitingRequests,
      utilizationPercent,
      status,
    };

    this.metrics.push(metrics);

    // Limit metrics history
    if (this.metrics.length > this.maxMetricsHistory) {
      this.metrics.shift();
    }

    return metrics;
  }

  /**
   * Log current pool metrics
   */
  private logPoolMetrics(): void {
    const current = this.getCurrentMetrics();

    AppLogger.info('Database pool metrics', {
      total: current.totalConnections,
      active: current.activeConnections,
      idle: current.idleConnections,
      waiting: current.waitingRequests,
      utilization: `${current.utilizationPercent.toFixed(2)}%`,
      status: current.status,
    });
  }

  /**
   * Log detailed pool report
   */
  private logDetailedReport(): void {
    const stats = this.getStatistics();

    AppLogger.info('Database pool detailed report', {
      current: {
        total: stats.current.totalConnections,
        active: stats.current.activeConnections,
        idle: stats.current.idleConnections,
        utilization: `${stats.current.utilizationPercent.toFixed(2)}%`,
      },
      averages: {
        utilization: `${stats.average.utilizationPercent.toFixed(2)}%`,
        activeConnections: stats.average.activeConnections.toFixed(2),
        idleConnections: stats.average.idleConnections.toFixed(2),
      },
      peaks: {
        maxUtilization: `${stats.peak.utilizationPercent.toFixed(2)}%`,
        maxActive: stats.peak.activeConnections,
        maxWaiting: stats.peak.waitingRequests,
      },
      health: {
        healthyPercentage: `${((stats.healthyCount / stats.totalCount) * 100).toFixed(2)}%`,
        warningCount: stats.warningCount,
        criticalCount: stats.criticalCount,
      },
      leaks: {
        suspectedLeakCount: this.leakWarnings.length,
      },
    });
  }

  /**
   * Get current pool metrics
   */
  getCurrentMetrics(): PoolMetrics {
    if (this.metrics.length === 0) {
      return this.recordMetrics();
    }
    return this.metrics[this.metrics.length - 1];
  }

  /**
   * Get pool statistics
   */
  getStatistics(): {
    current: PoolMetrics;
    average: {
      utilizationPercent: number;
      activeConnections: number;
      idleConnections: number;
      waitingRequests: number;
    };
    peak: {
      utilizationPercent: number;
      activeConnections: number;
      waitingRequests: number;
    };
    totalCount: number;
    healthyCount: number;
    warningCount: number;
    criticalCount: number;
  } {
    const current = this.getCurrentMetrics();

    if (this.metrics.length === 0) {
      return {
        current,
        average: {
          utilizationPercent: 0,
          activeConnections: 0,
          idleConnections: 0,
          waitingRequests: 0,
        },
        peak: {
          utilizationPercent: 0,
          activeConnections: 0,
          waitingRequests: 0,
        },
        totalCount: 0,
        healthyCount: 0,
        warningCount: 0,
        criticalCount: 0,
      };
    }

    const sum = this.metrics.reduce(
      (acc, m) => ({
        utilization: acc.utilization + m.utilizationPercent,
        active: acc.active + m.activeConnections,
        idle: acc.idle + m.idleConnections,
        waiting: acc.waiting + m.waitingRequests,
      }),
      { utilization: 0, active: 0, idle: 0, waiting: 0 }
    );

    const count = this.metrics.length;

    const peak = this.metrics.reduce(
      (acc, m) => ({
        utilization: Math.max(acc.utilization, m.utilizationPercent),
        active: Math.max(acc.active, m.activeConnections),
        waiting: Math.max(acc.waiting, m.waitingRequests),
      }),
      { utilization: 0, active: 0, waiting: 0 }
    );

    const healthyCount = this.metrics.filter((m) => m.status === 'healthy').length;
    const warningCount = this.metrics.filter((m) => m.status === 'warning').length;
    const criticalCount = this.metrics.filter((m) => m.status === 'critical').length;

    return {
      current,
      average: {
        utilizationPercent: sum.utilization / count,
        activeConnections: sum.active / count,
        idleConnections: sum.idle / count,
        waitingRequests: sum.waiting / count,
      },
      peak: {
        utilizationPercent: peak.utilization,
        activeConnections: peak.active,
        waitingRequests: peak.waiting,
      },
      totalCount: count,
      healthyCount,
      warningCount,
      criticalCount,
    };
  }

  /**
   * Get recent metrics
   */
  getRecentMetrics(count: number = 20): PoolMetrics[] {
    return this.metrics.slice(-count);
  }

  /**
   * Get connection leak warnings
   */
  getLeakWarnings(): ConnectionLeakWarning[] {
    return this.leakWarnings;
  }

  /**
   * Clear metrics history
   */
  clearMetrics(): void {
    this.metrics = [];
    this.leakWarnings = [];
    this.lastActiveCount = 0;
    this.highActiveConnectionTime = 0;
    AppLogger.info('Pool metrics cleared');
  }

  /**
   * Get pool configuration recommendations
   */
  getRecommendations(): string[] {
    const recommendations: string[] = [];
    const stats = this.getStatistics();

    // High utilization
    if (stats.average.utilizationPercent > this.config.warningThreshold) {
      recommendations.push(
        `Average pool utilization is high (${stats.average.utilizationPercent.toFixed(
          2
        )}%). Consider increasing pool size.`
      );
    }

    // Waiting requests
    if (stats.peak.waitingRequests > 0) {
      recommendations.push(
        `Peak waiting requests: ${stats.peak.waitingRequests}. Pool size may be insufficient for peak load.`
      );
    }

    // Connection leaks
    if (this.leakWarnings.length > 0) {
      recommendations.push(
        `${this.leakWarnings.length} suspected connection leak(s) detected. Review code for unclosed connections.`
      );
    }

    // Low utilization
    if (stats.average.utilizationPercent < 20 && stats.current.totalConnections > 5) {
      recommendations.push(
        `Average pool utilization is low (${stats.average.utilizationPercent.toFixed(
          2
        )}%). Consider reducing pool size to conserve resources.`
      );
    }

    // Many critical periods
    if (stats.criticalCount > stats.totalCount * 0.1) {
      recommendations.push(
        `Pool reached critical utilization in ${
          stats.criticalCount
        } samples (${((stats.criticalCount / stats.totalCount) * 100).toFixed(
          2
        )}% of time). Immediate action required.`
      );
    }

    return recommendations;
  }
}

/**
 * Create optimized pool configuration
 */
export function createOptimizedPoolConfig(
  baseConfig: Partial<PoolConfig> = {}
): PoolConfig {
  const defaultConfig: PoolConfig = {
    // Connection settings
    max: parseInt(process.env.DB_POOL_MAX || '20'), // Maximum connections
    min: parseInt(process.env.DB_POOL_MIN || '5'), // Minimum connections
    idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT || '30000'), // 30 seconds
    connectionTimeoutMillis: parseInt(process.env.DB_CONNECTION_TIMEOUT || '10000'), // 10 seconds

    // Connection lifetime
    maxUses: parseInt(process.env.DB_MAX_USES || '7500'), // Max uses per connection

    // Performance
    allowExitOnIdle: process.env.NODE_ENV !== 'production', // Only in development

    // Statement timeout (30 seconds default)
    statement_timeout: parseInt(process.env.DB_STATEMENT_TIMEOUT || '30000'),

    // Query timeout (same as statement timeout)
    query_timeout: parseInt(process.env.DB_QUERY_TIMEOUT || '30000'),

    // Application name for monitoring
    application_name: process.env.APP_NAME || 'website-cloner-pro',
  };

  return {
    ...defaultConfig,
    ...baseConfig,
  };
}

/**
 * Singleton instance
 */
let poolMonitor: PoolMonitorService | null = null;

export function initializePoolMonitor(
  pool: Pool,
  config?: Partial<PoolMonitorConfig>
): PoolMonitorService {
  poolMonitor = new PoolMonitorService(pool, config);
  poolMonitor.startMonitoring();
  return poolMonitor;
}

export function getPoolMonitor(): PoolMonitorService {
  if (!poolMonitor) {
    throw new Error('PoolMonitorService not initialized. Call initializePoolMonitor first.');
  }
  return poolMonitor;
}
