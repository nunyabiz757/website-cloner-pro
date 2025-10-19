import { minify as minifyHtml } from 'html-minifier-terser';
import { minify as minifyJs } from 'terser';
import CleanCSS from 'clean-css';
import * as cheerio from 'cheerio';

interface MinificationOptions {
  minifyHtml?: boolean;
  minifyInlineCSS?: boolean;
  minifyInlineJS?: boolean;
  minifyExternalCSS?: boolean;
  minifyExternalJS?: boolean;
  removeComments?: boolean;
  removeWhitespace?: boolean;
  preserveLineBreaks?: boolean;
  mangleVariables?: boolean;
}

interface MinificationResult {
  originalSize: number;
  minifiedSize: number;
  savings: {
    bytes: number;
    percentage: number;
  };
  breakdown: {
    html?: { before: number; after: number; savings: number };
    css?: { before: number; after: number; savings: number; files: number };
    js?: { before: number; after: number; savings: number; files: number };
  };
  minifiedContent: string;
  errors: string[];
}

export class CodeMinificationService {
  /**
   * Minify HTML and all embedded code
   */
  async minifyAll(
    htmlContent: string,
    options: MinificationOptions = {}
  ): Promise<MinificationResult> {
    const defaults: MinificationOptions = {
      minifyHtml: true,
      minifyInlineCSS: true,
      minifyInlineJS: true,
      minifyExternalCSS: false,
      minifyExternalJS: false,
      removeComments: true,
      removeWhitespace: true,
      preserveLineBreaks: false,
      mangleVariables: true,
    };

    const opts = { ...defaults, ...options };

    const originalSize = Buffer.byteLength(htmlContent, 'utf8');
    const errors: string[] = [];
    const breakdown: MinificationResult['breakdown'] = {};

    let processedHtml = htmlContent;

    // Step 1: Minify inline CSS and JS first (before HTML minification)
    if (opts.minifyInlineCSS || opts.minifyInlineJS) {
      const $ = cheerio.load(htmlContent);

      // Minify inline CSS
      if (opts.minifyInlineCSS) {
        const cssResult = await this.minifyInlineStyles($);
        breakdown.css = cssResult;
      }

      // Minify inline JS
      if (opts.minifyInlineJS) {
        const jsResult = await this.minifyInlineScripts($, opts.mangleVariables!);
        breakdown.js = jsResult;
      }

      processedHtml = $.html();
    }

    // Step 2: Minify HTML
    if (opts.minifyHtml) {
      const htmlBefore = Buffer.byteLength(processedHtml, 'utf8');

      try {
        processedHtml = await minifyHtml(processedHtml, {
          collapseWhitespace: opts.removeWhitespace,
          removeComments: opts.removeComments,
          removeRedundantAttributes: true,
          removeScriptTypeAttributes: true,
          removeStyleLinkTypeAttributes: true,
          useShortDoctype: true,
          minifyCSS: opts.minifyInlineCSS,
          minifyJS: opts.minifyInlineJS,
          minifyURLs: true,
          preserveLineBreaks: opts.preserveLineBreaks,
          removeEmptyAttributes: true,
          removeEmptyElements: false, // Keep to avoid breaking layouts
          sortAttributes: true,
          sortClassName: true,
        });

        const htmlAfter = Buffer.byteLength(processedHtml, 'utf8');
        breakdown.html = {
          before: htmlBefore,
          after: htmlAfter,
          savings: htmlBefore - htmlAfter,
        };
      } catch (error) {
        errors.push(`HTML minification error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    const minifiedSize = Buffer.byteLength(processedHtml, 'utf8');
    const savings = {
      bytes: originalSize - minifiedSize,
      percentage: ((originalSize - minifiedSize) / originalSize) * 100,
    };

    return {
      originalSize,
      minifiedSize,
      savings,
      breakdown,
      minifiedContent: processedHtml,
      errors,
    };
  }

  /**
   * Minify only CSS
   */
  async minifyCSS(cssContent: string): Promise<{
    minified: string;
    originalSize: number;
    minifiedSize: number;
    savings: number;
    errors: string[];
  }> {
    const originalSize = Buffer.byteLength(cssContent, 'utf8');
    const errors: string[] = [];

    const cleanCSS = new CleanCSS({
      level: 2,
      compatibility: 'ie9',
      returnPromise: false,
    });

    const result = cleanCSS.minify(cssContent);

    if (result.errors.length > 0) {
      errors.push(...result.errors);
    }

    const minified = result.styles;
    const minifiedSize = Buffer.byteLength(minified, 'utf8');

    return {
      minified,
      originalSize,
      minifiedSize,
      savings: originalSize - minifiedSize,
      errors,
    };
  }

  /**
   * Minify only JavaScript
   */
  async minifyJavaScript(
    jsContent: string,
    options: { mangle?: boolean } = {}
  ): Promise<{
    minified: string;
    originalSize: number;
    minifiedSize: number;
    savings: number;
    errors: string[];
  }> {
    const originalSize = Buffer.byteLength(jsContent, 'utf8');
    const errors: string[] = [];

    try {
      const result = await minifyJs(jsContent, {
        compress: {
          dead_code: true,
          drop_console: false,
          drop_debugger: true,
          keep_classnames: true,
          keep_fnames: !options.mangle,
          passes: 2,
        },
        mangle: options.mangle
          ? {
              keep_classnames: true,
              keep_fnames: false,
            }
          : false,
        format: {
          comments: false,
          beautify: false,
        },
        sourceMap: false,
      });

      const minified = result.code || jsContent;
      const minifiedSize = Buffer.byteLength(minified, 'utf8');

      return {
        minified,
        originalSize,
        minifiedSize,
        savings: originalSize - minifiedSize,
        errors,
      };
    } catch (error) {
      errors.push(`JavaScript minification error: ${error instanceof Error ? error.message : 'Unknown error'}`);

      return {
        minified: jsContent,
        originalSize,
        minifiedSize: originalSize,
        savings: 0,
        errors,
      };
    }
  }

  /**
   * Minify inline styles in HTML
   */
  private async minifyInlineStyles(
    $: cheerio.CheerioAPI
  ): Promise<{ before: number; after: number; savings: number; files: number }> {
    let totalBefore = 0;
    let totalAfter = 0;
    let fileCount = 0;

    const styles = $('style').toArray();

    for (const style of styles) {
      const $style = $(style);
      const cssContent = $style.html() || '';

      if (!cssContent.trim()) continue;

      totalBefore += Buffer.byteLength(cssContent, 'utf8');
      fileCount++;

      const result = await this.minifyCSS(cssContent);
      $style.html(result.minified);

      totalAfter += result.minifiedSize;
    }

    return {
      before: totalBefore,
      after: totalAfter,
      savings: totalBefore - totalAfter,
      files: fileCount,
    };
  }

  /**
   * Minify inline scripts in HTML
   */
  private async minifyInlineScripts(
    $: cheerio.CheerioAPI,
    mangle: boolean
  ): Promise<{ before: number; after: number; savings: number; files: number }> {
    let totalBefore = 0;
    let totalAfter = 0;
    let fileCount = 0;

    const scripts = $('script:not([src])').toArray();

    for (const script of scripts) {
      const $script = $(script);
      const jsContent = $script.html() || '';

      if (!jsContent.trim()) continue;

      totalBefore += Buffer.byteLength(jsContent, 'utf8');
      fileCount++;

      const result = await this.minifyJavaScript(jsContent, { mangle });

      if (result.errors.length === 0) {
        $script.html(result.minified);
        totalAfter += result.minifiedSize;
      } else {
        // Keep original if minification failed
        totalAfter += totalBefore;
      }
    }

    return {
      before: totalBefore,
      after: totalAfter,
      savings: totalBefore - totalAfter,
      files: fileCount,
    };
  }

  /**
   * Get minification recommendations
   */
  async analyzeMinificationOpportunities(
    htmlContent: string
  ): Promise<{
    unminifiedHTML: boolean;
    unminifiedCSS: number;
    unminifiedJS: number;
    comments: number;
    whitespace: {
      excessive: boolean;
      estimatedWaste: number;
    };
    recommendations: string[];
  }> {
    const $ = cheerio.load(htmlContent);
    const recommendations: string[] = [];

    // Check for comments
    const comments = $('*')
      .contents()
      .filter((_, node) => node.type === 'comment').length;

    if (comments > 0) {
      recommendations.push(
        `Found ${comments} HTML comment(s). Remove them to reduce file size.`
      );
    }

    // Check CSS
    const styles = $('style').toArray();
    let unminifiedCSS = 0;

    for (const style of styles) {
      const cssContent = $(style).html() || '';
      if (this.isUnminified(cssContent)) {
        unminifiedCSS++;
      }
    }

    if (unminifiedCSS > 0) {
      recommendations.push(
        `${unminifiedCSS} CSS block(s) appear unminified. Minify to save space.`
      );
    }

    // Check JS
    const scripts = $('script:not([src])').toArray();
    let unminifiedJS = 0;

    for (const script of scripts) {
      const jsContent = $(script).html() || '';
      if (this.isUnminified(jsContent)) {
        unminifiedJS++;
      }
    }

    if (unminifiedJS > 0) {
      recommendations.push(
        `${unminifiedJS} JavaScript block(s) appear unminified. Minify to save space.`
      );
    }

    // Check whitespace
    const htmlSize = Buffer.byteLength(htmlContent, 'utf8');
    const noWhitespaceSize = Buffer.byteLength(htmlContent.replace(/\s+/g, ' '), 'utf8');
    const whitespaceWaste = htmlSize - noWhitespaceSize;
    const excessiveWhitespace = whitespaceWaste > htmlSize * 0.2; // More than 20%

    if (excessiveWhitespace) {
      recommendations.push(
        `Excessive whitespace detected (~${this.formatBytes(whitespaceWaste)}). Enable whitespace removal.`
      );
    }

    // Check HTML minification
    const unminifiedHTML = this.isUnminified(htmlContent);

    if (unminifiedHTML) {
      recommendations.push(
        'HTML appears unminified. Minification could reduce file size by 10-30%.'
      );
    }

    return {
      unminifiedHTML,
      unminifiedCSS,
      unminifiedJS,
      comments,
      whitespace: {
        excessive: excessiveWhitespace,
        estimatedWaste: whitespaceWaste,
      },
      recommendations,
    };
  }

  /**
   * Check if code appears to be unminified
   */
  private isUnminified(code: string): boolean {
    // Heuristics for detecting unminified code
    const lines = code.split('\n');

    // Check for excessive line breaks
    if (lines.length > 50 && code.length / lines.length < 40) {
      return true;
    }

    // Check for indentation
    const indentedLines = lines.filter((line) => line.startsWith('  ') || line.startsWith('\t'));
    if (indentedLines.length > lines.length * 0.3) {
      return true;
    }

    // Check for multiple consecutive spaces
    if (code.match(/  +/g)?.length || 0 > 10) {
      return true;
    }

    return false;
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

  /**
   * Remove dead code (unused functions/variables)
   */
  async removeDeadCode(jsContent: string): Promise<{
    cleaned: string;
    removedFunctions: number;
    removedVariables: number;
    savings: number;
  }> {
    const originalSize = Buffer.byteLength(jsContent, 'utf8');

    try {
      // Use Terser's dead code elimination
      const result = await minifyJs(jsContent, {
        compress: {
          dead_code: true,
          unused: true,
          passes: 3,
        },
        mangle: false,
      });

      const cleaned = result.code || jsContent;
      const cleanedSize = Buffer.byteLength(cleaned, 'utf8');

      return {
        cleaned,
        removedFunctions: 0, // Would need AST analysis
        removedVariables: 0, // Would need AST analysis
        savings: originalSize - cleanedSize,
      };
    } catch (error) {
      return {
        cleaned: jsContent,
        removedFunctions: 0,
        removedVariables: 0,
        savings: 0,
      };
    }
  }

  /**
   * Extract critical code (code used in initial render)
   */
  async extractCriticalJS(
    htmlContent: string
  ): Promise<{
    critical: string;
    deferred: string;
  }> {
    const $ = cheerio.load(htmlContent);
    let critical = '';
    let deferred = '';

    $('script:not([src])').each((_, script) => {
      const $script = $(script);
      const content = $script.html() || '';

      // Simple heuristic: inline scripts without async/defer are critical
      if (!$script.attr('async') && !$script.attr('defer')) {
        critical += content + '\n';
      } else {
        deferred += content + '\n';
      }
    });

    return { critical, deferred };
  }
}
