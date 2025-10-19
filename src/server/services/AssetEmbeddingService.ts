import * as cheerio from 'cheerio';
import * as path from 'path';
import * as fs from 'fs/promises';

/**
 * Smart Asset Embedding Engine
 *
 * Automatically determines whether assets should be:
 * - Base64 embedded (inline)
 * - External files (linked)
 * - Uploaded to WordPress media library
 *
 * Features:
 * - Automatic threshold configuration
 * - HTTP request optimization
 * - Cache-aware decisions
 * - WordPress integration
 */

export interface AssetEmbeddingOptions {
  inlineThreshold?: number; // Bytes (default: 10KB)
  imageThreshold?: number; // Separate threshold for images
  fontThreshold?: number; // Separate threshold for fonts
  enableBase64?: boolean;
  enableInlineSVG?: boolean;
  optimizeForHTTP2?: boolean; // HTTP/2 changes embedding strategy
  respectCacheHeaders?: boolean;
  uploadToWordPress?: boolean;
  wordPressConfig?: {
    siteUrl: string;
    apiKey?: string;
    mediaPath?: string;
  };
}

export interface AssetDecision {
  assetPath: string;
  assetType: 'image' | 'font' | 'video' | 'audio' | 'document' | 'other';
  originalSize: number;
  decision: 'inline-base64' | 'inline-svg' | 'external' | 'wordpress-upload';
  reason: string;
  base64?: string;
  externalUrl?: string;
  wordPressMediaId?: number;
  savings?: {
    httpRequests: number;
    bytes: number;
  };
  warnings?: string[];
}

export interface EmbeddingResult {
  html: string; // Modified HTML
  decisions: AssetDecision[];
  stats: {
    totalAssets: number;
    inlined: number;
    external: number;
    wordPressUploaded: number;
    totalSizeBefore: number;
    totalSizeAfter: number;
    httpRequestsSaved: number;
  };
  recommendations: string[];
}

export interface AssetAnalysis {
  path: string;
  type: string;
  size: number;
  format: string;
  usageCount: number; // How many times used in HTML
  isCritical: boolean; // Above-the-fold
  hasCache: boolean; // Can be cached
  recommendedAction: 'inline' | 'external' | 'upload';
  reason: string;
}

export class AssetEmbeddingService {
  private readonly DEFAULT_INLINE_THRESHOLD = 10240; // 10KB
  private readonly DEFAULT_IMAGE_THRESHOLD = 8192; // 8KB for images
  private readonly DEFAULT_FONT_THRESHOLD = 50000; // 50KB for fonts
  private readonly HTTP2_THRESHOLD_MULTIPLIER = 0.5; // HTTP/2 = inline less

  /**
   * Process HTML and automatically embed or externalize assets
   */
  async processAssets(
    html: string,
    assets: Map<string, Buffer>, // assetPath -> content
    options: AssetEmbeddingOptions = {}
  ): Promise<EmbeddingResult> {
    const {
      inlineThreshold = this.DEFAULT_INLINE_THRESHOLD,
      imageThreshold = this.DEFAULT_IMAGE_THRESHOLD,
      fontThreshold = this.DEFAULT_FONT_THRESHOLD,
      enableBase64 = true,
      enableInlineSVG = true,
      optimizeForHTTP2 = false,
      respectCacheHeaders = true,
      uploadToWordPress = false,
    } = options;

    const $ = cheerio.load(html);
    const decisions: AssetDecision[] = [];
    const stats = {
      totalAssets: 0,
      inlined: 0,
      external: 0,
      wordPressUploaded: 0,
      totalSizeBefore: 0,
      totalSizeAfter: 0,
      httpRequestsSaved: 0,
    };

    // Analyze all assets first
    const analyses = await this.analyzeAssets($, assets);

    // Process images
    await this.processImages($, assets, analyses, options, decisions, stats);

    // Process fonts
    await this.processFonts($, assets, analyses, options, decisions, stats);

    // Process CSS background images
    await this.processCSSBackgrounds($, assets, analyses, options, decisions, stats);

    // Process other assets (videos, audio, etc.)
    await this.processOtherAssets($, assets, analyses, options, decisions, stats);

    // Generate recommendations
    const recommendations = this.generateRecommendations(decisions, stats, options);

    return {
      html: $.html(),
      decisions,
      stats,
      recommendations,
    };
  }

