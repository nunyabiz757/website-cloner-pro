import puppeteer, { Browser, Page } from 'puppeteer';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

export interface ScreenshotOptions {
  url: string;
  viewport?: {
    width: number;
    height: number;
  };
  fullPage?: boolean;
  delay?: number; // Wait time in ms before screenshot
  selector?: string; // Specific element to screenshot
}

export interface ComparisonResult {
  id: string;
  originalUrl: string;
  optimizedUrl: string;
  originalScreenshot: string;
  optimizedScreenshot: string;
  diffScreenshot: string;
  diffPercentage: number;
  pixelsDifferent: number;
  totalPixels: number;
  viewport: { width: number; height: number };
  timestamp: string;
  passed: boolean; // true if diff is below threshold
  threshold: number;
}

export interface VisualTest {
  id: string;
  name: string;
  viewports: Array<{ width: number; height: number; name: string }>;
  threshold: number; // Acceptable difference percentage (0-100)
  results: ComparisonResult[];
  status: 'pending' | 'running' | 'completed' | 'failed';
  createdAt: string;
  completedAt?: string;
}

export class VisualRegressionService {
  private browser: Browser | null = null;
  private screenshotsDir: string;

  constructor() {
    this.screenshotsDir = path.join(process.cwd(), 'temp', 'screenshots');
  }

