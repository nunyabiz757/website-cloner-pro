/**
 * Price Table Mapper
 *
 * Maps pricing table components to Elementor Price Table widget
 * Handles pricing plans, features, buttons, and badges
 */

import type { RecognizedComponent } from '../../../recognizer/types.js';
import type { ElementorWidget } from '../../../types/page-builder.types.js';
import crypto from 'crypto';

export class PriceTableMapper {
  static mapToElementor(component: RecognizedComponent): ElementorWidget {
    const mapping = this.extractMapping(component);

    return {
      id: this.generateUniqueId(),
      elType: 'widget',
      widgetType: 'price-table',
      settings: {
        // Badge/ribbon
        heading: mapping.badge || '',
        badge_position: mapping.badgePosition || 'right',

        // Title
        heading_tag: 'h3',
        title: mapping.title,

        // Price
        currency_symbol: mapping.currencySymbol,
        currency_position: 'before',
        price: mapping.price,
        period: mapping.period || 'mo',
        period_position: 'below',

        // Features
        features_list: mapping.features.map((feature) => ({
          _id: this.generateUniqueId(),
          item_text: feature.text,
          item_icon: {
            value: feature.icon || 'fas fa-check',
            library: 'solid',
          },
        })),

        // Button
        button_text: mapping.buttonText,
        link: mapping.buttonLink
          ? {
              url: mapping.buttonLink,
              is_external: this.isExternalLink(mapping.buttonLink),
              nofollow: false,
            }
          : undefined,

        // Colors
        heading_bg_color: mapping.badgeBackgroundColor || '#2ecc71',
        price_bg_color: mapping.priceBackgroundColor || '#f7f7f7',

        // Featured plan
        featured: mapping.isFeatured ? 'yes' : 'no',
      },
    };
  }

  private static extractMapping(component: RecognizedComponent) {
    const element = component.element;

    return {
      title: this.extractTitle(element),
      badge: this.extractBadge(element),
      badgePosition: this.detectBadgePosition(element),
      price: this.extractPrice(element),
      currencySymbol: this.extractCurrencySymbol(element),
      period: this.extractPeriod(element),
      features: this.extractFeatures(element),
      buttonText: this.extractButtonText(element),
      buttonLink: this.extractButtonLink(element),
      isFeatured: this.isFeaturedPlan(element),
      badgeBackgroundColor: this.extractBadgeBackgroundColor(element),
      priceBackgroundColor: this.extractPriceBackgroundColor(element),
    };
  }

  private static extractTitle(element: Element): string {
    const heading = element.querySelector(
      'h1, h2, h3, h4, h5, h6, [class*="title"], [class*="plan-name"], [class*="heading"]'
    );
    if (heading) return heading.textContent?.trim() || 'Basic';

    return 'Basic';
  }

  private static extractBadge(element: Element): string {
    const badge = element.querySelector(
      '[class*="badge"], [class*="ribbon"], [class*="tag"], [class*="popular"], [class*="featured"]'
    );
    if (badge) {
      const text = badge.textContent?.trim() || '';
      if (text) return text;
    }

    // Check for data attribute
    const badgeAttr = element.getAttribute('data-badge');
    if (badgeAttr) return badgeAttr;

    return '';
  }

  private static detectBadgePosition(element: Element): 'left' | 'right' {
    const badge = element.querySelector('[class*="badge"], [class*="ribbon"]');
    if (!badge) return 'right';

    const classList = badge.className.toLowerCase();
    if (classList.includes('left')) return 'left';
    if (classList.includes('right')) return 'right';

    return 'right';
  }

  private static extractPrice(element: Element): string {
    // Try to find price element
    const priceEl = element.querySelector('[class*="price"], [class*="cost"], [class*="amount"]');
    if (priceEl) {
      // Remove currency symbols and text, keep only numbers
      const text = priceEl.textContent || '';
      const match = text.match(/[\d,.]+/);
      if (match) return match[0].replace(',', '');
    }

    // Check for data attribute
    const priceAttr = element.getAttribute('data-price');
    if (priceAttr) return priceAttr;

    return '9.99';
  }

  private static extractCurrencySymbol(element: Element): string {
    const priceEl = element.querySelector('[class*="price"], [class*="cost"], [class*="amount"]');
    if (priceEl) {
      const text = priceEl.textContent || '';

      // Detect common currency symbols
      if (text.includes('$')) return '$';
      if (text.includes('€')) return '€';
      if (text.includes('£')) return '£';
      if (text.includes('¥')) return '¥';
      if (text.includes('₹')) return '₹';
      if (text.includes('USD')) return '$';
      if (text.includes('EUR')) return '€';
      if (text.includes('GBP')) return '£';
    }

    return '$'; // Default
  }

