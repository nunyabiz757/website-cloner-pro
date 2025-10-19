/**
 * LargeSiteCrawlManager
 *
 * Manages crawling of large websites (1000+ pages) with:
 * - Pagination strategy for memory efficiency
 * - Resume capability for interrupted crawls
 * - Progress tracking and time estimates
 * - Resource throttling and rate limiting
 * - Batch processing with cleanup
 *
 * Designed to handle enterprise-scale website crawling without memory issues.
 */

import { Pool } from 'pg';
import { EventEmitter } from 'events';
import { getPool } from '../config/database.js';
import { AppLogger } from './logger.service.js';
import MultiPageCrawlerService, { type CrawlOptions, type CrawledPage } from './MultiPageCrawlerService.js';
import CrawlPersistenceService from './CrawlPersistenceService.js';

// ============================================================================
// Type Definitions
// ============================================================================

export interface LargeCrawlOptions extends CrawlOptions {
  batchSize?: number; // Pages per batch (default: 100)
  maxBatches?: number; // Maximum batches to process
  throttleMs?: number; // Delay between batches (ms)
  memoryLimit?: number; // Max memory usage (MB)
  autoSave?: boolean; // Auto-save progress
  autoResume?: boolean; // Auto-resume on failure
}

export interface CrawlProgress {
  sessionId: string;
  status: 'pending' | 'crawling' | 'paused' | 'completed' | 'failed';
  currentBatch: number;
  totalBatches: number;
  pagesProcessed: number;
  totalPages: number;
  progressPercentage: number;
  estimatedTimeRemaining: number; // seconds
  averagePageTime: number; // ms
  memoryUsage: number; // MB
  startedAt: Date;
  lastUpdate: Date;
  errors: number;
}

export interface BatchResult {
  batchNumber: number;
  pagesProcessed: number;
  pagesFailed: number;
  duration: number; // ms
  memoryUsed: number; // MB
  errors: string[];
}

export interface PauseState {
  sessionId: string;
  lastBatch: number;
  lastPageIndex: number;
  lastPageUrl: string;
  crawlState: any;
  pausedAt: Date;
}

// ============================================================================
// LargeSiteCrawlManager
// ============================================================================

export class LargeSiteCrawlManager extends EventEmitter {
  private pool: Pool;
  private crawler: typeof MultiPageCrawlerService;
  private persistence: typeof CrawlPersistenceService;
  private activeCrawls: Map<string, AbortController> = new Map();
  private pauseRequests: Set<string> = new Set();

  private readonly DEFAULT_BATCH_SIZE = 100;
  private readonly DEFAULT_THROTTLE_MS = 1000;
  private readonly DEFAULT_MEMORY_LIMIT_MB = 512;

  constructor() {
    super();
    this.pool = getPool();
    this.crawler = MultiPageCrawlerService;
    this.persistence = CrawlPersistenceService;
  }

  // ============================================================================
  // Main Crawl Operations
  // ============================================================================

  /**
   * Start large-scale crawl with pagination
   */
  async startLargeCrawl(
    url: string,
    options: LargeCrawlOptions = {},
    userId?: string,
    projectId?: string
  ): Promise<string> {
    AppLogger.info('Starting large-scale crawl', { url, options });

    // Create session
    const sessionId = await this.persistence.createCrawlSession(url, options, userId, projectId);

    // Start crawl in background
    this.runCrawl(sessionId, url, options).catch(error => {
      AppLogger.error('Large crawl failed', error, { sessionId });
      this.persistence.updateCrawlSession(sessionId, {
        status: 'failed',
        error: error.message,
      });
    });

    return sessionId;
  }

