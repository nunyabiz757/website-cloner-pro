/**
 * Visual Comparison & Validation
 *
 * Provides visual comparison between original and converted pages:
 * - Screenshot comparison
 * - Pixel-perfect diff generation
 * - Similarity scoring (SSIM algorithm)
 * - Layout shift detection
 * - Element-level comparison
 */

import puppeteer, { Browser, Page } from 'puppeteer';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import type {
  VisualComparisonResult,
  ComparisonMetrics,
  StyleDiscrepancy,
} from '../types/component.types.js';

// Browser instance management (singleton)
let browserInstance: Browser | null = null;

/**
 * Get or create browser instance
 */
async function getBrowser(): Promise<Browser> {
  if (!browserInstance || !browserInstance.isConnected()) {
    browserInstance = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
      ]
    });
  }
  return browserInstance;
}

/**
 * Close browser instance
 */
export async function closeBrowser(): Promise<void> {
  if (browserInstance) {
    await browserInstance.close();
    browserInstance = null;
  }
}

/**
 * Main function: Compare original and converted pages visually
 */
export async function compareVisually(
  originalHTML: string,
  convertedHTML: string,
  options?: {
    viewport?: { width: number; height: number };
    fullPage?: boolean;
    threshold?: number; // Pixel diff threshold (0-1, default 0.1)
    includeMetrics?: boolean;
  }
): Promise<VisualComparisonResult> {
  const {
    viewport = { width: 1920, height: 1080 },
    fullPage = true,
    threshold = 0.1,
    includeMetrics = true,
  } = options || {};

  const browser = await getBrowser();

  try {
    // Create two pages for parallel screenshot capture
    const [originalPage, convertedPage] = await Promise.all([
      browser.newPage(),
      browser.newPage(),
    ]);

    // Set viewport
    await Promise.all([
      originalPage.setViewport(viewport),
      convertedPage.setViewport(viewport),
    ]);

    // Load HTML
    await Promise.all([
      originalPage.setContent(originalHTML, { waitUntil: 'networkidle0' }),
      convertedPage.setContent(convertedHTML, { waitUntil: 'networkidle0' }),
    ]);

    // Wait for any animations to settle
    await Promise.all([
      originalPage.waitForTimeout(500),
      convertedPage.waitForTimeout(500),
    ]);

    // Take screenshots
    const [originalScreenshot, convertedScreenshot] = await Promise.all([
      originalPage.screenshot({ fullPage, encoding: 'binary' }) as Promise<Buffer>,
      convertedPage.screenshot({ fullPage, encoding: 'binary' }) as Promise<Buffer>,
    ]);

    // Get dimensions
    const originalDimensions = await getPageDimensions(originalPage);
    const convertedDimensions = await getPageDimensions(convertedPage);

    const dimensionsMatch =
      originalDimensions.width === convertedDimensions.width &&
      originalDimensions.height === convertedDimensions.height;

    // Generate diff image and calculate metrics
    const { diffImage, pixelDifference, totalPixels, diffPercentage } =
      await generateDiffImage(
        originalScreenshot,
        convertedScreenshot,
        threshold
      );

    // Calculate similarity score
    const similarityScore = calculateSimilarityScore(diffPercentage);

    // Get detailed comparison metrics
    let comparisonMetrics: ComparisonMetrics | undefined;
    if (includeMetrics) {
      comparisonMetrics = await compareMetrics(
        originalPage,
        convertedPage,
        originalScreenshot,
        convertedScreenshot
      );
    } else {
      comparisonMetrics = {
        structuralSimilarity: similarityScore / 100,
        colorDifference: 0,
        layoutShift: 0,
        missingElements: [],
        extraElements: [],
        styleDiscrepancies: [],
      };
    }

    // Close pages
    await Promise.all([originalPage.close(), convertedPage.close()]);

    // Convert screenshots to base64
    const screenshotOriginal = originalScreenshot.toString('base64');
    const screenshotConverted = convertedScreenshot.toString('base64');
    const diffImageBase64 = diffImage?.toString('base64');

    return {
      screenshotOriginal,
      screenshotConverted,
      diffImage: diffImageBase64,
      similarityScore,
      pixelDifference,
      totalPixels,
      diffPercentage,
      comparisonMetrics,
      dimensions: {
        original: originalDimensions,
        converted: convertedDimensions,
        dimensionsMatch,
      },
      timestamp: new Date(),
    };
  } finally {
    // Browser stays open for reuse
  }
}

