import * as cheerio from 'cheerio';
import { minify as minifyJs } from 'terser';
import CleanCSS from 'clean-css';

interface BundleOptions {
  combineCSS?: boolean;
  combineJS?: boolean;
  inlineSmallResources?: boolean;
  smallResourceThreshold?: number; // bytes
  splitVendor?: boolean;
  codeSplitting?: boolean;
  chunkSize?: number; // bytes
}

interface BundleResult {
  originalFiles: number;
  bundledFiles: number;
  originalSize: number;
  bundledSize: number;
  savings: {
    bytes: number;
    percentage: number;
    httpRequests: number;
  };
  bundles: {
    name: string;
    type: 'css' | 'js';
    size: number;
    files: number;
  }[];
  optimizedHtml: string;
}

export class BundleOptimizationService {
  /**
   * Optimize bundles (combine and split intelligently)
   */
  async optimizeBundles(
    htmlContent: string,
    options: BundleOptions = {}
  ): Promise<BundleResult> {
    const defaults: BundleOptions = {
      combineCSS: true,
      combineJS: true,
      inlineSmallResources: true,
      smallResourceThreshold: 2048, // 2KB
      splitVendor: false,
      codeSplitting: false,
      chunkSize: 100 * 1024, // 100KB
    };

    const opts = { ...defaults, ...options };

    const $ = cheerio.load(htmlContent);
    const originalSize = Buffer.byteLength(htmlContent, 'utf8');
    let originalFiles = 0;
    let bundledFiles = 0;

    const bundles: BundleResult['bundles'] = [];

    // 1. Bundle CSS
    if (opts.combineCSS) {
      const cssResult = await this.bundleCSS($, opts);
      bundles.push(...cssResult.bundles);
      originalFiles += cssResult.originalFiles;
      bundledFiles += cssResult.bundledFiles;
    }

    // 2. Bundle JavaScript
    if (opts.combineJS) {
      const jsResult = await this.bundleJavaScript($, opts);
      bundles.push(...jsResult.bundles);
      originalFiles += jsResult.originalFiles;
      bundledFiles += jsResult.bundledFiles;
    }

    const optimizedHtml = $.html();
    const bundledSize = Buffer.byteLength(optimizedHtml, 'utf8');

    return {
      originalFiles,
      bundledFiles,
      originalSize,
      bundledSize,
      savings: {
        bytes: originalSize - bundledSize,
        percentage: ((originalSize - bundledSize) / originalSize) * 100,
        httpRequests: originalFiles - bundledFiles,
      },
      bundles,
      optimizedHtml,
    };
  }

  /**
   * Bundle all CSS into one or more optimized files
   */
  private async bundleCSS(
    $: cheerio.CheerioAPI,
    options: BundleOptions
  ): Promise<{
    bundles: { name: string; type: 'css'; size: number; files: number }[];
    originalFiles: number;
    bundledFiles: number;
  }> {
    const bundles: { name: string; type: 'css'; size: number; files: number }[] = [];
    let combinedCSS = '';
    let fileCount = 0;

    // Collect all inline CSS
    const styles = $('style').toArray();
    fileCount = styles.length;

    for (const style of styles) {
      const $style = $(style);
      const cssContent = $style.html() || '';

      if (cssContent.trim()) {
        combinedCSS += cssContent + '\n\n';
      }

      $style.remove();
    }

    if (combinedCSS) {
      // Minify combined CSS
      const cleanCSS = new CleanCSS({ level: 2 });
      const minified = cleanCSS.minify(combinedCSS);
      const finalCSS = minified.styles;
      const size = Buffer.byteLength(finalCSS, 'utf8');

      // Check if should inline or create separate bundle
      if (options.inlineSmallResources && size <= options.smallResourceThreshold!) {
        // Inline small CSS
        $('head').append(`<style id="bundled-css">${finalCSS}</style>`);

        bundles.push({
          name: 'inline-styles.css',
          type: 'css',
          size,
          files: fileCount,
        });
      } else {
        // Create external bundle (in real app, would save to file)
        $('head').append(`<style id="bundled-css">${finalCSS}</style>`);

        bundles.push({
          name: 'bundle.css',
          type: 'css',
          size,
          files: fileCount,
        });
      }
    }

    return {
      bundles,
      originalFiles: fileCount,
      bundledFiles: bundles.length,
    };
  }