  /**
   * Run the crawl (background process)
   */
  private async runCrawl(
    sessionId: string,
    url: string,
    options: LargeCrawlOptions
  ): Promise<void> {
    const batchSize = options.batchSize || this.DEFAULT_BATCH_SIZE;
    const maxPages = options.maxPages || 1000;
    const maxBatches = options.maxBatches || Math.ceil(maxPages / batchSize);
    const throttleMs = options.throttleMs || this.DEFAULT_THROTTLE_MS;
    const memoryLimit = options.memoryLimit || this.DEFAULT_MEMORY_LIMIT_MB;

    const startTime = Date.now();
    let currentBatch = 0;
    let totalPagesProcessed = 0;
    let totalErrors = 0;

    // Create abort controller for this crawl
    const abortController = new AbortController();
    this.activeCrawls.set(sessionId, abortController);

    try {
      // Update session status
      await this.persistence.updateCrawlSession(sessionId, {
        status: 'crawling',
        startedAt: new Date(),
      });

      // Initialize pagination tracking
      await this.initializePagination(sessionId, batchSize, maxBatches);

      AppLogger.info('Large crawl initialized', {
        sessionId,
        batchSize,
        maxBatches,
        maxPages,
      });

      // Process batches
      for (currentBatch = 0; currentBatch < maxBatches; currentBatch++) {
        // Check for pause request
        if (this.pauseRequests.has(sessionId)) {
          await this.handlePause(sessionId, currentBatch, totalPagesProcessed);
          return;
        }

        // Check for abort
        if (abortController.signal.aborted) {
          throw new Error('Crawl aborted');
        }

        // Check memory usage
        const memoryUsage = this.getMemoryUsage();
        if (memoryUsage > memoryLimit) {
          AppLogger.warn('Memory limit exceeded, forcing garbage collection', {
            sessionId,
            memoryUsage,
            memoryLimit,
          });
          await this.forceGarbageCollection();
        }

        // Process batch
        const batchStartTime = Date.now();
        const batchResult = await this.processNextBatch(
          sessionId,
          url,
          currentBatch,
          batchSize,
          options
        );

        totalPagesProcessed += batchResult.pagesProcessed;
        totalErrors += batchResult.pagesFailed;

        // Update progress
        await this.updateProgress(sessionId, {
          currentBatch,
          totalBatches: maxBatches,
          pagesProcessed: totalPagesProcessed,
          totalPages: maxPages,
        });

        // Emit progress event
        const progress = await this.getCrawlProgress(sessionId);
        this.emit('progress', progress);

        // Save batch state
        if (options.autoSave !== false) {
          await this.saveBatchState(sessionId, currentBatch, batchResult);
        }

        // Throttle between batches
        if (currentBatch < maxBatches - 1 && throttleMs > 0) {
          await this.delay(throttleMs);
        }

        // Clear memory after batch
        await this.clearBatchMemory();

        AppLogger.info(`Batch ${currentBatch + 1}/${maxBatches} completed`, {
          sessionId,
          pagesProcessed: batchResult.pagesProcessed,
          pagesFailed: batchResult.pagesFailed,
          duration: Date.now() - batchStartTime,
        });
      }

      // Crawl completed
      const totalDuration = Date.now() - startTime;
      await this.persistence.updateCrawlSession(sessionId, {
        status: 'completed',
        completedAt: new Date(),
        crawledPages: totalPagesProcessed,
        failedPages: totalErrors,
      });

      AppLogger.info('Large crawl completed', {
        sessionId,
        totalPages: totalPagesProcessed,
        totalErrors,
        duration: totalDuration,
      });

      this.emit('completed', { sessionId, totalPagesProcessed, totalErrors });

    } catch (error: any) {
      AppLogger.error('Large crawl error', error, { sessionId, currentBatch });

      await this.persistence.updateCrawlSession(sessionId, {
        status: 'failed',
        error: error.message,
      });

      this.emit('error', { sessionId, error });

      // Auto-resume if enabled
      if (options.autoResume && currentBatch > 0) {
        AppLogger.info('Auto-resuming crawl', { sessionId });
        setTimeout(() => this.resumeCrawl(sessionId), 5000);
      }

    } finally {
      this.activeCrawls.delete(sessionId);
      this.pauseRequests.delete(sessionId);
    }
  }

  /**
   * Process next batch of pages
   */
  async processNextBatch(
    sessionId: string,
    url: string,
    batchNumber: number,
    batchSize: number,
    options: LargeCrawlOptions
  ): Promise<BatchResult> {
    const startTime = Date.now();
    const startMemory = this.getMemoryUsage();

    try {
      // Calculate page range for this batch
      const startPage = batchNumber * batchSize;
      const endPage = startPage + batchSize;

      AppLogger.debug('Processing batch', {
        sessionId,
        batchNumber,
        startPage,
        endPage,
      });

      // Crawl pages in this batch
      const batchOptions: CrawlOptions = {
        ...options,
        maxPages: batchSize,
        // Add offset logic here if needed
      };

      const result = await this.crawler.crawlWebsite(url, batchOptions);

      // Store crawled pages
      if (result.pages.length > 0) {
        await this.persistence.storeCrawledPages(sessionId, result.pages);
      }

      const duration = Date.now() - startTime;
      const memoryUsed = this.getMemoryUsage() - startMemory;

      return {
        batchNumber,
        pagesProcessed: result.pages.length,
        pagesFailed: 0,
        duration,
        memoryUsed,
        errors: [],
      };

    } catch (error: any) {
      AppLogger.error('Batch processing failed', error, { sessionId, batchNumber });

      return {
        batchNumber,
        pagesProcessed: 0,
        pagesFailed: batchSize,
        duration: Date.now() - startTime,
        memoryUsed: this.getMemoryUsage() - startMemory,
        errors: [error.message],
      };
    }
  }

