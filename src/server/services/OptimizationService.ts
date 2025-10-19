import sharp from 'sharp';
import { minify as terserMinify } from 'terser';
import CleanCSS from 'clean-css';
import { PurgeCSS } from 'purgecss';
import critical from 'critical';
import * as cheerio from 'cheerio';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { optimize as optimizeSVG } from 'svgo';
import fontkit from 'fontkit';
import { compress as woff2Compress } from 'wawoff2';
import type {
  OptimizationResult,
  OptimizationChange,
  PerformanceIssue,
  ClonedWebsite,
  OptimizationSettings,
  Asset,
} from '../../shared/types/index.js';

export class OptimizationService {
  /**
   * Get quality settings based on preset
   */
  private getQualityPreset(preset: 'high' | 'medium' | 'low' | number): number {
    if (typeof preset === 'number') {
      return preset;
    }

    switch (preset) {
      case 'high':
        return 90; // High quality, larger file size
      case 'medium':
        return 80; // Balanced quality and size (default)
      case 'low':
        return 60; // Maximum compression, lower quality
      default:
        return 80;
    }
  }

  /**
   * Get Unicode range based on preset
   */
  private getUnicodeRange(preset: string): string {
    const ranges: Record<string, string> = {
      'latin': 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+2000-206F, U+2074, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD',
      'latin-ext': 'U+0100-024F, U+0259, U+1E00-1EFF, U+2020, U+20A0-20AB, U+20AD-20CF, U+2113, U+2C60-2C7F, U+A720-A7FF',
      'cyrillic': 'U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116',
      'cyrillic-ext': 'U+0460-052F, U+1C80-1C88, U+20B4, U+2DE0-2DFF, U+A640-A69F, U+FE2E-FE2F',
      'greek': 'U+0370-03FF',
      'greek-ext': 'U+1F00-1FFF',
      'vietnamese': 'U+0102-0103, U+0110-0111, U+0128-0129, U+0168-0169, U+01A0-01A1, U+01AF-01B0, U+1EA0-1EF9, U+20AB',
    };

    return ranges[preset] || preset; // Return custom range if not a preset
  }

  /**
   * Extract font metadata using fontkit
   */
  private async extractFontMetadata(fontPath: string): Promise<{
    family: string;
    weight: string;
    style: string;
    glyphCount: number;
  }> {
    try {
      const buffer = await fs.readFile(fontPath);
      const font = fontkit.create(buffer);

      return {
        family: font.familyName || 'Unknown',
        weight: font['OS/2']?.usWeightClass?.toString() || '400',
        style: font.postscriptName?.includes('Italic') ? 'italic' : 'normal',
        glyphCount: font.numGlyphs || 0,
      };
    } catch (error) {
      console.error(`Failed to extract font metadata from ${fontPath}:`, error);
      return {
        family: 'Unknown',
        weight: '400',
        style: 'normal',
        glyphCount: 0,
      };
    }
  }

