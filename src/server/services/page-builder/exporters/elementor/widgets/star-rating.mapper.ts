/**
 * Star Rating Widget Mapper
 *
 * Maps recognized star rating components to Elementor star-rating widget
 * Supports: Font Awesome stars, Unicode stars, custom icons
 */

import type { RecognizedComponent } from '../../../types/component.types.js';
import type { ElementorWidget } from '../../../types/builder.types.js';

export interface StarRatingMapping {
  rating: number; // 0-5
  maxRating: number; // Usually 5
  title?: string;
  icon: string;
  unmarkedStyle: 'solid' | 'outline';
  color?: string;
  unmarkedColor?: string;
  size?: number;
}

export class StarRatingMapper {
  /**
   * Maps a recognized star rating component to Elementor star-rating widget
   */
  static mapToElementor(component: RecognizedComponent): ElementorWidget {
    const mapping = this.extractMapping(component);

    return {
      id: this.generateUniqueId(),
      elType: 'widget',
      widgetType: 'star-rating',
      settings: {
        // Rating value
        rating: mapping.rating,
        rating_scale: mapping.maxRating.toString(),

        // Icon settings
        star_style: mapping.icon,
        unmarked_star_style: mapping.unmarkedStyle,

        // Title settings
        title: mapping.title || '',

        // Color settings
        star_color: mapping.color || '#f0ad4e',
        star_unmarked_color: mapping.unmarkedColor || '#ccd6df',

        // Size settings
        star_size: {
          size: mapping.size || 20,
          unit: 'px'
        },
        star_space: {
          size: 0,
          unit: 'px'
        },

        // Alignment
        alignment: 'left',

        // Schema settings (for SEO)
        schema_type: 'none' // Can be 'aggregate' or 'review' for rich snippets
      }
    };
  }

  /**
   * Extract mapping data from component
   */
  private static extractMapping(component: RecognizedComponent): StarRatingMapping {
    const element = component.element;
    const styles = component.styles || {};
    const content = component.content || {};

    return {
      rating: content.rating || this.extractRating(element),
      maxRating: content.maxRating || this.extractMaxRating(element),
      title: content.title || this.extractTitle(element),
      icon: this.detectStarIcon(element),
      unmarkedStyle: this.detectUnmarkedStyle(element),
      color: styles.starColor || this.extractStarColor(element),
      unmarkedColor: styles.unmarkedColor || this.extractUnmarkedColor(element),
      size: styles.starSize ? parseInt(styles.starSize) : this.extractStarSize(element)
    };
  }

  /**
   * Extract rating value (0-5)
   */
  private static extractRating(element: Element): number {
    // Method 1: Check data attribute
    const dataRating = element.getAttribute('data-rating');
    if (dataRating) {
      return parseFloat(dataRating);
    }

    // Method 2: Check ARIA label
    const ariaLabel = element.getAttribute('aria-label');
    if (ariaLabel) {
      const match = ariaLabel.match(/(\d+(\.\d+)?)\s*(out of|\/)\s*(\d+)/i);
      if (match) {
        return parseFloat(match[1]);
      }
    }

    // Method 3: Count filled stars
    const filledStars = element.querySelectorAll('.fa-star:not(.fa-star-o), .star-filled, .active');
    if (filledStars.length > 0) {
      return filledStars.length;
    }

    // Method 4: Check percentage width
    const filledContainer = element.querySelector('[style*="width"]');
    if (filledContainer instanceof HTMLElement) {
      const width = filledContainer.style.width;
      const percentage = parseInt(width);
      if (percentage) {
        return (percentage / 100) * 5;
      }
    }

    // Method 5: Count Unicode stars
    const text = element.textContent || '';
    const fullStars = (text.match(/★|⭐/g) || []).length;
    if (fullStars > 0) {
      return fullStars;
    }

    return 5; // Default to 5 stars
  }

  /**
   * Extract maximum rating scale
   */
  private static extractMaxRating(element: Element): number {
    // Check data attribute
    const dataMax = element.getAttribute('data-max-rating');
    if (dataMax) {
      return parseInt(dataMax);
    }

    // Count total stars
    const allStars = element.querySelectorAll('.fa-star, .star, [class*="star"]');
    if (allStars.length > 0 && allStars.length <= 10) {
      return allStars.length;
    }

    // Check Unicode stars (filled + empty)
    const text = element.textContent || '';
    const totalStars = (text.match(/★|☆|⭐/g) || []).length;
    if (totalStars > 0 && totalStars <= 10) {
      return totalStars;
    }

    return 5; // Default to 5-star scale
  }

  /**
   * Extract title/label
   */
  private static extractTitle(element: Element): string | undefined {
    // Check for adjacent text
    const parent = element.parentElement;
    if (parent) {
      const textNode = Array.from(parent.childNodes).find(
        node => node.nodeType === Node.TEXT_NODE && node.textContent?.trim()
      );
      if (textNode) {
        return textNode.textContent?.trim();
      }
    }

    // Check for label element
    const label = element.querySelector('.rating-label, .review-label');
    if (label) {
      return label.textContent?.trim();
    }

    return undefined;
  }

  /**
   * Detect star icon type
   */
  private static detectStarIcon(element: Element): string {
    const starElement = element.querySelector('i[class*="fa-star"]');
    if (starElement) {
      return 'fa-star'; // Font Awesome star
    }

    const text = element.textContent || '';
    if (text.includes('★') || text.includes('⭐')) {
      return 'unicode'; // Unicode star
    }

    return 'fa-star'; // Default
  }

  /**
   * Detect unmarked star style
   */
  private static detectUnmarkedStyle(element: Element): 'solid' | 'outline' {
    const emptyStarElement = element.querySelector('.fa-star-o, [class*="star-empty"], [class*="star-outline"]');
    if (emptyStarElement) {
      return 'outline';
    }

    const text = element.textContent || '';
    if (text.includes('☆')) {
      return 'outline'; // Unicode outline star
    }

    return 'solid'; // Default
  }

  /**
   * Extract star color
   */
  private static extractStarColor(element: Element): string | undefined {
    const starElement = element.querySelector('.fa-star, .star-filled, .active, [class*="star"]');
    if (starElement instanceof HTMLElement) {
      const color = getComputedStyle(starElement).color;
      if (color && color !== 'rgb(0, 0, 0)') {
        return this.rgbToHex(color);
      }
    }

    // Check for common rating colors
    if (element.classList.contains('text-yellow') || element.classList.contains('text-warning')) {
      return '#f0ad4e';
    }
    if (element.classList.contains('text-gold')) {
      return '#ffd700';
    }

    return undefined;
  }

  /**
   * Extract unmarked star color
   */
  private static extractUnmarkedColor(element: Element): string | undefined {
    const emptyStarElement = element.querySelector('.fa-star-o, [class*="star-empty"]');
    if (emptyStarElement instanceof HTMLElement) {
      const color = getComputedStyle(emptyStarElement).color;
      if (color) {
        return this.rgbToHex(color);
      }
    }

    return undefined;
  }

  /**
   * Extract star size
   */
  private static extractStarSize(element: Element): number {
    const starElement = element.querySelector('.fa-star, .star, [class*="star"]');
    if (starElement instanceof HTMLElement) {
      const fontSize = getComputedStyle(starElement).fontSize;
      return parseInt(fontSize) || 20;
    }

    return 20;
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
   * Generate unique Elementor widget ID
   */
  private static generateUniqueId(): string {
    return Math.random().toString(36).substring(2, 11);
  }
}

export default StarRatingMapper;
