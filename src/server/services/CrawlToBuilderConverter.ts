/**
 * CrawlToBuilderConverter Service
 *
 * Converts crawled pages to page builder formats (Elementor, Gutenberg, etc.)
 * with batch processing, progress tracking, and resume capability.
 *
 * Features:
 * - Batch conversion for memory efficiency
 * - Multiple builder format support
 * - Component recognition integration
 * - Conversion quality scoring
 * - Error handling per page
 * - Progress tracking with SSE support
 * - Resume capability for large crawls
 */

import { Pool } from 'pg';
import { JSDOM } from 'jsdom';
import { getPool } from '../config/database.js';
import { AppLogger } from './logger.service.js';
import { recognizeComponents, analyzeElement } from './page-builder/recognizer/component-recognizer.js';
import { exportToElementor } from './page-builder/exporters/elementor-exporter.js';
import { exportToGutenberg, GutenbergExporter } from './page-builder/exporters/gutenberg-exporter.js';
import type { AnalyzedElement } from './page-builder/types/component.types.js';
import type { ElementorWidget, ElementorExport } from './page-builder/types/builder.types.js';
import type { ComponentInfo } from './page-builder/types/builder.types.js';

// ============================================================================
// Type Definitions
// ============================================================================

export type BuilderType = 'elementor' | 'gutenberg' | 'divi' | 'beaver-builder';

export interface ConversionOptions {
  builderType: BuilderType;
  batchSize?: number; // Number of pages to convert per batch
  useGlobals?: boolean; // Use global colors/fonts
  customCSS?: boolean; // Include custom CSS
  optimizeOutput?: boolean; // Optimize export
  resumeFrom?: number; // Resume from page index
}

export interface ConversionResult {
  sessionId: string;
  success: boolean;
  totalPages: number;
  convertedPages: number;
  failedPages: number;
  averageQuality: number;
  averageConfidence: number;
  duration: number;
  conversions: PageConversion[];
  errors: ConversionError[];
}

export interface PageConversion {
  pageId: string;
  url: string;
  title: string;
  builderType: BuilderType;
  conversionData: any;
  componentCount: number;
  widgetCount: number;
  sectionCount: number;
  quality: number;
  confidence: number;
  manualReviewNeeded: boolean;
  warnings: string[];
  errors: string[];
  conversionTime: number;
}

export interface BatchResult {
  batchNumber: number;
  pagesProcessed: number;
  pagesSucceeded: number;
  pagesFailed: number;
  duration: number;
  conversions: PageConversion[];
  errors: ConversionError[];
}

export interface ConversionProgress {
  sessionId: string;
  status: string;
  totalPages: number;
  convertedPages: number;
  failedPages: number;
  currentBatch: number;
  totalBatches: number;
  progressPercentage: number;
  estimatedTimeRemaining: number;
  averagePageTime: number;
  startedAt: Date;
  lastActivity: Date;
}

export interface ConversionError {
  pageId?: string;
  url?: string;
  error: string;
  stack?: string;
  timestamp: Date;
}

interface CrawledPageData {
  id: string;
  url: string;
  title: string;
  html: string;
  depth: number;
  metadata: any;
}

// ============================================================================
// CrawlToBuilderConverter Service
// ============================================================================

export class CrawlToBuilderConverter {
  private pool: Pool;
  private conversionCache: Map<string, PageConversion> = new Map();
  private progressCallbacks: Map<string, (progress: ConversionProgress) => void> = new Map();

  constructor() {
    this.pool = getPool();
  }