/**
 * Get page dimensions
 */
async function getPageDimensions(
  page: Page
): Promise<{ width: number; height: number }> {
  return await page.evaluate(() => {
    return {
      width: document.documentElement.scrollWidth,
      height: document.documentElement.scrollHeight,
    };
  });
}

/**
 * Generate diff image using pixelmatch
 */
async function generateDiffImage(
  img1Buffer: Buffer,
  img2Buffer: Buffer,
  threshold: number
): Promise<{
  diffImage: Buffer | null;
  pixelDifference: number;
  totalPixels: number;
  diffPercentage: number;
}> {
  try {
    // Parse PNG images
    const img1 = PNG.sync.read(img1Buffer);
    const img2 = PNG.sync.read(img2Buffer);

    // Ensure images have same dimensions
    const width = Math.min(img1.width, img2.width);
    const height = Math.min(img1.height, img2.height);
    const totalPixels = width * height;

    // If dimensions don't match, resize
    let img1Data = img1.data;
    let img2Data = img2.data;

    if (img1.width !== width || img1.height !== height) {
      const resized = new PNG({ width, height });
      PNG.bitblt(img1, resized, 0, 0, width, height, 0, 0);
      img1Data = resized.data;
    }

    if (img2.width !== width || img2.height !== height) {
      const resized = new PNG({ width, height });
      PNG.bitblt(img2, resized, 0, 0, width, height, 0, 0);
      img2Data = resized.data;
    }

    // Create diff image
    const diff = new PNG({ width, height });

    // Compare pixels
    const pixelDifference = pixelmatch(
      img1Data,
      img2Data,
      diff.data,
      width,
      height,
      {
        threshold,
        alpha: 0.1,
        diffColor: [255, 0, 0], // Red for differences
        diffColorAlt: [255, 255, 0], // Yellow for alt differences
      }
    );

    const diffPercentage = (pixelDifference / totalPixels) * 100;

    // Convert diff to buffer
    const diffBuffer = PNG.sync.write(diff);

    return {
      diffImage: diffBuffer,
      pixelDifference,
      totalPixels,
      diffPercentage,
    };
  } catch (error) {
    console.error('Error generating diff image:', error);
    return {
      diffImage: null,
      pixelDifference: 0,
      totalPixels: 0,
      diffPercentage: 0,
    };
  }
}

/**
 * Calculate similarity score (0-100%)
 * Based on pixel difference percentage
 */
function calculateSimilarityScore(diffPercentage: number): number {
  // Convert diff percentage to similarity score
  // 0% diff = 100% similarity
  // 100% diff = 0% similarity
  const similarityScore = 100 - diffPercentage;
  return Math.max(0, Math.min(100, Math.round(similarityScore * 100) / 100));
}

/**
 * Calculate Structural Similarity Index (SSIM)
 */
