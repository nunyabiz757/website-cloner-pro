/**
 * Call to Action Widget Mapper
 *
 * Maps CTA sections (heading + description + button) to Elementor call-to-action widget
 */

import { RecognizedComponent } from '../../../types/component.types.js';
import { ElementorWidget } from '../../../types/elementor.types.js';

interface CTAMapping {
  title: string;
  description: string;
  buttonText: string;
  buttonLink: string;
  backgroundColor?: string;
  titleColor?: string;
  descriptionColor?: string;
  buttonColor?: string;
  buttonBackgroundColor?: string;
  ribbonText?: string;
  alignment: 'left' | 'center' | 'right';
}

export class CallToActionMapper {
  /**
   * Maps a recognized CTA component to Elementor call-to-action widget
   */
  static mapToElementor(component: RecognizedComponent): ElementorWidget {
    const mapping = this.extractMapping(component);

    return {
      id: this.generateUniqueId(),
      elType: 'widget',
      widgetType: 'call-to-action',
      settings: {
        // Content
        title: mapping.title,
        description: mapping.description,
        button_text: mapping.buttonText,
        link: {
          url: mapping.buttonLink,
          is_external: this.isExternalLink(mapping.buttonLink),
          nofollow: false
        },

        // Ribbon (optional badge/label)
        ribbon_title: mapping.ribbonText || '',
        ribbon_horizontal_position: 'left',

        // Layout
        content_alignment: mapping.alignment,

        // Style - Background
        background_type: 'classic',
        background_color: mapping.backgroundColor || '#6ec1e4',

        // Style - Title
        title_color: mapping.titleColor || '#ffffff',
        title_typography_typography: 'custom',
        title_typography_font_size: {
          size: 36,
          unit: 'px'
        },
        title_typography_font_weight: '700',

        // Style - Description
        description_color: mapping.descriptionColor || '#ffffff',
        description_typography_typography: 'custom',
        description_typography_font_size: {
          size: 16,
          unit: 'px'
        },

        // Style - Button
        button_text_color: mapping.buttonColor || '#ffffff',
        button_background_color: mapping.buttonBackgroundColor || '#ff6f61',
        button_typography_typography: 'custom',
        button_typography_font_size: {
          size: 16,
          unit: 'px'
        },
        button_typography_font_weight: '600',
        button_border_radius: {
          size: 3,
          unit: 'px'
        },
        button_padding: {
          top: 15,
          right: 30,
          bottom: 15,
          left: 30,
          unit: 'px'
        },

        // Spacing
        content_padding: {
          top: 60,
          right: 40,
          bottom: 60,
          left: 40,
          unit: 'px'
        }
      }
    };
  }

  /**
   * Extract CTA mapping from component
   */
  private static extractMapping(component: RecognizedComponent): CTAMapping {
    const element = component.element;

    return {
      title: this.extractTitle(element),
      description: this.extractDescription(element),
      buttonText: this.extractButtonText(element),
      buttonLink: this.extractButtonLink(element),
      backgroundColor: this.extractBackgroundColor(element),
      titleColor: this.extractTitleColor(element),
      descriptionColor: this.extractDescriptionColor(element),
      buttonColor: this.extractButtonColor(element),
      buttonBackgroundColor: this.extractButtonBackgroundColor(element),
      ribbonText: this.extractRibbonText(element),
      alignment: this.extractAlignment(element)
    };
  }

  /**
   * Extract title from CTA element
   */
  private static extractTitle(element: Element): string {
    // Try common heading selectors
    const heading = element.querySelector('h1, h2, h3, h4, [class*="title"], [class*="heading"]');
    if (heading) {
      return heading.textContent?.trim() || '';
    }

    // Try data attribute
    const dataTitle = element.getAttribute('data-title');
    if (dataTitle) return dataTitle;

    return 'Call to Action';
  }

  /**
   * Extract description/subtitle
   */
  private static extractDescription(element: Element): string {
    // Try paragraph or description elements
    const desc = element.querySelector('p, [class*="description"], [class*="subtitle"], [class*="text"]');
    if (desc) {
      return desc.textContent?.trim() || '';
    }

    return '';
  }

  /**
   * Extract button text
   */
  private static extractButtonText(element: Element): string {
    const button = element.querySelector('a, button, [class*="btn"], [class*="button"]');
    if (button) {
      return button.textContent?.trim() || 'Click Here';
    }

    return 'Click Here';
  }