  /**
   * Analyze all assets and determine optimal strategy
   */
  private async analyzeAssets(
    $: cheerio.CheerioAPI,
    assets: Map<string, Buffer>
  ): Promise<Map<string, AssetAnalysis>> {
    const analyses = new Map<string, AssetAnalysis>();

    // Count asset usage
    const usageCounts = new Map<string, number>();

    // Images
    $('img[src]').each((_, el) => {
      const src = $(el).attr('src') || '';
      usageCounts.set(src, (usageCounts.get(src) || 0) + 1);
    });

    // CSS background images
    $('[style*="background"]').each((_, el) => {
      const style = $(el).attr('style') || '';
      const matches = style.match(/url\(['"]?([^'")\s]+)['"]?\)/g);
      if (matches) {
        matches.forEach(match => {
          const url = match.replace(/url\(['"]?|['"]?\)/g, '');
          usageCounts.set(url, (usageCounts.get(url) || 0) + 1);
        });
      }
    });

    // Analyze each asset
    for (const [assetPath, content] of assets.entries()) {
      const size = content.length;
      const format = path.extname(assetPath).toLowerCase();
      const type = this.getAssetType(format);
      const usageCount = usageCounts.get(assetPath) || 1;

      // Determine if critical (simple heuristic: first few images are critical)
      const isCritical = this.isCriticalAsset($, assetPath);

      // Check if cacheable
      const hasCache = this.isCacheable(format);

      // Determine recommended action
      const { action, reason } = this.determineAction(
        size,
        type,
        usageCount,
        isCritical,
        hasCache
      );

      analyses.set(assetPath, {
        path: assetPath,
        type,
        size,
        format,
        usageCount,
        isCritical,
        hasCache,
        recommendedAction: action,
        reason,
      });
    }

    return analyses;
  }

  /**
   * Process image assets
   */
  private async processImages(
    $: cheerio.CheerioAPI,
    assets: Map<string, Buffer>,
    analyses: Map<string, AssetAnalysis>,
    options: AssetEmbeddingOptions,
    decisions: AssetDecision[],
    stats: any
  ) {
    const imageThreshold = options.imageThreshold || this.DEFAULT_IMAGE_THRESHOLD;

    $('img[src]').each((_, el) => {
      const $img = $(el);
      const src = $img.attr('src') || '';
      const asset = assets.get(src);
      const analysis = analyses.get(src);

      if (!asset || !analysis) return;

      stats.totalAssets++;
      stats.totalSizeBefore += asset.length;

      const decision = this.makeEmbeddingDecision(
        src,
        asset,
        analysis,
        imageThreshold,
        options
      );

      decisions.push(decision);

      // Apply decision
      if (decision.decision === 'inline-base64' && decision.base64) {
        $img.attr('src', decision.base64);
        stats.inlined++;
        stats.httpRequestsSaved++;
        stats.totalSizeAfter += asset.length * 1.37; // Base64 overhead
      } else if (decision.decision === 'inline-svg' && decision.base64) {
        $img.replaceWith(decision.base64); // Replace with inline SVG
        stats.inlined++;
        stats.httpRequestsSaved++;
        stats.totalSizeAfter += asset.length;
      } else if (decision.decision === 'wordpress-upload' && decision.externalUrl) {
        $img.attr('src', decision.externalUrl);
        stats.wordPressUploaded++;
        stats.totalSizeAfter += asset.length;
      } else {
        // Keep external
        stats.external++;
        stats.totalSizeAfter += asset.length;
      }
    });
  }

  /**
   * Process font assets
   */
  private async processFonts(
    $: cheerio.CheerioAPI,
    assets: Map<string, Buffer>,
    analyses: Map<string, AssetAnalysis>,
    options: AssetEmbeddingOptions,
    decisions: AssetDecision[],
    stats: any
  ) {
    const fontThreshold = options.fontThreshold || this.DEFAULT_FONT_THRESHOLD;

    // Find @font-face declarations in <style> tags
    $('style').each((_, el) => {
      let css = $(el).html() || '';
      const fontFaceRegex = /@font-face\s*{[^}]*url\(['"]?([^'")\s]+)['"]?\)[^}]*}/g;
      let match;

      while ((match = fontFaceRegex.exec(css)) !== null) {
        const fontUrl = match[1];
        const asset = assets.get(fontUrl);
        const analysis = analyses.get(fontUrl);

        if (!asset || !analysis) continue;

        stats.totalAssets++;
        stats.totalSizeBefore += asset.length;

        const decision = this.makeEmbeddingDecision(
          fontUrl,
          asset,
          analysis,
          fontThreshold,
          options
        );

        decisions.push(decision);

        // Apply decision
        if (decision.decision === 'inline-base64' && decision.base64) {
          css = css.replace(fontUrl, decision.base64);
          stats.inlined++;
          stats.httpRequestsSaved++;
          stats.totalSizeAfter += asset.length * 1.37;
        } else {
          stats.external++;
          stats.totalSizeAfter += asset.length;
        }
      }

      $(el).html(css);
    });
  }

  /**
   * Process CSS background images
   */
  private async processCSSBackgrounds(
    $: cheerio.CheerioAPI,
    assets: Map<string, Buffer>,
    analyses: Map<string, AssetAnalysis>,
    options: AssetEmbeddingOptions,
    decisions: AssetDecision[],
    stats: any
  ) {
    const imageThreshold = options.imageThreshold || this.DEFAULT_IMAGE_THRESHOLD;

    $('[style*="background"]').each((_, el) => {
      let style = $(el).attr('style') || '';
      const urlRegex = /url\(['"]?([^'")\s]+)['"]?\)/g;
      let match;

      while ((match = urlRegex.exec(style)) !== null) {
        const url = match[1];
        const asset = assets.get(url);
        const analysis = analyses.get(url);

        if (!asset || !analysis) continue;

        stats.totalAssets++;
        stats.totalSizeBefore += asset.length;

        const decision = this.makeEmbeddingDecision(
          url,
          asset,
          analysis,
          imageThreshold,
          options
        );

        decisions.push(decision);

        if (decision.decision === 'inline-base64' && decision.base64) {
          style = style.replace(url, decision.base64);
          stats.inlined++;
          stats.httpRequestsSaved++;
          stats.totalSizeAfter += asset.length * 1.37;
        } else {
          stats.external++;
          stats.totalSizeAfter += asset.length;
        }
      }

      $(el).attr('style', style);
    });
  }

  /**
   * Process other assets (video, audio, etc.)
   */
  private async processOtherAssets(
    $: cheerio.CheerioAPI,
    assets: Map<string, Buffer>,
    analyses: Map<string, AssetAnalysis>,
    options: AssetEmbeddingOptions,
    decisions: AssetDecision[],
    stats: any
  ) {
    // Videos - never inline (too large)
    $('video source[src], video[src]').each((_, el) => {
      const src = $(el).attr('src') || '';
      const asset = assets.get(src);
      const analysis = analyses.get(src);

      if (!asset || !analysis) return;

      stats.totalAssets++;
      stats.totalSizeBefore += asset.length;

      decisions.push({
        assetPath: src,
        assetType: 'video',
        originalSize: asset.length,
        decision: 'external',
        reason: 'Videos are too large to inline',
        warnings: ['Consider using video streaming service'],
      });

      stats.external++;
      stats.totalSizeAfter += asset.length;
    });

    // Audio - never inline
    $('audio source[src], audio[src]').each((_, el) => {
      const src = $(el).attr('src') || '';
      const asset = assets.get(src);
      const analysis = analyses.get(src);

      if (!asset || !analysis) return;

      stats.totalAssets++;
      stats.totalSizeBefore += asset.length;

      decisions.push({
        assetPath: src,
        assetType: 'audio',
        originalSize: asset.length,
        decision: 'external',
        reason: 'Audio files are too large to inline',
      });

      stats.external++;
      stats.totalSizeAfter += asset.length;
    });
  }

  /**
   * Make embedding decision for a single asset
   */
  private makeEmbeddingDecision(
    assetPath: string,
    content: Buffer,
    analysis: AssetAnalysis,
    threshold: number,
    options: AssetEmbeddingOptions
  ): AssetDecision {
    const size = content.length;
    const type = analysis.type as any;

    // SVG special handling
    if (options.enableInlineSVG && assetPath.endsWith('.svg')) {
      return {
        assetPath,
        assetType: type,
        originalSize: size,
        decision: 'inline-svg',
        reason: 'SVG files benefit from inlining for manipulation',
        base64: content.toString('utf-8'), // SVG as text, not base64
        savings: { httpRequests: 1, bytes: 0 },
      };
    }

    // WordPress upload for large, cacheable assets
    if (
      options.uploadToWordPress &&
      size > threshold &&
      analysis.hasCache &&
      analysis.usageCount === 1
    ) {
      return {
        assetPath,
        assetType: type,
        originalSize: size,
        decision: 'wordpress-upload',
        reason: 'Large, single-use asset - upload to WordPress media library',
        externalUrl: this.generateWordPressUrl(assetPath, options.wordPressConfig),
      };
    }

    // Base64 inline for small assets
    if (options.enableBase64 && size <= threshold) {
      // Adjust for HTTP/2
      const adjustedThreshold = options.optimizeForHTTP2
        ? threshold * this.HTTP2_THRESHOLD_MULTIPLIER
        : threshold;

      if (size <= adjustedThreshold) {
        const mimeType = this.getMimeType(assetPath);
        const base64 = `data:${mimeType};base64,${content.toString('base64')}`;

        return {
          assetPath,
          assetType: type,
          originalSize: size,
          decision: 'inline-base64',
          reason: `Small asset (${this.formatBytes(size)}) - inline to save HTTP request`,
          base64,
          savings: { httpRequests: 1, bytes: size * 0.37 }, // Base64 overhead
        };
      }
    }

    // Critical assets - consider inlining even if larger
    if (analysis.isCritical && size <= threshold * 2) {
      if (options.enableBase64) {
        const mimeType = this.getMimeType(assetPath);
        const base64 = `data:${mimeType};base64,${content.toString('base64')}`;

        return {
          assetPath,
          assetType: type,
          originalSize: size,
          decision: 'inline-base64',
          reason: 'Critical above-the-fold asset - inline for faster LCP',
          base64,
          savings: { httpRequests: 1, bytes: size * 0.37 },
          warnings: [`Asset is ${this.formatBytes(size)} - larger than typical inline threshold`],
        };
      }
    }

    // Assets used multiple times - keep external for caching
    if (analysis.usageCount > 1) {
      return {
        assetPath,
        assetType: type,
        originalSize: size,
        decision: 'external',
        reason: `Used ${analysis.usageCount} times - external file allows caching`,
      };
    }

    // Default: keep external
    return {
      assetPath,
      assetType: type,
      originalSize: size,
      decision: 'external',
      reason: `Asset size (${this.formatBytes(size)}) exceeds inline threshold`,
    };
  }

  /**
   * Determine optimal action for asset
   */
  private determineAction(
    size: number,
    type: string,
    usageCount: number,
    isCritical: boolean,
    hasCache: boolean
  ): { action: 'inline' | 'external' | 'upload'; reason: string } {
    // Never inline large videos/audio
    if (type === 'video' || type === 'audio') {
      return { action: 'external', reason: 'Media files are too large' };
    }

    // Small, single-use assets - inline
    if (size < 10240 && usageCount === 1) {
      return { action: 'inline', reason: 'Small, single-use asset' };
    }

    // Critical above-the-fold - inline if reasonable size
    if (isCritical && size < 20480) {
      return { action: 'inline', reason: 'Critical for LCP' };
    }

    // Multiple uses - external for caching
    if (usageCount > 1) {
      return { action: 'external', reason: 'Reused multiple times' };
    }

    // Large, cacheable - upload to WordPress
    if (size > 50000 && hasCache) {
      return { action: 'upload', reason: 'Large, cacheable asset' };
    }

    return { action: 'external', reason: 'Default strategy' };
  }

  /**
   * Check if asset is critical (above-the-fold)
   */
  private isCriticalAsset($: cheerio.CheerioAPI, assetPath: string): boolean {
    // Find all usages of this asset
    const images = $(`img[src="${assetPath}"]`);

    // Check if any usage is in critical section
    for (let i = 0; i < images.length; i++) {
      const $img = images.eq(i);

      // Check if in header/hero
      if ($img.closest('header, .hero, .banner, [class*="above-fold"]').length > 0) {
        return true;
      }

      // Check if early in DOM (first 5 images are usually above fold)
      if (i < 5) {
        return true;
      }
    }

    return false;
  }

  /**
   * Check if asset format is cacheable
   */
  private isCacheable(format: string): boolean {
    const cacheableFormats = [
      '.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg',
      '.woff', '.woff2', '.ttf', '.eot',
      '.mp4', '.webm', '.mp3',
    ];
    return cacheableFormats.includes(format.toLowerCase());
  }

  /**
   * Get asset type from format
   */
  private getAssetType(format: string): string {
    const imageFormats = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp', '.ico'];
    const fontFormats = ['.woff', '.woff2', '.ttf', '.eot', '.otf'];
    const videoFormats = ['.mp4', '.webm', '.ogg', '.mov'];
    const audioFormats = ['.mp3', '.wav', '.ogg', '.m4a'];

    format = format.toLowerCase();

    if (imageFormats.includes(format)) return 'image';
    if (fontFormats.includes(format)) return 'font';
    if (videoFormats.includes(format)) return 'video';
    if (audioFormats.includes(format)) return 'audio';

    return 'other';
  }

  /**
   * Get MIME type for asset
   */
  private getMimeType(assetPath: string): string {
    const ext = path.extname(assetPath).toLowerCase();
    const mimeTypes: Record<string, string> = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.svg': 'image/svg+xml',
      '.woff': 'font/woff',
      '.woff2': 'font/woff2',
      '.ttf': 'font/ttf',
      '.eot': 'application/vnd.ms-fontobject',
      '.mp4': 'video/mp4',
      '.webm': 'video/webm',
      '.mp3': 'audio/mpeg',
    };

    return mimeTypes[ext] || 'application/octet-stream';
  }

