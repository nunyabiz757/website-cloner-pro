/**
 * Progress Bar Widget Mapper
 *
 * Maps recognized progress bar components to Elementor progress widget
 * Supports: Percentage-based bars, skill bars, stat bars
 */

import type { RecognizedComponent } from '../../../types/component.types.js';
import type { ElementorWidget } from '../../../types/builder.types.js';

export interface ProgressBarMapping {
  title: string;
  percentage: number; // 0-100
  innerText?: string;
  type: 'info' | 'success' | 'warning' | 'danger' | '';
  barColor?: string;
  barBgColor?: string;
}

export class ProgressBarMapper {
  /**
   * Maps a recognized progress bar to Elementor progress widget
   */
  static mapToElementor(component: RecognizedComponent): ElementorWidget {
    const mapping = this.extractMapping(component);

    return {
      id: this.generateUniqueId(),
      elType: 'widget',
      widgetType: 'progress',
      settings: {
        // Title and percentage
        title: mapping.title,
        percent: {
          size: mapping.percentage,
          unit: '%'
        },
        inner_text: mapping.innerText || `${mapping.percentage}%`,
        display_percentage: 'show',

        // Type/Color
        progress_type: mapping.type || '',

        // Custom colors
        bar_color: mapping.barColor || '#61ce70',
        bar_bg_color: mapping.barBgColor || '#eee',

        // Bar styling
        bar_height: {
          size: 10,
          unit: 'px'
        },
        bar_border_radius: {
          size: 0,
          unit: 'px'
        },

        // Text styling
        title_color: '#333333',
        text_color: '#ffffff',

        // Animation
        progress_animation: 'yes'
      }
    };
  }

  /**
   * Extract mapping data from component
   */
  private static extractMapping(component: RecognizedComponent): ProgressBarMapping {
    const element = component.element;
    const styles = component.styles || {};
    const content = component.content || {};

    return {
      title: content.title || this.extractTitle(element),
      percentage: content.percentage || this.extractPercentage(element),
      innerText: content.innerText || this.extractInnerText(element),
      type: this.detectType(element),
      barColor: styles.barColor || this.extractBarColor(element),
      barBgColor: styles.barBgColor || this.extractBarBgColor(element)
    };
  }

  /**
   * Extract title/label
   */
  private static extractTitle(element: Element): string {
    // Check for title element
    const titleElement = element.querySelector('.progress-title, .skill-name, .title, label');
    if (titleElement) {
      return titleElement.textContent?.trim() || '';
    }

    // Check for adjacent text
    const parent = element.parentElement;
    if (parent) {
      const textBefore = this.getPreviousTextNode(element);
      if (textBefore) {
        return textBefore.trim();
      }
    }

    // Check data attribute
    const dataTitle = element.getAttribute('data-title') || element.getAttribute('data-label');
    if (dataTitle) {
      return dataTitle;
    }

    return 'Progress';
  }

  /**
   * Extract percentage value (0-100)
   */
  private static extractPercentage(element: Element): number {
    // Method 1: data-percentage attribute
    const dataPercentage = element.getAttribute('data-percentage') ||
                          element.getAttribute('data-percent') ||
                          element.getAttribute('data-value');
    if (dataPercentage) {
      return parseInt(dataPercentage);
    }

    // Method 2: Check width style of progress bar
    const progressBar = element.querySelector('.progress-bar, [role="progressbar"], .bar, [class*="fill"]');
    if (progressBar instanceof HTMLElement) {
      const width = progressBar.style.width;
      if (width) {
        return parseInt(width);
      }

      // Check inline style
      const style = progressBar.getAttribute('style');
      if (style) {
        const match = style.match(/width:\s*(\d+)%/);
        if (match) {
          return parseInt(match[1]);
        }
      }

      // Check computed style
      const computedWidth = getComputedStyle(progressBar).width;
      const parentWidth = progressBar.parentElement ? getComputedStyle(progressBar.parentElement).width : '100px';
      const widthPx = parseInt(computedWidth);
      const parentWidthPx = parseInt(parentWidth);
      if (widthPx && parentWidthPx) {
        return Math.round((widthPx / parentWidthPx) * 100);
      }
    }

    // Method 3: ARIA valuenow
    const ariaValuenow = element.getAttribute('aria-valuenow');
    if (ariaValuenow) {
      return parseInt(ariaValuenow);
    }

    // Method 4: Extract from class name (e.g., progress-80, skill-75)
    const classMatch = element.className.match(/(?:progress|skill|bar)-(\d+)/);
    if (classMatch) {
      return parseInt(classMatch[1]);
    }

    // Method 5: Extract from inner text
    const text = element.textContent || '';
    const textMatch = text.match(/(\d+)%/);
    if (textMatch) {
      return parseInt(textMatch[1]);
    }

    return 75; // Default to 75%
  }

  /**
   * Extract inner text (displayed on bar)
   */
  private static extractInnerText(element: Element): string | undefined {
    const progressBar = element.querySelector('.progress-bar, [role="progressbar"], .bar');
    if (progressBar) {
      const text = progressBar.textContent?.trim();
      if (text && text.length < 10) {
        return text;
      }
    }

    return undefined;
  }

  /**
   * Detect progress bar type based on classes
   */
  private static detectType(element: Element): 'info' | 'success' | 'warning' | 'danger' | '' {
    const classes = element.className.toLowerCase();

    if (classes.includes('info') || classes.includes('primary') || classes.includes('blue')) {
      return 'info';
    }
    if (classes.includes('success') || classes.includes('green')) {
      return 'success';
    }
    if (classes.includes('warning') || classes.includes('yellow') || classes.includes('orange')) {
      return 'warning';
    }
    if (classes.includes('danger') || classes.includes('error') || classes.includes('red')) {
      return 'danger';
    }

    return '';
  }

  /**
   * Extract bar color
   */
  private static extractBarColor(element: Element): string | undefined {
    const progressBar = element.querySelector('.progress-bar, [role="progressbar"], .bar, [class*="fill"]');
    if (progressBar instanceof HTMLElement) {
      const bgColor = getComputedStyle(progressBar).backgroundColor;
      if (bgColor && bgColor !== 'transparent' && bgColor !== 'rgba(0, 0, 0, 0)') {
        return this.rgbToHex(bgColor);
      }
    }

    return undefined;
  }

  /**
   * Extract bar background color
   */
  private static extractBarBgColor(element: Element): string | undefined {
    if (element instanceof HTMLElement) {
      const bgColor = getComputedStyle(element).backgroundColor;
      if (bgColor && bgColor !== 'transparent' && bgColor !== 'rgba(0, 0, 0, 0)') {
        return this.rgbToHex(bgColor);
      }
    }

    return undefined;
  }

  /**
   * Get previous text node
   */
  private static getPreviousTextNode(element: Element): string | null {
    const parent = element.parentElement;
    if (!parent) return null;

    for (const node of Array.from(parent.childNodes)) {
      if (node === element) break;
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent?.trim();
        if (text) return text;
      }
    }

    return null;
  }

  /**
   * Convert RGB to Hex color
   */
  private static rgbToHex(rgb: string): string {
    const match = rgb.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/);
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
   * Generate unique Elementor widget ID
   */
  private static generateUniqueId(): string {
    return Math.random().toString(36).substring(2, 11);
  }
}

export default ProgressBarMapper;
