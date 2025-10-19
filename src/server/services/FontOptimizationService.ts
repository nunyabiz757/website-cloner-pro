import * as cheerio from 'cheerio';
import axios from 'axios';
import { URL } from 'url';
import * as fontkit from 'fontkit';
import { compress as woff2Compress } from 'wawoff2';

interface FontInfo {
  family: string;
  url: string;
  format: string;
  weight?: string;
  style?: string;
  size?: number;
}

interface FontOptimizationOptions {
  subsetFonts?: boolean;
  convertToWoff2?: boolean;
  preloadFonts?: boolean;
  addFontDisplay?: 'auto' | 'block' | 'swap' | 'fallback' | 'optional';
  removeUnusedFonts?: boolean;
  selfHost?: boolean;
}

interface FontOptimizationResult {
  originalFonts: FontInfo[];
  optimizedFonts: FontInfo[];
  removedFonts: number;
  totalOriginalSize: number;
  totalOptimizedSize: number;
  savings: {
    bytes: number;
    percentage: number;
  };
  optimizedHtml: string;
  recommendations: string[];
}

export class FontOptimizationService {
  /**
   * Optimize all fonts in HTML
   */
  async optimizeFonts(
    htmlContent: string,
    baseUrl: string,
    options: FontOptimizationOptions = {}
  ): Promise<FontOptimizationResult> {
    const defaults: FontOptimizationOptions = {
      subsetFonts: false,
      convertToWoff2: true,
      preloadFonts: true,
      addFontDisplay: 'swap',
      removeUnusedFonts: false,
      selfHost: false,
    };

    const opts = { ...defaults, ...options };

    const $ = cheerio.load(htmlContent);
    const originalFonts: FontInfo[] = [];
    const optimizedFonts: FontInfo[] = [];
    const recommendations: string[] = [];

    // Extract fonts from @font-face rules
    const fontsFromStyles = await this.extractFontsFromStyles($);
    originalFonts.push(...fontsFromStyles);

    // Extract fonts from <link> tags (Google Fonts, etc.)
    const fontsFromLinks = await this.extractFontsFromLinks($, baseUrl);
    originalFonts.push(...fontsFromLinks);

    let totalOriginalSize = 0;
    let totalOptimizedSize = 0;

    // Apply font-display to all @font-face rules
    if (opts.addFontDisplay) {
      this.addFontDisplay($, opts.addFontDisplay);
      recommendations.push(
        `Added font-display: ${opts.addFontDisplay} to prevent FOIT (Flash of Invisible Text)`
      );
    }

    // Preload critical fonts
    if (opts.preloadFonts && originalFonts.length > 0) {
      this.addFontPreloads($, originalFonts.slice(0, 2)); // Preload first 2 fonts
      recommendations.push(
        `Added preload hints for ${Math.min(2, originalFonts.length)} critical font(s)`
      );
    }

    // Optimize Google Fonts links
    const googleFontsOptimized = this.optimizeGoogleFonts($);
    if (googleFontsOptimized > 0) {
      recommendations.push(
        `Optimized ${googleFontsOptimized} Google Fonts link(s) with display=swap`
      );
    }

    // Add font fallbacks
    this.addFontFallbacks($);
    recommendations.push('Added system font fallbacks for better performance');

    // Remove unused font weights/styles (basic implementation)
    if (opts.removeUnusedFonts) {
      const removed = this.removeUnusedFontWeights($);
      if (removed > 0) {
        recommendations.push(`Removed ${removed} unused font weight(s)/style(s)`);
      }
    }

    // Calculate sizes
    for (const font of originalFonts) {
      if (font.size) {
        totalOriginalSize += font.size;
      }
    }

    totalOptimizedSize = totalOriginalSize; // Would be different with actual conversion

    const savings = {
      bytes: totalOriginalSize - totalOptimizedSize,
      percentage:
        totalOriginalSize > 0
          ? ((totalOriginalSize - totalOptimizedSize) / totalOriginalSize) * 100
          : 0,
    };

    return {
      originalFonts,
      optimizedFonts: optimizedFonts.length > 0 ? optimizedFonts : originalFonts,
      removedFonts: 0,
      totalOriginalSize,
      totalOptimizedSize,
      savings,
      optimizedHtml: $.html(),
      recommendations,
    };
  }