  /**
   * Convert all crawled pages in a session
   */
  async convertCrawledPages(
    sessionId: string,
    options: ConversionOptions
  ): Promise<ConversionResult> {
    const startTime = Date.now();
    AppLogger.info(`Starting conversion for session ${sessionId}`, { sessionId, options });

    try {
      // Update session status
      await this.updateSessionStatus(sessionId, 'converting');

      // Get total page count
      const totalPages = await this.getTotalPages(sessionId);
      if (totalPages === 0) {
        throw new Error('No pages found for conversion');
      }

      // Calculate batches
      const batchSize = options.batchSize || 100;
      const totalBatches = Math.ceil(totalPages / batchSize);
      const startBatch = options.resumeFrom ? Math.floor(options.resumeFrom / batchSize) : 0;

      AppLogger.info(`Converting ${totalPages} pages in ${totalBatches} batches`, {
        sessionId,
        totalPages,
        totalBatches,
        batchSize,
      });

      const conversions: PageConversion[] = [];
      const errors: ConversionError[] = [];
      let convertedCount = 0;
      let failedCount = 0;
      let totalQuality = 0;
      let totalConfidence = 0;

      // Process batches
      for (let batchNum = startBatch; batchNum < totalBatches; batchNum++) {
        const batchStartTime = Date.now();
        AppLogger.info(`Processing batch ${batchNum + 1}/${totalBatches}`, { sessionId, batchNum });

        // Emit progress
        await this.emitProgress(sessionId, {
          totalPages,
          convertedPages: convertedCount,
          failedPages: failedCount,
          currentBatch: batchNum,
          totalBatches,
        });

        try {
          // Convert batch
          const batchResult = await this.processBatch(
            sessionId,
            batchNum,
            batchSize,
            options
          );

          conversions.push(...batchResult.conversions);
          errors.push(...batchResult.errors);
          convertedCount += batchResult.pagesSucceeded;
          failedCount += batchResult.pagesFailed;

          // Calculate running averages
          batchResult.conversions.forEach(conv => {
            totalQuality += conv.quality;
            totalConfidence += conv.confidence;
          });

          // Save batch metrics
          await this.saveBatchMetrics(sessionId, batchNum, batchResult);

          // Clear cache to free memory
          this.conversionCache.clear();

          AppLogger.info(`Batch ${batchNum + 1} completed`, {
            sessionId,
            succeeded: batchResult.pagesSucceeded,
            failed: batchResult.pagesFailed,
            duration: Date.now() - batchStartTime,
          });

        } catch (batchError: any) {
          AppLogger.error(`Batch ${batchNum + 1} failed`, batchError, { sessionId, batchNum });
          errors.push({
            error: `Batch ${batchNum + 1} failed: ${batchError.message}`,
            stack: batchError.stack,
            timestamp: new Date(),
          });
          // Continue with next batch
        }
      }

      // Update session status to completed
      await this.updateSessionStatus(sessionId, 'completed');

      const duration = Date.now() - startTime;
      const averageQuality = convertedCount > 0 ? totalQuality / convertedCount : 0;
      const averageConfidence = convertedCount > 0 ? totalConfidence / convertedCount : 0;

      // Final progress update
      await this.emitProgress(sessionId, {
        totalPages,
        convertedPages: convertedCount,
        failedPages: failedCount,
        currentBatch: totalBatches,
        totalBatches,
      });

      AppLogger.info(`Conversion completed for session ${sessionId}`, {
        sessionId,
        convertedPages: convertedCount,
        failedPages: failedCount,
        duration,
        averageQuality,
      });

      return {
        sessionId,
        success: true,
        totalPages,
        convertedPages: convertedCount,
        failedPages: failedCount,
        averageQuality,
        averageConfidence,
        duration,
        conversions,
        errors,
      };

    } catch (error: any) {
      AppLogger.error('Conversion failed', error, { sessionId });
      await this.updateSessionStatus(sessionId, 'failed', error.message);
      throw error;
    }
  }

