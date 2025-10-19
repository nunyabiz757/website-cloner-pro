import puppeteer, { Browser, Page } from 'puppeteer';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import path from 'path';
import fs from 'fs/promises';

interface ComparisonResult {
  similarity: number; // 0-100%
  differenceCount: number;
  totalPixels: number;
  diffImageBase64?: string;
  sideBySideBase64?: string;
  metrics: {
    original: PageMetrics;
    cloned: PageMetrics;
  };
  visualDifferences: VisualDifference[];
}

interface PageMetrics {
  loadTime: number;
  domContentLoaded: number;
  resourceCount: number;
  totalSize: number;
  screenshotBase64: string;
}

interface VisualDifference {
  type: 'color' | 'layout' | 'missing' | 'added';
  description: string;
  location?: { x: number; y: number; width: number; height: number };
  severity: 'high' | 'medium' | 'low';
}

interface ComparisonOptions {
  viewport?: { width: number; height: number };
  fullPage?: boolean;
  threshold?: number; // Pixel difference threshold (0-1)
  includeMetrics?: boolean;
  includeVisualAnalysis?: boolean;
}

export class BeforeAfterComparisonService {
  /**
   * Compare original URL with cloned version
   */
  async compare(
    originalUrl: string,
    clonedUrl: string,
    options: ComparisonOptions = {}
  ): Promise<ComparisonResult> {
    let browser: Browser | null = null;

    try {
      browser = await puppeteer.launch({ headless: true });

      // Capture both versions
      const [originalMetrics, clonedMetrics] = await Promise.all([
        this.capturePageMetrics(browser, originalUrl, options),
        this.capturePageMetrics(browser, clonedUrl, options),
      ]);

      // Decode base64 images
      const originalImage = this.decodeBase64Image(originalMetrics.screenshotBase64);
      const clonedImage = this.decodeBase64Image(clonedMetrics.screenshotBase64);

      // Perform pixel-level comparison
      const { similarity, differenceCount, diffImageBase64 } = await this.compareImages(
        originalImage,
        clonedImage,
        options.threshold || 0.1
      );

      // Create side-by-side comparison
      const sideBySideBase64 = await this.createSideBySide(
        originalMetrics.screenshotBase64,
        clonedMetrics.screenshotBase64
      );

      // Detect visual differences
      let visualDifferences: VisualDifference[] = [];
      if (options.includeVisualAnalysis !== false) {
        visualDifferences = await this.analyzeVisualDifferences(
          browser,
          originalUrl,
          clonedUrl
        );
      }

      await browser.close();

      return {
        similarity,
        differenceCount,
        totalPixels: originalImage.width * originalImage.height,
        diffImageBase64,
        sideBySideBase64,
        metrics: {
          original: originalMetrics,
          cloned: clonedMetrics,
        },
        visualDifferences,
      };
    } catch (error) {
      if (browser) await browser.close();
      throw error;
    }
  }

