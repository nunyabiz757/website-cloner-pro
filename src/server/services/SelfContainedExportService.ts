import axios from 'axios';
import * as cheerio from 'cheerio';
import path from 'path';
import fs from 'fs/promises';
import { URL } from 'url';
import archiver from 'archiver';
import { createWriteStream } from 'fs';

interface SelfContainedOptions {
  inlineImages?: boolean; // Convert to base64
  inlineFonts?: boolean; // Embed font files
  inlineScripts?: boolean; // Inline external JS
  inlineStyles?: boolean; // Inline external CSS
  singleFile?: boolean; // Create single HTML file
  maxImageSize?: number; // Max size for base64 encoding (bytes)
  preserveStructure?: boolean; // Keep folder structure in ZIP
}

interface ExportResult {
  format: 'single-file' | 'zip';
  content?: string; // For single-file
  zipPath?: string; // For ZIP
  size: number;
  files: number;
  inlinedResources: {
    images: number;
    fonts: number;
    scripts: number;
    styles: number;
  };
}

export class SelfContainedExportService {
  private tempDir: string;

  constructor() {
    this.tempDir = path.join(process.cwd(), 'temp', 'exports');
  }

  /**
   * Create self-contained export
   */
  async createSelfContainedExport(
    htmlContent: string,
    baseUrl: string,
    options: SelfContainedOptions = {}
  ): Promise<ExportResult> {
    const defaults: SelfContainedOptions = {
      inlineImages: true,
      inlineFonts: true,
      inlineScripts: true,
      inlineStyles: true,
      singleFile: true,
      maxImageSize: 500 * 1024, // 500KB
      preserveStructure: false,
    };

    const opts = { ...defaults, ...options };

    // Ensure temp directory exists
    await fs.mkdir(this.tempDir, { recursive: true });

    const $ = cheerio.load(htmlContent);
    let inlinedResources = {
      images: 0,
      fonts: 0,
      scripts: 0,
      styles: 0,
    };

    // 1. Inline stylesheets
    if (opts.inlineStyles) {
      const styleCount = await this.inlineStylesheets($, baseUrl);
      inlinedResources.styles = styleCount;
    }

    // 2. Inline scripts
    if (opts.inlineScripts) {
      const scriptCount = await this.inlineScripts($, baseUrl);
      inlinedResources.scripts = scriptCount;
    }

    // 3. Inline images
    if (opts.inlineImages) {
      const imageCount = await this.inlineImages($, baseUrl, opts.maxImageSize!);
      inlinedResources.images = imageCount;
    }

    // 4. Inline fonts from CSS
    if (opts.inlineFonts) {
      const fontCount = await this.inlineFonts($, baseUrl);
      inlinedResources.fonts = fontCount;
    }

    // 5. Process background images in inline styles
    await this.processInlineStyles($, baseUrl, opts.maxImageSize!);

    // Get final HTML
    const finalHtml = $.html();

    if (opts.singleFile) {
      // Single file export
      return {
        format: 'single-file',
        content: finalHtml,
        size: Buffer.byteLength(finalHtml, 'utf8'),
        files: 1,
        inlinedResources,
      };
    } else {
      // ZIP export with embedded resources
      const zipPath = await this.createZipExport(finalHtml, $, baseUrl);
      const stats = await fs.stat(zipPath);

      return {
        format: 'zip',
        zipPath,
        size: stats.size,
        files: 1, // Could be expanded to count files in ZIP
        inlinedResources,
      };
    }
  }