  /**
   * Convert a single page
   */
  async convertSinglePage(
    page: CrawledPageData,
    builderType: BuilderType,
    options: ConversionOptions = { builderType }
  ): Promise<PageConversion> {
    const startTime = Date.now();

    try {
      AppLogger.debug(`Converting page: ${page.url}`, { pageId: page.id, builderType });

      // Parse HTML and analyze components
      const dom = new JSDOM(page.html);
      const document = dom.window.document;
      const body = document.body;

      if (!body) {
        throw new Error('Invalid HTML: no body element found');
      }

      // Recognize components
      const analyzedElements = this.analyzeDocument(body);

      // Convert to builder format
      let conversionData: any;
      let componentCount = 0;
      let widgetCount = 0;
      let sectionCount = 0;
      let quality = 0;
      let confidence = 0;
      let manualReviewNeeded = false;
      const warnings: string[] = [];
      const errors: string[] = [];

      switch (builderType) {
        case 'elementor':
          const elementorResult = await this.convertToElementor(
            analyzedElements,
            page.title,
            options
          );
          conversionData = elementorResult.export;
          componentCount = elementorResult.stats.componentCount;
          widgetCount = elementorResult.stats.widgetCount;
          sectionCount = elementorResult.stats.sectionCount;
          quality = elementorResult.stats.quality;
          confidence = elementorResult.stats.confidence;
          manualReviewNeeded = elementorResult.stats.manualReviewNeeded;
          warnings.push(...elementorResult.warnings);
          errors.push(...elementorResult.errors);
          break;

        case 'gutenberg':
          const gutenbergResult = await this.convertToGutenberg(
            analyzedElements,
            page.title,
            options
          );
          conversionData = gutenbergResult.export;
          componentCount = gutenbergResult.stats.componentCount;
          widgetCount = gutenbergResult.stats.blockCount;
          sectionCount = gutenbergResult.stats.patternCount;
          quality = gutenbergResult.stats.quality;
          confidence = gutenbergResult.stats.confidence;
          manualReviewNeeded = gutenbergResult.stats.manualReviewNeeded;
          warnings.push(...gutenbergResult.warnings);
          errors.push(...gutenbergResult.errors);
          break;

        case 'divi':
        case 'beaver-builder':
          // TODO: Implement Divi and Beaver Builder converters
          throw new Error(`Builder type ${builderType} not yet implemented`);

        default:
          throw new Error(`Unknown builder type: ${builderType}`);
      }

      const conversionTime = Date.now() - startTime;

      return {
        pageId: page.id,
        url: page.url,
        title: page.title,
        builderType,
        conversionData,
        componentCount,
        widgetCount,
        sectionCount,
        quality,
        confidence,
        manualReviewNeeded,
        warnings,
        errors,
        conversionTime,
      };

    } catch (error: any) {
      AppLogger.error('Page conversion failed', error, { pageId: page.id, url: page.url });
      throw error;
    }
  }