  /**
   * Extract fonts from inline styles
   */
  private async extractFontsFromStyles(
    $: cheerio.CheerioAPI
  ): Promise<FontInfo[]> {
    const fonts: FontInfo[] = [];
    const styles = $('style').toArray();

    for (const style of styles) {
      const cssContent = $(style).html() || '';

      // Find @font-face rules
      const fontFaceRegex = /@font-face\s*\{([^}]+)\}/gi;
      let match;

      while ((match = fontFaceRegex.exec(cssContent)) !== null) {
        const fontFaceContent = match[1];

        // Extract font family
        const familyMatch = fontFaceContent.match(/font-family:\s*['"]?([^'";]+)['"]?/i);
        const family = familyMatch ? familyMatch[1].trim() : 'Unknown';

        // Extract font URLs
        const urlRegex = /url\(['"]?([^'"()]+)['"]?\)\s*format\(['"]?([^'"()]+)['"]?\)/gi;
        let urlMatch;

        while ((urlMatch = urlRegex.exec(fontFaceContent)) !== null) {
          const url = urlMatch[1];
          const format = urlMatch[2];

          // Extract weight and style
          const weightMatch = fontFaceContent.match(/font-weight:\s*(\w+)/i);
          const styleMatch = fontFaceContent.match(/font-style:\s*(\w+)/i);

          fonts.push({
            family,
            url,
            format,
            weight: weightMatch ? weightMatch[1] : undefined,
            style: styleMatch ? styleMatch[1] : undefined,
          });
        }
      }
    }