  /**
   * Capture page metrics and screenshot
   */
  private async capturePageMetrics(
    browser: Browser,
    url: string,
    options: ComparisonOptions
  ): Promise<PageMetrics> {
    const page = await browser.newPage();

    // Set viewport
    if (options.viewport) {
      await page.setViewport(options.viewport);
    } else {
      await page.setViewport({ width: 1920, height: 1080 });
    }

    const startTime = Date.now();

    // Track resources
    let resourceCount = 0;
    let totalSize = 0;

    page.on('response', (response) => {
      resourceCount++;
      const headers = response.headers();
      const contentLength = headers['content-length'];
      if (contentLength) {
        totalSize += parseInt(contentLength, 10);
      }
    });

    // Navigate to URL
    await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });

    const loadTime = Date.now() - startTime;

    // Get DOM content loaded time
    const domContentLoaded = await page.evaluate(() => {
      const timing = performance.timing;
      return timing.domContentLoadedEventEnd - timing.navigationStart;
    });

    // Take screenshot
    const screenshot = await page.screenshot({
      fullPage: options.fullPage !== false,
      encoding: 'base64',
      type: 'png',
    });

    await page.close();

    return {
      loadTime,
      domContentLoaded,
      resourceCount,
      totalSize,
      screenshotBase64: screenshot as string,
    };
  }

  /**
   * Decode base64 image to PNG
   */
  private decodeBase64Image(base64: string): PNG {
    const buffer = Buffer.from(base64, 'base64');
    return PNG.sync.read(buffer);
  }

  /**
   * Compare two images pixel by pixel
   */
  private async compareImages(
    img1: PNG,
    img2: PNG,
    threshold: number
  ): Promise<{
    similarity: number;
    differenceCount: number;
    diffImageBase64: string;
  }> {
    const { width, height } = img1;

    // Ensure images are same size
    if (img1.width !== img2.width || img1.height !== img2.height) {
      // Resize to match
      const maxWidth = Math.max(img1.width, img2.width);
      const maxHeight = Math.max(img1.height, img2.height);

      const resized1 = new PNG({ width: maxWidth, height: maxHeight });
      const resized2 = new PNG({ width: maxWidth, height: maxHeight });

      PNG.bitblt(img1, resized1, 0, 0, img1.width, img1.height, 0, 0);
      PNG.bitblt(img2, resized2, 0, 0, img2.width, img2.height, 0, 0);

      return this.compareImages(resized1, resized2, threshold);
    }

    // Create diff image
    const diff = new PNG({ width, height });

    const differenceCount = pixelmatch(
      img1.data,
      img2.data,
      diff.data,
      width,
      height,
      { threshold }
    );

    const totalPixels = width * height;
    const similarity = ((totalPixels - differenceCount) / totalPixels) * 100;

    // Convert diff to base64
    const diffBuffer = PNG.sync.write(diff);
    const diffImageBase64 = diffBuffer.toString('base64');

    return {
      similarity,
      differenceCount,
      diffImageBase64: `data:image/png;base64,${diffImageBase64}`,
    };
  }

  /**
   * Create side-by-side comparison image
   */
  private async createSideBySide(
    img1Base64: string,
    img2Base64: string
  ): Promise<string> {
    const img1 = this.decodeBase64Image(img1Base64);
    const img2 = this.decodeBase64Image(img2Base64);

    const maxHeight = Math.max(img1.height, img2.height);
    const totalWidth = img1.width + img2.width + 10; // 10px gap

    const sideBySide = new PNG({ width: totalWidth, height: maxHeight });

    // Fill with white background
    for (let y = 0; y < maxHeight; y++) {
      for (let x = 0; x < totalWidth; x++) {
        const idx = (totalWidth * y + x) << 2;
        sideBySide.data[idx] = 255; // R
        sideBySide.data[idx + 1] = 255; // G
        sideBySide.data[idx + 2] = 255; // B
        sideBySide.data[idx + 3] = 255; // A
      }
    }

    // Copy first image
    PNG.bitblt(img1, sideBySide, 0, 0, img1.width, img1.height, 0, 0);

    // Copy second image (with gap)
    PNG.bitblt(img2, sideBySide, 0, 0, img2.width, img2.height, img1.width + 10, 0);

    const buffer = PNG.sync.write(sideBySide);
    return `data:image/png;base64,${buffer.toString('base64')}`;
  }

  /**
   * Analyze visual differences between pages
   */
  private async analyzeVisualDifferences(
    browser: Browser,
    originalUrl: string,
    clonedUrl: string
  ): Promise<VisualDifference[]> {
    const differences: VisualDifference[] = [];

    const [originalPage, clonedPage] = await Promise.all([
      browser.newPage(),
      browser.newPage(),
    ]);

    await Promise.all([
      originalPage.goto(originalUrl, { waitUntil: 'networkidle0' }),
      clonedPage.goto(clonedUrl, { waitUntil: 'networkidle0' }),
    ]);

    // Compare DOM structure
    const [originalElements, clonedElements] = await Promise.all([
      originalPage.evaluate(() => document.querySelectorAll('*').length),
      clonedPage.evaluate(() => document.querySelectorAll('*').length),
    ]);

    if (Math.abs(originalElements - clonedElements) > 5) {
      differences.push({
        type: 'layout',
        description: `Element count differs: ${originalElements} vs ${clonedElements}`,
        severity: 'medium',
      });
    }

    // Compare fonts
    const [originalFonts, clonedFonts] = await Promise.all([
      this.getUsedFonts(originalPage),
      this.getUsedFonts(clonedPage),
    ]);

    const missingFonts = originalFonts.filter((f) => !clonedFonts.includes(f));
    if (missingFonts.length > 0) {
      differences.push({
        type: 'missing',
        description: `Missing fonts: ${missingFonts.join(', ')}`,
        severity: 'high',
      });
    }

    // Compare colors
    const [originalColors, clonedColors] = await Promise.all([
      this.getUsedColors(originalPage),
      this.getUsedColors(clonedPage),
    ]);

    const colorDiff = Math.abs(originalColors.length - clonedColors.length);
    if (colorDiff > 5) {
      differences.push({
        type: 'color',
        description: `Color palette differs significantly (${colorDiff} colors difference)`,
        severity: 'medium',
      });
    }

    // Compare images
    const [originalImages, clonedImages] = await Promise.all([
      originalPage.evaluate(() => document.querySelectorAll('img').length),
      clonedPage.evaluate(() => document.querySelectorAll('img').length),
    ]);

    if (originalImages !== clonedImages) {
      differences.push({
        type: originalImages > clonedImages ? 'missing' : 'added',
        description: `Image count differs: ${originalImages} vs ${clonedImages}`,
        severity: 'high',
      });
    }

    await Promise.all([originalPage.close(), clonedPage.close()]);

    return differences;
  }

  /**
   * Get used fonts on page
   */
  private async getUsedFonts(page: Page): Promise<string[]> {
    return await page.evaluate(() => {
      const fonts = new Set<string>();
      const elements = document.querySelectorAll('*');

      elements.forEach((el) => {
        const fontFamily = window.getComputedStyle(el).fontFamily;
        if (fontFamily) {
          fontFamily.split(',').forEach((font) => {
            fonts.add(font.trim().replace(/['"]/g, ''));
          });
        }
      });

      return Array.from(fonts);
    });
  }

  /**
   * Get used colors on page
   */
  private async getUsedColors(page: Page): Promise<string[]> {
    return await page.evaluate(() => {
      const colors = new Set<string>();
      const elements = document.querySelectorAll('*');

      elements.forEach((el) => {
        const styles = window.getComputedStyle(el);
        const color = styles.color;
        const backgroundColor = styles.backgroundColor;

        if (color && color !== 'rgba(0, 0, 0, 0)') colors.add(color);
        if (backgroundColor && backgroundColor !== 'rgba(0, 0, 0, 0)')
          colors.add(backgroundColor);
      });

      return Array.from(colors);
    });
  }

  /**
   * Compare across multiple viewports
   */
  async compareMultipleViewports(
    originalUrl: string,
    clonedUrl: string,
    viewports: Array<{ width: number; height: number; name: string }>
  ): Promise<Array<{ viewport: string; result: ComparisonResult }>> {
    const results = [];

    for (const viewport of viewports) {
      const result = await this.compare(originalUrl, clonedUrl, {
        viewport: { width: viewport.width, height: viewport.height },
      });

      results.push({
        viewport: viewport.name,
        result,
      });
    }

    return results;
  }

  /**
   * Generate comparison report
   */
  generateReport(comparison: ComparisonResult): string {
    const similarityGrade =
      comparison.similarity >= 95
        ? 'Excellent'
        : comparison.similarity >= 85
        ? 'Good'
        : comparison.similarity >= 70
        ? 'Fair'
        : 'Poor';

    let report = `# Before/After Comparison Report\n\n`;
    report += `## Visual Similarity: ${comparison.similarity.toFixed(2)}% (${similarityGrade})\n\n`;
    report += `- Different Pixels: ${comparison.differenceCount.toLocaleString()} / ${comparison.totalPixels.toLocaleString()}\n\n`;

    report += `## Performance Metrics\n\n`;
    report += `### Original\n`;
    report += `- Load Time: ${comparison.metrics.original.loadTime}ms\n`;
    report += `- DOM Content Loaded: ${comparison.metrics.original.domContentLoaded}ms\n`;
    report += `- Resources: ${comparison.metrics.original.resourceCount}\n`;
    report += `- Total Size: ${(comparison.metrics.original.totalSize / 1024 / 1024).toFixed(2)} MB\n\n`;

    report += `### Cloned\n`;
    report += `- Load Time: ${comparison.metrics.cloned.loadTime}ms\n`;
    report += `- DOM Content Loaded: ${comparison.metrics.cloned.domContentLoaded}ms\n`;
    report += `- Resources: ${comparison.metrics.cloned.resourceCount}\n`;
    report += `- Total Size: ${(comparison.metrics.cloned.totalSize / 1024 / 1024).toFixed(2)} MB\n\n`;

    if (comparison.visualDifferences.length > 0) {
      report += `## Visual Differences (${comparison.visualDifferences.length})\n\n`;
      comparison.visualDifferences.forEach((diff, idx) => {
        report += `${idx + 1}. [${diff.severity.toUpperCase()}] ${diff.type}: ${diff.description}\n`;
      });
    }

    return report;
  }
}