function calculateSSIM(
  img1Data: Uint8Array | Uint8ClampedArray,
  img2Data: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number
): number {
  // Simplified SSIM calculation
  // Full SSIM implementation would be more complex

  const windowSize = 8;
  const k1 = 0.01;
  const k2 = 0.03;
  const L = 255; // Dynamic range

  const c1 = (k1 * L) ** 2;
  const c2 = (k2 * L) ** 2;

  let ssimSum = 0;
  let windowCount = 0;

  for (let y = 0; y < height - windowSize; y += windowSize) {
    for (let x = 0; x < width - windowSize; x += windowSize) {
      const window1: number[] = [];
      const window2: number[] = [];

      // Extract window pixels
      for (let wy = 0; wy < windowSize; wy++) {
        for (let wx = 0; wx < windowSize; wx++) {
          const idx = ((y + wy) * width + (x + wx)) * 4;
          // Convert RGBA to grayscale
          const gray1 = Math.round(
            0.299 * img1Data[idx] +
            0.587 * img1Data[idx + 1] +
            0.114 * img1Data[idx + 2]
          );
          const gray2 = Math.round(
            0.299 * img2Data[idx] +
            0.587 * img2Data[idx + 1] +
            0.114 * img2Data[idx + 2]
          );
          window1.push(gray1);
          window2.push(gray2);
        }
      }

      // Calculate mean
      const mean1 = window1.reduce((a, b) => a + b, 0) / window1.length;
      const mean2 = window2.reduce((a, b) => a + b, 0) / window2.length;

      // Calculate variance and covariance
      let variance1 = 0;
      let variance2 = 0;
      let covariance = 0;

      for (let i = 0; i < window1.length; i++) {
        const diff1 = window1[i] - mean1;
        const diff2 = window2[i] - mean2;
        variance1 += diff1 * diff1;
        variance2 += diff2 * diff2;
        covariance += diff1 * diff2;
      }

      variance1 /= window1.length;
      variance2 /= window2.length;
      covariance /= window1.length;

      // SSIM formula
      const numerator = (2 * mean1 * mean2 + c1) * (2 * covariance + c2);
      const denominator =
        (mean1 * mean1 + mean2 * mean2 + c1) * (variance1 + variance2 + c2);

      const ssim = numerator / denominator;
      ssimSum += ssim;
      windowCount++;
    }
  }

  return windowCount > 0 ? ssimSum / windowCount : 0;
}

/**
 * Compare detailed metrics between pages
 */
async function compareMetrics(
  originalPage: Page,
  convertedPage: Page,
  originalScreenshot: Buffer,
  convertedScreenshot: Buffer
): Promise<ComparisonMetrics> {
  // Calculate SSIM
  const img1 = PNG.sync.read(originalScreenshot);
  const img2 = PNG.sync.read(convertedScreenshot);

  const width = Math.min(img1.width, img2.width);
  const height = Math.min(img1.height, img2.height);

  const structuralSimilarity = calculateSSIM(img1.data, img2.data, width, height);

  // Calculate average color difference
  const colorDifference = calculateAverageColorDiff(img1.data, img2.data, width, height);

  // Detect layout shift
  const layoutShift = await detectLayoutShift(originalPage, convertedPage);

  // Find missing and extra elements
  const { missingElements, extraElements } = await compareElements(
    originalPage,
    convertedPage
  );

  // Find style discrepancies
  const styleDiscrepancies = await compareStyles(originalPage, convertedPage);

  return {
    structuralSimilarity: Math.max(0, Math.min(1, structuralSimilarity)),
    colorDifference: Math.round(colorDifference),
    layoutShift: Math.round(layoutShift * 1000) / 1000,
    missingElements,
    extraElements,
    styleDiscrepancies,
  };
}

/**
 * Calculate average color difference
 */
function calculateAverageColorDiff(
  img1Data: Uint8Array | Uint8ClampedArray,
  img2Data: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number
): number {
  let totalDiff = 0;
  const pixelCount = width * height;

  for (let i = 0; i < pixelCount * 4; i += 4) {
    const rDiff = Math.abs(img1Data[i] - img2Data[i]);
    const gDiff = Math.abs(img1Data[i + 1] - img2Data[i + 1]);
    const bDiff = Math.abs(img1Data[i + 2] - img2Data[i + 2]);

    totalDiff += (rDiff + gDiff + bDiff) / 3;
  }

  return totalDiff / pixelCount;
}