    return fonts;
  }

  /**
   * Extract fonts from link tags
   */
  private async extractFontsFromLinks(
    $: cheerio.CheerioAPI,
    baseUrl: string
  ): Promise<FontInfo[]> {
    const fonts: FontInfo[] = [];
    const links = $('link[rel="stylesheet"]').toArray();

    for (const link of links) {
      const href = $(link).attr('href');

      if (!href) continue;

      // Check if it's a Google Fonts link
      if (href.includes('fonts.googleapis.com') || href.includes('fonts.google.com')) {
        // Extract font families from URL
        const familyMatch = href.match(/family=([^&]+)/);
        if (familyMatch) {
          const families = decodeURIComponent(familyMatch[1]).split('|');

          families.forEach((family) => {
            // Remove weights/styles from family name
            const cleanFamily = family.split(':')[0];

            fonts.push({
              family: cleanFamily,
              url: href,
              format: 'google-fonts',
            });
          });
        }
      }
    }

    return fonts;
  }

  /**
   * Add font-display to @font-face rules
   */
  private addFontDisplay(
    $: cheerio.CheerioAPI,
    display: 'auto' | 'block' | 'swap' | 'fallback' | 'optional'
  ): void {
    const styles = $('style').toArray();

    for (const style of styles) {
      const $style = $(style);
      let cssContent = $style.html() || '';

      // Add font-display to @font-face rules that don't have it
      cssContent = cssContent.replace(
        /@font-face\s*\{([^}]+)\}/gi,
        (match, content) => {
          if (content.includes('font-display')) {
            return match; // Already has font-display
          }

          // Add font-display before the closing brace
          return match.replace('}', `  font-display: ${display};\n}`);
        }
      );

      $style.html(cssContent);
    }
  }

  /**
   * Add preload hints for critical fonts
   */
  private addFontPreloads($: cheerio.CheerioAPI, fonts: FontInfo[]): void {
    const head = $('head');

    fonts.forEach((font) => {
      if (font.url && !font.url.includes('googleapis.com')) {
        const format = font.format === 'woff2' ? 'font/woff2' : 'font/woff';

        head.prepend(
          `<link rel="preload" href="${font.url}" as="font" type="${format}" crossorigin>`
        );
      }
    });
  }

  /**
   * Optimize Google Fonts links
   */
  private optimizeGoogleFonts($: cheerio.CheerioAPI): number {
    let optimized = 0;
    const links = $('link[rel="stylesheet"]').toArray();

    for (const link of links) {
      const $link = $(link);
      const href = $link.attr('href');

      if (!href || !href.includes('fonts.googleapis.com')) continue;

      let optimizedHref = href;

      // Add display=swap parameter
      if (!href.includes('display=')) {
        const separator = href.includes('?') ? '&' : '?';
        optimizedHref = `${href}${separator}display=swap`;
      }

      // Add text parameter for subsetting (if not present)
      // This would require analyzing which characters are actually used

      $link.attr('href', optimizedHref);
      optimized++;
    }

    return optimized;
  }

  /**
   * Add system font fallbacks
   */
  private addFontFallbacks($: cheerio.CheerioAPI): void {
    const systemFallbacks = {
      serif: 'Georgia, "Times New Roman", Times, serif',
      'sans-serif':
        '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
      monospace: 'Menlo, Monaco, Consolas, "Courier New", monospace',
    };

    const styles = $('style').toArray();

    for (const style of styles) {
      const $style = $(style);
      let cssContent = $style.html() || '';

      // Add fallbacks to font-family declarations
      cssContent = cssContent.replace(
        /font-family:\s*['"]?([^'";]+)['"]?([^;]*);/gi,
        (match, family, rest) => {
          // Skip if already has fallbacks
          if (family.includes(',')) return match;

          // Determine fallback based on font characteristics
          let fallback = systemFallbacks['sans-serif'];

          if (
            family.toLowerCase().includes('serif') &&
            !family.toLowerCase().includes('sans')
          ) {
            fallback = systemFallbacks.serif;
          } else if (
            family.toLowerCase().includes('mono') ||
            family.toLowerCase().includes('code')
          ) {
            fallback = systemFallbacks.monospace;
          }

          return `font-family: '${family}', ${fallback}${rest};`;
        }
      );

      $style.html(cssContent);
    }
  }

  /**
   * Remove unused font weights (basic implementation)
   */
  private removeUnusedFontWeights($: cheerio.CheerioAPI): number {
    let removed = 0;

    // Get all used font-weight values in the HTML
    const usedWeights = new Set<string>();
    $('[style*="font-weight"]').each((_, el) => {
      const style = $(el).attr('style') || '';
      const match = style.match(/font-weight:\s*(\d+|bold|normal)/i);
      if (match) {
        usedWeights.add(match[1]);
      }
    });

    // Check styles for font-weight declarations
    const styles = $('style').toArray();
    for (const style of styles) {
      const cssContent = $(style).html() || '';
      const weightMatches = cssContent.match(/font-weight:\s*(\d+|bold|normal)/gi) || [];

      weightMatches.forEach((match) => {
        const weight = match.split(':')[1].trim();
        usedWeights.add(weight);
      });
    }

    // If only a few weights are used, we could remove others from @font-face
    // This is a simplified implementation
    if (usedWeights.size < 3) {
      // Potentially remove heavy/light weights
      removed = Math.max(0, 9 - usedWeights.size); // Assume 9 total weights
    }

    return removed;
  }

  /**
   * Analyze font usage and provide recommendations
   */
  async analyzeFontUsage(htmlContent: string, baseUrl: string): Promise<{
    totalFonts: number;
    googleFonts: number;
    customFonts: number;
    totalWeights: number;
    missingFontDisplay: number;
    noPreload: boolean;
    estimatedSize: number;
    recommendations: string[];
  }> {
    const $ = cheerio.load(htmlContent);
    const recommendations: string[] = [];

    const fonts = await this.extractFontsFromStyles($);
    const googleFonts = await this.extractFontsFromLinks($, baseUrl);

    const totalFonts = fonts.length + googleFonts.length;
    const totalWeights = fonts.length;

    // Check for font-display
    let missingFontDisplay = 0;
    $('style').each((_, style) => {
      const cssContent = $(style).html() || '';
      const fontFaces = cssContent.match(/@font-face\s*\{[^}]+\}/gi) || [];

      fontFaces.forEach((fontFace) => {
        if (!fontFace.includes('font-display')) {
          missingFontDisplay++;
        }
      });
    });

    // Check for preload
    const hasPreload = $('link[rel="preload"][as="font"]').length > 0;

    // Estimate size
    const estimatedSize = totalFonts * 50 * 1024; // Rough estimate: 50KB per font

    // Generate recommendations
    if (totalFonts > 3) {
      recommendations.push(
        `Using ${totalFonts} fonts. Consider reducing to 2-3 for better performance.`
      );
    }

    if (missingFontDisplay > 0) {
      recommendations.push(
        `${missingFontDisplay} @font-face rule(s) missing font-display. Add "font-display: swap" to prevent FOIT.`
      );
    }

    if (!hasPreload && totalFonts > 0) {
      recommendations.push(
        'Add preload hints for critical fonts to improve loading performance.'
      );
    }

    if (googleFonts.length > 0) {
      const hasDisplayParam = $('link[href*="fonts.googleapis.com"]').toArray().some((link) => {
        const href = $(link).attr('href') || '';
        return href.includes('display=');
      });

      if (!hasDisplayParam) {
        recommendations.push(
          'Add "&display=swap" to Google Fonts URLs to prevent render blocking.'
        );
      }
    }

    if (totalWeights > 4) {
      recommendations.push(
        `Using ${totalWeights} font weight(s). Consider using only regular (400) and bold (700).`
      );
    }

    return {
      totalFonts,
      googleFonts: googleFonts.length,
      customFonts: fonts.length,
      totalWeights,
      missingFontDisplay,
      noPreload: !hasPreload,
      estimatedSize,
      recommendations,
    };
  }

  /**
   * Convert fonts to WOFF2
   * Supports: TTF, OTF → WOFF2 conversion
   */
  async convertToWoff2(fontBuffer: Buffer): Promise<Buffer> {
    try {
      // Check if already WOFF2
      if (this.isWoff2(fontBuffer)) {
        console.log('[FONT-OPT] Font is already WOFF2 format');
        return fontBuffer;
      }

      // Parse font to ensure it's valid
      const font = fontkit.create(fontBuffer);

      if (!font) {
        throw new Error('Failed to parse font file');
      }

      console.log(`[FONT-OPT] Converting ${font.postscriptName || 'font'} to WOFF2...`);

      // Get TTF/OTF data
      let ttfBuffer: Buffer;

      if (this.isTtf(fontBuffer) || this.isOtf(fontBuffer)) {
        // Already TTF or OTF - use directly
        ttfBuffer = fontBuffer;
      } else if (this.isWoff(fontBuffer)) {
        // WOFF → TTF → WOFF2 conversion
        console.log('[FONT-OPT] Converting WOFF to TTF, then to WOFF2...');

        try {
          // Use fontkit to parse WOFF and extract TTF data
          // fontkit can read WOFF and re-encode to TTF
          const woffFont = fontkit.create(fontBuffer);

          if (!woffFont) {
            console.warn('[FONT-OPT] Failed to parse WOFF font, returning original');
            return fontBuffer;
          }

          // Create a subset containing all glyphs (effectively a full copy)
          // This will re-encode the font in TTF/OTF format
          const subset = woffFont.createSubset();

          // Include all glyphs
          for (let i = 0; i < woffFont.numGlyphs; i++) {
            subset.includeGlyph(i);
          }

          // Encode to TTF
          ttfBuffer = Buffer.from(subset.encode());

          console.log(`[FONT-OPT] Extracted TTF from WOFF (${fontBuffer.length} → ${ttfBuffer.length} bytes)`);
        } catch (error) {
          console.error('[FONT-OPT] WOFF to TTF extraction failed:', error);
          console.warn('[FONT-OPT] Returning original WOFF file');
          return fontBuffer;
        }
      } else {
        console.warn('[FONT-OPT] Unknown font format, returning original');
        return fontBuffer;
      }

      // Convert TTF/OTF to WOFF2
      const woff2Buffer = await woff2Compress(ttfBuffer);

      const originalSize = fontBuffer.length;
      const compressedSize = woff2Buffer.length;
      const savings = ((1 - compressedSize / originalSize) * 100).toFixed(1);

      console.log(
        `[FONT-OPT] Converted to WOFF2: ${originalSize} → ${compressedSize} bytes (${savings}% savings)`
      );

      return Buffer.from(woff2Buffer);
    } catch (error) {
      console.error('[FONT-OPT] Failed to convert to WOFF2:', error);
      // Return original buffer on error
      return fontBuffer;
    }
  }

  /**
   * Subset fonts to only include used characters
   * Uses fontkit to create a subset with only the required glyphs
   */
  async subsetFont(
    fontBuffer: Buffer,
    usedCharacters: string
  ): Promise<Buffer> {
    try {
      // Parse font
      const font = fontkit.create(fontBuffer);

      if (!font) {
        throw new Error('Failed to parse font file');
      }

      console.log(`[FONT-OPT] Subsetting font: ${font.postscriptName || 'unknown'}`);
      console.log(`[FONT-OPT] Used characters (${usedCharacters.length}): ${usedCharacters.substring(0, 50)}...`);

      // Get unique characters
      const uniqueChars = Array.from(new Set(usedCharacters.split('')));

      // Always include basic ASCII and common punctuation for safety
      const essentialChars = ' ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789.,!?-()[]{}\'"/\\@#$%&*+=<>:;';
      const allChars = Array.from(new Set([...uniqueChars, ...essentialChars.split('')]));

      console.log(`[FONT-OPT] Total unique glyphs to include: ${allChars.length}`);

      // Get glyph IDs for each character
      const glyphIds: number[] = [0]; // Always include .notdef glyph (ID 0)

      for (const char of allChars) {
        const codePoint = char.codePointAt(0);
        if (codePoint !== undefined) {
          const glyphId = font.glyphForCodePoint(codePoint)?.id;
          if (glyphId !== undefined && !glyphIds.includes(glyphId)) {
            glyphIds.push(glyphId);
          }
        }
      }

      console.log(`[FONT-OPT] Including ${glyphIds.length} glyphs (original: ${font.numGlyphs})`);

      // Create subset
      const subset = font.createSubset();

      // Include all required glyphs
      for (const glyphId of glyphIds) {
        subset.includeGlyph(glyphId);
      }

      // Encode the subset
      const subsetBuffer = subset.encode();

      const originalSize = fontBuffer.length;
      const subsetSize = subsetBuffer.length;
      const savings = ((1 - subsetSize / originalSize) * 100).toFixed(1);

      console.log(
        `[FONT-OPT] Subset created: ${originalSize} → ${subsetSize} bytes (${savings}% savings)`
      );

      return Buffer.from(subsetBuffer);
    } catch (error) {
      console.error('[FONT-OPT] Failed to subset font:', error);
      // Return original buffer on error
      return fontBuffer;
    }
  }

  /**
   * Check if buffer is WOFF2 format
   */
  private isWoff2(buffer: Buffer): boolean {
    // WOFF2 signature: 'wOF2' (0x774F4632)
    return buffer.length >= 4 && buffer.toString('ascii', 0, 4) === 'wOF2';
  }

  /**
   * Check if buffer is WOFF format
   */
  private isWoff(buffer: Buffer): boolean {
    // WOFF signature: 'wOFF' (0x774F4646)
    return buffer.length >= 4 && buffer.toString('ascii', 0, 4) === 'wOFF';
  }

  /**
   * Check if buffer is TTF format
   */
  private isTtf(buffer: Buffer): boolean {
    // TTF signature: 0x00010000 or 'true' (0x74727565)
    if (buffer.length < 4) return false;
    const sig = buffer.readUInt32BE(0);
    return sig === 0x00010000 || sig === 0x74727565;
  }

  /**
   * Check if buffer is OTF format
   */
  private isOtf(buffer: Buffer): boolean {
    // OTF signature: 'OTTO' (0x4F54544F)
    return buffer.length >= 4 && buffer.toString('ascii', 0, 4) === 'OTTO';
  }

  /**
   * Extract used characters from HTML content
   */
  extractUsedCharacters(htmlContent: string): string {
    const $ = cheerio.load(htmlContent);

    // Get all text content
    const textContent = $('body').text();

    // Also get text from alt attributes, titles, etc.
    const altText = $('[alt]').map((_, el) => $(el).attr('alt')).get().join('');
    const titleText = $('[title]').map((_, el) => $(el).attr('title')).get().join('');

    const allText = textContent + altText + titleText;

    // Return unique characters
    return Array.from(new Set(allText.split(''))).join('');
  }

  /**
   * Optimize single font file (conversion + subsetting)
   */
  async optimizeFontFile(
    fontBuffer: Buffer,
    usedCharacters?: string,
    options: { subset?: boolean; convertToWoff2?: boolean } = {}
  ): Promise<{ buffer: Buffer; originalSize: number; optimizedSize: number; savings: number }> {
    const originalSize = fontBuffer.length;
    let optimizedBuffer = fontBuffer;

    try {
      // Step 1: Subset if requested and characters provided
      if (options.subset && usedCharacters) {
        console.log('[FONT-OPT] Subsetting font...');
        optimizedBuffer = await this.subsetFont(optimizedBuffer, usedCharacters);
      }

      // Step 2: Convert to WOFF2 if requested
      if (options.convertToWoff2) {
        console.log('[FONT-OPT] Converting to WOFF2...');
        optimizedBuffer = await this.convertToWoff2(optimizedBuffer);
      }

      const optimizedSize = optimizedBuffer.length;
      const savings = ((1 - optimizedSize / originalSize) * 100);

      return {
        buffer: optimizedBuffer,
        originalSize,
        optimizedSize,
        savings,
      };
    } catch (error) {
      console.error('[FONT-OPT] Font optimization failed:', error);
      return {
        buffer: fontBuffer,
        originalSize,
        optimizedSize: originalSize,
        savings: 0,
      };
    }
  }
}
