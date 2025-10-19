/**
 * Image Gallery Mapper
 *
 * Maps image gallery components to Elementor Gallery widget
 * Handles grid layouts, lightbox, and captions
 */

import type { RecognizedComponent } from '../../../recognizer/types.js';
import type { ElementorWidget } from '../../../types/page-builder.types.js';
import crypto from 'crypto';

export class ImageGalleryMapper {
  static mapToElementor(component: RecognizedComponent): ElementorWidget {
    const mapping = this.extractMapping(component);

    return {
      id: this.generateUniqueId(),
      elType: 'widget',
      widgetType: 'image-gallery',
      settings: {
        // Gallery images
        gallery: mapping.images.map((img) => ({
          id: this.generateUniqueId(),
          url: img.url,
          alt: img.alt || '',
          caption: img.caption || '',
        })),

        // Layout
        gallery_layout: mapping.layout, // 'grid' | 'masonry' | 'justified'
        columns: {
          size: mapping.columns || 4,
        },
        columns_tablet: {
          size: Math.max(2, Math.floor(mapping.columns / 2)),
        },
        columns_mobile: {
          size: 1,
        },
        gap: {
          size: mapping.gap || 10,
          unit: 'px',
        },

        // Lightbox
        open_lightbox: mapping.hasLightbox ? 'yes' : 'default',

        // Image settings
        image_size: 'medium',
        aspect_ratio: mapping.aspectRatio || '3:2',

        // Hover effects
        hover_animation: mapping.hoverAnimation || 'none',
      },
    };
  }

  private static extractMapping(component: RecognizedComponent) {
    const element = component.element;

    return {
      images: this.extractImages(element),
      layout: this.detectLayout(element),
      columns: this.detectColumns(element),
      gap: this.detectGap(element),
      hasLightbox: this.hasLightbox(element),
      aspectRatio: this.detectAspectRatio(element),
      hoverAnimation: this.detectHoverAnimation(element),
    };
  }

  private static extractImages(
    element: Element
  ): Array<{ url: string; alt: string; caption: string }> {
    const images: Array<{ url: string; alt: string; caption: string }> = [];

    // Find all image elements
    const imgElements = element.querySelectorAll('img');

    imgElements.forEach((img) => {
      const url = img.getAttribute('src') || img.getAttribute('data-src') || '';

      if (url && !url.startsWith('data:')) {
        // Skip data URIs
        images.push({
          url,
          alt: img.getAttribute('alt') || '',
          caption: this.extractCaption(img),
        });
      }
    });

    // Fallback: Check for background images on divs
    if (images.length === 0) {
      const items = element.querySelectorAll('[class*="gallery-item"], [class*="image-item"]');

      items.forEach((item) => {
        const bgImage = this.extractBackgroundImage(item);
        if (bgImage) {
          images.push({
            url: bgImage,
            alt: '',
            caption: this.extractCaption(item),
          });
        }
      });
    }

    return images;
  }

  private static extractCaption(element: Element): string {
    // Check for figcaption
    const parent = element.parentElement;
    if (parent) {
      const figcaption = parent.querySelector('figcaption, [class*="caption"]');
      if (figcaption) return figcaption.textContent?.trim() || '';
    }

    // Check for title attribute
    const title = element.getAttribute('title');
    if (title) return title;

    return '';
  }

  private static detectLayout(element: Element): 'grid' | 'masonry' | 'justified' {
    const classList = element.className.toLowerCase();

    if (classList.includes('masonry')) return 'masonry';
    if (classList.includes('justified')) return 'justified';
    if (classList.includes('grid')) return 'grid';

    // Check for CSS Grid or Flexbox
    const computedStyle = element instanceof HTMLElement ? getComputedStyle(element) : null;
    if (computedStyle) {
      const display = computedStyle.display;
      if (display === 'grid') return 'grid';
      if (display === 'flex') return 'justified';
    }

    return 'grid'; // Default
  }

  private static detectColumns(element: Element): number {
    // Check for data attribute
    const columnsAttr = element.getAttribute('data-columns');
    if (columnsAttr) {
      const cols = parseInt(columnsAttr, 10);
      if (!isNaN(cols) && cols > 0) return Math.min(cols, 10); // Max 10 columns
    }

    // Check class names for column hints
    const classList = element.className.toLowerCase();
    const colMatch = classList.match(/col(?:umn)?s?-?(\d+)/);
    if (colMatch) {
      const cols = parseInt(colMatch[1], 10);
      if (!isNaN(cols) && cols > 0) return Math.min(cols, 10);
    }

    // Try to detect from CSS Grid
    const computedStyle = element instanceof HTMLElement ? getComputedStyle(element) : null;
    if (computedStyle) {
      const gridTemplateColumns = computedStyle.gridTemplateColumns;
      if (gridTemplateColumns && gridTemplateColumns !== 'none') {
        const cols = gridTemplateColumns.split(' ').length;
        if (cols > 0) return Math.min(cols, 10);
      }
    }

    // Count children in first row to estimate columns
    const items = element.querySelectorAll('[class*="gallery-item"], [class*="image-item"], img');
    if (items.length > 0) {
      // Estimate based on container width and item width
      const containerWidth = element instanceof HTMLElement ? element.offsetWidth : 0;
      if (containerWidth > 0 && items[0] instanceof HTMLElement) {
        const itemWidth = items[0].offsetWidth;
        if (itemWidth > 0) {
          const estimatedCols = Math.floor(containerWidth / itemWidth);
          if (estimatedCols > 0) return Math.min(estimatedCols, 10);
        }
      }
    }

    return 4; // Default
  }

