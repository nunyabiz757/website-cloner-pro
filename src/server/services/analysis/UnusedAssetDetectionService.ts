/**
 * Unused Asset Detection Service
 *
 * Analyzes HTML and CSS files to detect unused assets (images, fonts, scripts)
 * Calculates potential savings and provides removal recommendations
 */

import * as path from 'path';

export interface Asset {
  url: string;
  type: 'image' | 'css' | 'javascript' | 'font' | 'video' | 'audio' | 'other';
  size: number;
  path: string;
  filename: string;
}

export interface AssetUsage {
  asset: Asset;
  isUsed: boolean;
  referencedIn: string[]; // File paths where it's referenced
  usageCount: number;
  confidence: 'high' | 'medium' | 'low'; // Confidence that it's truly unused
}

export interface UnusedAssetsReport {
  totalAssets: number;
  usedAssets: number;
  unusedAssets: number;
  unusedList: AssetUsage[];
  potentialSavings: number; // Bytes
  potentialSavingsFormatted: string; // "2.4 MB"
  breakdown: {
    images: { total: number; unused: number; savings: number };
    css: { total: number; unused: number; savings: number };
    javascript: { total: number; unused: number; savings: number };
    fonts: { total: number; unused: number; savings: number };
    other: { total: number; unused: number; savings: number };
  };
  scanDate: string;
  confidence: 'high' | 'medium' | 'low';
}

export class UnusedAssetDetectionService {
  /**
   * Detect unused assets in a project
   */
  static async detectUnusedAssets(
    htmlFiles: string[],
    cssFiles: string[],
    assets: Asset[]
  ): Promise<UnusedAssetsReport> {
    const assetUsageMap = new Map<string, AssetUsage>();

    // Initialize usage map
    assets.forEach(asset => {
      assetUsageMap.set(this.normalizeAssetUrl(asset.url), {
        asset,
        isUsed: false,
        referencedIn: [],
        usageCount: 0,
        confidence: 'high'
      });
    });

    // Scan HTML files
    for (const htmlFile of htmlFiles) {
      const references = this.extractReferencesFromHtml(htmlFile);
      this.markAssetsAsUsed(assetUsageMap, references, htmlFile);
    }

    // Scan CSS files
    for (const cssFile of cssFiles) {
      const references = this.extractReferencesFromCss(cssFile);
      this.markAssetsAsUsed(assetUsageMap, references, cssFile);
    }

    // Build report
    return this.buildReport(assetUsageMap);
  }

  /**
   * Extract asset references from HTML content
   */
  private static extractReferencesFromHtml(html: string): string[] {
    const references: string[] = [];

    // Extract from src attributes
    const srcMatches = html.matchAll(/src\s*=\s*["']([^"']+)["']/gi);
    for (const match of srcMatches) {
      references.push(this.normalizeAssetUrl(match[1]));
    }

    // Extract from href attributes
    const hrefMatches = html.matchAll(/href\s*=\s*["']([^"']+)["']/gi);
    for (const match of hrefMatches) {
      const url = match[1];
      // Only include asset files, not navigation links
      if (this.isAssetUrl(url)) {
        references.push(this.normalizeAssetUrl(url));
      }
    }

    // Extract from srcset attributes
    const srcsetMatches = html.matchAll(/srcset\s*=\s*["']([^"']+)["']/gi);
    for (const match of srcsetMatches) {
      // Parse srcset (multiple URLs separated by commas)
      const urls = match[1].split(',').map(part => {
        const url = part.trim().split(/\s+/)[0];
        return this.normalizeAssetUrl(url);
      });
      references.push(...urls);
    }

    // Extract from inline styles
    const styleMatches = html.matchAll(/style\s*=\s*["']([^"']+)["']/gi);
    for (const match of styleMatches) {
      const urls = this.extractUrlsFromCss(match[1]);
      references.push(...urls);
    }

    // Extract from <style> tags
    const styleTagMatches = html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi);
    for (const match of styleTagMatches) {
      const urls = this.extractUrlsFromCss(match[1]);
      references.push(...urls);
    }

    // Extract from data attributes (data-src, data-background, data-lazy, etc.)
    const dataMatches = html.matchAll(/data-[a-z-]*\s*=\s*["']([^"']+)["']/gi);
    for (const match of dataMatches) {
      if (this.looksLikeAssetUrl(match[1])) {
        references.push(this.normalizeAssetUrl(match[1]));
      }
    }