/**
 * Detect layout shift between pages
 */
async function detectLayoutShift(
  originalPage: Page,
  convertedPage: Page
): Promise<number> {
  const [originalPositions, convertedPositions] = await Promise.all([
    getElementPositions(originalPage),
    getElementPositions(convertedPage),
  ]);

  let totalShift = 0;
  let elementCount = 0;

  for (const [selector, originalPos] of Object.entries(originalPositions)) {
    const convertedPos = convertedPositions[selector];
    if (convertedPos) {
      const shift =
        Math.abs(originalPos.top - convertedPos.top) +
        Math.abs(originalPos.left - convertedPos.left);
      totalShift += shift;
      elementCount++;
    }
  }

  return elementCount > 0 ? totalShift / elementCount : 0;
}

/**
 * Get element positions on page
 */
async function getElementPositions(
  page: Page
): Promise<Record<string, { top: number; left: number }>> {
  return await page.evaluate(() => {
    const positions: Record<string, { top: number; left: number }> = {};

    // Get positions of major elements
    const selectors = [
      'header',
      'nav',
      'main',
      'footer',
      'section',
      'article',
      '.container',
      '.hero',
      '.card',
    ];

    for (const selector of selectors) {
      const elements = document.querySelectorAll(selector);
      elements.forEach((el, index) => {
        const rect = el.getBoundingClientRect();
        const key = `${selector}[${index}]`;
        positions[key] = {
          top: rect.top + window.scrollY,
          left: rect.left + window.scrollX,
        };
      });
    }

    return positions;
  });
}

/**
 * Compare elements between pages
 */
async function compareElements(
  originalPage: Page,
  convertedPage: Page
): Promise<{ missingElements: string[]; extraElements: string[] }> {
  const [originalSelectors, convertedSelectors] = await Promise.all([
    getElementSelectors(originalPage),
    getElementSelectors(convertedPage),
  ]);

  const originalSet = new Set(originalSelectors);
  const convertedSet = new Set(convertedSelectors);

  const missingElements: string[] = [];
  const extraElements: string[] = [];

  for (const selector of originalSelectors) {
    if (!convertedSet.has(selector)) {
      missingElements.push(selector);
    }
  }

  for (const selector of convertedSelectors) {
    if (!originalSet.has(selector)) {
      extraElements.push(selector);
    }
  }

  return { missingElements, extraElements };
}

/**
 * Get element selectors from page
 */
async function getElementSelectors(page: Page): Promise<string[]> {
  return await page.evaluate(() => {
    const selectors: string[] = [];

    function generateSelector(el: Element): string {
      if (el.id) {
        return `#${el.id}`;
      }

      const classes = Array.from(el.classList)
        .filter(cls => !cls.startsWith('_') && !cls.match(/\d{5,}/))
        .slice(0, 2)
        .join('.');

      if (classes) {
        return `${el.tagName.toLowerCase()}.${classes}`;
      }

      return el.tagName.toLowerCase();
    }

    const elements = document.querySelectorAll('*');
    elements.forEach(el => {
      const selector = generateSelector(el);
      if (selector && !selectors.includes(selector)) {
        selectors.push(selector);
      }
    });

    return selectors;
  });
}

/**
 * Compare styles between pages
 */
async function compareStyles(
  originalPage: Page,
  convertedPage: Page
): Promise<StyleDiscrepancy[]> {
  const [originalStyles, convertedStyles] = await Promise.all([
    getElementStyles(originalPage),
    getElementStyles(convertedPage),
  ]);

  const discrepancies: StyleDiscrepancy[] = [];

  for (const [selector, originalStyle] of Object.entries(originalStyles)) {
    const convertedStyle = convertedStyles[selector];
    if (convertedStyle) {
      const styleDiff = compareStyleObjects(originalStyle, convertedStyle);
      if (styleDiff.length > 0) {
        styleDiff.forEach(diff => {
          discrepancies.push({
            selector,
            ...diff,
          });
        });
      }
    }
  }

  return discrepancies.slice(0, 50); // Limit to top 50 discrepancies
}