  private static extractPeriod(element: Element): string {
    const periodEl = element.querySelector('[class*="period"], [class*="duration"], [class*="interval"]');
    if (periodEl) {
      const text = periodEl.textContent?.trim().toLowerCase() || '';

      if (text.includes('month')) return 'mo';
      if (text.includes('year')) return 'yr';
      if (text.includes('week')) return 'wk';
      if (text.includes('day')) return 'day';
      if (text.includes('one-time') || text.includes('lifetime')) return 'one-time';
    }

    // Check price element for period info
    const priceEl = element.querySelector('[class*="price"]');
    if (priceEl) {
      const text = priceEl.textContent?.trim().toLowerCase() || '';

      if (text.includes('/mo') || text.includes('per month') || text.includes('monthly')) return 'mo';
      if (text.includes('/yr') || text.includes('per year') || text.includes('yearly') || text.includes('annually')) return 'yr';
      if (text.includes('/wk') || text.includes('per week') || text.includes('weekly')) return 'wk';
    }

    return 'mo'; // Default
  }

  private static extractFeatures(element: Element): Array<{ text: string; icon: string }> {
    const features: Array<{ text: string; icon: string }> = [];

    // Find features list
    const featureList = element.querySelector(
      'ul[class*="feature"], ul[class*="benefit"], ul[class*="include"], .features, .benefits'
    );

    if (featureList) {
      const items = featureList.querySelectorAll('li');
      items.forEach((item) => {
        const text = item.textContent?.trim() || '';
        if (text) {
          // Check if feature has an icon
          const icon = item.querySelector('i[class*="fa-"], i[class*="icon-"]');
          let iconClass = 'fas fa-check';

          if (icon) {
            const classList = Array.from(icon.classList);
            const faIcon = classList.find(
              (cls) => cls.startsWith('fa-') && cls !== 'fa' && cls !== 'fas' && cls !== 'far' && cls !== 'fab'
            );
            if (faIcon) iconClass = `fas ${faIcon}`;
          }

          features.push({
            text: text.replace(/^[✓✔︎✗✘×]/, '').trim(), // Remove any leading checkmark/cross symbols
            icon: iconClass,
          });
        }
      });
    }

    // Fallback: look for any list items
    if (features.length === 0) {
      const lists = element.querySelectorAll('ul, ol');
      if (lists.length > 0) {
        const list = lists[0]; // Use the first list
        const items = list.querySelectorAll('li');
        items.forEach((item) => {
          const text = item.textContent?.trim() || '';
          if (text) {
            features.push({
              text,
              icon: 'fas fa-check',
            });
          }
        });
      }
    }

    // Default features if none found
    if (features.length === 0) {
      return [
        { text: 'Feature 1', icon: 'fas fa-check' },
        { text: 'Feature 2', icon: 'fas fa-check' },
        { text: 'Feature 3', icon: 'fas fa-check' },
      ];
    }

    return features.slice(0, 10); // Limit to 10 features
  }

  private static extractButtonText(element: Element): string {
    const button = element.querySelector('button, a.btn, a[class*="button"], [class*="cta"]');
    if (button) return button.textContent?.trim() || 'Get Started';

    return 'Get Started';
  }

  private static extractButtonLink(element: Element): string {
    const link = element.querySelector('a');
    if (link) return link.getAttribute('href') || '#';

    return '#';
  }

  private static isFeaturedPlan(element: Element): boolean {
    const classList = element.className.toLowerCase();

    return (
      classList.includes('featured') ||
      classList.includes('popular') ||
      classList.includes('recommended') ||
      classList.includes('highlight')
    );
  }

  private static extractBadgeBackgroundColor(element: Element): string {
    const badge = element.querySelector('[class*="badge"], [class*="ribbon"]');
    if (!badge) return '#2ecc71';

    const computedStyle = badge instanceof HTMLElement ? getComputedStyle(badge) : null;
    if (computedStyle) {
      const bgColor = computedStyle.backgroundColor;
      if (bgColor && bgColor !== 'transparent' && bgColor !== 'rgba(0, 0, 0, 0)') {
        return this.rgbToHex(bgColor);
      }
    }

    return '#2ecc71';
  }

  private static extractPriceBackgroundColor(element: Element): string {
    const priceSection = element.querySelector('[class*="price"]')?.parentElement;
    if (!priceSection) return '#f7f7f7';

    const computedStyle = priceSection instanceof HTMLElement ? getComputedStyle(priceSection) : null;
    if (computedStyle) {
      const bgColor = computedStyle.backgroundColor;
      if (bgColor && bgColor !== 'transparent' && bgColor !== 'rgba(0, 0, 0, 0)') {
        return this.rgbToHex(bgColor);
      }
    }

    return '#f7f7f7';
  }

  // Helper methods
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

export default PriceTableMapper;
