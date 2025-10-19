import * as cheerio from 'cheerio';
import { URL } from 'url';

interface ResourceHintsOptions {
  dnsPrefetch?: boolean;
  preconnect?: boolean;
  prefetch?: boolean;
  preload?: boolean;
  preloadFonts?: boolean;
  preloadCriticalCSS?: boolean;
  preloadCriticalJS?: boolean;
  maxHints?: number;
}

interface ResourceHintsResult {
  optimizedHtml: string;
  hintsAdded: {
    dnsPrefetch: number;
    preconnect: number;
    prefetch: number;
    preload: number;
  };
  externalDomains: string[];
}

export class ResourceHintsService {
  /**
   * Add resource hints to HTML
   */
  async addResourceHints(
    htmlContent: string,
    baseUrl: string,
    options: ResourceHintsOptions = {}
  ): Promise<ResourceHintsResult> {
    const defaults: ResourceHintsOptions = {
      dnsPrefetch: true,
      preconnect: true,
      prefetch: false,
      preload: true,
      preloadFonts: true,
      preloadCriticalCSS: true,
      preloadCriticalJS: true,
      maxHints: 10,
    };

    const opts = { ...defaults, ...options };

    const $ = cheerio.load(htmlContent);
    const hintsAdded = {
      dnsPrefetch: 0,
      preconnect: 0,
      prefetch: 0,
      preload: 0,
    };

    // Extract all external domains
    const externalDomains = this.extractExternalDomains($, baseUrl);

    // Add DNS prefetch for external domains
    if (opts.dnsPrefetch) {
      hintsAdded.dnsPrefetch = this.addDnsPrefetch($, externalDomains, opts.maxHints!);
    }

    // Add preconnect for important domains
    if (opts.preconnect) {
      hintsAdded.preconnect = this.addPreconnect(
        $,
        externalDomains.slice(0, 3),
        opts.maxHints!
      );
    }

    // Preload critical fonts
    if (opts.preload && opts.preloadFonts) {
      hintsAdded.preload += this.addFontPreloads($);
    }

    // Preload critical CSS
    if (opts.preload && opts.preloadCriticalCSS) {
      hintsAdded.preload += this.addCSSPreloads($);
    }

    // Preload critical JS
    if (opts.preload && opts.preloadCriticalJS) {
      hintsAdded.preload += this.addJSPreloads($);
    }

    // Prefetch next-page resources
    if (opts.prefetch) {
      hintsAdded.prefetch = this.addPrefetch($);
    }

    return {
      optimizedHtml: $.html(),
      hintsAdded,
      externalDomains,
    };
  }

  /**
   * Extract external domains from HTML
   */
  private extractExternalDomains($: cheerio.CheerioAPI, baseUrl: string): string[] {
    const domains = new Set<string>();

    try {
      const baseHostname = new URL(baseUrl).hostname;

      // Check all elements with src or href
      $('[src], [href]').each((_, el) => {
        const $el = $(el);
        const url = $el.attr('src') || $el.attr('href');

        if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
          try {
            const urlObj = new URL(url);
            if (urlObj.hostname !== baseHostname) {
              domains.add(urlObj.origin);
            }
          } catch {}
        }
      });
    } catch (error) {
      console.error('Failed to extract external domains:', error);
    }

