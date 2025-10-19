import * as cheerio from 'cheerio';
import { minify as minifyHtml } from 'html-minifier-terser';
import { minify as minifyJs } from 'terser';
import CleanCSS from 'clean-css';
import sharp from 'sharp';
import path from 'path';
import fs from 'fs/promises';
import zlib from 'zlib';
import { promisify } from 'util';

const gzip = promisify(zlib.gzip);
const brotli = promisify(zlib.brotliCompress);

interface OptimizationOptions {
  minifyHtml?: boolean;
  minifyCSS?: boolean;
  minifyJS?: boolean;
  optimizeImages?: boolean;
  generateCriticalCSS?: boolean;
  inlineCriticalCSS?: boolean;
  lazyLoadImages?: boolean;
  compressAssets?: boolean;
  removeUnusedCSS?: boolean;
  prefetchResources?: boolean;
  imageQuality?: number; // 1-100
  imageFormats?: ('webp' | 'avif' | 'original')[];
}

interface OptimizationResult {
  originalSize: number;
  optimizedSize: number;
  compressionRatio: number;
  optimizedHtml: string;
  optimizations: {
    html?: { before: number; after: number };
    css?: { before: number; after: number };
    js?: { before: number; after: number };
    images?: { before: number; after: number; count: number };
  };
  criticalCSS?: string;
  recommendations: string[];
}

interface ImageOptimization {
  original: Buffer;
  webp?: Buffer;
  avif?: Buffer;
  optimized: Buffer;
  format: string;
  savings: number;
}

export class PerformanceOptimizedExportService {
  private tempDir: string;

  constructor() {
    this.tempDir = path.join(process.cwd(), 'temp', 'optimized');
  }

  /**
   * Create performance-optimized export
   */
  async optimizeExport(
    htmlContent: string,
    options: OptimizationOptions = {}
  ): Promise<OptimizationResult> {
    const defaults: OptimizationOptions = {
      minifyHtml: true,
      minifyCSS: true,
      minifyJS: true,
      optimizeImages: true,
      generateCriticalCSS: true,
      inlineCriticalCSS: true,
      lazyLoadImages: true,
      compressAssets: false,
      removeUnusedCSS: false,
      prefetchResources: true,
      imageQuality: 85,
      imageFormats: ['webp', 'original'],
    };

    const opts = { ...defaults, ...options };

    await fs.mkdir(this.tempDir, { recursive: true });

    const $ = cheerio.load(htmlContent);
    const originalSize = Buffer.byteLength(htmlContent, 'utf8');

    const optimizations: OptimizationResult['optimizations'] = {};
    const recommendations: string[] = [];

    // 1. Extract and optimize CSS
    let cssOptimization;
    if (opts.minifyCSS) {
      cssOptimization = await this.optimizeCSS($, opts);
      optimizations.css = cssOptimization;
    }

    // 2. Extract and optimize JavaScript
    let jsOptimization;
    if (opts.minifyJS) {
      jsOptimization = await this.optimizeJavaScript($, opts);
      optimizations.js = jsOptimization;
    }

    // 3. Generate critical CSS
    let criticalCSS;
    if (opts.generateCriticalCSS) {
      criticalCSS = await this.extractCriticalCSS($);

      if (opts.inlineCriticalCSS && criticalCSS) {
        this.inlineCriticalCSS($, criticalCSS);
        recommendations.push('Critical CSS has been inlined for faster first paint');
      }
    }

    // 4. Optimize images
    let imageOptimization;
    if (opts.optimizeImages) {
      imageOptimization = await this.optimizeImages($, opts);
      optimizations.images = imageOptimization;
    }

    // 5. Add lazy loading to images
    if (opts.lazyLoadImages) {
      this.addLazyLoading($);
      recommendations.push('Lazy loading enabled for offscreen images');
    }

    // 6. Remove unused CSS
    if (opts.removeUnusedCSS) {
      const removed = await this.removeUnusedCSS($);
      if (removed > 0) {
        recommendations.push(`Removed ${removed} unused CSS rules`);
      }
    }

    // 7. Add resource hints
    if (opts.prefetchResources) {
      this.addResourceHints($);
      recommendations.push('Resource hints added for faster loading');
    }

    // 8. Optimize fonts
    this.optimizeFonts($);
    recommendations.push('Font loading optimized with font-display: swap');

    // 9. Add performance meta tags
    this.addPerformanceMetaTags($);

    // 10. Minify HTML
    let optimizedHtml = $.html();
    if (opts.minifyHtml) {
      const htmlBefore = Buffer.byteLength(optimizedHtml, 'utf8');
      optimizedHtml = await this.minifyHTML(optimizedHtml);
      const htmlAfter = Buffer.byteLength(optimizedHtml, 'utf8');
      optimizations.html = { before: htmlBefore, after: htmlAfter };
    }

    const optimizedSize = Buffer.byteLength(optimizedHtml, 'utf8');
    const compressionRatio = ((originalSize - optimizedSize) / originalSize) * 100;

    // Add performance recommendations
    recommendations.push(...this.generateRecommendations($, optimizations));

    return {
      originalSize,
      optimizedSize,
      compressionRatio,
      optimizedHtml,
      optimizations,
      criticalCSS,
      recommendations,
    };
  }