  /**
   * Batch convert pages
   */
  async *batchConvert(
    pages: CrawledPageData[],
    builderType: BuilderType,
    batchSize: number = 50,
    options: ConversionOptions = { builderType }
  ): AsyncGenerator<BatchResult> {
    const totalBatches = Math.ceil(pages.length / batchSize);

    for (let i = 0; i < pages.length; i += batchSize) {
      const batch = pages.slice(i, i + batchSize);
      const batchNumber = Math.floor(i / batchSize);
      const startTime = Date.now();

      AppLogger.info(`Processing batch ${batchNumber + 1}/${totalBatches}`, {
        batchSize: batch.length,
      });

      const conversions: PageConversion[] = [];
      const errors: ConversionError[] = [];
      let succeeded = 0;
      let failed = 0;

      // Process batch in parallel
      const results = await Promise.allSettled(
        batch.map(page => this.convertSinglePage(page, builderType, options))
      );

      results.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          conversions.push(result.value);
          succeeded++;
        } else {
          const page = batch[index];
          errors.push({
            pageId: page.id,
            url: page.url,
            error: result.reason.message,
            stack: result.reason.stack,
            timestamp: new Date(),
          });
          failed++;
        }
      });

      const duration = Date.now() - startTime;

      yield {
        batchNumber,
        pagesProcessed: batch.length,
        pagesSucceeded: succeeded,
        pagesFailed: failed,
        duration,
        conversions,
        errors,
      };

      // Clear cache after batch
      this.conversionCache.clear();
    }
  }

  /**
   * Get conversion progress
   */
  async getConversionProgress(sessionId: string): Promise<ConversionProgress> {
    const client = await this.pool.connect();

    try {
      const result = await client.query(
        `SELECT
          cs.id as session_id,
          cs.status,
          cs.total_pages,
          cs.converted_pages,
          cs.failed_pages,
          cp.current_batch,
          cp.total_batches,
          cs.started_at,
          cs.last_activity_at
        FROM crawl_sessions cs
        LEFT JOIN crawl_pagination cp ON cp.session_id = cs.id
        WHERE cs.id = $1`,
        [sessionId]
      );

      if (result.rows.length === 0) {
        throw new Error('Session not found');
      }

      const row = result.rows[0];
      const totalPages = row.total_pages || 0;
      const convertedPages = row.converted_pages || 0;
      const progressPercentage = totalPages > 0 ? (convertedPages / totalPages) * 100 : 0;

      // Calculate estimated time remaining
      const startedAt = new Date(row.started_at);
      const now = new Date();
      const elapsedMs = now.getTime() - startedAt.getTime();
      const averagePageTime = convertedPages > 0 ? elapsedMs / convertedPages : 0;
      const remainingPages = totalPages - convertedPages;
      const estimatedTimeRemaining = averagePageTime * remainingPages;

      return {
        sessionId,
        status: row.status,
        totalPages,
        convertedPages,
        failedPages: row.failed_pages || 0,
        currentBatch: row.current_batch || 0,
        totalBatches: row.total_batches || 0,
        progressPercentage,
        estimatedTimeRemaining,
        averagePageTime,
        startedAt,
        lastActivity: new Date(row.last_activity_at),
      };

    } finally {
      client.release();
    }
  }

  /**
   * Resume conversion from last saved state
   */
  async resumeConversion(sessionId: string): Promise<ConversionResult> {
    AppLogger.info(`Resuming conversion for session ${sessionId}`, { sessionId });

    // Get last processed page index
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `SELECT last_page_index, crawl_state
        FROM crawl_pagination
        WHERE session_id = $1`,
        [sessionId]
      );

      if (result.rows.length === 0) {
        throw new Error('No pagination data found for session');
      }

      const { last_page_index, crawl_state } = result.rows[0];
      const resumeFrom = last_page_index + 1;

      AppLogger.info(`Resuming from page index ${resumeFrom}`, { sessionId, resumeFrom });

      // Resume with original options (stored in crawl_state)
      const options: ConversionOptions = crawl_state.options || { builderType: 'elementor' };
      options.resumeFrom = resumeFrom;

      return await this.convertCrawledPages(sessionId, options);

    } finally {
      client.release();
    }
  }

  /**
   * Register progress callback for SSE
   */
  onProgress(sessionId: string, callback: (progress: ConversionProgress) => void): void {
    this.progressCallbacks.set(sessionId, callback);
  }

  /**
   * Unregister progress callback
   */
  offProgress(sessionId: string): void {
    this.progressCallbacks.delete(sessionId);
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  /**
   * Process a batch of pages
   */
  private async processBatch(
    sessionId: string,
    batchNum: number,
    batchSize: number,
    options: ConversionOptions
  ): Promise<BatchResult> {
    const startTime = Date.now();

    // Get pages for this batch
    const pages = await this.getPagesForBatch(sessionId, batchNum, batchSize);

    if (pages.length === 0) {
      return {
        batchNumber: batchNum,
        pagesProcessed: 0,
        pagesSucceeded: 0,
        pagesFailed: 0,
        duration: 0,
        conversions: [],
        errors: [],
      };
    }

    const conversions: PageConversion[] = [];
    const errors: ConversionError[] = [];
    let succeeded = 0;
    let failed = 0;

    // Process pages in parallel (with concurrency limit)
    const concurrency = 5;
    for (let i = 0; i < pages.length; i += concurrency) {
      const chunk = pages.slice(i, i + concurrency);
      const results = await Promise.allSettled(
        chunk.map(page => this.convertAndSavePage(sessionId, page, options))
      );

      results.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          conversions.push(result.value);
          succeeded++;
        } else {
          const page = chunk[index];
          errors.push({
            pageId: page.id,
            url: page.url,
            error: result.reason.message,
            stack: result.reason.stack,
            timestamp: new Date(),
          });
          failed++;
        }
      });
    }

    const duration = Date.now() - startTime;

    return {
      batchNumber: batchNum,
      pagesProcessed: pages.length,
      pagesSucceeded: succeeded,
      pagesFailed: failed,
      duration,
      conversions,
      errors,
    };
  }

  /**
   * Convert and save a single page
   */
  private async convertAndSavePage(
    sessionId: string,
    page: CrawledPageData,
    options: ConversionOptions
  ): Promise<PageConversion> {
    // Convert page
    const conversion = await this.convertSinglePage(page, options.builderType, options);

    // Save conversion to database
    await this.saveConversion(sessionId, conversion);

    // Update page status
    await this.updatePageConversionStatus(page.id, 'completed');

    return conversion;
  }

  /**
   * Analyze HTML document and extract components
   */
  private analyzeDocument(body: HTMLElement): AnalyzedElement[] {
    const elements: AnalyzedElement[] = [];

    // Recursively analyze all elements
    const analyze = (element: Element) => {
      try {
        const analyzed = analyzeElement(element);
        elements.push(analyzed);

        // Analyze children
        for (const child of Array.from(element.children)) {
          analyze(child);
        }
      } catch (error) {
        AppLogger.warn('Element analysis failed', { error });
      }
    };

    analyze(body);
    return elements;
  }

  /**
   * Convert to Elementor format
   */
  private async convertToElementor(
    elements: AnalyzedElement[],
    title: string,
    options: ConversionOptions
  ): Promise<{
    export: ElementorExport;
    stats: any;
    warnings: string[];
    errors: string[];
  }> {
    const warnings: string[] = [];
    const errors: string[] = [];

    // Convert elements to widgets
    const widgets: ElementorWidget[] = [];
    let totalConfidence = 0;
    let manualReviewCount = 0;

    for (const element of elements) {
      try {
        // Create widget from element
        const widget = this.createElementorWidget(element);
        if (widget) {
          widgets.push(widget);

          // Track confidence (simplified for now)
          const confidence = element.context?.depth ? 100 - (element.context.depth * 10) : 50;
          totalConfidence += confidence;

          if (confidence < 70) {
            manualReviewCount++;
          }
        }
      } catch (error: any) {
        errors.push(`Widget creation failed for ${element.tagName}: ${error.message}`);
      }
    }

    // Export to Elementor
    const elementorExport = exportToElementor(widgets, title, {
      customCSS: options.customCSS ? '' : undefined,
      useGlobals: options.useGlobals,
    });

    const componentCount = elements.length;
    const widgetCount = widgets.length;
    const sectionCount = elementorExport.content?.length || 0;
    const averageConfidence = componentCount > 0 ? totalConfidence / componentCount : 0;
    const quality = this.calculateQuality(averageConfidence, manualReviewCount, componentCount);

    return {
      export: elementorExport,
      stats: {
        componentCount,
        widgetCount,
        sectionCount,
        quality,
        confidence: averageConfidence,
        manualReviewNeeded: manualReviewCount > 0,
      },
      warnings,
      errors,
    };
  }

  /**
   * Convert to Gutenberg format
   */
  private async convertToGutenberg(
    elements: AnalyzedElement[],
    title: string,
    options: ConversionOptions
  ): Promise<{
    export: any;
    stats: any;
    warnings: string[];
    errors: string[];
  }> {
    const warnings: string[] = [];
    const errors: string[] = [];

    // Convert elements to ComponentInfo format for Gutenberg exporter
    const components: ComponentInfo[] = this.elementsToComponents(elements);

    // Use Gutenberg exporter
    const exporter = new GutenbergExporter();
    const gutenbergExport = exporter.export(components, {
      usePatterns: true,
      extractReusable: true,
      generateGlobalStyles: options.useGlobals,
    });

    const componentCount = elements.length;
    const blockCount = gutenbergExport.blocks.length;
    const patternCount = gutenbergExport.patterns.length;
    const averageConfidence = 75; // Simplified for now
    const quality = this.calculateQuality(averageConfidence, 0, componentCount);

    return {
      export: gutenbergExport,
      stats: {
        componentCount,
        blockCount,
        patternCount,
        quality,
        confidence: averageConfidence,
        manualReviewNeeded: false,
      },
      warnings,
      errors,
    };
  }

  /**
   * Create Elementor widget from analyzed element
   */
  private createElementorWidget(element: AnalyzedElement): ElementorWidget | null {
    // Map element to widget type
    const widgetType = this.mapToElementorWidgetType(element.tagName);

    if (!widgetType) {
      return null;
    }

    return {
      id: this.generateId(),
      elType: 'widget',
      widgetType,
      settings: {
        // Map element attributes and styles to widget settings
        ...this.extractWidgetSettings(element),
      },
    };
  }

  /**
   * Map HTML tag to Elementor widget type
   */
  private mapToElementorWidgetType(tagName: string): string | null {
    const map: Record<string, string> = {
      h1: 'heading',
      h2: 'heading',
      h3: 'heading',
      h4: 'heading',
      h5: 'heading',
      h6: 'heading',
      p: 'text-editor',
      img: 'image',
      button: 'button',
      a: 'button',
      div: 'html',
      section: 'html',
    };

    return map[tagName.toLowerCase()] || null;
  }

  /**
   * Extract widget settings from element
   */
  private extractWidgetSettings(element: AnalyzedElement): Record<string, any> {
    const settings: Record<string, any> = {};

    // Extract common settings
    if (element.textContent) {
      settings.text = element.textContent;
    }

    if (element.attributes?.src) {
      settings.image = { url: element.attributes.src };
    }

    if (element.attributes?.href) {
      settings.link = { url: element.attributes.href };
    }

    // Extract styles
    if (element.styles) {
      if (element.styles.color) settings.color = element.styles.color;
      if (element.styles.backgroundColor) settings.background_color = element.styles.backgroundColor;
      if (element.styles.fontSize) settings.font_size = element.styles.fontSize;
    }

    return settings;
  }

  /**
   * Convert AnalyzedElements to ComponentInfo
   */
  private elementsToComponents(elements: AnalyzedElement[]): ComponentInfo[] {
    return elements.map(element => ({
      componentType: element.tagName,
      tagName: element.tagName,
      className: element.classes?.join(' '),
      id: element.id,
      textContent: element.textContent,
      innerHTML: element.innerHTML,
      attributes: element.attributes,
      styles: element.styles,
      children: element.children ? this.elementsToComponents(element.children) : undefined,
    }));
  }

  /**
   * Calculate conversion quality score
   */
  private calculateQuality(
    averageConfidence: number,
    manualReviewCount: number,
    totalComponents: number
  ): number {
    const confidenceScore = averageConfidence;
    const reviewPenalty = totalComponents > 0 ? (manualReviewCount / totalComponents) * 20 : 0;
    return Math.max(0, Math.min(100, confidenceScore - reviewPenalty));
  }

  /**
   * Generate unique ID
   */
  private generateId(): string {
    return Math.random().toString(36).substring(2, 15);
  }

  // ============================================================================
  // Database Operations
  // ============================================================================

  /**
   * Get total pages for session
   */
  private async getTotalPages(sessionId: string): Promise<number> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        'SELECT COUNT(*) as count FROM crawled_pages WHERE session_id = $1',
        [sessionId]
      );
      return parseInt(result.rows[0].count);
    } finally {
      client.release();
    }
  }

  /**
   * Get pages for a specific batch
   */
  private async getPagesForBatch(
    sessionId: string,
    batchNum: number,
    batchSize: number
  ): Promise<CrawledPageData[]> {
    const client = await this.pool.connect();
    try {
      const offset = batchNum * batchSize;
      const result = await client.query(
        `SELECT id, url, title, html, depth, metadata
        FROM crawled_pages
        WHERE session_id = $1
        ORDER BY created_at
        LIMIT $2 OFFSET $3`,
        [sessionId, batchSize, offset]
      );

      return result.rows.map(row => ({
        id: row.id,
        url: row.url,
        title: row.title || '',
        html: row.html || '',
        depth: row.depth || 0,
        metadata: row.metadata || {},
      }));
    } finally {
      client.release();
    }
  }

  /**
   * Save conversion result to database
   */
  private async saveConversion(
    sessionId: string,
    conversion: PageConversion
  ): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query(
        `INSERT INTO page_builder_conversions (
          page_id, session_id, builder_type, conversion_data,
          component_count, widget_count, section_count,
          conversion_quality, confidence_score, manual_review_needed,
          warnings, errors
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        ON CONFLICT (page_id, builder_type) DO UPDATE SET
          conversion_data = EXCLUDED.conversion_data,
          component_count = EXCLUDED.component_count,
          widget_count = EXCLUDED.widget_count,
          section_count = EXCLUDED.section_count,
          conversion_quality = EXCLUDED.conversion_quality,
          confidence_score = EXCLUDED.confidence_score,
          manual_review_needed = EXCLUDED.manual_review_needed,
          warnings = EXCLUDED.warnings,
          errors = EXCLUDED.errors,
          updated_at = NOW()`,
        [
          conversion.pageId,
          sessionId,
          conversion.builderType,
          JSON.stringify(conversion.conversionData),
          conversion.componentCount,
          conversion.widgetCount,
          conversion.sectionCount,
          conversion.quality,
          conversion.confidence,
          conversion.manualReviewNeeded,
          JSON.stringify(conversion.warnings),
          JSON.stringify(conversion.errors),
        ]
      );
    } finally {
      client.release();
    }
  }

  /**
   * Update page conversion status
   */
  private async updatePageConversionStatus(
    pageId: string,
    status: 'pending' | 'converting' | 'completed' | 'failed',
    error?: string
  ): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query(
        `UPDATE crawled_pages
        SET conversion_status = $1,
            converted = $2,
            conversion_error = $3,
            converted_at = CASE WHEN $1 = 'completed' THEN NOW() ELSE converted_at END
        WHERE id = $4`,
        [status, status === 'completed', error || null, pageId]
      );
    } finally {
      client.release();
    }
  }

  /**
   * Update session status
   */
  private async updateSessionStatus(
    sessionId: string,
    status: string,
    error?: string
  ): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query(
        `UPDATE crawl_sessions
        SET status = $1,
            error = $2,
            completed_at = CASE WHEN $1 IN ('completed', 'failed') THEN NOW() ELSE completed_at END,
            last_activity_at = NOW()
        WHERE id = $3`,
        [status, error || null, sessionId]
      );
    } finally {
      client.release();
    }
  }

  /**
   * Save batch metrics
   */
  private async saveBatchMetrics(
    sessionId: string,
    batchNumber: number,
    result: BatchResult
  ): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query(
        `INSERT INTO crawl_batch_metrics (
          session_id, batch_number, pages_processed, pages_succeeded, pages_failed,
          duration_ms, avg_page_time_ms, errors
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          sessionId,
          batchNumber,
          result.pagesProcessed,
          result.pagesSucceeded,
          result.pagesFailed,
          result.duration,
          result.pagesProcessed > 0 ? result.duration / result.pagesProcessed : 0,
          JSON.stringify(result.errors),
        ]
      );
    } finally {
      client.release();
    }
  }

  /**
   * Emit progress update
   */
  private async emitProgress(
    sessionId: string,
    update: Partial<ConversionProgress>
  ): Promise<void> {
    const callback = this.progressCallbacks.get(sessionId);
    if (callback) {
      const progress = await this.getConversionProgress(sessionId);
      callback({ ...progress, ...update });
    }
  }
}

// Export singleton instance
export default new CrawlToBuilderConverter();