    // Extract from poster attribute (video posters)
    const posterMatches = html.matchAll(/poster\s*=\s*["']([^"']+)["']/gi);
    for (const match of posterMatches) {
      references.push(this.normalizeAssetUrl(match[1]));
    }

    return references.filter(Boolean);
  }

  /**
   * Extract asset references from CSS content
   */
  private static extractReferencesFromCss(css: string): string[] {
    return this.extractUrlsFromCss(css);
  }

  /**
   * Extract URLs from CSS content (url() functions)
   */
  private static extractUrlsFromCss(css: string): string[] {
    const references: string[] = [];

    // Extract from url() functions
    const urlMatches = css.matchAll(/url\s*\(\s*["']?([^"')]+)["']?\s*\)/gi);
    for (const match of urlMatches) {
      references.push(this.normalizeAssetUrl(match[1]));
    }

    // Extract from @import rules
    const importMatches = css.matchAll(/@import\s+["']([^"']+)["']/gi);
    for (const match of importMatches) {
      references.push(this.normalizeAssetUrl(match[1]));
    }

    return references.filter(Boolean);
  }

  /**
   * Mark assets as used based on references
   */
  private static markAssetsAsUsed(
    assetUsageMap: Map<string, AssetUsage>,
    references: string[],
    sourceFile: string
  ): void {
    references.forEach(ref => {
      // Try exact match first
      let usage = assetUsageMap.get(ref);

      // Try filename match (for relative paths)
      if (!usage) {
        const filename = this.getFilename(ref);
        for (const [url, assetUsage] of assetUsageMap) {
          if (this.getFilename(url) === filename) {
            usage = assetUsage;
            break;
          }
        }
      }

      // Try partial match (for CDN URLs vs local URLs)
      if (!usage) {
        for (const [url, assetUsage] of assetUsageMap) {
          if (this.urlsMatch(url, ref)) {
            usage = assetUsage;
            break;
          }
        }
      }

      if (usage) {
        usage.isUsed = true;
        if (!usage.referencedIn.includes(sourceFile)) {
          usage.referencedIn.push(sourceFile);
        }
        usage.usageCount++;
      }
    });
  }

  /**
   * Build final report
   */
  private static buildReport(assetUsageMap: Map<string, AssetUsage>): UnusedAssetsReport {
    const allAssets = Array.from(assetUsageMap.values());
    const unusedAssets = allAssets.filter(a => !a.isUsed);

    const potentialSavings = unusedAssets.reduce((sum, a) => sum + a.asset.size, 0);

    // Build breakdown by type
    const breakdown = {
      images: { total: 0, unused: 0, savings: 0 },
      css: { total: 0, unused: 0, savings: 0 },
      javascript: { total: 0, unused: 0, savings: 0 },
      fonts: { total: 0, unused: 0, savings: 0 },
      other: { total: 0, unused: 0, savings: 0 }
    };

    allAssets.forEach(assetUsage => {
      const type = assetUsage.asset.type;
      const key = type === 'image' ? 'images' :
                  type === 'css' ? 'css' :
                  type === 'javascript' ? 'javascript' :
                  type === 'font' ? 'fonts' : 'other';

      breakdown[key].total++;

      if (!assetUsage.isUsed) {
        breakdown[key].unused++;
        breakdown[key].savings += assetUsage.asset.size;
      }
    });

    // Calculate overall confidence
    const confidence = this.calculateConfidence(allAssets, unusedAssets);

    return {
      totalAssets: allAssets.length,
      usedAssets: allAssets.filter(a => a.isUsed).length,
      unusedAssets: unusedAssets.length,
      unusedList: unusedAssets,
      potentialSavings,
      potentialSavingsFormatted: this.formatBytes(potentialSavings),
      breakdown,
      scanDate: new Date().toISOString(),
      confidence
    };
  }

  /**
   * Calculate confidence level of the scan
   */
  private static calculateConfidence(
    allAssets: AssetUsage[],
    unusedAssets: AssetUsage[]
  ): 'high' | 'medium' | 'low' {
    // High confidence if most assets are used and we have good coverage
    const usageRate = (allAssets.length - unusedAssets.length) / allAssets.length;

    if (usageRate > 0.8) return 'high';
    if (usageRate > 0.5) return 'medium';
    return 'low';
  }

  /**
   * Normalize URL for comparison
   */
  private static normalizeAssetUrl(url: string): string {
    // Remove query strings and fragments
    url = url.split('?')[0].split('#')[0];

    // Remove leading/trailing whitespace
    url = url.trim();

    // Remove data URIs
    if (url.startsWith('data:')) return '';

    // Remove leading slashes for consistency
    url = url.replace(/^\/+/, '');

    return url;
  }

  /**
   * Get filename from URL
   */
  private static getFilename(url: string): string {
    const normalized = this.normalizeAssetUrl(url);
    return normalized.split('/').pop() || '';
  }

  /**
   * Check if two URLs match (handles CDN vs local)
   */
  private static urlsMatch(url1: string, url2: string): boolean {
    const filename1 = this.getFilename(url1);
    const filename2 = this.getFilename(url2);

    // Exact filename match
    if (filename1 === filename2 && filename1) {
      return true;
    }

    // Partial path match
    const path1 = url1.split('/').slice(-2).join('/');
    const path2 = url2.split('/').slice(-2).join('/');

    return path1 === path2 && path1 !== '';
  }

  /**
   * Check if URL looks like an asset
   */
  private static isAssetUrl(url: string): boolean {
    const assetExtensions = [
      '.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif', '.svg',
      '.css', '.js', '.woff', '.woff2', '.ttf', '.otf', '.eot',
      '.mp4', '.webm', '.mp3', '.wav', '.pdf', '.zip'
    ];

    const lowerUrl = url.toLowerCase();
    return assetExtensions.some(ext => lowerUrl.endsWith(ext));
  }

  /**
   * Check if string looks like an asset URL
   */
  private static looksLikeAssetUrl(str: string): boolean {
    return this.isAssetUrl(str) ||
           str.startsWith('http://') ||
           str.startsWith('https://') ||
           str.startsWith('//') ||
           str.startsWith('/assets') ||
           str.startsWith('/static');
  }

  /**
   * Format bytes to human-readable size
   */
  private static formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';

    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
  }

  /**
   * Get asset type from filename
   */
  static getAssetType(filename: string): Asset['type'] {
    const ext = path.extname(filename).toLowerCase();

    const typeMap: Record<string, Asset['type']> = {
      '.jpg': 'image', '.jpeg': 'image', '.png': 'image', '.gif': 'image',
      '.webp': 'image', '.avif': 'image', '.svg': 'image', '.ico': 'image',
      '.css': 'css',
      '.js': 'javascript', '.mjs': 'javascript',
      '.woff': 'font', '.woff2': 'font', '.ttf': 'font', '.otf': 'font', '.eot': 'font',
      '.mp4': 'video', '.webm': 'video', '.ogv': 'video',
      '.mp3': 'audio', '.wav': 'audio', '.ogg': 'audio'
    };

    return typeMap[ext] || 'other';
  }

  /**
   * Filter unused assets by confidence level
   */
  static filterByConfidence(
    report: UnusedAssetsReport,
    minConfidence: 'low' | 'medium' | 'high'
  ): AssetUsage[] {
    const confidenceLevels = { low: 0, medium: 1, high: 2 };
    const minLevel = confidenceLevels[minConfidence];

    return report.unusedList.filter(usage => {
      const level = confidenceLevels[usage.confidence];
      return level >= minLevel;
    });
  }

  /**
   * Get removal recommendations
   */
  static getRemovalRecommendations(report: UnusedAssetsReport): {
    safe: AssetUsage[];
    review: AssetUsage[];
    risky: AssetUsage[];
  } {
    const safe: AssetUsage[] = [];
    const review: AssetUsage[] = [];
    const risky: AssetUsage[] = [];

    report.unusedList.forEach(usage => {
      // Safe to remove: High confidence, no references, common file types
      if (usage.confidence === 'high' && usage.usageCount === 0) {
        safe.push(usage);
      }
      // Review needed: Medium confidence or small number of references
      else if (usage.confidence === 'medium' || usage.usageCount < 2) {
        review.push(usage);
      }
      // Risky: Low confidence or many references (might be dynamically loaded)
      else {
        risky.push(usage);
      }
    });

    return { safe, review, risky };
  }
}

export default UnusedAssetDetectionService;
