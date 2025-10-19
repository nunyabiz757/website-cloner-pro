import puppeteer, { Browser, Page } from 'puppeteer';
import axios from 'axios';
import path from 'path';

interface Asset {
  url: string;
  type: 'image' | 'css' | 'js' | 'font' | 'video' | 'other';
  size: number;
  compressedSize?: number;
  optimizationPotential: number; // percentage
  issues: string[];
  recommendations: string[];
}

interface ImageOptimization {
  url: string;
  currentFormat: string;
  recommendedFormat: string;
  currentSize: number;
  estimatedSize: number;
  savingsPercent: number;
  dimensions: { width: number; height: number };
  displaySize: { width: number; height: number };
  isResponsive: boolean;
  hasRetina: boolean;
  recommendation: string;
}

interface AssetOptimizationAnalysis {
  assets: Asset[];
  images: ImageOptimization[];
  totalSize: number;
  potentialSavings: number;
  recommendations: string[];
  modernFormatSupport: {
    webp: boolean;
    avif: boolean;
    webm: boolean;
  };
}

export class AssetOptimizationService {
  private readonly imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp', '.avif'];
  private readonly fontExtensions = ['.woff', '.woff2', '.ttf', '.otf', '.eot'];
  private readonly videoExtensions = ['.mp4', '.webm', '.ogg', '.mov'];

  /**
   * Analyze assets for optimization opportunities
   */
  async analyzeAssets(url: string): Promise<AssetOptimizationAnalysis> {
    let browser: Browser | null = null;

    try {
      browser = await puppeteer.launch({ headless: true });
      const page = await browser.newPage();

      // Enable request interception to track assets
      const assets: Asset[] = [];
      const imageDetails: ImageOptimization[] = [];

      await page.setRequestInterception(true);

      page.on('request', (request) => {
        request.continue();
      });

      page.on('response', async (response) => {
        try {
          const url = response.url();
          const headers = response.headers();
          const contentType = headers['content-type'] || '';
          const contentLength = parseInt(headers['content-length'] || '0', 10);

          const asset: Asset = {
            url,
            type: this.getAssetType(url, contentType),
            size: contentLength,
            optimizationPotential: 0,
            issues: [],
            recommendations: [],
          };

          // Analyze based on type
          if (asset.type === 'image') {
            this.analyzeImage(asset, url, contentType, contentLength);
          } else if (asset.type === 'js') {
            this.analyzeJavaScript(asset, url, headers);
          } else if (asset.type === 'css') {
            this.analyzeCSS(asset, url, headers);
          } else if (asset.type === 'font') {
            this.analyzeFont(asset, url, contentType);
          }

          if (asset.size > 0) {
            assets.push(asset);
          }
        } catch (error) {
          // Ignore errors for individual assets
        }
      });

      await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });

      // Analyze images in detail
      const images = await this.analyzeImagesInDetail(page);
      imageDetails.push(...images);

      // Check modern format support
      const modernFormatSupport = await this.checkModernFormatSupport(page);

      // Calculate totals
      const totalSize = assets.reduce((sum, asset) => sum + asset.size, 0);
      const potentialSavings = assets.reduce(
        (sum, asset) => sum + (asset.size * asset.optimizationPotential) / 100,
        0
      );

      // Generate recommendations
      const recommendations = this.generateRecommendations(
        assets,
        imageDetails,
        modernFormatSupport
      );

      await browser.close();

