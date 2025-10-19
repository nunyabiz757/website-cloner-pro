/**
 * Icon Box Widget Mapper
 *
 * Maps recognized icon box components to Elementor icon-box widget
 * Supports: Font Awesome icons, SVG icons, image icons, custom positioning
 */

import type { RecognizedComponent } from '../../../types/component.types.js';
import type { ElementorWidget } from '../../../types/builder.types.js';

export interface IconBoxMapping {
  icon: string;
  iconLibrary: 'fa-solid' | 'fa-regular' | 'fa-brands' | 'svg';
  title: string;
  description: string;
  link?: string;
  iconPosition: 'top' | 'left' | 'right';
  iconColor?: string;
  titleColor?: string;
  descriptionColor?: string;
  titleFontSize?: number;
  titleFontWeight?: string;
  iconSize?: number;
}

export class IconBoxMapper {
  /**
   * Maps a recognized icon box component to Elementor icon-box widget
   */
  static mapToElementor(component: RecognizedComponent): ElementorWidget {
    const mapping = this.extractMapping(component);

    return {
      id: this.generateUniqueId(),
      elType: 'widget',
      widgetType: 'icon-box',
      settings: {
        // Icon settings
        selected_icon: {
          value: mapping.icon,
          library: mapping.iconLibrary
        },
        icon_color: mapping.iconColor || '#000000',
        icon_size: {
          size: mapping.iconSize || 50,
          unit: 'px'
        },
        icon_space: {
          size: 15,
          unit: 'px'
        },

        // Title settings
        title_text: mapping.title,
        title_color: mapping.titleColor || '#000000',
        title_size: 'default',
        typography_typography: 'custom',
        typography_font_size: {
          size: mapping.titleFontSize || 24,
          unit: 'px'
        },
        typography_font_weight: mapping.titleFontWeight || '600',
        title_bottom_space: {
          size: 10,
          unit: 'px'
        },

        // Description settings
        description_text: mapping.description,
        description_color: mapping.descriptionColor || '#666666',

        // Layout settings
        position: mapping.iconPosition,
        icon_vertical_align: 'top',
        content_vertical_alignment: 'top',

        // Link settings
        link: mapping.link ? {
          url: mapping.link,
          is_external: this.isExternalLink(mapping.link),
          nofollow: false
        } : {},

        // Hover effects
        hover_animation: this.detectHoverAnimation(component.element)
      }
    };
  }

  /**
   * Extract mapping data from component
   */
  private static extractMapping(component: RecognizedComponent): IconBoxMapping {
    const element = component.element;
    const styles = component.styles || {};
    const content = component.content || {};

    return {
      icon: this.extractIcon(element),
      iconLibrary: this.detectIconLibrary(element),
      title: content.title || this.extractTitle(element),
      description: content.description || this.extractDescription(element),
      link: content.link || this.extractLink(element),
      iconPosition: this.detectIconPosition(element),
      iconColor: styles.iconColor || this.extractIconColor(element),
      titleColor: styles.titleColor || this.extractTitleColor(element),
      descriptionColor: styles.descriptionColor || '#666666',
      titleFontSize: styles.titleFontSize ? parseInt(styles.titleFontSize) : this.extractTitleFontSize(element),
      titleFontWeight: styles.titleFontWeight || this.extractTitleFontWeight(element),
      iconSize: styles.iconSize ? parseInt(styles.iconSize) : this.extractIconSize(element)
    };
  }

  /**
   * Extract icon from element (Font Awesome, SVG, or image)
   */
  private static extractIcon(element: Element): string {
    // Check for Font Awesome
    const iconElement = element.querySelector('i[class*="fa-"]');
    if (iconElement) {
      const classes = iconElement.className.split(' ');
      const iconClass = classes.find(c =>
        c.startsWith('fa-') &&
        !c.match(/^fa-(solid|regular|brands|light|duotone)$/)
      );
      if (iconClass) {
        return iconClass;
      }
    }

    // Check for SVG
    const svgElement = element.querySelector('svg');
    if (svgElement) {
      return svgElement.outerHTML;
    }

    // Check for image icon
    const imgElement = element.querySelector('img[class*="icon"], img[class*="feature"]');
    if (imgElement) {
      const src = imgElement.getAttribute('src');
      if (src) {
        return src;
      }
    }

    return 'fas fa-star'; // Default fallback
  }

  /**
   * Detect icon library type
   */
  private static detectIconLibrary(element: Element): 'fa-solid' | 'fa-regular' | 'fa-brands' | 'svg' {
    const iconElement = element.querySelector('i[class*="fa-"]');
    if (iconElement) {
      const classes = iconElement.className;
      if (classes.includes('fa-brands') || classes.includes('fab')) return 'fa-brands';
      if (classes.includes('fa-regular') || classes.includes('far')) return 'fa-regular';
      return 'fa-solid';
    }

    const svgElement = element.querySelector('svg');
    if (svgElement) {
      return 'svg';
    }

    return 'fa-solid';
  }

  /**
   * Extract title from element
   */
  private static extractTitle(element: Element): string {
    const titleElement = element.querySelector('h2, h3, h4, h5, .title, [class*="title"]');
    if (titleElement) {
      return titleElement.textContent?.trim() || '';
    }
    return '';
  }