  /**
   * Optimize CSS
   */
  private async optimizeCSS(
    $: cheerio.CheerioAPI,
    options: OptimizationOptions
  ): Promise<{ before: number; after: number }> {
    let totalBefore = 0;
    let totalAfter = 0;

    const styles = $('style').toArray();
    const cleanCSS = new CleanCSS({
      level: 2,
      compatibility: 'ie9',
    });

    for (const style of styles) {
      const $style = $(style);
      const cssContent = $style.html() || '';
      totalBefore += Buffer.byteLength(cssContent, 'utf8');

      const minified = cleanCSS.minify(cssContent);
      if (!minified.errors.length) {
        $style.html(minified.styles);
        totalAfter += Buffer.byteLength(minified.styles, 'utf8');
      } else {
        totalAfter += totalBefore;
      }
    }

    return { before: totalBefore, after: totalAfter };
  }

  /**
   * Optimize JavaScript
   */
  private async optimizeJavaScript(
    $: cheerio.CheerioAPI,
    options: OptimizationOptions
  ): Promise<{ before: number; after: number }> {
    let totalBefore = 0;
    let totalAfter = 0;

    const scripts = $('script:not([src])').toArray();

    for (const script of scripts) {
      const $script = $(script);
      const jsContent = $script.html() || '';
      totalBefore += Buffer.byteLength(jsContent, 'utf8');

      try {
        const minified = await minifyJs(jsContent, {
          compress: {
            dead_code: true,
            drop_console: false,
            drop_debugger: true,
            keep_classnames: true,
            keep_fnames: false,
          },
          mangle: {
            keep_classnames: true,
          },
          format: {
            comments: false,
          },
        });

        if (minified.code) {
          $script.html(minified.code);
          totalAfter += Buffer.byteLength(minified.code, 'utf8');
        } else {
          totalAfter += totalBefore;
        }
      } catch (error) {
        console.error('Failed to minify JavaScript:', error);
        totalAfter += totalBefore;
      }
    }

    return { before: totalBefore, after: totalAfter };
  }