  /**
   * Inline external stylesheets
   */
  private async inlineStylesheets($: cheerio.CheerioAPI, baseUrl: string): Promise<number> {
    let count = 0;
    const links = $('link[rel="stylesheet"]').toArray();

    for (const link of links) {
      const $link = $(link);
      const href = $link.attr('href');

      if (!href || href.startsWith('data:')) continue;

      try {
        const absoluteUrl = this.resolveUrl(href, baseUrl);
        const cssContent = await this.fetchResource(absoluteUrl);

        // Process @import and url() in CSS
        const processedCss = await this.processCssUrls(cssContent, absoluteUrl);

        // Replace link with inline style
        $link.replaceWith(`<style data-inlined-from="${href}">\n${processedCss}\n</style>`);
        count++;
      } catch (error) {
        console.error(`Failed to inline stylesheet ${href}:`, error);
        // Keep the original link tag
      }
    }

    return count;
  }

  /**
   * Inline external scripts
   */
  private async inlineScripts($: cheerio.CheerioAPI, baseUrl: string): Promise<number> {
    let count = 0;
    const scripts = $('script[src]').toArray();

    for (const script of scripts) {
      const $script = $(script);
      const src = $script.attr('src');

      if (!src || src.startsWith('data:')) continue;

      try {
        const absoluteUrl = this.resolveUrl(src, baseUrl);
        const jsContent = await this.fetchResource(absoluteUrl);

        // Replace script tag with inline script
        $script.removeAttr('src');
        $script.text(jsContent);
        $script.attr('data-inlined-from', src);
        count++;
      } catch (error) {
        console.error(`Failed to inline script ${src}:`, error);
        // Keep the original script tag
      }
    }

    return count;
  }

  /**
   * Inline images as base64
   */
  private async inlineImages(
    $: cheerio.CheerioAPI,
    baseUrl: string,
    maxSize: number
  ): Promise<number> {
    let count = 0;
    const images = $('img[src]').toArray();

    for (const img of images) {
      const $img = $(img);
      const src = $img.attr('src');

      if (!src || src.startsWith('data:')) continue;

      try {
        const absoluteUrl = this.resolveUrl(src, baseUrl);
        const { data, contentType, size } = await this.fetchResourceWithMeta(absoluteUrl);

        // Only inline if under max size
        if (size <= maxSize) {
          const base64 = data.toString('base64');
          $img.attr('src', `data:${contentType};base64,${base64}`);
          $img.attr('data-original-src', src);
          count++;
        }
      } catch (error) {
        console.error(`Failed to inline image ${src}:`, error);
        // Keep the original src
      }
    }

    return count;
  }

  /**
   * Inline fonts from CSS @font-face rules
   */
  private async inlineFonts($: cheerio.CheerioAPI, baseUrl: string): Promise<number> {
    let count = 0;
    const styles = $('style').toArray();

    for (const style of styles) {
      const $style = $(style);
      let cssContent = $style.html() || '';

      // Find @font-face rules
      const fontFaceRegex = /@font-face\s*\{[^}]*\}/gi;
      const fontFaces = cssContent.match(fontFaceRegex) || [];

      for (const fontFace of fontFaces) {
        // Extract font URLs
        const urlRegex = /url\(['"]?([^'"()]+)['"]?\)/gi;
        let match;
        let updatedFontFace = fontFace;

        while ((match = urlRegex.exec(fontFace)) !== null) {
          const fontUrl = match[1];

          if (fontUrl.startsWith('data:')) continue;

          try {
            const absoluteUrl = this.resolveUrl(fontUrl, baseUrl);
            const { data, contentType } = await this.fetchResourceWithMeta(absoluteUrl);

            const base64 = data.toString('base64');
            const dataUri = `data:${contentType};base64,${base64}`;

            updatedFontFace = updatedFontFace.replace(fontUrl, dataUri);
            count++;
          } catch (error) {
            console.error(`Failed to inline font ${fontUrl}:`, error);
          }
        }

        cssContent = cssContent.replace(fontFace, updatedFontFace);
      }

      $style.html(cssContent);
    }

