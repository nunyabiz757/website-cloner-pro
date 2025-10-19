import axios from 'axios';
import path from 'path';
import fs from 'fs/promises';
import * as cheerio from 'cheerio';
import { parse } from '@babel/parser';
import traverse from '@babel/traverse';
import generate from '@babel/generator';

interface Dependency {
  type: 'script' | 'style' | 'font' | 'image';
  url: string;
  isExternal: boolean;
  canInline: boolean;
  size?: number;
  inlinedContent?: string;
}

interface InliningResult {
  originalSize: number;
  inlinedSize: number;
  inlinedCount: number;
  dependencies: Dependency[];
  modifiedHTML: string;
  externalDependencies: string[];
  warnings: string[];
}

interface InliningOptions {
  inlineScripts: boolean;
  inlineStyles: boolean;
  inlineFonts: boolean;
  inlineImages: boolean;
  maxScriptSize: number; // KB
  maxStyleSize: number; // KB
  maxImageSize: number; // KB
  preserveCDN: string[]; // CDN URLs to never inline
}

export class DependencyInliningService {
  private readonly defaultOptions: InliningOptions = {
    inlineScripts: true,
    inlineStyles: true,
    inlineFonts: false,
    inlineImages: true,
    maxScriptSize: 50, // 50 KB
    maxStyleSize: 50, // 50 KB
    maxImageSize: 10, // 10 KB
    preserveCDN: ['googleapis.com', 'gstatic.com', 'cloudflare.com'],
  };

