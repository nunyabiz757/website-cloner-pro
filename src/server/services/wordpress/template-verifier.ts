/**
 * Template Verifier
 *
 * Verifies that imported templates work correctly in target page builders
 * Features:
 * - Visual comparison (before/after screenshots)
 * - Widget validation
 * - Broken asset detection
 * - Rendering errors detection
 * - Performance metrics
 */

import puppeteer, { Browser, Page } from 'puppeteer';
import { WordPressAPIClient } from './wordpress-api-client.js';
import { generateDiffImage, calculateSimilarityScore } from '../page-builder/validator/visual-comparator.js';
import { AppLogger } from '../../utils/logger.js';
import * as fs from 'fs/promises';
import * as path from 'path';

export interface VerificationOptions {
  postId: number;
  originalUrl: string; // Original website URL for comparison
  takeScreenshots?: boolean;
  checkAssets?: boolean;
  checkConsoleErrors?: boolean;
  timeout?: number;
}

export interface VerificationResult {
  success: boolean;
  postId: number;
  postUrl: string;
  checks: {
    rendering: {
      success: boolean;
      errors: string[];
    };
    visual: {
      similarity?: number;
      diffPercentage?: number;
      screenshotPath?: string;
      diffImagePath?: string;
    };
    assets: {
      totalAssets: number;
      brokenAssets: number;
      brokenUrls: string[];
    };
    console: {
      errors: string[];
      warnings: string[];
    };
    performance: {
      loadTime: number;
      domContentLoaded: number;
      firstContentfulPaint?: number;
    };
  };
  summary: string;
  recommendations: string[];
}

/**
 * Template Verifier Service
 */
export class TemplateVerifier {
  private browser: Browser | null = null;
  private client: WordPressAPIClient;

  constructor(client: WordPressAPIClient) {
    this.client = client;
  }