  /**
   * Optimize images
   */
  private async optimizeImages(
    $: cheerio.CheerioAPI,
    options: OptimizationOptions
  ): Promise<{ before: number; after: number; count: number }> {
    let totalBefore = 0;
    let totalAfter = 0;
    let count = 0;

    const images = $('img[src^="data:image"]').toArray();

    for (const img of images) {
      const $img = $(img);
      const src = $img.attr('src') || '';

      try {
        // Extract base64 data
        const matches = src.match(/^data:image\/(\w+);base64,(.+)$/);
        if (!matches) continue;

        const [, format, base64Data] = matches;
        const buffer = Buffer.from(base64Data, 'base64');
        totalBefore += buffer.length;

        // Optimize image
        const optimized = await this.optimizeImageBuffer(buffer, options.imageQuality!);
        totalAfter += optimized.optimized.length;

        // Replace with optimized version
        const newBase64 = optimized.optimized.toString('base64');
        $img.attr('src', `data:image/${optimized.format};base64,${newBase64}`);

        // Add WebP source if available
        if (optimized.webp && options.imageFormats?.includes('webp')) {
          const webpBase64 = optimized.webp.toString('base64');
          const $picture = $('<picture>');
          $picture.append(`<source srcset="data:image/webp;base64,${webpBase64}" type="image/webp">`);
          $picture.append($img.clone());
          $img.replaceWith($picture);
        }

        count++;
      } catch (error) {
        console.error('Failed to optimize image:', error);
      }
    }

    return { before: totalBefore, after: totalAfter, count };
  }

  /**
   * Optimize image buffer
   */
  private async optimizeImageBuffer(
    buffer: Buffer,
    quality: number
  ): Promise<ImageOptimization> {
    const image = sharp(buffer);
    const metadata = await image.metadata();

    let optimized: Buffer;
    let webp: Buffer | undefined;
    let avif: Buffer | undefined;

    // Optimize original format
    if (metadata.format === 'jpeg' || metadata.format === 'jpg') {
      optimized = await image.jpeg({ quality, progressive: true }).toBuffer();
    } else if (metadata.format === 'png') {
      optimized = await image.png({ compressionLevel: 9, quality }).toBuffer();
    } else {
      optimized = buffer;
    }

    // Generate WebP version
    try {
      webp = await sharp(buffer).webp({ quality }).toBuffer();
    } catch (error) {
      console.error('Failed to generate WebP:', error);
    }

    // Generate AVIF version (optional)
    try {
      avif = await sharp(buffer).avif({ quality }).toBuffer();
    } catch (error) {
      console.error('Failed to generate AVIF:', error);
    }

    return {
      original: buffer,
      webp,
      avif,
      optimized,
      format: metadata.format || 'jpeg',
      savings: ((buffer.length - optimized.length) / buffer.length) * 100,
    };
  }

  /**
   * Extract critical CSS (above-the-fold)
   */
  private async extractCriticalCSS($: cheerio.CheerioAPI): Promise<string> {
    // Simple heuristic: extract CSS for elements in viewport
    // In production, use libraries like 'critical' or 'penthouse'

    const criticalSelectors = [
      'html', 'body', 'head',
      'header', 'nav', 'main',
      '.hero', '.banner', '.header',
      'h1', 'h2', 'h3',
      'p', 'a', 'button',
      '.above-fold', '.visible',
    ];

    let criticalCSS = '';
    const styles = $('style').toArray();

    for (const style of styles) {
      const cssContent = $(style).html() || '';

      // Extract rules matching critical selectors
      const rules = this.extractCSSRules(cssContent, criticalSelectors);
      criticalCSS += rules;
    }

    // Minify critical CSS
    const cleanCSS = new CleanCSS({ level: 2 });
    const minified = cleanCSS.minify(criticalCSS);

    return minified.styles;
  }

  /**
   * Extract CSS rules matching selectors
   */
  private extractCSSRules(css: string, selectors: string[]): string {
    let extracted = '';

    // Simple regex-based extraction
    for (const selector of selectors) {
      const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`${escapedSelector}\\s*\\{[^}]+\\}`, 'gi');
      const matches = css.match(regex) || [];
      extracted += matches.join('\n');
    }