  /**
   * Bundle all JavaScript into optimized chunks
   */
  private async bundleJavaScript(
    $: cheerio.CheerioAPI,
    options: BundleOptions
  ): Promise<{
    bundles: { name: string; type: 'js'; size: number; files: number }[];
    originalFiles: number;
    bundledFiles: number;
  }> {
    const bundles: { name: string; type: 'js'; size: number; files: number }[] = [];
    let combinedJS = '';
    let vendorJS = '';
    let appJS = '';
    let fileCount = 0;

    // Collect all inline JavaScript
    const scripts = $('script:not([src])').toArray();
    fileCount = scripts.length;

    for (const script of scripts) {
      const $script = $(script);
      const jsContent = $script.html() || '';

      if (!jsContent.trim()) continue;

      // Detect vendor/library code (heuristic)
      const isVendor = this.isVendorCode(jsContent);

      if (options.splitVendor && isVendor) {
        vendorJS += jsContent + '\n\n';
      } else {
        appJS += jsContent + '\n\n';
      }

      combinedJS += jsContent + '\n\n';
      $script.remove();
    }

    // Bundle vendor code separately
    if (options.splitVendor && vendorJS) {
      const minified = await this.minifyJS(vendorJS);
      const size = Buffer.byteLength(minified, 'utf8');

      if (options.inlineSmallResources && size <= options.smallResourceThreshold!) {
        $('body').append(`<script id="vendor-bundle">${minified}</script>`);
      } else {
        $('body').append(`<script id="vendor-bundle">${minified}</script>`);
      }

      bundles.push({
        name: 'vendor.js',
        type: 'js',
        size,
        files: Math.floor(fileCount * 0.3), // Estimate
      });
    }

    // Bundle app code
    if (appJS || (!options.splitVendor && combinedJS)) {
      const codeToBundle = appJS || combinedJS;
      const minified = await this.minifyJS(codeToBundle);
      const size = Buffer.byteLength(minified, 'utf8');

      // Code splitting: split large bundles
      if (options.codeSplitting && size > options.chunkSize!) {
        const chunks = this.splitIntoChunks(minified, options.chunkSize!);

        chunks.forEach((chunk, index) => {
          const chunkSize = Buffer.byteLength(chunk, 'utf8');
          $('body').append(`<script id="app-chunk-${index}">${chunk}</script>`);

          bundles.push({
            name: `app.chunk-${index}.js`,
            type: 'js',
            size: chunkSize,
            files: Math.ceil(fileCount / chunks.length),
          });
        });
      } else {
        // Single bundle
        if (options.inlineSmallResources && size <= options.smallResourceThreshold!) {
          $('body').append(`<script id="app-bundle">${minified}</script>`);
        } else {
          $('body').append(`<script id="app-bundle">${minified}</script>`);
        }

        bundles.push({
          name: 'app.js',
          type: 'js',
          size,
          files: fileCount - (options.splitVendor ? Math.floor(fileCount * 0.3) : 0),
        });
      }
    }

    return {
      bundles,
      originalFiles: fileCount,
      bundledFiles: bundles.length,
    };
  }

  /**
   * Detect if code is vendor/library code
   */
  private isVendorCode(code: string): boolean {
    // Heuristics for detecting vendor code
    const vendorIndicators = [
      /\/\*!.*\*\//i, // License comments
      /@license/i,
      /@preserve/i,
      /jquery/i,
      /react/i,
      /vue/i,
      /angular/i,
      /lodash/i,
      /moment/i,
      /bootstrap/i,
      /polyfill/i,
    ];

    return vendorIndicators.some((indicator) => indicator.test(code));
  }

  /**
   * Minify JavaScript
   */
  private async minifyJS(code: string): Promise<string> {
    try {
      const result = await minifyJs(code, {
        compress: {
          dead_code: true,
          drop_console: false,
          drop_debugger: true,
          passes: 2,
        },
        mangle: true,
        format: {
          comments: false,
        },
      });

      return result.code || code;
    } catch (error) {
      console.error('Failed to minify JavaScript:', error);
      return code;
    }
  }