  private static detectGap(element: Element): number {
    const computedStyle = element instanceof HTMLElement ? getComputedStyle(element) : null;
    if (computedStyle) {
      // Check CSS Grid gap
      const gap = computedStyle.gap || computedStyle.gridGap;
      if (gap && gap !== 'normal') {
        const gapValue = parseInt(gap, 10);
        if (!isNaN(gapValue)) return gapValue;
      }

      // Check for margin/padding patterns
      const marginRight = parseInt(computedStyle.marginRight, 10);
      if (!isNaN(marginRight) && marginRight > 0) return marginRight;
    }

    return 10; // Default
  }

  private static hasLightbox(element: Element): boolean {
    // Check for common lightbox libraries
    const links = element.querySelectorAll('a');

    for (const link of links) {
      const rel = link.getAttribute('rel') || '';
      const dataAttr = link.getAttribute('data-lightbox') || '';
      const classList = link.className.toLowerCase();

      if (
        rel.includes('lightbox') ||
        rel.includes('fancybox') ||
        dataAttr ||
        classList.includes('lightbox') ||
        classList.includes('fancybox') ||
        classList.includes('magnific')
      ) {
        return true;
      }
    }

    // Check for data attributes on container
    if (
      element.hasAttribute('data-lightbox') ||
      element.hasAttribute('data-fancybox') ||
      element.className.toLowerCase().includes('lightbox')
    ) {
      return true;
    }

    return false;
  }

  private static detectAspectRatio(element: Element): '1:1' | '3:2' | '4:3' | '16:9' | '9:16' | '21:9' {
    // Check for data attribute
    const ratioAttr = element.getAttribute('data-aspect-ratio');
    if (ratioAttr) return ratioAttr as any;

    // Check class names
    const classList = element.className.toLowerCase();
    if (classList.includes('square') || classList.includes('1-1')) return '1:1';
    if (classList.includes('3-2')) return '3:2';
    if (classList.includes('4-3')) return '4:3';
    if (classList.includes('16-9')) return '16:9';
    if (classList.includes('9-16')) return '9:16';
    if (classList.includes('21-9')) return '21:9';

    // Try to detect from first image
    const firstImg = element.querySelector('img');
    if (firstImg instanceof HTMLImageElement) {
      const width = firstImg.naturalWidth || firstImg.width;
      const height = firstImg.naturalHeight || firstImg.height;

      if (width > 0 && height > 0) {
        const ratio = width / height;

        if (Math.abs(ratio - 1) < 0.1) return '1:1'; // Square
        if (Math.abs(ratio - 1.5) < 0.1) return '3:2';
        if (Math.abs(ratio - 1.333) < 0.1) return '4:3';
        if (Math.abs(ratio - 1.778) < 0.1) return '16:9';
        if (Math.abs(ratio - 0.5625) < 0.1) return '9:16';
        if (Math.abs(ratio - 2.333) < 0.1) return '21:9';
      }
    }

    return '3:2'; // Default
  }

  private static detectHoverAnimation(element: Element): string {
    const classList = element.className.toLowerCase();

    if (classList.includes('zoom')) return 'zoom-in';
    if (classList.includes('grow')) return 'grow';
    if (classList.includes('shrink')) return 'shrink';
    if (classList.includes('rotate')) return 'rotate';
    if (classList.includes('pulse')) return 'pulse';

    return 'none';
  }

  // Helper methods
  private static extractBackgroundImage(element: Element): string {
    const computedStyle = element instanceof HTMLElement ? getComputedStyle(element) : null;
    if (computedStyle) {
      const bgImage = computedStyle.backgroundImage;
      if (bgImage && bgImage !== 'none') {
        const match = bgImage.match(/url\(['"]?([^'"]+)['"]?\)/);
        if (match) return match[1];
      }
    }

    return '';
  }

  private static generateUniqueId(): string {
    return crypto.randomBytes(4).toString('hex');
  }
}

export default ImageGalleryMapper;