    return extracted;
  }

  /**
   * Inline critical CSS in head
   */
  private inlineCriticalCSS($: cheerio.CheerioAPI, criticalCSS: string): void {
    // Add critical CSS as first style tag in head
    $('head').prepend(`<style id="critical-css">${criticalCSS}</style>`);

    // Load other styles asynchronously
    $('link[rel="stylesheet"]').each((_, link) => {
      const $link = $(link);
      $link.attr('media', 'print');
      $link.attr('onload', "this.media='all'");
    });
  }

  /**
   * Add lazy loading to images
   */
  private addLazyLoading($: cheerio.CheerioAPI): void {
    const images = $('img').toArray();

    images.forEach((img, index) => {
      const $img = $(img);

      // Skip first 2 images (likely above fold)
      if (index < 2) return;

      // Add loading="lazy" attribute
      $img.attr('loading', 'lazy');

      // Add decoding="async"
      $img.attr('decoding', 'async');
    });
  }

  /**
   * Remove unused CSS (basic implementation)
   */
  private async removeUnusedCSS($: cheerio.CheerioAPI): Promise<number> {
    let removedCount = 0;

    // Get all classes and IDs used in HTML
    const usedClasses = new Set<string>();
    const usedIds = new Set<string>();

    $('[class]').each((_, el) => {
      const classes = $(el).attr('class')?.split(/\s+/) || [];
      classes.forEach((cls) => usedClasses.add(cls));
    });

    $('[id]').each((_, el) => {
      const id = $(el).attr('id');
      if (id) usedIds.add(id);
    });

    // Process styles
    const styles = $('style').toArray();

    for (const style of styles) {
      const $style = $(style);
      const cssContent = $style.html() || '';

      // Remove rules for unused classes/IDs
      let optimizedCSS = cssContent;
      const classRegex = /\.([a-zA-Z0-9_-]+)\s*\{[^}]+\}/g;
      const idRegex = /#([a-zA-Z0-9_-]+)\s*\{[^}]+\}/g;

      // Check class rules
      let match;
      while ((match = classRegex.exec(cssContent)) !== null) {
        const className = match[1];
        if (!usedClasses.has(className)) {
          optimizedCSS = optimizedCSS.replace(match[0], '');
          removedCount++;
        }
      }

      // Check ID rules
      while ((match = idRegex.exec(cssContent)) !== null) {
        const idName = match[1];
        if (!usedIds.has(idName)) {
          optimizedCSS = optimizedCSS.replace(match[0], '');
          removedCount++;
        }
      }

      $style.html(optimizedCSS);
    }

    return removedCount;
  }

  /**
   * Add resource hints for faster loading
   */
  private addResourceHints($: cheerio.CheerioAPI): void {
    const head = $('head');

    // Add DNS prefetch for external domains
    const externalLinks = new Set<string>();
    $('a[href^="http"], img[src^="http"], script[src^="http"], link[href^="http"]').each((_, el) => {
      const url = $(el).attr('href') || $(el).attr('src');
      if (url) {
        try {
          const domain = new URL(url).origin;
          externalLinks.add(domain);
        } catch (error) {
          // Invalid URL
        }
      }
    });

    externalLinks.forEach((domain) => {
      head.append(`<link rel="dns-prefetch" href="${domain}">`);
    });

    // Add preconnect for important domains
    const importantDomains = Array.from(externalLinks).slice(0, 3);
    importantDomains.forEach((domain) => {
      head.append(`<link rel="preconnect" href="${domain}" crossorigin>`);
    });
  }

  /**
   * Optimize font loading
   */
  private optimizeFonts($: cheerio.CheerioAPI): void {
    // Add font-display: swap to @font-face rules
    const styles = $('style').toArray();

    for (const style of styles) {
      const $style = $(style);
      let cssContent = $style.html() || '';

      // Add font-display to @font-face rules
      cssContent = cssContent.replace(
        /(@font-face\s*\{[^}]*)(})/gi,
        (match, p1, p2) => {
          if (p1.includes('font-display')) return match;
          return `${p1}font-display: swap;${p2}`;
        }
      );

      $style.html(cssContent);
    }

    // Preload important fonts
    $('head').append(
      '<link rel="preload" as="font" type="font/woff2" crossorigin>'
    );
  }

  /**
   * Add performance meta tags
   */
  private addPerformanceMetaTags($: cheerio.CheerioAPI): void {
    const head = $('head');

    // Viewport meta
    if (!$('meta[name="viewport"]').length) {
      head.append('<meta name="viewport" content="width=device-width, initial-scale=1">');
    }

    // Optimize rendering
    head.append('<meta http-equiv="x-ua-compatible" content="ie=edge">');

    // Add performance hints
    head.append('<!-- Optimized by Website Cloner Pro -->');
  }

  /**
   * Minify HTML
   */
  private async minifyHTML(html: string): Promise<string> {
    return await minifyHtml(html, {
      collapseWhitespace: true,
      removeComments: true,
      removeRedundantAttributes: true,
      removeScriptTypeAttributes: true,
      removeStyleLinkTypeAttributes: true,
      useShortDoctype: true,
      minifyCSS: true,
      minifyJS: true,
      minifyURLs: true,
    });
  }

  /**
   * Generate performance recommendations
   */
  private generateRecommendations(
    $: cheerio.CheerioAPI,
    optimizations: OptimizationResult['optimizations']
  ): string[] {
    const recommendations: string[] = [];

    // Check image count
    const imageCount = $('img').length;
    if (imageCount > 20) {
      recommendations.push(
        `Consider reducing image count (${imageCount} images). Use image sprites or CSS for icons.`
      );
    }

    // Check script count
    const scriptCount = $('script').length;
    if (scriptCount > 10) {
      recommendations.push(
        `High script count (${scriptCount}). Consider bundling scripts to reduce HTTP requests.`
      );
    }

    // Check stylesheet count
    const stylesheetCount = $('link[rel="stylesheet"]').length + $('style').length;
    if (stylesheetCount > 5) {
      recommendations.push(
        `Multiple stylesheets detected (${stylesheetCount}). Consider combining into one file.`
      );
    }

    // Check for render-blocking resources
    const renderBlockingScripts = $('script[src]:not([async]):not([defer])').length;
    if (renderBlockingScripts > 0) {
      recommendations.push(
        `${renderBlockingScripts} render-blocking scripts found. Add async or defer attributes.`
      );
    }

    // Check CSS optimizations
    if (optimizations.css) {
      const savings = optimizations.css.before - optimizations.css.after;
      const percent = ((savings / optimizations.css.before) * 100).toFixed(1);
      recommendations.push(`CSS optimized: ${percent}% reduction (${savings} bytes saved)`);
    }

    // Check JS optimizations
    if (optimizations.js) {
      const savings = optimizations.js.before - optimizations.js.after;
      const percent = ((savings / optimizations.js.before) * 100).toFixed(1);
      recommendations.push(`JavaScript optimized: ${percent}% reduction (${savings} bytes saved)`);
    }

    // Check image optimizations
    if (optimizations.images && optimizations.images.count > 0) {
      const savings = optimizations.images.before - optimizations.images.after;
      const percent = ((savings / optimizations.images.before) * 100).toFixed(1);
      recommendations.push(
        `${optimizations.images.count} images optimized: ${percent}% reduction (${savings} bytes saved)`
      );
    }

    return recommendations;
  }

  /**
   * Generate compressed versions
   */
  async generateCompressedVersions(html: string): Promise<{
    gzip: Buffer;
    brotli: Buffer;
    gzipSize: number;
    brotliSize: number;
  }> {
    const gzipBuffer = await gzip(html, { level: 9 });
    const brotliBuffer = await brotli(html, {
      params: {
        [zlib.constants.BROTLI_PARAM_QUALITY]: 11,
      },
    });

    return {
      gzip: gzipBuffer,
      brotli: brotliBuffer,
      gzipSize: gzipBuffer.length,
      brotliSize: brotliBuffer.length,
    };
  }
}