  /**
   * Generate WordPress media library URL
   */
  private generateWordPressUrl(
    assetPath: string,
    wpConfig?: AssetEmbeddingOptions['wordPressConfig']
  ): string {
    if (!wpConfig || !wpConfig.siteUrl) {
      return assetPath;
    }

    const filename = path.basename(assetPath);
    const mediaPath = wpConfig.mediaPath || '/wp-content/uploads/';

    return `${wpConfig.siteUrl}${mediaPath}${filename}`;
  }

  /**
   * Generate recommendations
   */
  private generateRecommendations(
    decisions: AssetDecision[],
    stats: any,
    options: AssetEmbeddingOptions
  ): string[] {
    const recommendations: string[] = [];

    // HTTP requests saved
    if (stats.httpRequestsSaved > 0) {
      recommendations.push(
        `✅ Saved ${stats.httpRequestsSaved} HTTP requests by inlining small assets`
      );
    }

    // Base64 overhead warning
    const inlinedSize = decisions
      .filter(d => d.decision === 'inline-base64')
      .reduce((sum, d) => sum + d.originalSize, 0);

    if (inlinedSize > 50000) {
      const inlinedKB = (inlinedSize / 1024).toFixed(2);
      recommendations.push(
        `⚠️ ${inlinedKB}KB of assets inlined. This increases HTML size by ~37% due to Base64 encoding.`
      );
    }

    // HTTP/2 recommendation
    if (!options.optimizeForHTTP2 && stats.inlined > 10) {
      recommendations.push(
        `💡 Consider enabling HTTP/2 optimization. With HTTP/2 multiplexing, fewer assets need inlining.`
      );
    }

    // WordPress upload recommendation
    const largeExternal = decisions.filter(
      d => d.decision === 'external' && d.originalSize > 100000
    );

    if (largeExternal.length > 0 && !options.uploadToWordPress) {
      recommendations.push(
        `💡 ${largeExternal.length} large assets (>100KB) detected. Consider uploading to WordPress media library.`
      );
    }

    // Critical asset handling
    const criticalExternal = decisions.filter(
      d => d.decision === 'external' && d.assetPath.includes('hero')
    );

    if (criticalExternal.length > 0) {
      recommendations.push(
        `⚠️ ${criticalExternal.length} critical assets are external. Consider inlining for faster LCP.`
      );
    }

    // Overall performance
    const reductionPercent = Math.round(
      ((stats.httpRequestsSaved / stats.totalAssets) * 100) || 0
    );

    if (reductionPercent >= 30) {
      recommendations.push(
        `✅ Excellent! Reduced HTTP requests by ${reductionPercent}%`
      );
    } else if (reductionPercent >= 10) {
      recommendations.push(
        `👍 Good! Reduced HTTP requests by ${reductionPercent}%`
      );
    } else {
      recommendations.push(
        `💡 Consider adjusting thresholds to inline more small assets (current: ${reductionPercent}% reduction)`
      );
    }

    return recommendations;
  }

