/**
 * MinimalImageService - Sharp-free image handling
 *
 * Handles images without conversion or optimization
 * Trade-off: No WebP/AVIF conversion, no resizing
 * Benefit: 20MB smaller, still functional for HTML generation
 */

import * as cheerio from 'cheerio';
import axios from 'axios';
import { createHash } from 'crypto';

interface ImageInfo {
  url: string;
  localPath?: string;
  width?: number;
  height?: number;
  format?: string;
  size?: number;
  alt?: string;
  loading?: 'lazy' | 'eager';
}

interface ImageOptimization {
  htmlUpdates: string;
  images: ImageInfo[];
  summary: {
    totalImages: number;
    withLazyLoading: number;
    withDimensions: number;
    withAlt: number;
    missingOptimizations: string[];
  };
}

export class MinimalImageService {
  /**
   * Optimize images in HTML (without actual conversion)
   * Adds lazy loading, dimensions, and responsive attributes
   */
  async optimizeImages(html: string): Promise<ImageOptimization> {
    const $ = cheerio.load(html);
    const images: ImageInfo[] = [];
    const $images = $('img');

    let withLazyLoading = 0;
    let withDimensions = 0;
    let withAlt = 0;
    const missingOptimizations: string[] = [];

    // Process each image
    for (let i = 0; i < $images.length; i++) {
      const $img = $($images[i]);
      const src = $img.attr('src');

      if (!src || src.startsWith('data:')) continue;

      const imageInfo: ImageInfo = {
        url: src,
        width: parseInt($img.attr('width') || '0') || undefined,
        height: parseInt($img.attr('height') || '0') || undefined,
        alt: $img.attr('alt'),
        loading: $img.attr('loading') as 'lazy' | 'eager' | undefined,
      };

      // Add lazy loading if missing (skip first 2 images)
      if (i >= 2 && !imageInfo.loading) {
        $img.attr('loading', 'lazy');
        imageInfo.loading = 'lazy';
        withLazyLoading++;
      } else if (imageInfo.loading === 'lazy') {
        withLazyLoading++;
      }

      // Check for dimensions
      if (imageInfo.width && imageInfo.height) {
        withDimensions++;
      } else {
        // Try to fetch image metadata
        const dimensions = await this.getImageDimensions(src);
        if (dimensions) {
          $img.attr('width', dimensions.width.toString());
          $img.attr('height', dimensions.height.toString());
          imageInfo.width = dimensions.width;
          imageInfo.height = dimensions.height;
          withDimensions++;
        } else {
          missingOptimizations.push(`Image missing dimensions: ${src}`);
        }
      }

      // Check for alt text
      if (imageInfo.alt) {
        withAlt++;
      } else {
        missingOptimizations.push(`Image missing alt text: ${src}`);
      }

      // Add decoding="async" for better performance
      if (!$img.attr('decoding')) {
        $img.attr('decoding', 'async');
      }

      images.push(imageInfo);
    }

    return {
      htmlUpdates: $.html(),
      images,
      summary: {
        totalImages: images.length,
        withLazyLoading,
        withDimensions,
        withAlt,
        missingOptimizations,
      },
    };
  }

  /**
   * Generate responsive image HTML
   * Creates srcset without actually creating multiple image versions
   */
  generateResponsiveHtml(
    src: string,
    alt: string,
    width: number,
    height: number
  ): string {
    // Generate srcset placeholders (would need actual images in full mode)
    const srcset = [
      `${src} ${width}w`,
      // Placeholders for other sizes
      // In full mode with Sharp, we'd generate: 640w, 750w, 828w, 1080w, 1200w, etc.
    ].join(', ');

    const sizes = '(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw';

    return `<img
      src="${src}"
      srcset="${srcset}"
      sizes="${sizes}"
      alt="${alt}"
      width="${width}"
      height="${height}"
      loading="lazy"
      decoding="async"
    />`;
  }

  /**
   * Add lazy loading to images
   */
  addLazyLoading(html: string, skipFirst: number = 2): string {
    const $ = cheerio.load(html);
    const $images = $('img');

    $images.each((i, el) => {
      if (i >= skipFirst) {
        const $img = $(el);
        if (!$img.attr('loading')) {
          $img.attr('loading', 'lazy');
        }
      }
    });

    return $.html();
  }