/**
 * Get element styles from page
 */
async function getElementStyles(
  page: Page
): Promise<Record<string, Record<string, string>>> {
  return await page.evaluate(() => {
    const styles: Record<string, Record<string, string>> = {};

    const importantProps = [
      'display',
      'position',
      'width',
      'height',
      'fontSize',
      'color',
      'backgroundColor',
      'margin',
      'padding',
      'flexDirection',
      'gridTemplateColumns',
    ];

    function generateSelector(el: Element): string {
      if (el.id) return `#${el.id}`;
      const classes = Array.from(el.classList).slice(0, 2).join('.');
      return classes ? `${el.tagName.toLowerCase()}.${classes}` : el.tagName.toLowerCase();
    }

    const elements = document.querySelectorAll('*');
    elements.forEach(el => {
      const selector = generateSelector(el);
      const computed = window.getComputedStyle(el);
      const styleObj: Record<string, string> = {};

      importantProps.forEach(prop => {
        const value = computed.getPropertyValue(
          prop.replace(/([A-Z])/g, '-$1').toLowerCase()
        );
        if (value) {
          styleObj[prop] = value;
        }
      });

      styles[selector] = styleObj;
    });

    return styles;
  });
}

/**
 * Compare two style objects
 */
function compareStyleObjects(
  original: Record<string, string>,
  converted: Record<string, string>
): Array<{
  property: string;
  originalValue: string;
  convertedValue: string;
  severity: 'minor' | 'moderate' | 'major';
}> {
  const diffs: Array<{
    property: string;
    originalValue: string;
    convertedValue: string;
    severity: 'minor' | 'moderate' | 'major';
  }> = [];

  for (const [prop, originalValue] of Object.entries(original)) {
    const convertedValue = converted[prop];
    if (convertedValue && originalValue !== convertedValue) {
      // Determine severity
      let severity: 'minor' | 'moderate' | 'major' = 'minor';

      if (['display', 'position', 'width', 'height'].includes(prop)) {
        severity = 'major';
      } else if (['fontSize', 'color', 'backgroundColor'].includes(prop)) {
        severity = 'moderate';
      }

      diffs.push({
        property: prop,
        originalValue,
        convertedValue,
        severity,
      });
    }
  }

  return diffs;
}

/**
 * Compare two pages at multiple breakpoints
 */
export async function compareResponsive(
  originalHTML: string,
  convertedHTML: string
): Promise<Record<string, VisualComparisonResult>> {
  const breakpoints = {
    mobile: { width: 375, height: 667 },
    tablet: { width: 768, height: 1024 },
    laptop: { width: 1366, height: 768 },
    desktop: { width: 1920, height: 1080 },
  };

  const results: Record<string, VisualComparisonResult> = {};

  for (const [name, viewport] of Object.entries(breakpoints)) {
    results[name] = await compareVisually(originalHTML, convertedHTML, {
      viewport,
      fullPage: true,
      threshold: 0.1,
      includeMetrics: true,
    });
  }

  return results;
}

/**
 * Simple screenshot comparison (wrapper for tests)
 * Takes raw screenshot buffers and compares them
 */
export async function compareScreenshots(
  screenshot1: Buffer,
  screenshot2: Buffer,
  options?: {
    threshold?: number;
  }
): Promise<{
  similarity: number;
  differences: number;
  diffPercentage: number;
  diffImage?: Buffer;
}> {
  const { threshold = 0.1 } = options || {};

  const { diffImage, pixelDifference, totalPixels, diffPercentage } =
    await generateDiffImage(screenshot1, screenshot2, threshold);

  const similarity = calculateSimilarityScore(diffPercentage);

  return {
    similarity,
    differences: pixelDifference,
    diffPercentage,
    diffImage: diffImage || undefined,
  };
}