  /**
   * Inline external dependencies into HTML
   */
  async inlineDependencies(
    htmlContent: string,
    baseUrl: string,
    options: Partial<InliningOptions> = {}
  ): Promise<InliningResult> {
    const opts = { ...this.defaultOptions, ...options };
    const $ = cheerio.load(htmlContent);

    const dependencies: Dependency[] = [];
    const externalDependencies: string[] = [];
    const warnings: string[] = [];
    let originalSize = Buffer.byteLength(htmlContent);
    let inlinedCount = 0;

    // Inline stylesheets
    if (opts.inlineStyles) {
      const styleLinks = $('link[rel="stylesheet"]');
      for (let i = 0; i < styleLinks.length; i++) {
        const link = styleLinks.eq(i);
        const href = link.attr('href');

        if (href && !this.shouldPreserveCDN(href, opts.preserveCDN)) {
          const result = await this.inlineStylesheet($, link, href, baseUrl, opts);
          dependencies.push(result);

          if (result.inlinedContent) {
            inlinedCount++;
          } else if (result.isExternal) {
            externalDependencies.push(href);
          }
        }
      }
    }

    // Inline scripts
    if (opts.inlineScripts) {
      const scripts = $('script[src]');
      for (let i = 0; i < scripts.length; i++) {
        const script = scripts.eq(i);
        const src = script.attr('src');

        if (src && !this.shouldPreserveCDN(src, opts.preserveCDN)) {
          const result = await this.inlineScript($, script, src, baseUrl, opts);
          dependencies.push(result);

          if (result.inlinedContent) {
            inlinedCount++;
          } else if (result.isExternal) {
            externalDependencies.push(src);
          }
        }
      }
    }

    // Inline images
    if (opts.inlineImages) {
      const images = $('img[src]');
      for (let i = 0; i < images.length; i++) {
        const img = images.eq(i);
        const src = img.attr('src');

        if (src && !this.shouldPreserveCDN(src, opts.preserveCDN)) {
          const result = await this.inlineImage($, img, src, baseUrl, opts);
          dependencies.push(result);

          if (result.inlinedContent) {
            inlinedCount++;
          }
        }
      }

      // Also check background images in style attributes
      $('[style*="background"]').each((_, el) => {
        const style = $(el).attr('style') || '';
        const urlMatch = style.match(/url\(['"]?([^'"()]+)['"]?\)/);

        if (urlMatch && urlMatch[1]) {
          const bgUrl = urlMatch[1];
          // Note: Background image inlining would need to be async
          warnings.push(`Background image found but not inlined: ${bgUrl}`);
        }
      });
    }

    // Inline fonts (base64 encode font files)
    if (opts.inlineFonts) {
      const fontFaces = this.extractFontFaces(htmlContent);
      for (const fontUrl of fontFaces) {
        if (!this.shouldPreserveCDN(fontUrl, opts.preserveCDN)) {
          const result = await this.inlineFont(fontUrl, baseUrl);
          dependencies.push(result);

          if (result.inlinedContent) {
            // Replace font URLs in CSS
            const cssContent = $('style').html() || '';
            const updatedCSS = cssContent.replace(
              new RegExp(fontUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'),
              result.inlinedContent
            );
            $('style').html(updatedCSS);
            inlinedCount++;
          }
        }
      }
    }

    const modifiedHTML = $.html();
    const inlinedSize = Buffer.byteLength(modifiedHTML);

    return {
      originalSize,
      inlinedSize,
      inlinedCount,
      dependencies,
      modifiedHTML,
      externalDependencies,
      warnings,
    };
  }

  /**
   * Inline a stylesheet
   */
  private async inlineStylesheet(
    $: cheerio.CheerioAPI,
    link: cheerio.Cheerio<any>,
    href: string,
    baseUrl: string,
    options: InliningOptions
  ): Promise<Dependency> {
    const absoluteUrl = this.resolveUrl(href, baseUrl);
    const isExternal = this.isExternalUrl(absoluteUrl, baseUrl);

    try {
      const response = await axios.get(absoluteUrl, { responseType: 'text', timeout: 10000 });
      const cssContent = response.data;
      const size = Buffer.byteLength(cssContent);

      // Check size limit
      if (size > options.maxStyleSize * 1024) {
        return {
          type: 'style',
          url: href,
          isExternal,
          canInline: false,
          size,
        };
      }

      // Process CSS to inline relative URLs
      const processedCSS = await this.processCSSUrls(cssContent, absoluteUrl);

      // Replace link with inline style
      link.replaceWith(`<style data-inlined-from="${href}">${processedCSS}</style>`);

      return {
        type: 'style',
        url: href,
        isExternal,
        canInline: true,
        size,
        inlinedContent: processedCSS,
      };
    } catch (error) {
      console.error(`Failed to inline stylesheet: ${href}`, error);
      return {
        type: 'style',
        url: href,
        isExternal,
        canInline: false,
      };
    }
  }

  /**
   * Inline a script
   */
  private async inlineScript(
    $: cheerio.CheerioAPI,
    script: cheerio.Cheerio<any>,
    src: string,
    baseUrl: string,
    options: InliningOptions
  ): Promise<Dependency> {
    const absoluteUrl = this.resolveUrl(src, baseUrl);
    const isExternal = this.isExternalUrl(absoluteUrl, baseUrl);

    try {
      const response = await axios.get(absoluteUrl, { responseType: 'text', timeout: 10000 });
      const jsContent = response.data;
      const size = Buffer.byteLength(jsContent);

      // Check size limit
      if (size > options.maxScriptSize * 1024) {
        return {
          type: 'script',
          url: src,
          isExternal,
          canInline: false,
          size,
        };
      }

      // Preserve script attributes
      const scriptAttrs = script.attr();
      const attrStr = Object.entries(scriptAttrs || {})
        .filter(([key]) => key !== 'src')
        .map(([key, val]) => `${key}="${val}"`)
        .join(' ');

      // Replace script with inline version
      script.replaceWith(
        `<script ${attrStr} data-inlined-from="${src}">${jsContent}</script>`
      );

      return {
        type: 'script',
        url: src,
        isExternal,
        canInline: true,
        size,
        inlinedContent: jsContent,
      };
    } catch (error) {
      console.error(`Failed to inline script: ${src}`, error);
      return {
        type: 'script',
        url: src,
        isExternal,
        canInline: false,
      };
    }
  }

  /**
   * Inline an image (convert to base64)
   */
  private async inlineImage(
    $: cheerio.CheerioAPI,
    img: cheerio.Cheerio<any>,
    src: string,
    baseUrl: string,
    options: InliningOptions
  ): Promise<Dependency> {
    const absoluteUrl = this.resolveUrl(src, baseUrl);
    const isExternal = this.isExternalUrl(absoluteUrl, baseUrl);

    // Skip data URLs
    if (src.startsWith('data:')) {
      return {
        type: 'image',
        url: src,
        isExternal: false,
        canInline: false,
      };
    }

    try {
      const response = await axios.get(absoluteUrl, {
        responseType: 'arraybuffer',
        timeout: 10000,
      });

      const buffer = Buffer.from(response.data);
      const size = buffer.length;

      // Check size limit
      if (size > options.maxImageSize * 1024) {
        return {
          type: 'image',
          url: src,
          isExternal,
          canInline: false,
          size,
        };
      }

      // Determine MIME type
      const contentType =
        response.headers['content-type'] || this.getMimeType(src) || 'image/png';
      const base64 = buffer.toString('base64');
      const dataUrl = `data:${contentType};base64,${base64}`;

      // Replace src with data URL
      img.attr('src', dataUrl);
      img.attr('data-original-src', src);

      return {
        type: 'image',
        url: src,
        isExternal,
        canInline: true,
        size,
        inlinedContent: dataUrl,
      };
    } catch (error) {
      console.error(`Failed to inline image: ${src}`, error);
      return {
        type: 'image',
        url: src,
        isExternal,
        canInline: false,
      };
    }
  }

  /**
   * Inline a font file
   */
  private async inlineFont(fontUrl: string, baseUrl: string): Promise<Dependency> {
    const absoluteUrl = this.resolveUrl(fontUrl, baseUrl);
    const isExternal = this.isExternalUrl(absoluteUrl, baseUrl);

    try {
      const response = await axios.get(absoluteUrl, {
        responseType: 'arraybuffer',
        timeout: 10000,
      });

      const buffer = Buffer.from(response.data);
      const size = buffer.length;
      const mimeType = this.getFontMimeType(fontUrl);
      const base64 = buffer.toString('base64');
      const dataUrl = `data:${mimeType};base64,${base64}`;

      return {
        type: 'font',
        url: fontUrl,
        isExternal,
        canInline: true,
        size,
        inlinedContent: dataUrl,
      };
    } catch (error) {
      console.error(`Failed to inline font: ${fontUrl}`, error);
      return {
        type: 'font',
        url: fontUrl,
        isExternal,
        canInline: false,
      };
    }
  }

  /**
   * Process CSS to inline relative URLs
   */
  private async processCSSUrls(cssContent: string, cssUrl: string): Promise<string> {
    const urlRegex = /url\(['"]?([^'"()]+)['"]?\)/g;
    let match;
    const replacements: Array<{ original: string; replacement: string }> = [];

    while ((match = urlRegex.exec(cssContent)) !== null) {
      const url = match[1];

      // Skip data URLs and absolute URLs
      if (url.startsWith('data:') || url.startsWith('http')) {
        continue;
      }

      // Resolve relative URL
      const absoluteUrl = this.resolveUrl(url, cssUrl);
      replacements.push({ original: match[0], replacement: `url('${absoluteUrl}')` });
    }

    // Apply replacements
    let processedCSS = cssContent;
    for (const { original, replacement } of replacements) {
      processedCSS = processedCSS.replace(original, replacement);
    }

    return processedCSS;
  }

  /**
   * Extract font URLs from CSS @font-face rules
   */
  private extractFontFaces(content: string): string[] {
    const fontUrls: string[] = [];
    const fontFaceRegex = /@font-face\s*\{[^}]*\}/g;
    const urlRegex = /url\(['"]?([^'"()]+)['"]?\)/g;

    const fontFaces = content.match(fontFaceRegex) || [];

    for (const fontFace of fontFaces) {
      let match;
      while ((match = urlRegex.exec(fontFace)) !== null) {
        fontUrls.push(match[1]);
      }
    }

    return fontUrls;
  }