  /**
   * Extract button link
   */
  private static extractButtonLink(element: Element): string {
    const link = element.querySelector('a[href]');
    if (link) {
      return link.getAttribute('href') || '#';
    }

    return '#';
  }

  /**
   * Extract background color
   */
  private static extractBackgroundColor(element: Element): string | undefined {
    if (!(element instanceof HTMLElement)) return undefined;

    const computedStyle = getComputedStyle(element);
    const bgColor = computedStyle.backgroundColor;

    if (bgColor && bgColor !== 'rgba(0, 0, 0, 0)' && bgColor !== 'transparent') {
      return this.rgbToHex(bgColor);
    }

    return undefined;
  }

  /**
   * Extract title color
   */
  private static extractTitleColor(element: Element): string | undefined {
    const heading = element.querySelector('h1, h2, h3, h4, [class*="title"]');
    if (!heading || !(heading instanceof HTMLElement)) return undefined;

    const computedStyle = getComputedStyle(heading);
    const color = computedStyle.color;

    if (color) {
      return this.rgbToHex(color);
    }

    return undefined;
  }

  /**
   * Extract description color
   */
  private static extractDescriptionColor(element: Element): string | undefined {
    const desc = element.querySelector('p, [class*="description"]');
    if (!desc || !(desc instanceof HTMLElement)) return undefined;

    const computedStyle = getComputedStyle(desc);
    const color = computedStyle.color;

    if (color) {
      return this.rgbToHex(color);
    }

    return undefined;
  }

  /**
   * Extract button text color
   */
  private static extractButtonColor(element: Element): string | undefined {
    const button = element.querySelector('a, button, [class*="btn"]');
    if (!button || !(button instanceof HTMLElement)) return undefined;

    const computedStyle = getComputedStyle(button);
    const color = computedStyle.color;

    if (color) {
      return this.rgbToHex(color);
    }

    return undefined;
  }

  /**
   * Extract button background color
   */
  private static extractButtonBackgroundColor(element: Element): string | undefined {
    const button = element.querySelector('a, button, [class*="btn"]');
    if (!button || !(button instanceof HTMLElement)) return undefined;

    const computedStyle = getComputedStyle(button);
    const bgColor = computedStyle.backgroundColor;

    if (bgColor && bgColor !== 'rgba(0, 0, 0, 0)' && bgColor !== 'transparent') {
      return this.rgbToHex(bgColor);
    }

    return undefined;
  }

  /**
   * Extract ribbon/badge text (e.g., "New!", "Limited Time", "Save 20%")
   */
  private static extractRibbonText(element: Element): string | undefined {
    const ribbon = element.querySelector('[class*="ribbon"], [class*="badge"], [class*="label"]');
    if (ribbon) {
      return ribbon.textContent?.trim() || undefined;
    }

    return undefined;
  }

  /**
   * Extract content alignment
   */
  private static extractAlignment(element: Element): 'left' | 'center' | 'right' {
    if (!(element instanceof HTMLElement)) return 'center';

    const computedStyle = getComputedStyle(element);
    const textAlign = computedStyle.textAlign;

    if (textAlign === 'left') return 'left';
    if (textAlign === 'right') return 'right';
    if (textAlign === 'center') return 'center';

    // Check for flex alignment
    const justifyContent = computedStyle.justifyContent;
    if (justifyContent === 'flex-start') return 'left';
    if (justifyContent === 'flex-end') return 'right';
    if (justifyContent === 'center') return 'center';

    return 'center';
  }

  /**
   * Convert RGB color to Hex
   */
  private static rgbToHex(rgb: string): string {
    const match = rgb.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (!match) return rgb;

    const r = parseInt(match[1]);
    const g = parseInt(match[2]);
    const b = parseInt(match[3]);

    return '#' + [r, g, b]
      .map(x => x.toString(16).padStart(2, '0'))
      .join('');
  }

  /**
   * Check if link is external
   */
  private static isExternalLink(url: string): boolean {
    if (url.startsWith('#') || url.startsWith('/')) return false;
    if (url.startsWith('http://') || url.startsWith('https://')) {
      try {
        const urlObj = new URL(url);
        return urlObj.hostname !== globalThis.location?.hostname;
      } catch {
        return true;
      }
    }
    return false;
  }

  /**
   * Generate unique Elementor widget ID
   */
  private static generateUniqueId(): string {
    return Math.random().toString(36).substring(2, 11);
  }
}

export default CallToActionMapper;
