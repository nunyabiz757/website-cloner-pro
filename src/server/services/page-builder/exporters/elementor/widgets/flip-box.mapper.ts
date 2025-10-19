/**
 * Flip Box Mapper
 *
 * Maps flip box/card components to Elementor Flip Box widget
 * Handles front/back content, flip direction, and animations
 */

import type { RecognizedComponent } from '../../../recognizer/types.js';
import type { ElementorWidget } from '../../../types/page-builder.types.js';
import crypto from 'crypto';

export class FlipBoxMapper {
  static mapToElementor(component: RecognizedComponent): ElementorWidget {
    const mapping = this.extractMapping(component);

    return {
      id: this.generateUniqueId(),
      elType: 'widget',
      widgetType: 'flip-box',
      settings: {
        // Front side
        graphic_element: mapping.frontHasImage ? 'image' : 'icon',
        image: mapping.frontImage
          ? {
              url: mapping.frontImage,
              id: '',
            }
          : undefined,
        icon: mapping.frontIcon
          ? {
              value: mapping.frontIcon,
              library: 'solid',
            }
          : undefined,
        title_text_a: mapping.frontTitle,
        description_text_a: mapping.frontDescription,

        // Back side
        title_text_b: mapping.backTitle,
        description_text_b: mapping.backDescription,
        button_text: mapping.buttonText,
        link: mapping.buttonLink
          ? {
              url: mapping.buttonLink,
              is_external: this.isExternalLink(mapping.buttonLink),
              nofollow: false,
            }
          : undefined,

        // Flip settings
        flip_effect: mapping.flipDirection, // 'flip' | 'slide' | 'push' | 'zoom-in' | 'fade'
        flip_direction: mapping.flipAxis, // 'up' | 'down' | 'left' | 'right'

        // Height
        height: {
          size: mapping.height || 400,
          unit: 'px',
        },

        // Colors
        background_color_a: mapping.frontBackgroundColor || '#1abc9c',
        background_color_b: mapping.backBackgroundColor || '#5c6f7c',

        // Alignment
        content_alignment: mapping.alignment || 'center',
      },
    };
  }

  private static extractMapping(component: RecognizedComponent) {
    const element = component.element;

    return {
      // Front side
      frontTitle: this.extractFrontTitle(element),
      frontDescription: this.extractFrontDescription(element),
      frontImage: this.extractFrontImage(element),
      frontIcon: this.extractFrontIcon(element),
      frontHasImage: this.hasFrontImage(element),
      frontBackgroundColor: this.extractFrontBackgroundColor(element),

      // Back side
      backTitle: this.extractBackTitle(element),
      backDescription: this.extractBackDescription(element),
      backBackgroundColor: this.extractBackBackgroundColor(element),

      // Button
      buttonText: this.extractButtonText(element),
      buttonLink: this.extractButtonLink(element),

      // Flip settings
      flipDirection: this.detectFlipEffect(element),
      flipAxis: this.detectFlipAxis(element),
      alignment: this.detectAlignment(element),
      height: this.extractHeight(element),
    };
  }

  // Front side extraction
  private static extractFrontTitle(element: Element): string {
    const front = this.getFrontSide(element);
    if (!front) return 'Front Title';

    const heading = front.querySelector('h1, h2, h3, h4, h5, h6, [class*="title"], [class*="heading"]');
    if (heading) return heading.textContent?.trim() || 'Front Title';

    return 'Front Title';
  }

  private static extractFrontDescription(element: Element): string {
    const front = this.getFrontSide(element);
    if (!front) return '';

    const desc = front.querySelector('p, [class*="description"], [class*="text"]');
    if (desc) return desc.textContent?.trim() || '';

    return '';
  }

  private static extractFrontImage(element: Element): string {
    const front = this.getFrontSide(element);
    if (!front) return '';

    const img = front.querySelector('img');
    if (img) {
      return img.getAttribute('src') || img.getAttribute('data-src') || '';
    }

    // Check for background image
    const bgImage = this.extractBackgroundImage(front);
    if (bgImage) return bgImage;

    return '';
  }

  private static extractFrontIcon(element: Element): string {
    const front = this.getFrontSide(element);
    if (!front) return 'fas fa-star';

    // Check for Font Awesome icons
    const icon = front.querySelector('i[class*="fa-"], i[class*="icon-"]');
    if (icon) {
      const classList = Array.from(icon.classList);
      const iconClass = classList.find(cls => cls.startsWith('fa-') && cls !== 'fa' && cls !== 'fas' && cls !== 'far' && cls !== 'fab');
      if (iconClass) return `fas ${iconClass}`;
    }

    return 'fas fa-star';
  }

  private static hasFrontImage(element: Element): boolean {
    const front = this.getFrontSide(element);
    if (!front) return false;

    return !!front.querySelector('img') || !!this.extractBackgroundImage(front);
  }