  /**
   * Convert font to WOFF2 format
   */
  private async convertToWOFF2(inputPath: string, outputPath: string): Promise<void> {
    try {
      const inputBuffer = await fs.readFile(inputPath);
      const woff2Buffer = await woff2Compress(inputBuffer);
      await fs.writeFile(outputPath, woff2Buffer);
    } catch (error) {
      throw new Error(`Failed to convert font to WOFF2: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Subset font to include only specific characters
   */
  private async subsetFont(
    inputPath: string,
    outputPath: string,
    unicodeRange?: string,
    text?: string
  ): Promise<number> {
    try {
      const buffer = await fs.readFile(inputPath);
      const font = fontkit.create(buffer);

      // Parse unicode range
      let codePoints: Set<number> = new Set();

      if (text) {
        // Extract code points from provided text
        for (let i = 0; i < text.length; i++) {
          codePoints.add(text.charCodeAt(i));
        }
      } else if (unicodeRange) {
        // Parse unicode range (e.g., "U+0000-00FF")
        const ranges = unicodeRange.split(',').map((r) => r.trim());

        for (const range of ranges) {
          const match = range.match(/U\+([0-9A-F]+)(?:-([0-9A-F]+))?/i);
          if (match) {
            const start = parseInt(match[1], 16);
            const end = match[2] ? parseInt(match[2], 16) : start;

            for (let i = start; i <= end; i++) {
              codePoints.add(i);
            }
          }
        }
      }

      // Create subset (simplified - in production, use a library like fonttools via Python)
      // For now, we'll just copy the font and return its size
      // TODO: Implement actual subsetting using pyftsubset or similar
      await fs.copyFile(inputPath, outputPath);

      const stats = await fs.stat(outputPath);
      return stats.size;
    } catch (error) {
      throw new Error(`Failed to subset font: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Apply a single optimization fix
   */
  async applyFix(
    issue: PerformanceIssue,
    website: ClonedWebsite,
    settings: OptimizationSettings
  ): Promise<OptimizationResult> {
    const changes: OptimizationChange[] = [];

    try {
      switch (issue.category) {
        case 'images':
          return await this.optimizeImages(issue, website, settings.images);

        case 'css':
          return await this.optimizeCSS(issue, website, settings.css);

        case 'javascript':
          return await this.optimizeJavaScript(issue, website, settings.javascript);

        case 'fonts':
          return await this.optimizeFonts(issue, website, settings.fonts);

        case 'html':
          return await this.optimizeHTML(issue, website, settings.html);

        case 'layout-stability':
          return await this.fixLayoutShift(issue, website);

        case 'render':
          return await this.fixRenderBlocking(issue, website, settings);

        default:
          throw new Error(`Unknown optimization category: ${issue.category}`);
      }
    } catch (error) {
      return {
        issueId: issue.id,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        changes: [],
      };
    }
  }

  /**
   * Apply multiple fixes at once
   */
  async applyMultipleFixes(
    issues: PerformanceIssue[],
    website: ClonedWebsite,
    settings: OptimizationSettings
  ): Promise<OptimizationResult[]> {
    const results: OptimizationResult[] = [];

    for (const issue of issues) {
      const result = await this.applyFix(issue, website, settings);
      results.push(result);
    }

    return results;
  }

  /**
   * Image Optimization
   */
  private async optimizeImages(
    issue: PerformanceIssue,
    website: ClonedWebsite,
    settings: any
  ): Promise<OptimizationResult> {
    const changes: OptimizationChange[] = [];
    const projectDir = path.join(process.cwd(), 'uploads', website.id);
    let totalBytesSaved = 0;

    // Optimize each image
    for (const asset of website.assets.filter((a) => a.type === 'image')) {
      const originalPath = path.join(projectDir, asset.localPath);
      const optimizedDir = path.join(projectDir, 'assets', 'optimized');
      await fs.mkdir(optimizedDir, { recursive: true });

      const filename = path.basename(asset.localPath, path.extname(asset.localPath));

      try {
        const image = sharp(originalPath);
        const metadata = await image.metadata();
        const originalSize = asset.size;
        let bytesSaved = 0;

        // Handle SVG optimization separately
        if (metadata.format === 'svg') {
          const svgContent = await fs.readFile(originalPath, 'utf-8');
          const optimized = await this.optimizeSVGImage(svgContent);

          const svgPath = path.join(optimizedDir, `${filename}.svg`);
          await fs.writeFile(svgPath, optimized.data);

          const optimizedStats = await fs.stat(svgPath);
          bytesSaved = originalSize - optimizedStats.size;

          changes.push({
            type: 'add',
            file: asset.localPath,
            description: `Optimized SVG (${((bytesSaved / originalSize) * 100).toFixed(1)}% reduction)`,
            bytesSaved,
          });

          continue;
        }

        // Get quality based on preset or custom value
        const quality = this.getQualityPreset(settings.quality);

        // Generate blur-up placeholder if enabled
        if (settings.generateBlurPlaceholder) {
          const placeholderPath = path.join(optimizedDir, `${filename}-placeholder.jpg`);
          await sharp(originalPath)
            .resize(20) // Tiny 20px width
            .jpeg({ quality: 30 })
            .toFile(placeholderPath);

          // Convert placeholder to base64 for inline embedding
          const placeholderBuffer = await fs.readFile(placeholderPath);
          const placeholderBase64 = placeholderBuffer.toString('base64');
          asset.metadata = {
            ...asset.metadata,
            blurPlaceholder: `data:image/jpeg;base64,${placeholderBase64}`,
          };
        }

        // Determine which formats to generate
        const formats: Array<'webp' | 'avif' | 'jpeg' | 'png'> = [];

        if (settings.format === 'auto' || settings.format === 'avif') {
          formats.push('avif');
        }
        if (settings.format === 'auto' || settings.format === 'webp') {
          formats.push('webp');
        }
        if (settings.format === 'jpeg' && metadata.format === 'jpeg') {
          formats.push('jpeg');
        }
        if (settings.format === 'png' && metadata.format === 'png') {
          formats.push('png');
        }

        // Fallback to WebP if no formats specified
        if (!formats.length) {
          formats.push('webp');
        }

        // Generate optimized images in requested formats
        for (const format of formats) {
          const formatPath = path.join(optimizedDir, `${filename}.${format}`);

          if (format === 'webp') {
            await sharp(originalPath)
              .webp({
                quality,
                effort: settings.compressionType === 'lossless' ? 6 : 4,
                lossless: settings.compressionType === 'lossless',
              })
              .toFile(formatPath);
          } else if (format === 'avif') {
            await sharp(originalPath)
              .avif({
                quality,
                effort: settings.compressionType === 'lossless' ? 9 : 4,
                lossless: settings.compressionType === 'lossless',
              })
              .toFile(formatPath);
          } else if (format === 'jpeg') {
            // Progressive JPEG for better perceived performance
            await sharp(originalPath)
              .jpeg({
                quality,
                progressive: settings.progressive !== false, // Default to true
                mozjpeg: true, // Use mozjpeg for better compression
              })
              .toFile(formatPath);
          } else if (format === 'png') {
            await sharp(originalPath)
              .png({
                quality,
                compressionLevel: 9,
                progressive: true,
              })
              .toFile(formatPath);
          }

          const optimizedStats = await fs.stat(formatPath);
          bytesSaved = Math.max(bytesSaved, originalSize - optimizedStats.size);

          // Generate responsive images if enabled
          if (settings.responsive && metadata.width) {
            const sizes = [400, 800, 1200, 1600].filter((s) => s <= metadata.width!);

            for (const size of sizes) {
              const responsivePath = path.join(optimizedDir, `${filename}-${size}.${format}`);

              let sharpInstance = sharp(originalPath).resize(size);

              if (format === 'webp') {
                await sharpInstance
                  .webp({
                    quality,
                    effort: settings.compressionType === 'lossless' ? 6 : 4,
                    lossless: settings.compressionType === 'lossless',
                  })
                  .toFile(responsivePath);
              } else if (format === 'avif') {
                await sharpInstance
                  .avif({
                    quality,
                    effort: settings.compressionType === 'lossless' ? 9 : 4,
                    lossless: settings.compressionType === 'lossless',
                  })
                  .toFile(responsivePath);
              } else if (format === 'jpeg') {
                await sharpInstance
                  .jpeg({
                    quality,
                    progressive: settings.progressive !== false,
                    mozjpeg: true,
                  })
                  .toFile(responsivePath);
              } else if (format === 'png') {
                await sharpInstance
                  .png({
                    quality,
                    compressionLevel: 9,
                  })
                  .toFile(responsivePath);
              }
            }
          }
        }

        totalBytesSaved += bytesSaved;

        const qualityLabel = typeof settings.quality === 'string'
          ? settings.quality
          : `${quality}%`;

        changes.push({
          type: 'add',
          file: asset.localPath,
          description: `Converted ${asset.originalUrl} to ${formats.join(' and ')} (quality: ${qualityLabel})`,
          bytesSaved,
        });

      } catch (error) {
        console.error(`Failed to optimize ${asset.localPath}:`, error);
      }
    }

    // Update HTML to use picture elements with modern formats
    if (settings.generateSrcset) {
      const $ = cheerio.load(website.html);

      $('img').each((_, elem) => {
        const $img = $(elem);
        const src = $img.attr('src');
        const alt = $img.attr('alt') || '';
        const width = $img.attr('width');
        const height = $img.attr('height');
        const className = $img.attr('class');
        const loading = settings.lazyLoad ? 'lazy' : undefined;

        if (src) {
          const filename = path.basename(src, path.extname(src));
          const avifSrc = `/assets/optimized/${filename}.avif`;
          const webpSrc = `/assets/optimized/${filename}.webp`;

          // Get blur placeholder for this image
          const asset = website.assets.find((a) => a.localPath.includes(filename));
          const blurPlaceholder = asset?.metadata?.blurPlaceholder;

          // Build srcset for responsive images
          let avifSrcset = '';
          let webpSrcset = '';

          if (settings.responsive) {
            const sizes = [400, 800, 1200, 1600];
            avifSrcset = sizes
              .map((size) => `/assets/optimized/${filename}-${size}.avif ${size}w`)
              .join(', ');
            webpSrcset = sizes
              .map((size) => `/assets/optimized/${filename}-${size}.webp ${size}w`)
              .join(', ');
          }

          // Build picture element with multiple format support
          const sources = [];

          // AVIF source (best compression, modern browsers)
          if (settings.format === 'auto' || settings.format === 'avif') {
            sources.push(
              `<source ${avifSrcset ? `srcset="${avifSrcset}"` : `srcset="${avifSrc}"`} type="image/avif">`
            );
          }

          // WebP source (good compression, wide browser support)
          if (settings.format === 'auto' || settings.format === 'webp') {
            sources.push(
              `<source ${webpSrcset ? `srcset="${webpSrcset}"` : `srcset="${webpSrc}"`} type="image/webp">`
            );
          }

          // Add blur-up placeholder styling
          const blurStyle = blurPlaceholder && settings.generateBlurPlaceholder
            ? `style="background-image: url('${blurPlaceholder}'); background-size: cover; background-position: center;"`
            : '';

          const picture = `
            <picture>
              ${sources.join('\n              ')}
              <img src="${src}" alt="${alt}" ${width ? `width="${width}"` : ''} ${height ? `height="${height}"` : ''} ${className ? `class="${className}"` : ''} ${loading ? `loading="${loading}"` : ''} ${blurStyle}>
            </picture>
          `;

          $img.replaceWith(picture);
        }
      });

      website.html = $.html();

      const formatDescription = settings.format === 'auto'
        ? 'AVIF and WebP with fallbacks'
        : settings.format === 'avif'
        ? 'AVIF format'
        : 'WebP format';

      changes.push({
        type: 'modify',
        file: 'index.html',
        description: `Updated images to use picture elements with ${formatDescription}`,
      });
    }

    return {
      issueId: issue.id,
      success: true,
      changes,
    };
  }

  /**
   * Optimize SVG images
   */
  private async optimizeSVGImage(svgContent: string): Promise<{ data: string }> {
    const result = optimizeSVG(svgContent, {
      plugins: [
        {
          name: 'preset-default',
          params: {
            overrides: {
              // Preserve viewBox for responsiveness
              removeViewBox: false,
              // Don't remove IDs (might be referenced)
              cleanupIds: false,
            },
          },
        },
        // Remove comments
        'removeComments',
        // Remove hidden elements
        'removeHiddenElems',
        // Remove empty containers
        'removeEmptyContainers',
        // Minify styles
        'minifyStyles',
        // Remove unnecessary metadata
        'removeMetadata',
        // Remove editor data
        'removeEditorsNSData',
        // Optimize paths
        'convertPathData',
        // Merge multiple paths
        'mergePaths',
        // Remove duplicate gradients/patterns
        'removeDuplicates',
        // Sort attributes
        'sortAttrs',
        // Simplify transforms
        'convertTransform',
      ],
    });

    return { data: result.data };
  }

  /**
   * CSS Optimization
   */
  private async optimizeCSS(
    issue: PerformanceIssue,
    website: ClonedWebsite,
    settings: any
  ): Promise<OptimizationResult> {
    const changes: OptimizationChange[] = [];

    // Remove unused CSS
    if (settings.removeUnused && issue.title.includes('unused')) {
      const purgeCSSResults = await new PurgeCSS().purge({
        content: [{ raw: website.html, extension: 'html' }],
        css: website.css.map((css) => ({ raw: css })),
      });

      const originalSize = website.css.join('').length;
      const optimizedSize = purgeCSSResults.map((r) => r.css).join('').length;
      const bytesSaved = originalSize - optimizedSize;

      website.css = purgeCSSResults.map((r) => r.css);

      changes.push({
        type: 'modify',
        file: 'styles.css',
        description: 'Removed unused CSS rules',
        bytesSaved,
      });
    }

    // Minify CSS
    if (settings.minify) {
      const cleanCSS = new CleanCSS({ level: 2 });

      for (let i = 0; i < website.css.length; i++) {
        const result = cleanCSS.minify(website.css[i]);
        const bytesSaved = website.css[i].length - result.styles.length;

        website.css[i] = result.styles;

        changes.push({
          type: 'modify',
          file: `styles-${i}.css`,
          description: 'Minified CSS',
          bytesSaved,
        });
      }
    }

    return {
      issueId: issue.id,
      success: true,
      changes,
    };
  }

  /**
   * JavaScript Optimization
   */
  private async optimizeJavaScript(
    issue: PerformanceIssue,
    website: ClonedWebsite,
    settings: any
  ): Promise<OptimizationResult> {
    const changes: OptimizationChange[] = [];

    // Minify JavaScript
    if (settings.minify) {
      for (let i = 0; i < website.javascript.length; i++) {
        const result = await terserMinify(website.javascript[i], {
          compress: {
            dead_code: settings.removeUnused,
            drop_console: true,
            drop_debugger: true,
          },
          mangle: true,
        });

        if (result.code) {
          const bytesSaved = website.javascript[i].length - result.code.length;
          website.javascript[i] = result.code;

          changes.push({
            type: 'modify',
            file: `script-${i}.js`,
            description: 'Minified JavaScript',
            bytesSaved,
          });
        }
      }
    }

    // Add defer/async attributes
    if (settings.defer || settings.async) {
      const $ = cheerio.load(website.html);

      $('script[src]').each((_, elem) => {
        const $script = $(elem);

        if (settings.defer) {
          $script.attr('defer', '');
        } else if (settings.async) {
          $script.attr('async', '');
        }
      });

      website.html = $.html();

      changes.push({
        type: 'modify',
        file: 'index.html',
        description: `Added ${settings.defer ? 'defer' : 'async'} attribute to scripts`,
      });
    }

    return {
      issueId: issue.id,
      success: true,
      changes,
    };
  }

  /**
   * Font Optimization with subsetting, WOFF2 conversion, and advanced features
   */
  private async optimizeFonts(
    issue: PerformanceIssue,
    website: ClonedWebsite,
    settings: any
  ): Promise<OptimizationResult> {
    const changes: OptimizationChange[] = [];
    const $ = cheerio.load(website.html);
    const projectDir = path.join(process.cwd(), 'uploads', website.id);
    const optimizedFontsDir = path.join(projectDir, 'assets', 'fonts', 'optimized');
    await fs.mkdir(optimizedFontsDir, { recursive: true });

    let totalBytesSaved = 0;

    // Process each font asset
    const fontAssets = website.assets.filter((a) => a.type === 'font');

    for (const fontAsset of fontAssets) {
      const originalPath = path.join(projectDir, fontAsset.localPath);
      const filename = path.basename(fontAsset.localPath, path.extname(fontAsset.localPath));
      const originalSize = fontAsset.size;

      try {
        // Extract font metadata
        const metadata = await this.extractFontMetadata(originalPath);

        // Store metadata in asset
        fontAsset.metadata = {
          ...fontAsset.metadata,
          fontFamily: metadata.family,
          fontWeight: metadata.weight,
          fontStyle: metadata.style,
          glyphCount: metadata.glyphCount,
        };

        let optimizedPath = originalPath;
        let bytesSaved = 0;

        // Step 1: Subset font if enabled
        if (settings.subset && (settings.unicodeRange || settings.subsetCharacters)) {
          const subsetPath = path.join(optimizedFontsDir, `${filename}-subset${path.extname(fontAsset.localPath)}`);
          const unicodeRange = settings.unicodeRange ? this.getUnicodeRange(settings.unicodeRange) : undefined;

          await this.subsetFont(
            optimizedPath,
            subsetPath,
            unicodeRange,
            settings.subsetCharacters
          );

          optimizedPath = subsetPath;

          const subsetStats = await fs.stat(subsetPath);
          const subsetReduction = originalSize - subsetStats.size;

          if (subsetReduction > 0) {
            bytesSaved += subsetReduction;
            fontAsset.metadata.unicodeRange = unicodeRange || 'custom';

            changes.push({
              type: 'modify',
              file: fontAsset.localPath,
              description: `Subsetted font to ${settings.unicodeRange || 'custom characters'} (${((subsetReduction / originalSize) * 100).toFixed(1)}% reduction)`,
              bytesSaved: subsetReduction,
            });
          }
        }

        // Step 2: Convert to WOFF2 if enabled
        if (settings.format === 'woff2' && !fontAsset.localPath.endsWith('.woff2')) {
          const woff2Path = path.join(optimizedFontsDir, `${filename}.woff2`);

          await this.convertToWOFF2(optimizedPath, woff2Path);

          const woff2Stats = await fs.stat(woff2Path);
          const formatReduction = (await fs.stat(optimizedPath)).size - woff2Stats.size;

          if (formatReduction > 0) {
            bytesSaved += formatReduction;
            fontAsset.optimizedFormat = 'woff2';
            fontAsset.optimizedSize = woff2Stats.size;

            changes.push({
              type: 'add',
              file: fontAsset.localPath,
              description: `Converted to WOFF2 format (${((formatReduction / originalSize) * 100).toFixed(1)}% additional reduction)`,
              bytesSaved: formatReduction,
            });
          }

          optimizedPath = woff2Path;
        }

        totalBytesSaved += bytesSaved;
      } catch (error) {
        console.error(`Failed to optimize font ${fontAsset.localPath}:`, error);
      }
    }

    // Step 3: Add font-display to @font-face declarations
    const fontDisplayCSS = website.css.map((css) => {
      if (css.includes('@font-face')) {
        const updatedCSS = css.replace(
          /@font-face\s*{([^}]*)}/g,
          (match, content) => {
            // Add font-display if not present
            let newContent = content;
            if (!content.includes('font-display')) {
              newContent = `font-display: ${settings.fontDisplay || 'swap'}; ${content}`;
            }

            // Add unicode-range if subsetting is enabled
            if (settings.subset && settings.unicodeRange && !content.includes('unicode-range')) {
              const range = this.getUnicodeRange(settings.unicodeRange);
              newContent = `${newContent} unicode-range: ${range};`;
            }

            return `@font-face { ${newContent}}`;
          }
        );
        return updatedCSS;
      }
      return css;
    });

    website.css = fontDisplayCSS;

    changes.push({
      type: 'modify',
      file: 'styles.css',
      description: `Added font-display: ${settings.fontDisplay || 'swap'}${settings.subset && settings.unicodeRange ? ' and unicode-range' : ''}`,
    });

    // Step 4: Add font preloading based on strategy
    const preloadStrategy = settings.preloadStrategy || 'critical';

    if (settings.preload && preloadStrategy !== 'none') {
      let fontsToPreload: Asset[] = [];

      if (preloadStrategy === 'critical') {
        // Only preload first 1-2 critical fonts (typically body + heading fonts)
        fontsToPreload = fontAssets.slice(0, 2);
      } else if (preloadStrategy === 'all') {
        // Preload all fonts (not recommended for performance)
        fontsToPreload = fontAssets;
      }

      const preloadLinks = fontsToPreload
        .map((font) => {
          const format = font.optimizedFormat || font.format;
          const type = format === 'woff2' ? 'font/woff2' : format === 'woff' ? 'font/woff' : `font/${format}`;
          const href = font.optimizedFormat
            ? `/assets/fonts/optimized/${path.basename(font.localPath, path.extname(font.localPath))}.${font.optimizedFormat}`
            : font.localPath;

          return `<link rel="preload" href="${href}" as="font" type="${type}" crossorigin>`;
        })
        .join('\n    ');

      $('head').prepend(`\n    ${preloadLinks}\n  `);
      website.html = $.html();

      changes.push({
        type: 'add',
        file: 'index.html',
        description: `Added font preload links for ${fontsToPreload.length} font(s) using ${preloadStrategy} strategy`,
      });
    }

    // Step 5: Self-host Google Fonts if enabled
    if (settings.selfHost) {
      // Find and remove Google Fonts links
      const googleFontsLinks = $('link[href*="fonts.googleapis.com"]');

      if (googleFontsLinks.length > 0) {
        googleFontsLinks.remove();
        website.html = $.html();

        changes.push({
          type: 'remove',
          file: 'index.html',
          description: `Removed ${googleFontsLinks.length} Google Fonts link(s) for self-hosting`,
        });
      }
    }

    return {
      issueId: issue.id,
      success: true,
      changes,
    };
  }

  /**
   * HTML Optimization
   */
  private async optimizeHTML(
    issue: PerformanceIssue,
    website: ClonedWebsite,
    settings: any
  ): Promise<OptimizationResult> {
    const changes: OptimizationChange[] = [];
    const $ = cheerio.load(website.html);

    // Add resource hints
    if (settings.addResourceHints) {
      const externalDomains = new Set<string>();

      $('link[href^="http"], script[src^="http"], img[src^="http"]').each((_, elem) => {
        const url = $(elem).attr('href') || $(elem).attr('src');
        if (url) {
          try {
            const domain = new URL(url).origin;
            externalDomains.add(domain);
          } catch {}
        }
      });

      const hints = Array.from(externalDomains)
        .map((domain) => `<link rel="preconnect" href="${domain}">`)
        .join('\n');

      $('head').prepend(hints);

      changes.push({
        type: 'add',
        file: 'index.html',
        description: 'Added preconnect resource hints',
      });
    }

    // Lazy load iframes
    if (settings.lazyLoadIframes) {
      $('iframe').each((_, elem) => {
        $(elem).attr('loading', 'lazy');
      });

      changes.push({
        type: 'modify',
        file: 'index.html',
        description: 'Added lazy loading to iframes',
      });
    }

    // Minify HTML
    if (settings.minify) {
      const originalSize = website.html.length;
      website.html = $.html({
        decodeEntities: false,
      }).replace(/\s+/g, ' ').replace(/>\s+</g, '><');

      const bytesSaved = originalSize - website.html.length;

      changes.push({
        type: 'modify',
        file: 'index.html',
        description: 'Minified HTML',
        bytesSaved,
      });
    } else {
      website.html = $.html();
    }

    return {
      issueId: issue.id,
      success: true,
      changes,
    };
  }

  /**
   * Fix Layout Shift Issues
   */
  private async fixLayoutShift(
    issue: PerformanceIssue,
    website: ClonedWebsite
  ): Promise<OptimizationResult> {
    const changes: OptimizationChange[] = [];
    const $ = cheerio.load(website.html);

    // Add dimensions to images without them
    for (const asset of website.assets.filter((a) => a.type === 'image')) {
      if (asset.dimensions) {
        $(`img[src*="${path.basename(asset.localPath)}"]`).each((_, elem) => {
          const $img = $(elem);

          if (!$img.attr('width') && !$img.attr('height')) {
            $img.attr('width', asset.dimensions!.width.toString());
            $img.attr('height', asset.dimensions!.height.toString());
          }
        });
      }
    }

    website.html = $.html();

    changes.push({
      type: 'modify',
      file: 'index.html',
      description: 'Added explicit dimensions to images',
    });

    return {
      issueId: issue.id,
      success: true,
      changes,
    };
  }

  /**
   * Fix Render Blocking Resources
   */
  private async fixRenderBlocking(
    issue: PerformanceIssue,
    website: ClonedWebsite,
    settings: OptimizationSettings
  ): Promise<OptimizationResult> {
    const changes: OptimizationChange[] = [];
    const $ = cheerio.load(website.html);

    // Extract critical CSS
    if (settings.css.extractCritical) {
      try {
        const projectDir = path.join(process.cwd(), 'uploads', website.id);
        const htmlPath = path.join(projectDir, 'index.html');

        const { css: criticalCSS } = await critical.generate({
          inline: false,
          base: projectDir,
          src: 'index.html',
          width: 1300,
          height: 900,
        });

        // Inline critical CSS
        $('head').append(`<style>${criticalCSS}</style>`);

        // Defer non-critical stylesheets
        $('link[rel="stylesheet"]').each((_, elem) => {
          const $link = $(elem);
          const href = $link.attr('href');

          $link.replaceWith(
            `<link rel="preload" href="${href}" as="style" onload="this.onload=null;this.rel='stylesheet'">
             <noscript><link rel="stylesheet" href="${href}"></noscript>`
          );
        });

        website.html = $.html();

        changes.push({
          type: 'modify',
          file: 'index.html',
          description: 'Inlined critical CSS and deferred non-critical styles',
        });
      } catch (error) {
        console.error('Failed to extract critical CSS:', error);
      }
    }

    return {
      issueId: issue.id,
      success: true,
      changes,
    };
  }
}

export default new OptimizationService();