  /**
   * Get image dimensions from URL (basic probe without full download)
   */
  private async getImageDimensions(
    url: string
  ): Promise<{ width: number; height: number } | null> {
    try {
      // For minimal mode, we'll skip actual dimension detection
      // In full mode with Sharp, we'd probe the image headers

      // Quick check if it's a data URL
      if (url.startsWith('data:image')) {
        return this.getDataUrlDimensions(url);
      }

      // For external URLs, return null (would need Sharp or image-size package)
      return null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Extract dimensions from data URL (if present in SVG)
   */
  private getDataUrlDimensions(dataUrl: string): { width: number; height: number } | null {
    try {
      // SVG data URLs might have dimensions in XML
      if (dataUrl.includes('svg')) {
        const match = dataUrl.match(/width="(\d+)".*height="(\d+)"/);
        if (match) {
          return {
            width: parseInt(match[1]),
            height: parseInt(match[2]),
          };
        }
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Generate image optimization report
   */
  generateOptimizationReport(optimization: ImageOptimization): string {
    const { summary } = optimization;
    const { totalImages, withLazyLoading, withDimensions, withAlt, missingOptimizations } =
      summary;

    let report = `# Image Optimization Report\n\n`;
    report += `## Summary\n`;
    report += `- Total Images: ${totalImages}\n`;
    report += `- With Lazy Loading: ${withLazyLoading}/${totalImages} (${((withLazyLoading / totalImages) * 100).toFixed(1)}%)\n`;
    report += `- With Dimensions: ${withDimensions}/${totalImages} (${((withDimensions / totalImages) * 100).toFixed(1)}%)\n`;
    report += `- With Alt Text: ${withAlt}/${totalImages} (${((withAlt / totalImages) * 100).toFixed(1)}%)\n\n`;

    if (missingOptimizations.length > 0) {
      report += `## Issues Found\n\n`;
      missingOptimizations.forEach((issue, i) => {
        report += `${i + 1}. ${issue}\n`;
      });
      report += `\n`;
    }

    report += `## Recommendations\n\n`;
    if (withLazyLoading < totalImages) {
      report += `- Add lazy loading to ${totalImages - withLazyLoading} more images\n`;
    }
    if (withDimensions < totalImages) {
      report += `- Add explicit dimensions to ${totalImages - withDimensions} images to prevent CLS\n`;
    }
    if (withAlt < totalImages) {
      report += `- Add alt text to ${totalImages - withAlt} images for accessibility\n`;
    }

    report += `\n⚠️  **Note**: Running in MINIMAL mode. For advanced image optimization (WebP/AVIF conversion, resizing), upgrade to full mode: \`npm run install:full\`\n`;

    return report;
  }

  /**
   * Extract all image URLs from HTML
   */
  extractImageUrls(html: string): string[] {
    const $ = cheerio.load(html);
    const urls: string[] = [];

    $('img').each((_, el) => {
      const src = $(el).attr('src');
      if (src && !src.startsWith('data:')) {
        urls.push(src);
      }
    });

    // Also check for background images in inline styles
    $('[style*="background"]').each((_, el) => {
      const style = $(el).attr('style') || '';
      const match = style.match(/url\(['"]?([^'"()]+)['"]?\)/);
      if (match && match[1]) {
        urls.push(match[1]);
      }
    });

    return [...new Set(urls)]; // Remove duplicates
  }

  /**
   * Check if image format is modern
   */
  isModernFormat(url: string): boolean {
    const ext = url.split('.').pop()?.toLowerCase();
    return ext === 'webp' || ext === 'avif';
  }

  /**
   * Generate suggestions for image optimization
   */
  getSuggestions(images: ImageInfo[]): string[] {
    const suggestions: string[] = [];

    const oldFormatImages = images.filter(
      (img) => !this.isModernFormat(img.url) && !img.url.startsWith('data:')
    );

    if (oldFormatImages.length > 0) {
      suggestions.push(
        `Convert ${oldFormatImages.length} images to WebP/AVIF for 30-50% size reduction (requires full mode)`
      );
    }

    const withoutLazy = images.filter((img) => !img.loading || img.loading !== 'lazy');
    if (withoutLazy.length > 2) {
      suggestions.push(`Add lazy loading to ${withoutLazy.length - 2} offscreen images`);
    }

    const withoutDimensions = images.filter((img) => !img.width || !img.height);
    if (withoutDimensions.length > 0) {
      suggestions.push(
        `Add explicit dimensions to ${withoutDimensions.length} images to prevent layout shift (CLS)`
      );
    }

    const withoutAlt = images.filter((img) => !img.alt);
    if (withoutAlt.length > 0) {
      suggestions.push(
        `Add descriptive alt text to ${withoutAlt.length} images for accessibility`
      );
    }

    return suggestions;
  }
}