      return {
        assets,
        images: imageDetails,
        totalSize,
        potentialSavings,
        recommendations,
        modernFormatSupport,
      };
    } catch (error) {
      if (browser) await browser.close();
      throw error;
    }
  }

  /**
   * Determine asset type from URL and content type
   */
  private getAssetType(
    url: string,
    contentType: string
  ): 'image' | 'css' | 'js' | 'font' | 'video' | 'other' {
    const ext = path.extname(new URL(url).pathname).toLowerCase();

    if (this.imageExtensions.includes(ext) || contentType.startsWith('image/')) {
      return 'image';
    } else if (ext === '.css' || contentType.includes('text/css')) {
      return 'css';
    } else if (
      ext === '.js' ||
      contentType.includes('javascript') ||
      contentType.includes('ecmascript')
    ) {
      return 'js';
    } else if (this.fontExtensions.includes(ext) || contentType.includes('font')) {
      return 'font';
    } else if (this.videoExtensions.includes(ext) || contentType.startsWith('video/')) {
      return 'video';
    }

    return 'other';
  }

  /**
   * Analyze image asset
   */
  private analyzeImage(asset: Asset, url: string, contentType: string, size: number): void {
    const ext = path.extname(new URL(url).pathname).toLowerCase();

    // Check format
    if (['.png', '.jpg', '.jpeg'].includes(ext)) {
      asset.issues.push('Legacy image format');
      asset.recommendations.push('Convert to WebP or AVIF for better compression');
      asset.optimizationPotential = 30; // WebP typically saves 30%
    }

    // Check size
    if (size > 500 * 1024) {
      // > 500 KB
      asset.issues.push('Large image file size');
      asset.recommendations.push('Compress image or use responsive images');
      asset.optimizationPotential = Math.max(asset.optimizationPotential, 40);
    }

    // Check for inline SVG opportunity
    if (ext === '.svg' && size < 10 * 1024) {
      asset.recommendations.push('Consider inlining small SVG for fewer requests');
    }
  }

  /**
   * Analyze JavaScript asset
   */
  private analyzeJavaScript(asset: Asset, url: string, headers: Record<string, string>): void {
    // Check compression
    const contentEncoding = headers['content-encoding'];
    if (!contentEncoding || !contentEncoding.includes('gzip')) {
      asset.issues.push('Not gzip compressed');
      asset.recommendations.push('Enable gzip compression on server');
      asset.optimizationPotential = 70; // JavaScript compresses well
    }

    // Check minification
    if (url.includes('.js') && !url.includes('.min.js')) {
      asset.issues.push('Possibly not minified');
      asset.recommendations.push('Minify JavaScript files');
      asset.optimizationPotential = Math.max(asset.optimizationPotential, 30);
    }

    // Check size
    if (asset.size > 200 * 1024) {
      // > 200 KB
      asset.issues.push('Large JavaScript bundle');
      asset.recommendations.push('Consider code splitting and lazy loading');
      asset.optimizationPotential = Math.max(asset.optimizationPotential, 50);
    }

    // Check caching
    const cacheControl = headers['cache-control'];
    if (!cacheControl || cacheControl.includes('no-cache')) {
      asset.issues.push('No caching headers');
      asset.recommendations.push('Add Cache-Control headers for better caching');
    }
  }

  /**
   * Analyze CSS asset
   */
  private analyzeCSS(asset: Asset, url: string, headers: Record<string, string>): void {
    // Check compression
    const contentEncoding = headers['content-encoding'];
    if (!contentEncoding || !contentEncoding.includes('gzip')) {
      asset.issues.push('Not gzip compressed');
      asset.recommendations.push('Enable gzip compression on server');
      asset.optimizationPotential = 60;
    }

    // Check minification
    if (url.includes('.css') && !url.includes('.min.css')) {
      asset.issues.push('Possibly not minified');
      asset.recommendations.push('Minify CSS files');
      asset.optimizationPotential = Math.max(asset.optimizationPotential, 25);
    }

    // Check for unused CSS opportunity
    if (asset.size > 50 * 1024) {
      // > 50 KB
      asset.issues.push('Large CSS file');
      asset.recommendations.push('Remove unused CSS rules with PurgeCSS or similar');
      asset.optimizationPotential = Math.max(asset.optimizationPotential, 40);
    }
  }

  /**
   * Analyze font asset
   */
  private analyzeFont(asset: Asset, url: string, contentType: string): void {
    const ext = path.extname(new URL(url).pathname).toLowerCase();

    // Recommend WOFF2
    if (!['.woff2'].includes(ext)) {
      asset.issues.push('Not using WOFF2 format');
      asset.recommendations.push('Convert to WOFF2 for better compression');
      asset.optimizationPotential = 30;
    }

    // Check for font subsetting opportunity
    if (asset.size > 100 * 1024) {
      // > 100 KB
      asset.issues.push('Large font file');
      asset.recommendations.push('Subset font to include only used characters');
      asset.optimizationPotential = Math.max(asset.optimizationPotential, 60);
    }

    // Recommend font-display
    asset.recommendations.push('Use font-display: swap for better loading performance');
  }

  /**
   * Analyze images in detail
   */
  private async analyzeImagesInDetail(page: Page): Promise<ImageOptimization[]> {
    return await page.evaluate(() => {
      const optimizations: any[] = [];
      const images = document.querySelectorAll('img');

      images.forEach((img) => {
        const rect = img.getBoundingClientRect();
        const naturalWidth = img.naturalWidth;
        const naturalHeight = img.naturalHeight;
        const displayWidth = rect.width;
        const displayHeight = rect.height;

        // Determine current format
        const src = img.src || '';
        let currentFormat = 'unknown';
        if (src.includes('.jpg') || src.includes('.jpeg')) currentFormat = 'jpeg';
        else if (src.includes('.png')) currentFormat = 'png';
        else if (src.includes('.gif')) currentFormat = 'gif';
        else if (src.includes('.webp')) currentFormat = 'webp';
        else if (src.includes('.avif')) currentFormat = 'avif';
        else if (src.includes('.svg')) currentFormat = 'svg';

        // Determine recommended format
        let recommendedFormat = 'webp';
        if (currentFormat === 'svg') recommendedFormat = 'svg'; // Keep SVG as is
        else if (currentFormat === 'avif') recommendedFormat = 'avif'; // Already optimal

        // Calculate optimization potential
        const isOversized = naturalWidth > displayWidth * 1.5 || naturalHeight > displayHeight * 1.5;
        const isLegacyFormat = ['jpeg', 'png', 'gif'].includes(currentFormat);

        let savingsPercent = 0;
        if (isLegacyFormat) savingsPercent += 30; // WebP/AVIF savings
        if (isOversized) savingsPercent += 50; // Resize savings

        const isResponsive = img.hasAttribute('srcset');
        const hasRetina = img.currentSrc !== img.src;

        let recommendation = '';
        if (isLegacyFormat) recommendation += `Convert ${currentFormat} to ${recommendedFormat}. `;
        if (isOversized)
          recommendation += `Resize image from ${naturalWidth}x${naturalHeight} to ${Math.round(displayWidth)}x${Math.round(displayHeight)}. `;
        if (!isResponsive)
          recommendation += 'Add srcset attribute for responsive images. ';

        if (recommendation) {
          optimizations.push({
            url: src,
            currentFormat,
            recommendedFormat,
            currentSize: 0, // Unknown from client side
            estimatedSize: 0,
            savingsPercent,
            dimensions: { width: naturalWidth, height: naturalHeight },
            displaySize: { width: displayWidth, height: displayHeight },
            isResponsive,
            hasRetina,
            recommendation: recommendation.trim(),
          });
        }
      });

      return optimizations;
    });
  }

  /**
   * Check browser support for modern formats
   */
  private async checkModernFormatSupport(page: Page): Promise<{
    webp: boolean;
    avif: boolean;
    webm: boolean;
  }> {
    return await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      canvas.width = 1;
      canvas.height = 1;

      return {
        webp: canvas.toDataURL('image/webp').indexOf('data:image/webp') === 0,
        avif: false, // AVIF check is more complex
        webm: !!document.createElement('video').canPlayType('video/webm'),
      };
    });
  }

  /**
   * Generate optimization recommendations
   */
  private generateRecommendations(
    assets: Asset[],
    images: ImageOptimization[],
    modernFormats: { webp: boolean; avif: boolean; webm: boolean }
  ): string[] {
    const recommendations: string[] = [];

    // Image recommendations
    const legacyImages = images.filter((img) =>
      ['jpeg', 'png', 'gif'].includes(img.currentFormat)
    );
    if (legacyImages.length > 0 && modernFormats.webp) {
      recommendations.push(
        `Convert ${legacyImages.length} images to WebP format for ~30% size reduction.`
      );
    }

    const oversizedImages = images.filter(
      (img) =>
        img.dimensions.width > img.displaySize.width * 1.5 ||
        img.dimensions.height > img.displaySize.height * 1.5
    );
    if (oversizedImages.length > 0) {
      recommendations.push(
        `Resize ${oversizedImages.length} oversized images to match display dimensions.`
      );
    }

    const nonResponsiveImages = images.filter((img) => !img.isResponsive);
    if (nonResponsiveImages.length > 5) {
      recommendations.push(
        `Add srcset attributes to ${nonResponsiveImages.length} images for responsive loading.`
      );
    }

    // JavaScript recommendations
    const largeScripts = assets.filter((a) => a.type === 'js' && a.size > 200 * 1024);
    if (largeScripts.length > 0) {
      recommendations.push(
        `Split ${largeScripts.length} large JavaScript bundles for faster initial load.`
      );
    }

    const uncompressedJS = assets.filter(
      (a) => a.type === 'js' && a.issues.includes('Not gzip compressed')
    );
    if (uncompressedJS.length > 0) {
      recommendations.push(`Enable gzip compression for ${uncompressedJS.length} JavaScript files.`);
    }

    // CSS recommendations
    const largeCSS = assets.filter((a) => a.type === 'css' && a.size > 50 * 1024);
    if (largeCSS.length > 0) {
      recommendations.push(
        `Remove unused CSS from ${largeCSS.length} large stylesheets using PurgeCSS.`
      );
    }

    // Font recommendations
    const largeFonts = assets.filter((a) => a.type === 'font' && a.size > 100 * 1024);
    if (largeFonts.length > 0) {
      recommendations.push(`Subset ${largeFonts.length} font files to include only used glyphs.`);
    }

    const nonWoff2Fonts = assets.filter(
      (a) => a.type === 'font' && !a.url.includes('.woff2')
    );
    if (nonWoff2Fonts.length > 0) {
      recommendations.push(`Convert ${nonWoff2Fonts.length} fonts to WOFF2 format.`);
    }

    // General recommendations
    const totalPotentialSavings = assets.reduce(
      (sum, a) => sum + (a.size * a.optimizationPotential) / 100,
      0
    );
    if (totalPotentialSavings > 500 * 1024) {
      recommendations.push(
        `Total optimization potential: ${(totalPotentialSavings / 1024 / 1024).toFixed(2)} MB (${Math.round((totalPotentialSavings / assets.reduce((sum, a) => sum + a.size, 0)) * 100)}% reduction).`
      );
    }

    return recommendations;
  }

  /**
   * Get optimization priority
   */
  getPriority(asset: Asset): 'high' | 'medium' | 'low' {
    if (asset.optimizationPotential > 50 || asset.size > 500 * 1024) {
      return 'high';
    } else if (asset.optimizationPotential > 20 || asset.size > 100 * 1024) {
      return 'medium';
    }
    return 'low';
  }
}