  /**
   * Initialize browser instance
   */
  private async getBrowser(): Promise<Browser> {
    if (!this.browser) {
      this.browser = await puppeteer.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
        ],
      });
    }
    return this.browser;
  }

  /**
   * Close browser instance
   */
  async closeBrowser(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  /**
   * Capture screenshot of a URL
   */
  async captureScreenshot(options: ScreenshotOptions): Promise<string> {
    const browser = await this.getBrowser();
    const page = await browser.newPage();

    try {
      // Set viewport
      if (options.viewport) {
        await page.setViewport(options.viewport);
      } else {
        await page.setViewport({ width: 1920, height: 1080 });
      }

      // Navigate to URL
      await page.goto(options.url, {
        waitUntil: 'networkidle2',
        timeout: 30000,
      });

      // Wait for additional delay if specified
      if (options.delay) {
        await page.waitForTimeout(options.delay);
      }

      // Ensure screenshots directory exists
      await fs.mkdir(this.screenshotsDir, { recursive: true });

      // Generate unique filename
      const filename = `${crypto.randomUUID()}.png`;
      const filepath = path.join(this.screenshotsDir, filename);

      // Take screenshot
      if (options.selector) {
        const element = await page.$(options.selector);
        if (element) {
          await element.screenshot({ path: filepath });
        } else {
          throw new Error(`Element not found: ${options.selector}`);
        }
      } else {
        await page.screenshot({
          path: filepath,
          fullPage: options.fullPage ?? true,
        });
      }

      await page.close();
      return filepath;
    } catch (error) {
      await page.close();
      throw error;
    }
  }

  /**
   * Compare two screenshots and generate diff image
   */
  async compareScreenshots(
    originalPath: string,
    optimizedPath: string,
    threshold: number = 0.1
  ): Promise<{
    diffPath: string;
    diffPercentage: number;
    pixelsDifferent: number;
    totalPixels: number;
    passed: boolean;
  }> {
    // Read images
    const img1Buffer = await fs.readFile(originalPath);
    const img2Buffer = await fs.readFile(optimizedPath);

    const img1 = PNG.sync.read(img1Buffer);
    const img2 = PNG.sync.read(img2Buffer);

    // Ensure images have the same dimensions
    const { width, height } = img1;
    if (img2.width !== width || img2.height !== height) {
      throw new Error('Screenshots have different dimensions');
    }

    // Create diff image
    const diff = new PNG({ width, height });

    // Compare images
    const pixelsDifferent = pixelmatch(
      img1.data,
      img2.data,
      diff.data,
      width,
      height,
      {
        threshold: 0.1, // Pixel comparison threshold (0-1)
        alpha: 0.1,
        diffColor: [255, 0, 0], // Red for differences
        diffMask: false,
      }
    );

    // Calculate difference percentage
    const totalPixels = width * height;
    const diffPercentage = (pixelsDifferent / totalPixels) * 100;

    // Save diff image
    const diffFilename = `diff-${crypto.randomUUID()}.png`;
    const diffPath = path.join(this.screenshotsDir, diffFilename);
    await fs.writeFile(diffPath, PNG.sync.write(diff));

    return {
      diffPath,
      diffPercentage,
      pixelsDifferent,
      totalPixels,
      passed: diffPercentage <= threshold,
    };
  }

  /**
   * Run complete visual regression test
   */
  async runVisualTest(
    originalUrl: string,
    optimizedUrl: string,
    viewports: Array<{ width: number; height: number; name: string }> = [
      { width: 1920, height: 1080, name: 'Desktop' },
      { width: 768, height: 1024, name: 'Tablet' },
      { width: 375, height: 667, name: 'Mobile' },
    ],
    threshold: number = 5 // 5% difference threshold
  ): Promise<ComparisonResult[]> {
    const results: ComparisonResult[] = [];

    for (const viewport of viewports) {
      try {
        // Capture original screenshot
        const originalScreenshot = await this.captureScreenshot({
          url: originalUrl,
          viewport: { width: viewport.width, height: viewport.height },
          fullPage: true,
          delay: 2000, // Wait 2s for page to settle
        });

        // Capture optimized screenshot
        const optimizedScreenshot = await this.captureScreenshot({
          url: optimizedUrl,
          viewport: { width: viewport.width, height: viewport.height },
          fullPage: true,
          delay: 2000,
        });

        // Compare screenshots
        const comparison = await this.compareScreenshots(
          originalScreenshot,
          optimizedScreenshot,
          threshold
        );

        // Create result
        const result: ComparisonResult = {
          id: crypto.randomUUID(),
          originalUrl,
          optimizedUrl,
          originalScreenshot,
          optimizedScreenshot,
          diffScreenshot: comparison.diffPath,
          diffPercentage: comparison.diffPercentage,
          pixelsDifferent: comparison.pixelsDifferent,
          totalPixels: comparison.totalPixels,
          viewport: { width: viewport.width, height: viewport.height },
          timestamp: new Date().toISOString(),
          passed: comparison.passed,
          threshold,
        };

        results.push(result);
      } catch (error) {
        console.error(`Visual test failed for ${viewport.name}:`, error);
        // Continue with other viewports even if one fails
      }
    }

    return results;
  }

  /**
   * Capture multiple screenshots at different scroll positions
   */
  async captureScrollingScreenshots(
    url: string,
    viewport: { width: number; height: number },
    scrollSteps: number = 5
  ): Promise<string[]> {
    const browser = await this.getBrowser();
    const page = await browser.newPage();
    const screenshots: string[] = [];

    try {
      await page.setViewport(viewport);
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

      // Get page height
      const pageHeight = await page.evaluate(() => document.documentElement.scrollHeight);
      const viewportHeight = viewport.height;
      const scrollDistance = Math.floor((pageHeight - viewportHeight) / scrollSteps);

      await fs.mkdir(this.screenshotsDir, { recursive: true });

      // Capture screenshots at different scroll positions
      for (let i = 0; i <= scrollSteps; i++) {
        const scrollY = i * scrollDistance;
        await page.evaluate((y) => window.scrollTo(0, y), scrollY);
        await page.waitForTimeout(500); // Wait for scroll to complete

        const filename = `scroll-${crypto.randomUUID()}.png`;
        const filepath = path.join(this.screenshotsDir, filename);
        await page.screenshot({ path: filepath });
        screenshots.push(filepath);
      }

      await page.close();
      return screenshots;
    } catch (error) {
      await page.close();
      throw error;
    }
  }

  /**
   * Compare element-specific screenshots
   */
  async compareElements(
    originalUrl: string,
    optimizedUrl: string,
    selectors: string[],
    viewport?: { width: number; height: number }
  ): Promise<
    Array<{
      selector: string;
      result: ComparisonResult | null;
      error?: string;
    }>
  > {
    const results = [];

    for (const selector of selectors) {
      try {
        // Capture original element
        const originalScreenshot = await this.captureScreenshot({
          url: originalUrl,
          viewport,
          selector,
          delay: 1000,
        });

        // Capture optimized element
        const optimizedScreenshot = await this.captureScreenshot({
          url: optimizedUrl,
          viewport,
          selector,
          delay: 1000,
        });

        // Compare
        const comparison = await this.compareScreenshots(originalScreenshot, optimizedScreenshot);

        const result: ComparisonResult = {
          id: crypto.randomUUID(),
          originalUrl,
          optimizedUrl,
          originalScreenshot,
          optimizedScreenshot,
          diffScreenshot: comparison.diffPath,
          diffPercentage: comparison.diffPercentage,
          pixelsDifferent: comparison.pixelsDifferent,
          totalPixels: comparison.totalPixels,
          viewport: viewport || { width: 1920, height: 1080 },
          timestamp: new Date().toISOString(),
          passed: comparison.passed,
          threshold: 5,
        };

        results.push({ selector, result });
      } catch (error) {
        results.push({
          selector,
          result: null,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    return results;
  }

  /**
   * Generate visual regression report
   */
  async generateReport(results: ComparisonResult[]): Promise<string> {
    const passedTests = results.filter((r) => r.passed).length;
    const failedTests = results.length - passedTests;
    const avgDifference =
      results.reduce((sum, r) => sum + r.diffPercentage, 0) / results.length;

    const report = `# Visual Regression Test Report

Generated: ${new Date().toLocaleString()}

## Summary

- **Total Tests**: ${results.length}
- **Passed**: ${passedTests} ✅
- **Failed**: ${failedTests} ❌
- **Average Difference**: ${avgDifference.toFixed(2)}%

## Test Results

${results
  .map(
    (result, idx) => `
### Test ${idx + 1} - ${result.viewport.width}x${result.viewport.height}

- **Status**: ${result.passed ? '✅ PASSED' : '❌ FAILED'}
- **Difference**: ${result.diffPercentage.toFixed(2)}%
- **Threshold**: ${result.threshold}%
- **Pixels Different**: ${result.pixelsDifferent.toLocaleString()} / ${result.totalPixels.toLocaleString()}
- **Original URL**: ${result.originalUrl}
- **Optimized URL**: ${result.optimizedUrl}

Screenshots:
- Original: \`${path.basename(result.originalScreenshot)}\`
- Optimized: \`${path.basename(result.optimizedScreenshot)}\`
- Diff: \`${path.basename(result.diffScreenshot)}\`
`
  )
  .join('\n')}

---
Generated by Website Cloner Pro - Visual Regression Testing
`;

    return report;
  }

  /**
   * Cleanup old screenshots
   */
  async cleanupScreenshots(olderThanDays: number = 7): Promise<number> {
    try {
      const files = await fs.readdir(this.screenshotsDir);
      const now = Date.now();
      const maxAge = olderThanDays * 24 * 60 * 60 * 1000;
      let deletedCount = 0;

      for (const file of files) {
        const filepath = path.join(this.screenshotsDir, file);
        const stats = await fs.stat(filepath);
        const age = now - stats.mtimeMs;

        if (age > maxAge) {
          await fs.unlink(filepath);
          deletedCount++;
        }
      }

      return deletedCount;
    } catch (error) {
      console.error('Error cleaning up screenshots:', error);
      return 0;
    }
  }
}