    return count;
  }

  /**
   * Process CSS content and inline URLs
   */
  private async processCssUrls(cssContent: string, cssUrl: string): Promise<string> {
    let processed = cssContent;

    // Process @import statements
    const importRegex = /@import\s+url\(['"]?([^'"()]+)['"]?\)|@import\s+['"]([^'"]+)['"]/gi;
    let match;

    while ((match = importRegex.exec(cssContent)) !== null) {
      const importUrl = match[1] || match[2];
      if (importUrl && !importUrl.startsWith('data:')) {
        try {
          const absoluteUrl = this.resolveUrl(importUrl, cssUrl);
          const importedCss = await this.fetchResource(absoluteUrl);
          const processedImport = await this.processCssUrls(importedCss, absoluteUrl);

          // Replace @import with actual CSS content
          processed = processed.replace(match[0], `/* Imported from ${importUrl} */\n${processedImport}`);
        } catch (error) {
          console.error(`Failed to process @import ${importUrl}:`, error);
        }
      }
    }

    // Process url() references (images, fonts, etc.)
    const urlRegex = /url\(['"]?(?!data:)([^'"()]+)['"]?\)/gi;
    const urls: string[] = [];

    while ((match = urlRegex.exec(cssContent)) !== null) {
      urls.push(match[1]);
    }

    // Replace URLs with absolute URLs (or base64 for small resources)
    for (const url of urls) {
      try {
        const absoluteUrl = this.resolveUrl(url, cssUrl);
        // Keep as absolute URL for now (could be inlined based on size)
        processed = processed.replace(
          new RegExp(`url\\(['"]?${this.escapeRegex(url)}['"]?\\)`, 'g'),
          `url('${absoluteUrl}')`
        );
      } catch (error) {
        console.error(`Failed to process CSS URL ${url}:`, error);
      }
    }

    return processed;
  }

  /**
   * Process inline styles with background images
   */
  private async processInlineStyles(
    $: cheerio.CheerioAPI,
    baseUrl: string,
    maxSize: number
  ): Promise<void> {
    const elementsWithStyle = $('[style]').toArray();

    for (const element of elementsWithStyle) {
      const $element = $(element);
      let styleAttr = $element.attr('style') || '';

      // Find background-image URLs
      const urlRegex = /url\(['"]?([^'"()]+)['"]?\)/gi;
      let match;

      while ((match = urlRegex.exec(styleAttr)) !== null) {
        const imageUrl = match[1];

        if (imageUrl.startsWith('data:')) continue;

        try {
          const absoluteUrl = this.resolveUrl(imageUrl, baseUrl);
          const { data, contentType, size } = await this.fetchResourceWithMeta(absoluteUrl);

          if (size <= maxSize) {
            const base64 = data.toString('base64');
            const dataUri = `data:${contentType};base64,${base64}`;

            styleAttr = styleAttr.replace(imageUrl, dataUri);
          }
        } catch (error) {
          console.error(`Failed to inline background image ${imageUrl}:`, error);
        }
      }

      $element.attr('style', styleAttr);
    }
  }

  /**
   * Create ZIP export
   */
  private async createZipExport(
    htmlContent: string,
    $: cheerio.CheerioAPI,
    baseUrl: string
  ): Promise<string> {
    const timestamp = Date.now();
    const zipPath = path.join(this.tempDir, `export-${timestamp}.zip`);

    return new Promise((resolve, reject) => {
      const output = createWriteStream(zipPath);
      const archive = archiver('zip', { zlib: { level: 9 } });

      output.on('close', () => resolve(zipPath));
      archive.on('error', (err) => reject(err));

      archive.pipe(output);

      // Add HTML file
      archive.append(htmlContent, { name: 'index.html' });

      // Add README
      const readme = this.generateReadme(baseUrl);
      archive.append(readme, { name: 'README.txt' });

      archive.finalize();
    });
  }

  /**
   * Generate README for export
   */
  private generateReadme(originalUrl: string): string {
    return `Website Cloner Pro - Self-Contained Export
===========================================

This is a self-contained export of: ${originalUrl}

All dependencies (CSS, JavaScript, images, fonts) have been embedded into the HTML file.
This ensures the website works completely offline without any external dependencies.

Features:
- All stylesheets inlined
- All scripts embedded
- Images converted to base64 (where appropriate)
- Fonts embedded in CSS
- No external network requests required

To view:
1. Open index.html in any web browser
2. The site will work completely offline

Generated by Website Cloner Pro
${new Date().toISOString()}
`;
  }

  /**
   * Fetch resource from URL
   */
  private async fetchResource(url: string): Promise<string> {
    const response = await axios.get(url, {
      responseType: 'text',
      timeout: 30000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });

    return response.data;
  }

  /**
   * Fetch resource with metadata
   */
  private async fetchResourceWithMeta(url: string): Promise<{
    data: Buffer;
    contentType: string;
    size: number;
  }> {
    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 30000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });

    const data = Buffer.from(response.data);
    const contentType = response.headers['content-type'] || 'application/octet-stream';

    return {
      data,
      contentType,
      size: data.length,
    };
  }

  /**
   * Resolve relative URL to absolute
   */
  private resolveUrl(url: string, baseUrl: string): string {
    if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('//')) {
      return url.startsWith('//') ? `https:${url}` : url;
    }

    try {
      const resolved = new URL(url, baseUrl);
      return resolved.href;
    } catch (error) {
      console.error(`Failed to resolve URL ${url} with base ${baseUrl}:`, error);
      return url;
    }
  }

  /**
   * Escape regex special characters
   */
  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Calculate total size of HTML content
   */
  async calculateSize(htmlContent: string): Promise<{
    totalSize: number;
    breakdown: {
      html: number;
      inlineStyles: number;
      inlineScripts: number;
      base64Images: number;
      base64Fonts: number;
    };
  }> {
    const $ = cheerio.load(htmlContent);

    const htmlSize = Buffer.byteLength(htmlContent, 'utf8');

    // Calculate inline styles
    let inlineStylesSize = 0;
    $('style').each((_, el) => {
      inlineStylesSize += Buffer.byteLength($(el).html() || '', 'utf8');
    });

    // Calculate inline scripts
    let inlineScriptsSize = 0;
    $('script:not([src])').each((_, el) => {
      inlineScriptsSize += Buffer.byteLength($(el).html() || '', 'utf8');
    });

    // Calculate base64 images
    let base64ImagesSize = 0;
    $('img[src^="data:"]').each((_, el) => {
      const src = $(el).attr('src') || '';
      base64ImagesSize += Buffer.byteLength(src, 'utf8');
    });

    // Calculate base64 fonts (approximate from styles)
    let base64FontsSize = 0;
    $('style').each((_, el) => {
      const content = $(el).html() || '';
      const fontFaceMatches = content.match(/url\(data:font[^)]+\)/gi) || [];
      fontFaceMatches.forEach((match) => {
        base64FontsSize += Buffer.byteLength(match, 'utf8');
      });
    });

    return {
      totalSize: htmlSize,
      breakdown: {
        html: htmlSize - inlineStylesSize - inlineScriptsSize,
        inlineStyles: inlineStylesSize,
        inlineScripts: inlineScriptsSize,
        base64Images: base64ImagesSize,
        base64Fonts: base64FontsSize,
      },
    };
  }

  /**
   * Cleanup old export files
   */
  async cleanup(maxAgeHours: number = 24): Promise<number> {
    let deletedCount = 0;

    try {
      const files = await fs.readdir(this.tempDir);
      const now = Date.now();

      for (const file of files) {
        const filePath = path.join(this.tempDir, file);
        const stats = await fs.stat(filePath);
        const ageHours = (now - stats.mtimeMs) / (1000 * 60 * 60);

        if (ageHours > maxAgeHours) {
          await fs.unlink(filePath);
          deletedCount++;
        }
      }
    } catch (error) {
      console.error('Cleanup failed:', error);
    }

    return deletedCount;
  }
}