  /**
   * Resolve relative URL to absolute
   */
  private resolveUrl(url: string, baseUrl: string): string {
    if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('//')) {
      return url.startsWith('//') ? `https:${url}` : url;
    }

    try {
      return new URL(url, baseUrl).href;
    } catch {
      return url;
    }
  }

  /**
   * Check if URL is external
   */
  private isExternalUrl(url: string, baseUrl: string): boolean {
    try {
      const urlObj = new URL(url);
      const baseUrlObj = new URL(baseUrl);
      return urlObj.hostname !== baseUrlObj.hostname;
    } catch {
      return false;
    }
  }

  /**
   * Check if CDN should be preserved
   */
  private shouldPreserveCDN(url: string, preserveCDN: string[]): boolean {
    return preserveCDN.some((cdn) => url.includes(cdn));
  }

  /**
   * Get MIME type from file extension
   */
  private getMimeType(filename: string): string {
    const ext = path.extname(filename).toLowerCase();
    const mimeTypes: Record<string, string> = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.svg': 'image/svg+xml',
      '.webp': 'image/webp',
      '.bmp': 'image/bmp',
      '.ico': 'image/x-icon',
    };
    return mimeTypes[ext] || 'application/octet-stream';
  }

  /**
   * Get font MIME type from file extension
   */
  private getFontMimeType(filename: string): string {
    const ext = path.extname(filename).toLowerCase();
    const fontTypes: Record<string, string> = {
      '.woff': 'font/woff',
      '.woff2': 'font/woff2',
      '.ttf': 'font/ttf',
      '.otf': 'font/otf',
      '.eot': 'application/vnd.ms-fontobject',
    };
    return fontTypes[ext] || 'font/woff';
  }

  /**
   * Bundle multiple JavaScript files into one
   */
  async bundleScripts(scriptContents: string[]): Promise<string> {
    let bundled = '(function() {\n';
    bundled += '  "use strict";\n\n';

    for (let i = 0; i < scriptContents.length; i++) {
      bundled += `  // Script ${i + 1}\n`;
      bundled += `  ${scriptContents[i]}\n\n`;
    }

    bundled += '})();\n';
    return bundled;
  }

  /**
   * Bundle multiple CSS files into one
   */
  async bundleStyles(styleContents: string[]): Promise<string> {
    return styleContents.join('\n\n');
  }

  /**
   * Remove unused CSS from bundled stylesheet
   */
  async removeUnusedCSS(cssContent: string, htmlContent: string): Promise<string> {
    // This is a simplified version - for production, use PurgeCSS or similar
    const $ = cheerio.load(htmlContent);
    const usedClasses = new Set<string>();
    const usedIds = new Set<string>();

    // Collect used classes and IDs
    $('[class]').each((_, el) => {
      const classes = $(el).attr('class')?.split(/\s+/) || [];
      classes.forEach((c) => usedClasses.add(c));
    });

    $('[id]').each((_, el) => {
      const id = $(el).attr('id');
      if (id) usedIds.add(id);
    });

    // Simple filtering (this is very basic - a real implementation would parse CSS properly)
    const lines = cssContent.split('\n');
    const filtered: string[] = [];
    let inRule = false;
    let currentRule = '';

    for (const line of lines) {
      if (line.includes('{')) {
        inRule = true;
        currentRule = line;
      } else if (line.includes('}')) {
        inRule = false;
        currentRule += line;

        // Check if rule uses any of the collected classes/ids
        const hasUsedSelector =
          Array.from(usedClasses).some((c) => currentRule.includes(`.${c}`)) ||
          Array.from(usedIds).some((id) => currentRule.includes(`#${id}`)) ||
          currentRule.match(/^[a-z]/); // Keep element selectors

        if (hasUsedSelector) {
          filtered.push(currentRule);
        }

        currentRule = '';
      } else if (inRule) {
        currentRule += line;
      } else {
        filtered.push(line);
      }
    }

    return filtered.join('\n');
  }
}
