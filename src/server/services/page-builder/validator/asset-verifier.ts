/**
 * Asset Verification System
 *
 * Verifies all assets used in the page:
 * - Images (img, background-image, picture, srcset)
 * - Fonts (@font-face, font-family)
 * - Videos (video, iframe embeds)
 * - Stylesheets (link[rel=stylesheet])
 * - Scripts (script[src])
 */

import puppeteer, { Browser, Page } from 'puppeteer';
import https from 'https';
import http from 'http';
import { URL } from 'url';
import type {
  AssetVerificationResult,
  AssetStatus,
  MissingAsset,
  BrokenAsset,
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
      args: ['--no-sandbox', '--disable-setuid-sandbox']
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
 * Main function: Verify all assets in HTML
 */
export async function verifyAssets(
  html: string,
  options?: {
    baseURL?: string;
    checkExternal?: boolean;
    timeout?: number;
  }
): Promise<AssetVerificationResult> {
  const {
    baseURL = 'http://localhost',
    checkExternal = true,
    timeout = 5000,
  } = options || {};

  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
    // Track network requests
    const assetRequests: Map<string, { type: string; status?: number; error?: string }> = new Map();

    // Listen to network events
    await page.setRequestInterception(true);

    page.on('request', request => {
      const resourceType = request.resourceType();
      const url = request.url();

      if (['image', 'font', 'media', 'stylesheet', 'script'].includes(resourceType)) {
        assetRequests.set(url, { type: resourceType });
      }

      request.continue();
    });

    page.on('response', response => {
      const url = response.url();
      if (assetRequests.has(url)) {
        const asset = assetRequests.get(url)!;
        asset.status = response.status();
      }
    });

    page.on('requestfailed', request => {
      const url = request.url();
      if (assetRequests.has(url)) {
        const asset = assetRequests.get(url)!;
        asset.error = request.failure()?.errorText || 'Request failed';
      }
    });

    // Load HTML
    await page.setContent(html, { waitUntil: 'networkidle0', timeout });

    // Extract all assets from DOM
    const extractedAssets = await extractAllAssets(page, baseURL);

    // Verify each asset
    const verificationResults = await verifyExtractedAssets(
      extractedAssets,
      assetRequests,
      checkExternal,
      timeout
    );

    await page.close();

    return verificationResults;
  } catch (error) {
    await page.close();
    throw error;
  }
}

/**
 * Extract all assets from page
 */