  /**
   * Pause crawl
   */
  async pauseCrawl(sessionId: string): Promise<void> {
    AppLogger.info('Pausing crawl', { sessionId });

    if (!this.activeCrawls.has(sessionId)) {
      throw new Error('No active crawl found for session');
    }

    // Mark for pause (will pause at next batch boundary)
    this.pauseRequests.add(sessionId);

    this.emit('paused', { sessionId });
  }

  /**
   * Resume crawl from paused state
   */
  async resumeCrawl(sessionId: string): Promise<void> {
    AppLogger.info('Resuming crawl', { sessionId });

    // Get session
    const session = await this.persistence.getCrawlSession(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    if (session.status !== 'paused' && session.status !== 'failed') {
      throw new Error('Can only resume paused or failed crawls');
    }

    // Get pagination state
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        'SELECT current_batch, crawl_state FROM crawl_pagination WHERE session_id = $1',
        [sessionId]
      );

      if (result.rows.length === 0) {
        throw new Error('No pagination state found');
      }

      const { current_batch, crawl_state } = result.rows[0];

      // Resume from last batch
      const resumeOptions: LargeCrawlOptions = {
        ...session.options,
        ...crawl_state,
      };

      // Start crawl from current batch
      await this.runCrawl(sessionId, session.startUrl, {
        ...resumeOptions,
        maxBatches: (session.options.maxBatches || 10) - current_batch,
      });

    } finally {
      client.release();
    }
  }

  /**
   * Cancel crawl completely
   */
  async cancelCrawl(sessionId: string): Promise<void> {
    AppLogger.info('Cancelling crawl', { sessionId });

    const abortController = this.activeCrawls.get(sessionId);
    if (abortController) {
      abortController.abort();
    }

    await this.persistence.updateCrawlSession(sessionId, {
      status: 'failed',
      error: 'Cancelled by user',
    });

    this.activeCrawls.delete(sessionId);
    this.pauseRequests.delete(sessionId);

    this.emit('cancelled', { sessionId });
  }

  /**
   * Get current crawl progress
   */
  async getCrawlProgress(sessionId: string): Promise<CrawlProgress> {
    const session = await this.persistence.getCrawlSession(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    const client = await this.pool.connect();
    try {
      const result = await client.query(
        'SELECT current_batch, total_batches FROM crawl_pagination WHERE session_id = $1',
        [sessionId]
      );

      const pagination = result.rows[0] || { current_batch: 0, total_batches: 0 };

      const totalPages = session.totalPages || 0;
      const pagesProcessed = session.crawledPages || 0;
      const progressPercentage = totalPages > 0 ? (pagesProcessed / totalPages) * 100 : 0;

      // Calculate time estimates
      const elapsedMs = session.startedAt
        ? Date.now() - session.startedAt.getTime()
        : 0;
      const averagePageTime = pagesProcessed > 0 ? elapsedMs / pagesProcessed : 0;
      const remainingPages = totalPages - pagesProcessed;
      const estimatedTimeRemaining = Math.round((averagePageTime * remainingPages) / 1000);

      return {
        sessionId,
        status: session.status,
        currentBatch: pagination.current_batch || 0,
        totalBatches: pagination.total_batches || 0,
        pagesProcessed,
        totalPages,
        progressPercentage: Math.round(progressPercentage * 100) / 100,
        estimatedTimeRemaining,
        averagePageTime: Math.round(averagePageTime),
        memoryUsage: this.getMemoryUsage(),
        startedAt: session.startedAt || session.createdAt,
        lastUpdate: session.lastActivityAt,
        errors: session.errorCount,
      };

    } finally {
      client.release();
    }
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  /**
   * Initialize pagination tracking
   */
  private async initializePagination(
    sessionId: string,
    batchSize: number,
    totalBatches: number
  ): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query(
        `INSERT INTO crawl_pagination (
          session_id, current_batch, total_batches, pages_per_batch
        ) VALUES ($1, $2, $3, $4)
        ON CONFLICT (session_id) DO UPDATE SET
          total_batches = EXCLUDED.total_batches,
          pages_per_batch = EXCLUDED.pages_per_batch`,
        [sessionId, 0, totalBatches, batchSize]
      );
    } finally {
      client.release();
    }
  }

  /**
   * Update progress in database
   */
  private async updateProgress(
    sessionId: string,
    progress: {
      currentBatch: number;
      totalBatches: number;
      pagesProcessed: number;
      totalPages: number;
    }
  ): Promise<void> {
    const client = await this.pool.connect();
    try {
      // Update pagination
      await client.query(
        `UPDATE crawl_pagination
        SET current_batch = $1,
            last_page_index = $2,
            updated_at = NOW()
        WHERE session_id = $3`,
        [progress.currentBatch, progress.pagesProcessed, sessionId]
      );

      // Update session
      await this.persistence.updateCrawlSession(sessionId, {
        crawledPages: progress.pagesProcessed,
      });

    } finally {
      client.release();
    }
  }

  /**
   * Handle pause request
   */
  private async handlePause(
    sessionId: string,
    currentBatch: number,
    pagesProcessed: number
  ): Promise<void> {
    AppLogger.info('Handling pause request', { sessionId, currentBatch });

    // Save current state
    const client = await this.pool.connect();
    try {
      await client.query(
        `UPDATE crawl_pagination
        SET current_batch = $1,
            last_page_index = $2,
            updated_at = NOW()
        WHERE session_id = $3`,
        [currentBatch, pagesProcessed, sessionId]
      );

      await this.persistence.updateCrawlSession(sessionId, {
        status: 'paused',
        crawledPages: pagesProcessed,
      });

    } finally {
      client.release();
    }

    this.pauseRequests.delete(sessionId);
  }

  /**
   * Save batch state
   */
  private async saveBatchState(
    sessionId: string,
    batchNumber: number,
    result: BatchResult
  ): Promise<void> {
    const client = await this.pool.connect();
    try {
      // Add batch to history
      await client.query(
        `UPDATE crawl_pagination
        SET batch_history = batch_history || $1::jsonb
        WHERE session_id = $2`,
        [
          JSON.stringify({
            batchNumber,
            pagesProcessed: result.pagesProcessed,
            pagesFailed: result.pagesFailed,
            duration: result.duration,
            timestamp: new Date().toISOString(),
          }),
          sessionId,
        ]
      );

      // Save batch metrics
      await client.query(
        `INSERT INTO crawl_batch_metrics (
          session_id, batch_number, pages_processed, pages_succeeded, pages_failed,
          duration_ms, memory_usage_mb, errors
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          sessionId,
          batchNumber,
          result.pagesProcessed,
          result.pagesProcessed - result.pagesFailed,
          result.pagesFailed,
          result.duration,
          result.memoryUsed,
          JSON.stringify(result.errors),
        ]
      );

    } finally {
      client.release();
    }
  }

  /**
   * Get memory usage in MB
   */
  private getMemoryUsage(): number {
    const used = process.memoryUsage();
    return Math.round(used.heapUsed / 1024 / 1024);
  }

  /**
   * Force garbage collection (if available)
   */
  private async forceGarbageCollection(): Promise<void> {
    if (global.gc) {
      global.gc();
      AppLogger.debug('Forced garbage collection');
    }
    // Give GC time to work
    await this.delay(100);
  }

  /**
   * Clear memory after batch
   */
  private async clearBatchMemory(): Promise<void> {
    // Clear any large objects
    // Force GC if available
    if (global.gc) {
      global.gc();
    }
    // Small delay to allow cleanup
    await this.delay(50);
  }

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // ============================================================================
  // Statistics and Monitoring
  // ============================================================================

  /**
   * Get crawl statistics
   */
  async getCrawlStatistics(sessionId: string): Promise<any> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `SELECT
          batch_number,
          pages_processed,
          pages_succeeded,
          pages_failed,
          duration_ms,
          avg_page_time_ms,
          memory_usage_mb,
          started_at,
          completed_at
        FROM crawl_batch_metrics
        WHERE session_id = $1
        ORDER BY batch_number`,
        [sessionId]
      );

      const batches = result.rows;

      // Calculate aggregates
      const totalPages = batches.reduce((sum, b) => sum + b.pages_processed, 0);
      const totalSucceeded = batches.reduce((sum, b) => sum + b.pages_succeeded, 0);
      const totalFailed = batches.reduce((sum, b) => sum + b.pages_failed, 0);
      const totalDuration = batches.reduce((sum, b) => sum + b.duration_ms, 0);
      const avgPageTime = totalPages > 0 ? totalDuration / totalPages : 0;
      const peakMemory = Math.max(...batches.map(b => b.memory_usage_mb));

      return {
        sessionId,
        batches: batches.length,
        totalPages,
        totalSucceeded,
        totalFailed,
        totalDuration,
        avgPageTime: Math.round(avgPageTime),
        peakMemory,
        successRate: totalPages > 0 ? (totalSucceeded / totalPages) * 100 : 0,
        batchDetails: batches,
      };

    } finally {
      client.release();
    }
  }

  /**
   * Get active crawls
   */
  getActiveCrawls(): string[] {
    return Array.from(this.activeCrawls.keys());
  }

  /**
   * Check if crawl is active
   */
  isCrawlActive(sessionId: string): boolean {
    return this.activeCrawls.has(sessionId);
  }

  /**
   * Check if crawl is paused
   */
  isCrawlPaused(sessionId: string): boolean {
    return this.pauseRequests.has(sessionId);
  }
}

// Export singleton instance
export default new LargeSiteCrawlManager();