  /**
   * Extract description from element
   */
  private static extractDescription(element: Element): string {
    const descElement = element.querySelector('p, .description, [class*="desc"]');
    if (descElement) {
      return descElement.textContent?.trim() || '';
    }
    return '';
  }

  /**
   * Extract link from element
   */
  private static extractLink(element: Element): string | undefined {
    const linkElement = element.querySelector('a');
    if (linkElement) {
      return linkElement.getAttribute('href') || undefined;
    }
    return undefined;
  }

  /**
   * Detect icon position relative to text
   */
  private static detectIconPosition(element: Element): 'top' | 'left' | 'right' {
    if (!(element instanceof HTMLElement)) return 'top';

    const computedStyle = getComputedStyle(element);
    const flexDirection = computedStyle.flexDirection;
    const textAlign = computedStyle.textAlign;

    if (flexDirection === 'column' || textAlign === 'center') return 'top';
    if (flexDirection === 'row-reverse') return 'right';
    if (flexDirection === 'row') return 'left';

    // Check if icon is before or after text in DOM
    const iconElement = element.querySelector('i, svg, img');
    const titleElement = element.querySelector('h2, h3, h4, h5');

    if (iconElement && titleElement) {
      const iconIndex = Array.from(element.children).indexOf(iconElement as Element);
      const titleIndex = Array.from(element.children).indexOf(titleElement as Element);

      if (iconIndex > titleIndex) return 'right';
      if (iconIndex < titleIndex) return 'left';
    }

    return 'top';
  }

  /**
   * Extract icon color from styles
   */
  private static extractIconColor(element: Element): string | undefined {
    const iconElement = element.querySelector('i, svg, img');
    if (iconElement instanceof HTMLElement) {
      const color = getComputedStyle(iconElement).color;
      if (color && color !== 'rgb(0, 0, 0)') {
        return this.rgbToHex(color);
      }
    }
    return undefined;
  }

  /**
   * Extract title color from styles
   */
  private static extractTitleColor(element: Element): string | undefined {
    const titleElement = element.querySelector('h2, h3, h4, h5');
    if (titleElement instanceof HTMLElement) {
      const color = getComputedStyle(titleElement).color;
      if (color) {
        return this.rgbToHex(color);
      }
    }
    return undefined;
  }

  /**
   * Extract title font size
   */
  private static extractTitleFontSize(element: Element): number {
    const titleElement = element.querySelector('h2, h3, h4, h5');
    if (titleElement instanceof HTMLElement) {
      const fontSize = getComputedStyle(titleElement).fontSize;
      return parseInt(fontSize) || 24;
    }
    return 24;
  }

  /**
   * Extract title font weight
   */
  private static extractTitleFontWeight(element: Element): string {
    const titleElement = element.querySelector('h2, h3, h4, h5');
    if (titleElement instanceof HTMLElement) {
      const fontWeight = getComputedStyle(titleElement).fontWeight;
      return fontWeight || '600';
    }
    return '600';
  }

  /**
   * Extract icon size
   */
  private static extractIconSize(element: Element): number {
    const iconElement = element.querySelector('i, svg, img');
    if (iconElement instanceof HTMLElement) {
      const fontSize = getComputedStyle(iconElement).fontSize;
      const width = getComputedStyle(iconElement).width;

      if (fontSize && fontSize !== '0px') {
        return parseInt(fontSize);
      }
      if (width && width !== '0px') {
        return parseInt(width);
      }
    }
    return 50;
  }

  /**
   * Detect hover animation from CSS classes
   */
  private static detectHoverAnimation(element: Element): string {
    const animationClasses = [
      'hover-grow', 'hover-shrink', 'hover-pulse', 'hover-bounce',
      'animate-fade', 'animate-slide', 'animate-zoom'
    ];

    const animationMap: Record<string, string> = {
      'hover-grow': 'grow',
      'hover-shrink': 'shrink',
      'hover-pulse': 'pulse',
      'hover-bounce': 'bounce',
      'animate-fade': 'fadeIn',
      'animate-slide': 'slideInUp',
      'animate-zoom': 'zoomIn'
    };

    for (const animClass of animationClasses) {
      if (element.classList.contains(animClass)) {
        return animationMap[animClass] || '';
      }
    }

    return '';
  }

  /**
   * Convert RGB to Hex color
   */
  private static rgbToHex(rgb: string): string {
    const match = rgb.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/);
    if (match) {
      const r = parseInt(match[1]);
      const g = parseInt(match[2]);
      const b = parseInt(match[3]);
      return '#' + [r, g, b].map(x => {
        const hex = x.toString(16);
        return hex.length === 1 ? '0' + hex : hex;
      }).join('');
    }
    return rgb;
  }

  /**
   * Check if link is external
   */
  private static isExternalLink(url: string): boolean {
    try {
      if (url.startsWith('/') || url.startsWith('#')) {
        return false;
      }
      const urlObj = new URL(url, typeof window !== 'undefined' ? window.location.origin : 'http://localhost');
      return urlObj.hostname !== (typeof window !== 'undefined' ? window.location.hostname : 'localhost');
    } catch {
      return false;
    }
  }

  /**
   * Generate unique Elementor widget ID
   */
  private static generateUniqueId(): string {
    return Math.random().toString(36).substring(2, 11);
  }
}

export default IconBoxMapper;