  /**
   * Split code into chunks
   */
  private splitIntoChunks(code: string, chunkSize: number): string[] {
    const chunks: string[] = [];

    // Split by function boundaries (simple approach)
    const functions = code.split(/(?=function\s+\w+|const\s+\w+\s*=\s*\()/);

    let currentChunk = '';

    for (const func of functions) {
      if (
        Buffer.byteLength(currentChunk + func, 'utf8') > chunkSize &&
        currentChunk
      ) {
        chunks.push(currentChunk);
        currentChunk = func;
      } else {
        currentChunk += func;
      }
    }

    if (currentChunk) {
      chunks.push(currentChunk);
    }

    return chunks.length > 0 ? chunks : [code];
  }

  /**
   * Analyze bundle optimization opportunities
   */
  async analyzeBundleOpportunities(htmlContent: string): Promise<{
    totalFiles: number;
    cssFiles: number;
    jsFiles: number;
    totalSize: number;
    averageFileSize: number;
    potentialHTTPRequestSavings: number;
    potentialSizeSavings: number;
    recommendations: string[];
  }> {
    const $ = cheerio.load(htmlContent);
    const recommendations: string[] = [];

    let totalSize = 0;
    let cssFiles = 0;
    let jsFiles = 0;

    // Count CSS
    $('style').each((_, style) => {
      const content = $(style).html() || '';
      if (content.trim()) {
        cssFiles++;
        totalSize += Buffer.byteLength(content, 'utf8');
      }
    });

    $('link[rel="stylesheet"]').each(() => {
      cssFiles++;
    });

    // Count JS
    $('script:not([src])').each((_, script) => {
      const content = $(script).html() || '';
      if (content.trim()) {
        jsFiles++;
        totalSize += Buffer.byteLength(content, 'utf8');
      }
    });

    $('script[src]').each(() => {
      jsFiles++;
    });

    const totalFiles = cssFiles + jsFiles;
    const averageFileSize = totalFiles > 0 ? totalSize / totalFiles : 0;

    // Estimate savings
    const potentialHTTPRequestSavings = Math.max(0, totalFiles - 2); // Ideal: 1 CSS + 1 JS
    const potentialSizeSavings = Math.floor(totalSize * 0.15); // ~15% from bundling/minification

    // Generate recommendations
    if (cssFiles > 3) {
      recommendations.push(
        `${cssFiles} CSS file(s) detected. Bundle them into a single file to reduce HTTP requests.`
      );
    }

    if (jsFiles > 5) {
      recommendations.push(
        `${jsFiles} JavaScript file(s) detected. Consider bundling to reduce HTTP requests.`
      );
    }

    if (totalSize > 500 * 1024) {
      recommendations.push(
        `Large bundle size (${this.formatBytes(totalSize)}). Consider code splitting.`
      );
    }

    if (averageFileSize < 2 * 1024) {
      recommendations.push(
        `Small average file size (${this.formatBytes(averageFileSize)}). Inline small resources to reduce overhead.`
      );
    }

    if (potentialHTTPRequestSavings > 10) {
      recommendations.push(
        `Can save ${potentialHTTPRequestSavings} HTTP requests by bundling resources.`
      );
    }

    return {
      totalFiles,
      cssFiles,
      jsFiles,
      totalSize,
      averageFileSize,
      potentialHTTPRequestSavings,
      potentialSizeSavings,
      recommendations,
    };
  }

  /**
   * Get optimal bundle strategy
   */
  getOptimalBundleStrategy(
    totalSize: number,
    fileCount: number,
    hasVendor: boolean
  ): BundleOptions {
    return {
      combineCSS: true,
      combineJS: true,
      inlineSmallResources: totalSize / fileCount < 5 * 1024, // Inline if avg < 5KB
      smallResourceThreshold: 2048,
      splitVendor: hasVendor && totalSize > 200 * 1024, // Split if >200KB and has vendor
      codeSplitting: totalSize > 500 * 1024, // Split if >500KB
      chunkSize: 100 * 1024,
    };
  }

  /**
   * Format bytes to human-readable string
   */
  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  }
}