  private static extractFrontBackgroundColor(element: Element): string {
    const front = this.getFrontSide(element);
    if (!front) return '#1abc9c';

    const computedStyle = front instanceof HTMLElement ? getComputedStyle(front) : null;
    if (computedStyle) {
      const bgColor = computedStyle.backgroundColor;
      if (bgColor && bgColor !== 'transparent' && bgColor !== 'rgba(0, 0, 0, 0)') {
        return this.rgbToHex(bgColor);
      }
    }

    return '#1abc9c';
  }

  // Back side extraction
  private static extractBackTitle(element: Element): string {
    const back = this.getBackSide(element);
    if (!back) return 'Back Title';

    const heading = back.querySelector('h1, h2, h3, h4, h5, h6, [class*="title"], [class*="heading"]');
    if (heading) return heading.textContent?.trim() || 'Back Title';

    return 'Back Title';
  }

  private static extractBackDescription(element: Element): string {
    const back = this.getBackSide(element);
    if (!back) return 'This is the back of the flip box';

    const desc = back.querySelector('p, [class*="description"], [class*="text"]');
    if (desc) return desc.textContent?.trim() || 'This is the back of the flip box';

    return 'This is the back of the flip box';
  }

  private static extractBackBackgroundColor(element: Element): string {
    const back = this.getBackSide(element);
    if (!back) return '#5c6f7c';

    const computedStyle = back instanceof HTMLElement ? getComputedStyle(back) : null;
    if (computedStyle) {
      const bgColor = computedStyle.backgroundColor;
      if (bgColor && bgColor !== 'transparent' && bgColor !== 'rgba(0, 0, 0, 0)') {
        return this.rgbToHex(bgColor);
      }
    }

    return '#5c6f7c';
  }

  // Button extraction
  private static extractButtonText(element: Element): string {
    const back = this.getBackSide(element);
    if (!back) return 'Learn More';

    const button = back.querySelector('button, a.btn, a[class*="button"], .cta-button');
    if (button) return button.textContent?.trim() || 'Learn More';

    return 'Learn More';
  }

  private static extractButtonLink(element: Element): string {
    const back = this.getBackSide(element);
    if (!back) return '#';

    const link = back.querySelector('a');
    if (link) return link.getAttribute('href') || '#';

    return '#';
  }

  // Flip settings detection
  private static detectFlipEffect(element: Element): 'flip' | 'slide' | 'push' | 'zoom-in' | 'fade' {
    const classList = element.className.toLowerCase();

    if (classList.includes('slide')) return 'slide';
    if (classList.includes('push')) return 'push';
    if (classList.includes('zoom')) return 'zoom-in';
    if (classList.includes('fade')) return 'fade';

    return 'flip'; // Default
  }

  private static detectFlipAxis(element: Element): 'up' | 'down' | 'left' | 'right' {
    const classList = element.className.toLowerCase();

    if (classList.includes('up')) return 'up';
    if (classList.includes('down')) return 'down';
    if (classList.includes('horizontal') || classList.includes('left')) return 'left';
    if (classList.includes('vertical') || classList.includes('right')) return 'right';

    return 'right'; // Default
  }

  private static detectAlignment(element: Element): 'left' | 'center' | 'right' {
    const front = this.getFrontSide(element);
    if (!front) return 'center';

    const computedStyle = front instanceof HTMLElement ? getComputedStyle(front) : null;
    if (computedStyle) {
      const textAlign = computedStyle.textAlign;
      if (textAlign === 'left') return 'left';
      if (textAlign === 'right') return 'right';
    }

    return 'center';
  }

  private static extractHeight(element: Element): number {
    const computedStyle = element instanceof HTMLElement ? getComputedStyle(element) : null;
    if (computedStyle) {
      const height = parseInt(computedStyle.height, 10);
      if (!isNaN(height) && height > 0) return height;
    }

    return 400; // Default
  }

  // Helper methods
  private static getFrontSide(element: Element): Element | null {
    // Common patterns for flip box front side
    return (
      element.querySelector('.flip-box-front, .flip-front, .front, [class*="front-side"]') ||
      element.querySelector('.flip-box > div:first-child') ||
      element.children[0] ||
      null
    );
  }

  private static getBackSide(element: Element): Element | null {
    // Common patterns for flip box back side
    return (
      element.querySelector('.flip-box-back, .flip-back, .back, [class*="back-side"]') ||
      element.querySelector('.flip-box > div:last-child') ||
      element.children[1] ||
      null
    );
  }

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

  private static rgbToHex(rgb: string): string {
    const match = rgb.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (match) {
      const r = parseInt(match[1], 10);
      const g = parseInt(match[2], 10);
      const b = parseInt(match[3], 10);
      return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
    }
    return rgb;
  }

  private static isExternalLink(url: string): boolean {
    return url.startsWith('http://') || url.startsWith('https://');
  }

  private static generateUniqueId(): string {
    return crypto.randomBytes(4).toString('hex');
  }
}

export default FlipBoxMapper;