  /**
   * Initialize Puppeteer browser
   */
  private async initBrowser(): Promise<void> {
    if (!this.browser) {
      this.browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
      });
    }
  }

  /**
   * Close browser
   */
  async closeBrowser(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  /**
   * Verify imported template
   */
  async verifyTemplate(options: VerificationOptions): Promise<VerificationResult> {
    const result: VerificationResult = {
      success: false,
      postId: options.postId,
      postUrl: '',
      checks: {
        rendering: {
          success: false,
          errors: [],
        },
        visual: {},
        assets: {
          totalAssets: 0,
          brokenAssets: 0,
          brokenUrls: [],
        },
        console: {
          errors: [],
          warnings: [],
        },
        performance: {
          loadTime: 0,
          domContentLoaded: 0,
        },
      },
      summary: '',
      recommendations: [],
    };

    try {
      await this.initBrowser();

      // Get post URL from WordPress
      const post = await this.client.getPost(options.postId);
      result.postUrl = post.link;

      AppLogger.info('Verifying template', { postId: options.postId, url: result.postUrl });

      // Run verification checks
      await this.checkRendering(result, options);

      if (options.takeScreenshots) {
        await this.checkVisualComparison(result, options);
      }

      if (options.checkAssets) {
        await this.checkAssets(result);
      }

      // Generate summary and recommendations
      this.generateSummary(result);

      result.success = result.checks.rendering.success && result.checks.assets.brokenAssets === 0;

      AppLogger.info('Template verification complete', {
        postId: options.postId,
        success: result.success,
      });
    } catch (error) {
      AppLogger.error('Template verification failed', error as Error);
      result.checks.rendering.errors.push(
        `Verification failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }

    return result;
  }

  /**
   * Check if template renders without errors
   */
  private async checkRendering(result: VerificationResult, options: VerificationOptions): Promise<void> {
    const page = await this.browser!.newPage();

    try {
      // Set up console listeners
      const consoleMessages: { type: string; text: string }[] = [];

      page.on('console', (msg) => {
        consoleMessages.push({
          type: msg.type(),
          text: msg.text(),
        });
      });

      page.on('pageerror', (error) => {
        result.checks.console.errors.push(error.message);
      });

      // Navigate to page
      const startTime = Date.now();

      const response = await page.goto(result.postUrl, {
        waitUntil: 'networkidle2',
        timeout: options.timeout || 30000,
      });

      const loadTime = Date.now() - startTime;
      result.checks.performance.loadTime = loadTime;

      // Check response status
      if (!response || response.status() !== 200) {
        result.checks.rendering.errors.push(`Page returned status ${response?.status() || 'unknown'}`);
        return;
      }

      // Get performance metrics
      const performanceTiming = JSON.parse(
        await page.evaluate(() => JSON.stringify(window.performance.timing))
      );

      result.checks.performance.domContentLoaded =
        performanceTiming.domContentLoadedEventEnd - performanceTiming.navigationStart;

      // Try to get First Contentful Paint
      try {
        const fcp = await page.evaluate(() => {
          const perfEntries = performance.getEntriesByType('paint');
          const fcpEntry = perfEntries.find((entry) => entry.name === 'first-contentful-paint');
          return fcpEntry?.startTime || null;
        });

        if (fcp) {
          result.checks.performance.firstContentfulPaint = fcp;
        }
      } catch (error) {
        // FCP not available
      }

      // Process console messages
      for (const msg of consoleMessages) {
        if (msg.type === 'error') {
          result.checks.console.errors.push(msg.text);
        } else if (msg.type === 'warning') {
          result.checks.console.warnings.push(msg.text);
        }
      }

      // Check for Elementor/Builder specific errors
      const hasBuilderErrors = await page.evaluate(() => {
        const elementorErrors = document.querySelectorAll('.elementor-error, .elementor-warning');
        return elementorErrors.length > 0;
      });

      if (hasBuilderErrors) {
        result.checks.rendering.errors.push('Page builder errors detected in DOM');
      }

      result.checks.rendering.success = result.checks.console.errors.length === 0 && !hasBuilderErrors;
    } catch (error) {
      result.checks.rendering.errors.push(
        `Rendering check failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    } finally {
      await page.close();
    }
  }

  /**
   * Check visual comparison with original
   */
  private async checkVisualComparison(result: VerificationResult, options: VerificationOptions): Promise<void> {
    try {
      const page = await this.browser!.newPage();

      // Set viewport
      await page.setViewport({ width: 1920, height: 1080 });

      // Take screenshot of WordPress page
      await page.goto(result.postUrl, { waitUntil: 'networkidle2', timeout: options.timeout || 30000 });

      const wpScreenshotPath = path.join(
        process.cwd(),
        'temp',
        `verification-wp-${options.postId}-${Date.now()}.png`
      );

      await fs.mkdir(path.dirname(wpScreenshotPath), { recursive: true });
      await page.screenshot({ path: wpScreenshotPath, fullPage: true });

      result.checks.visual.screenshotPath = wpScreenshotPath;

      // Take screenshot of original page
      await page.goto(options.originalUrl, { waitUntil: 'networkidle2', timeout: options.timeout || 30000 });

      const originalScreenshotPath = path.join(
        process.cwd(),
        'temp',
        `verification-original-${options.postId}-${Date.now()}.png`
      );

      await page.screenshot({ path: originalScreenshotPath, fullPage: true });

      // Compare screenshots
      const wpScreenshot = await fs.readFile(wpScreenshotPath);
      const originalScreenshot = await fs.readFile(originalScreenshotPath);

      const { diffImage, pixelDifference, totalPixels, diffPercentage } = await generateDiffImage(
        wpScreenshot,
        originalScreenshot,
        0.1
      );

      result.checks.visual.diffPercentage = diffPercentage;
      result.checks.visual.similarity = calculateSimilarityScore(diffPercentage);

      // Save diff image
      if (diffImage) {
        const diffImagePath = path.join(process.cwd(), 'temp', `verification-diff-${options.postId}-${Date.now()}.png`);

        await fs.writeFile(diffImagePath, diffImage);
        result.checks.visual.diffImagePath = diffImagePath;
      }

      await page.close();

      AppLogger.debug('Visual comparison complete', {
        similarity: result.checks.visual.similarity,
        diffPercentage: result.checks.visual.diffPercentage,
      });
    } catch (error) {
      AppLogger.error('Visual comparison failed', error as Error);
      result.checks.rendering.errors.push(
        `Visual comparison failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Check for broken assets
   */
  private async checkAssets(result: VerificationResult): Promise<void> {
    const page = await this.browser!.newPage();

    try {
      const failedRequests: string[] = [];
      const allRequests: Set<string> = new Set();

      // Listen for failed requests
      page.on('requestfailed', (request) => {
        const url = request.url();
        failedRequests.push(url);
        AppLogger.debug('Failed request', { url, failure: request.failure()?.errorText });
      });

      page.on('response', (response) => {
        const url = response.url();
        allRequests.add(url);

        // Check for 404, 500 errors
        if (response.status() >= 400) {
          failedRequests.push(url);
        }
      });

      await page.goto(result.postUrl, { waitUntil: 'networkidle2' });

      result.checks.assets.totalAssets = allRequests.size;
      result.checks.assets.brokenAssets = failedRequests.length;
      result.checks.assets.brokenUrls = [...new Set(failedRequests)];

      await page.close();
    } catch (error) {
      AppLogger.error('Asset check failed', error as Error);
    }
  }

  /**
   * Generate summary and recommendations
   */
  private generateSummary(result: VerificationResult): void {
    const issues: string[] = [];
    const recommendations: string[] = [];

    // Rendering issues
    if (!result.checks.rendering.success) {
      issues.push(`${result.checks.rendering.errors.length} rendering errors`);
      recommendations.push('Review console errors and fix page builder configuration');
    }

    // Asset issues
    if (result.checks.assets.brokenAssets > 0) {
      issues.push(`${result.checks.assets.brokenAssets} broken assets`);
      recommendations.push('Check media library and ensure all assets are uploaded');
    }

    // Console errors
    if (result.checks.console.errors.length > 0) {
      issues.push(`${result.checks.console.errors.length} console errors`);
      recommendations.push('Review browser console for JavaScript errors');
    }

    // Visual comparison
    if (result.checks.visual.similarity !== undefined) {
      if (result.checks.visual.similarity < 0.8) {
        issues.push(`Low visual similarity (${(result.checks.visual.similarity * 100).toFixed(1)}%)`);
        recommendations.push('Review visual differences and adjust page builder settings');
      }
    }

    // Performance issues
    if (result.checks.performance.loadTime > 5000) {
      issues.push(`Slow load time (${(result.checks.performance.loadTime / 1000).toFixed(1)}s)`);
      recommendations.push('Optimize page builder settings and enable caching');
    }

    // Generate summary
    if (issues.length === 0) {
      result.summary = '✓ Template imported successfully with no issues detected';
    } else {
      result.summary = `⚠ Template imported with ${issues.length} issue(s): ${issues.join(', ')}`;
    }

    result.recommendations = recommendations;
  }

  /**
   * Verify multiple templates in batch
   */
  async verifyBatch(
    verifications: VerificationOptions[]
  ): Promise<{ results: VerificationResult[]; summary: { total: number; passed: number; failed: number } }> {
    await this.initBrowser();

    const results: VerificationResult[] = [];

    for (const options of verifications) {
      const result = await this.verifyTemplate(options);
      results.push(result);
    }

    await this.closeBrowser();

    const summary = {
      total: results.length,
      passed: results.filter((r) => r.success).length,
      failed: results.filter((r) => !r.success).length,
    };

    return { results, summary };
  }
}

/**
 * Create template verifier instance
 */
export function createTemplateVerifier(client: WordPressAPIClient): TemplateVerifier {
  return new TemplateVerifier(client);
}