  /**
   * Format bytes to human-readable format
   */
  private formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(2)}KB`;
    return `${(bytes / 1048576).toFixed(2)}MB`;
  }

  /**
   * Calculate optimal thresholds based on HTTP protocol
   */
  calculateOptimalThresholds(
    useHTTP2: boolean = false
  ): {
    inlineThreshold: number;
    imageThreshold: number;
    fontThreshold: number;
    reasoning: string;
  } {
    if (useHTTP2) {
      // HTTP/2 has multiplexing - inline less
      return {
        inlineThreshold: 5120, // 5KB
        imageThreshold: 4096, // 4KB
        fontThreshold: 25000, // 25KB
        reasoning:
          'HTTP/2 multiplexing reduces the cost of additional requests. Lower thresholds recommended.',
      };
    } else {
      // HTTP/1.1 - inline more to reduce requests
      return {
        inlineThreshold: 10240, // 10KB
        imageThreshold: 8192, // 8KB
        fontThreshold: 50000, // 50KB
        reasoning:
          'HTTP/1.1 has high request overhead. Higher thresholds recommended to reduce requests.',
      };
    }
  }

  /**
   * WordPress media library upload (placeholder for actual implementation)
   */
  async uploadToWordPress(
    assetPath: string,
    content: Buffer,
    wpConfig: AssetEmbeddingOptions['wordPressConfig']
  ): Promise<{ mediaId: number; url: string }> {
    // This would integrate with WordPress REST API
    // For now, return mock data

    const filename = path.basename(assetPath);
    const mediaId = Math.floor(Math.random() * 10000);
    const url = `${wpConfig?.siteUrl || ''}/wp-content/uploads/${filename}`;

    return { mediaId, url };
  }
}

export default new AssetEmbeddingService();