    return Array.from(domains);
  }

  /**
   * Add DNS prefetch hints
   */
  private addDnsPrefetch(
    $: cheerio.CheerioAPI,
    domains: string[],
    maxHints: number
  ): number {
    const head = $('head');
    let count = 0;

    // Check existing dns-prefetch hints
    const existing = $('link[rel="dns-prefetch"]')
      .toArray()
      .map((link) => $(link).attr('href'));

    domains.slice(0, maxHints).forEach((domain) => {
      if (!existing.includes(domain)) {
        head.append(`<link rel="dns-prefetch" href="${domain}">`);
        count++;
      }
    });

    return count;
  }

  /**
   * Add preconnect hints
   */
  private addPreconnect(
    $: cheerio.CheerioAPI,
    domains: string[],
    maxHints: number
  ): number {
    const head = $('head');
    let count = 0;

    // Check existing preconnect hints
    const existing = $('link[rel="preconnect"]')
      .toArray()
      .map((link) => $(link).attr('href'));

    domains.slice(0, Math.min(3, maxHints)).forEach((domain) => {
      if (!existing.includes(domain)) {
        head.append(`<link rel="preconnect" href="${domain}" crossorigin>`);
        count++;
      }
    });

    return count;
  }

  /**
   * Add font preload hints
   */
  private addFontPreloads($: cheerio.CheerioAPI): number {
    const head = $('head');
    let count = 0;

    // Find font URLs in styles
    const fontUrls = new Set<string>();

    $('style').each((_, style) => {
      const cssContent = $(style).html() || '';

      // Extract font URLs from @font-face rules
      const fontUrlRegex = /url\(['"]?([^'"()]+\.(?:woff2|woff|ttf|otf))['"]?\)/gi;
      let match;

      while ((match = fontUrlRegex.exec(cssContent)) !== null) {
        fontUrls.add(match[1]);
      }
    });

    // Check existing preload hints
    const existing = $('link[rel="preload"][as="font"]')
      .toArray()
      .map((link) => $(link).attr('href'));

    // Preload first 2 fonts (most critical)
    Array.from(fontUrls)
      .slice(0, 2)
      .forEach((url) => {
        if (!existing.includes(url)) {
          const format = url.endsWith('.woff2') ? 'font/woff2' : 'font/woff';
          head.prepend(
            `<link rel="preload" href="${url}" as="font" type="${format}" crossorigin>`
          );
          count++;
        }
      });

    return count;
  }

  /**
   * Add CSS preload hints
   */
  private addCSSPreloads($: cheerio.CheerioAPI): number {
    const head = $('head');
    let count = 0;

    // Check existing preload hints
    const existing = $('link[rel="preload"][as="style"]')
      .toArray()
      .map((link) => $(link).attr('href'));

    // Preload first external CSS file (if any)
    const cssLinks = $('link[rel="stylesheet"]').toArray();

    if (cssLinks.length > 0) {
      const firstCSS = $(cssLinks[0]);
      const href = firstCSS.attr('href');

      if (href && !existing.includes(href)) {
        head.prepend(`<link rel="preload" href="${href}" as="style">`);
        count++;
      }
    }

    return count;
  }

  /**
   * Add JS preload hints
   */
  private addJSPreloads($: cheerio.CheerioAPI): number {
    const head = $('head');
    let count = 0;

    // Check existing preload hints
    const existing = $('link[rel="preload"][as="script"]')
      .toArray()
      .map((link) => $(link).attr('href'));

    // Preload critical scripts (without async/defer)
    const criticalScripts = $('script[src]:not([async]):not([defer])')
      .toArray()
      .slice(0, 2); // First 2 critical scripts

    criticalScripts.forEach((script) => {
      const src = $(script).attr('src');

      if (src && !existing.includes(src)) {
        head.prepend(`<link rel="preload" href="${src}" as="script">`);
        count++;
      }
    });

    return count;
  }

  /**
   * Add prefetch hints for next-page navigation
   */
  private addPrefetch($: cheerio.CheerioAPI): number {
    const head = $('head');
    let count = 0;

    // Check existing prefetch hints
    const existing = $('link[rel="prefetch"]')
      .toArray()
      .map((link) => $(link).attr('href'));

    // Prefetch main navigation links
    const navLinks = $('nav a[href], .nav a[href], .menu a[href]')
      .toArray()
      .slice(0, 5); // First 5 nav links

    navLinks.forEach((link) => {
      const href = $(link).attr('href');

      if (
        href &&
        !href.startsWith('#') &&
        !href.startsWith('javascript:') &&
        !existing.includes(href)
      ) {
        head.append(`<link rel="prefetch" href="${href}">`);
        count++;
      }
    });

    return count;
  }

  /**
   * Analyze resource hints opportunities
   */
  async analyzeResourceHints(htmlContent: string, baseUrl: string): Promise<{
    externalDomains: number;
    hasPreconnect: boolean;
    hasDnsPrefetch: boolean;
    preloadableFonts: number;
    preloadableCSS: number;
    preloadableJS: number;
    recommendations: string[];
  }> {
    const $ = cheerio.load(htmlContent);
    const recommendations: string[] = [];

    const externalDomains = this.extractExternalDomains($, baseUrl);
    const hasPreconnect = $('link[rel="preconnect"]').length > 0;
    const hasDnsPrefetch = $('link[rel="dns-prefetch"]').length > 0;

    // Count preloadable resources
    const fontUrls = new Set<string>();
    $('style').each((_, style) => {
      const cssContent = $(style).html() || '';
      const matches = cssContent.match(/url\([^)]+\.(?:woff2|woff|ttf|otf)\)/gi) || [];
      matches.forEach((match) => fontUrls.add(match));
    });

    const preloadableFonts = fontUrls.size;
    const preloadableCSS = $('link[rel="stylesheet"]').length;
    const preloadableJS = $('script[src]:not([async]):not([defer])').length;

    // Generate recommendations
    if (externalDomains.length > 0 && !hasDnsPrefetch) {
      recommendations.push(
        `Add DNS prefetch for ${externalDomains.length} external domain(s) to reduce DNS lookup time`
      );
    }

    if (externalDomains.length > 0 && !hasPreconnect) {
      recommendations.push(
        `Add preconnect hints for critical external domains to establish connections early`
      );
    }

    if (preloadableFonts > 0) {
      recommendations.push(
        `Preload ${Math.min(2, preloadableFonts)} critical font(s) to prevent font loading delay`
      );
    }

    if (preloadableCSS > 0) {
      recommendations.push(
        `Preload critical CSS files to improve rendering performance`
      );
    }

    if (preloadableJS > 0) {
      recommendations.push(
        `Consider preloading ${preloadableJS} critical JavaScript file(s)`
      );
    }

    return {
      externalDomains: externalDomains.length,
      hasPreconnect,
      hasDnsPrefetch,
      preloadableFonts,
      preloadableCSS,
      preloadableJS,
      recommendations,
    };
  }

  /**
   * Get optimal resource hints configuration
   */
  getOptimalConfiguration(externalDomains: number, hasLargeAssets: boolean): ResourceHintsOptions {
    return {
      dnsPrefetch: externalDomains > 0,
      preconnect: externalDomains > 0 && externalDomains <= 3,
      prefetch: false, // Only enable for multi-page sites
      preload: true,
      preloadFonts: true,
      preloadCriticalCSS: hasLargeAssets,
      preloadCriticalJS: hasLargeAssets,
      maxHints: externalDomains > 5 ? 5 : externalDomains,
    };
  }
}