async function extractAllAssets(
  page: Page,
  baseURL: string
): Promise<{
  images: Map<string, string[]>;
  fonts: Map<string, string[]>;
  videos: Map<string, string[]>;
  stylesheets: Map<string, string[]>;
  scripts: Map<string, string[]>;
}> {
  return await page.evaluate((base) => {
    const images = new Map<string, string[]>();
    const fonts = new Map<string, string[]>();
    const videos = new Map<string, string[]>();
    const stylesheets = new Map<string, string[]>();
    const scripts = new Map<string, string[]>();

    // Helper: Resolve URL
    function resolveURL(url: string): string {
      try {
        return new URL(url, base).href;
      } catch {
        return url;
      }
    }

    // Helper: Generate selector for element
    function getSelector(el: Element): string {
      if (el.id) return `#${el.id}`;
      const classes = Array.from(el.classList).slice(0, 2).join('.');
      return classes ? `${el.tagName.toLowerCase()}.${classes}` : el.tagName.toLowerCase();
    }

    // 1. Extract images
    // <img> tags
    document.querySelectorAll('img').forEach(img => {
      const src = img.src || img.getAttribute('data-src');
      if (src) {
        const url = resolveURL(src);
        if (!images.has(url)) images.set(url, []);
        images.get(url)!.push(getSelector(img));
      }

      // srcset
      const srcset = img.srcset || img.getAttribute('data-srcset');
      if (srcset) {
        srcset.split(',').forEach(entry => {
          const url = resolveURL(entry.trim().split(' ')[0]);
          if (!images.has(url)) images.set(url, []);
          images.get(url)!.push(getSelector(img));
        });
      }
    });

    // <picture> sources
    document.querySelectorAll('picture source').forEach(source => {
      const srcset = source.getAttribute('srcset');
      if (srcset) {
        srcset.split(',').forEach(entry => {
          const url = resolveURL(entry.trim().split(' ')[0]);
          if (!images.has(url)) images.set(url, []);
          images.get(url)!.push(getSelector(source.closest('picture')!));
        });
      }
    });

    // Background images from inline styles
    document.querySelectorAll('[style*="background"]').forEach(el => {
      const style = el.getAttribute('style') || '';
      const matches = style.match(/url\(['"]?([^'"()]+)['"]?\)/g);
      if (matches) {
        matches.forEach(match => {
          const url = resolveURL(match.replace(/url\(['"]?|['"]?\)/g, ''));
          if (!images.has(url)) images.set(url, []);
          images.get(url)!.push(getSelector(el));
        });
      }
    });

    // Background images from computed styles
    document.querySelectorAll('*').forEach(el => {
      const computed = window.getComputedStyle(el);
      const bgImage = computed.backgroundImage;
      if (bgImage && bgImage !== 'none') {
        const matches = bgImage.match(/url\(['"]?([^'"()]+)['"]?\)/g);
        if (matches) {
          matches.forEach(match => {
            const url = resolveURL(match.replace(/url\(['"]?|['"]?\)/g, ''));
            if (!images.has(url)) images.set(url, []);
            images.get(url)!.push(getSelector(el));
          });
        }
      }
    });

    // 2. Extract fonts
    // @font-face from stylesheets
    Array.from(document.styleSheets).forEach(sheet => {
      try {
        Array.from(sheet.cssRules || []).forEach(rule => {
          if (rule instanceof CSSFontFaceRule) {
            const src = rule.style.getPropertyValue('src');
            if (src) {
              const matches = src.match(/url\(['"]?([^'"()]+)['"]?\)/g);
              if (matches) {
                matches.forEach(match => {
                  const url = resolveURL(match.replace(/url\(['"]?|['"]?\)/g, ''));
                  if (!fonts.has(url)) fonts.set(url, []);
                  fonts.get(url)!.push('@font-face');
                });
              }
            }
          }
        });
      } catch (e) {
        // Cross-origin stylesheets might throw errors
      }
    });

    // 3. Extract videos
    // <video> tags
    document.querySelectorAll('video').forEach(video => {
      const src = video.src || video.getAttribute('data-src');
      if (src) {
        const url = resolveURL(src);
        if (!videos.has(url)) videos.set(url, []);
        videos.get(url)!.push(getSelector(video));
      }

      // <source> tags inside <video>
      video.querySelectorAll('source').forEach(source => {
        const src = source.src;
        if (src) {
          const url = resolveURL(src);
          if (!videos.has(url)) videos.set(url, []);
          videos.get(url)!.push(getSelector(video));
        }
      });
    });

    // <iframe> embeds (YouTube, Vimeo, etc.)
    document.querySelectorAll('iframe').forEach(iframe => {
      const src = iframe.src;
      if (src && /youtube|vimeo|dailymotion|wistia/i.test(src)) {
        const url = resolveURL(src);
        if (!videos.has(url)) videos.set(url, []);
        videos.get(url)!.push(getSelector(iframe));
      }
    });

    // 4. Extract stylesheets
    document.querySelectorAll('link[rel="stylesheet"]').forEach(link => {
      const href = link.getAttribute('href');
      if (href) {
        const url = resolveURL(href);
        if (!stylesheets.has(url)) stylesheets.set(url, []);
        stylesheets.get(url)!.push(getSelector(link));
      }
    });

    // 5. Extract scripts
    document.querySelectorAll('script[src]').forEach(script => {
      const src = script.getAttribute('src');
      if (src) {
        const url = resolveURL(src);
        if (!scripts.has(url)) scripts.set(url, []);
        scripts.get(url)!.push(getSelector(script));
      }
    });

    return {
      images,
      fonts,
      videos,
      stylesheets,
      scripts,
    };
  }, baseURL);
}

/**
 * Verify extracted assets
 */
async function verifyExtractedAssets(
  extractedAssets: {
    images: Map<string, string[]>;
    fonts: Map<string, string[]>;
    videos: Map<string, string[]>;
    stylesheets: Map<string, string[]>;
    scripts: Map<string, string[]>;
  },
  networkRequests: Map<string, { type: string; status?: number; error?: string }>,
  checkExternal: boolean,
  timeout: number
): Promise<AssetVerificationResult> {
  const missingAssets: MissingAsset[] = [];
  const brokenAssets: BrokenAsset[] = [];

  // Verify each asset type
  const imageStatus = await verifyAssetType(
    extractedAssets.images,
    'image',
    networkRequests,
    checkExternal,
    timeout,
    missingAssets,
    brokenAssets
  );

  const fontStatus = await verifyAssetType(
    extractedAssets.fonts,
    'font',
    networkRequests,
    checkExternal,
    timeout,
    missingAssets,
    brokenAssets
  );

  const videoStatus = await verifyAssetType(
    extractedAssets.videos,
    'video',
    networkRequests,
    checkExternal,
    timeout,
    missingAssets,
    brokenAssets
  );

  const stylesheetStatus = await verifyAssetType(
    extractedAssets.stylesheets,
    'stylesheet',
    networkRequests,
    checkExternal,
    timeout,
    missingAssets,
    brokenAssets
  );

  const scriptStatus = await verifyAssetType(
    extractedAssets.scripts,
    'script',
    networkRequests,
    checkExternal,
    timeout,
    missingAssets,
    brokenAssets
  );

  const totalAssets =
    imageStatus.total +
    fontStatus.total +
    videoStatus.total +
    stylesheetStatus.total +
    scriptStatus.total;

  const verifiedAssets =
    imageStatus.verified +
    fontStatus.verified +
    videoStatus.verified +
    stylesheetStatus.verified +
    scriptStatus.verified;

  const verificationScore = totalAssets > 0
    ? Math.round((verifiedAssets / totalAssets) * 100)
    : 100;

  return {
    totalAssets,
    verifiedAssets,
    missingAssets,
    brokenAssets,
    assetsByType: {
      images: imageStatus,
      fonts: fontStatus,
      videos: videoStatus,
      stylesheets: stylesheetStatus,
      scripts: scriptStatus,
    },
    verificationScore,
    timestamp: new Date(),
  };
}

/**
 * Verify specific asset type
 */
async function verifyAssetType(
  assets: Map<string, string[]>,
  type: 'image' | 'font' | 'video' | 'stylesheet' | 'script',
  networkRequests: Map<string, { type: string; status?: number; error?: string }>,
  checkExternal: boolean,
  timeout: number,
  missingAssets: MissingAsset[],
  brokenAssets: BrokenAsset[]
): Promise<AssetStatus> {
  const urls = Array.from(assets.keys());
  const status: AssetStatus = {
    total: urls.length,
    verified: 0,
    missing: 0,
    broken: 0,
    urls: urls,
  };

  for (const [url, usedIn] of assets.entries()) {
    // Check network requests first
    const networkRequest = networkRequests.get(url);

    if (networkRequest) {
      if (networkRequest.status && networkRequest.status >= 200 && networkRequest.status < 400) {
        status.verified++;
        continue;
      }

      if (networkRequest.error) {
        status.broken++;
        brokenAssets.push({
          type,
          url,
          error: networkRequest.error,
          usedIn,
        });
        continue;
      }

      if (networkRequest.status && networkRequest.status >= 400) {
        status.missing++;
        missingAssets.push({
          type,
          url,
          usedIn,
          severity: type === 'image' ? 'critical' : 'warning',
          suggestion: getSuggestionForMissingAsset(url, type),
        });
        continue;
      }
    }

    // If not in network requests, check externally if enabled
    if (checkExternal && isExternalURL(url)) {
      const verified = await checkURLExists(url, timeout);
      if (verified) {
        status.verified++;
      } else {
        status.missing++;
        missingAssets.push({
          type,
          url,
          usedIn,
          severity: type === 'image' ? 'critical' : 'warning',
          suggestion: getSuggestionForMissingAsset(url, type),
        });
      }
    } else {
      // Can't verify local/relative URLs without a server
      status.verified++;
    }
  }

  return status;
}

/**
 * Check if URL is external
 */
function isExternalURL(url: string): boolean {
  try {
    const parsedURL = new URL(url);
    return parsedURL.protocol === 'http:' || parsedURL.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Check if URL exists and is accessible
 */
async function checkURLExists(url: string, timeout: number): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const parsedURL = new URL(url);
      const protocol = parsedURL.protocol === 'https:' ? https : http;

      const request = protocol.get(url, { timeout }, (response) => {
        resolve(response.statusCode !== undefined && response.statusCode < 400);
      });

      request.on('error', () => resolve(false));
      request.on('timeout', () => {
        request.destroy();
        resolve(false);
      });
    } catch {
      resolve(false);
    }
  });
}

/**
 * Get suggestion for missing asset
 */
function getSuggestionForMissingAsset(
  url: string,
  type: 'image' | 'font' | 'video' | 'stylesheet' | 'script'
): string {
  if (url.includes('404') || url.includes('not-found')) {
    return `Asset not found. Check if the URL is correct: ${url}`;
  }

  if (type === 'image') {
    return 'Consider using a placeholder image or removing the broken image reference.';
  }

  if (type === 'font') {
    return 'Use a fallback font or include the font file in your assets.';
  }

  if (type === 'video') {
    return 'Check if the video URL is correct or use an alternative video source.';
  }

  if (type === 'stylesheet') {
    return 'Ensure the stylesheet is properly linked or include styles inline.';
  }

  if (type === 'script') {
    return 'Verify the script URL or include the script inline if possible.';
  }

  return 'Verify the asset URL and ensure it is accessible.';
}

/**
 * Verify assets in converted page and compare with original
 */
export async function compareAssets(
  originalHTML: string,
  convertedHTML: string
): Promise<{
  original: AssetVerificationResult;
  converted: AssetVerificationResult;
  newAssets: string[];
  removedAssets: string[];
  compatibilityScore: number;
}> {
  const [originalResult, convertedResult] = await Promise.all([
    verifyAssets(originalHTML),
    verifyAssets(convertedHTML),
  ]);

  // Get all URLs
  const originalURLs = new Set<string>();
  const convertedURLs = new Set<string>();

  Object.values(originalResult.assetsByType).forEach(assetType => {
    assetType.urls.forEach(url => originalURLs.add(url));
  });

  Object.values(convertedResult.assetsByType).forEach(assetType => {
    assetType.urls.forEach(url => convertedURLs.add(url));
  });

  // Find differences
  const newAssets = Array.from(convertedURLs).filter(url => !originalURLs.has(url));
  const removedAssets = Array.from(originalURLs).filter(url => !convertedURLs.has(url));

  // Calculate compatibility score
  const totalOriginal = originalResult.totalAssets;
  const preserved = totalOriginal - removedAssets.length;
  const compatibilityScore = totalOriginal > 0
    ? Math.round((preserved / totalOriginal) * 100)
    : 100;

  return {
    original: originalResult,
    converted: convertedResult,
    newAssets,
    removedAssets,
    compatibilityScore,
  };
}
