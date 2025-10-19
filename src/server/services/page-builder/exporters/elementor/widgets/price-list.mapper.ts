/**
 * Price List Widget Mapper
 *
 * Maps service/menu price lists to Elementor price-list widget
 * Common in restaurants, service providers, pricing pages
 */

import { RecognizedComponent } from '../../../types/component.types.js';
import { ElementorWidget } from '../../../types/elementor.types.js';

interface PriceListItem {
  title: string;
  price: string;
  description?: string;
  image?: string;
  link?: string;
}

export class PriceListMapper {
  /**
   * Maps a recognized price list to Elementor price-list widget
   */
  static mapToElementor(component: RecognizedComponent): ElementorWidget {
    const items = this.extractItems(component.element);

    return {
      id: this.generateUniqueId(),
      elType: 'widget',
      widgetType: 'price-list',
      settings: {
        // Price list items
        price_list: items.map((item, index) => ({
          _id: this.generateUniqueId(),
          item_title: item.title,
          item_price: item.price,
          item_description: item.description || '',
          image: item.image ? { url: item.image } : undefined,
          link: item.link ? { url: item.link } : undefined
        })),

        // Layout
        space_between: {
          size: 20,
          unit: 'px'
        },

        // Style - Title
        title_color: '#000000',
        title_typography_typography: 'custom',
        title_typography_font_size: {
          size: 18,
          unit: 'px'
        },
        title_typography_font_weight: '600',

        // Style - Price
        price_color: '#6ec1e4',
        price_typography_typography: 'custom',
        price_typography_font_size: {
          size: 18,
          unit: 'px'
        },
        price_typography_font_weight: '700',

        // Style - Description
        description_color: '#666666',
        description_typography_typography: 'custom',
        description_typography_font_size: {
          size: 14,
          unit: 'px'
        },

        // Style - Separator (line between title and price)
        separator_style: 'dotted',
        separator_weight: {
          size: 1,
          unit: 'px'
        },
        separator_color: '#dddddd',
        separator_spacing: {
          size: 10,
          unit: 'px'
        }
      }
    };
  }

  /**
   * Extract price list items from element
   */
  private static extractItems(element: Element): PriceListItem[] {
    const items: PriceListItem[] = [];

    // Method 1: Look for list items (li)
    const listItems = element.querySelectorAll('li, [class*="price-item"], [class*="menu-item"], [class*="service-item"]');

    if (listItems.length > 0) {
      listItems.forEach(item => {
        const extracted = this.extractItemFromElement(item);
        if (extracted) {
          items.push(extracted);
        }
      });
    }

    // Method 2: Look for table rows
    if (items.length === 0) {
      const rows = element.querySelectorAll('tr');
      rows.forEach(row => {
        const extracted = this.extractItemFromTableRow(row);
        if (extracted) {
          items.push(extracted);
        }
      });
    }

    // Method 3: Look for flex/grid items
    if (items.length === 0) {
      const flexItems = element.querySelectorAll('[class*="item"], [class*="row"]');
      flexItems.forEach(item => {
        const extracted = this.extractItemFromElement(item);
        if (extracted) {
          items.push(extracted);
        }
      });
    }

    return items.filter(item => item.title && item.price);
  }

  /**
   * Extract item from a single element
   */
  private static extractItemFromElement(element: Element): PriceListItem | null {
    const title = this.extractItemTitle(element);
    const price = this.extractItemPrice(element);

    if (!title || !price) return null;

    return {
      title,
      price,
      description: this.extractItemDescription(element),
      image: this.extractItemImage(element),
      link: this.extractItemLink(element)
    };
  }

  /**
   * Extract item from table row
   */
  private static extractItemFromTableRow(row: Element): PriceListItem | null {
    const cells = row.querySelectorAll('td, th');
    if (cells.length < 2) return null;

    const title = cells[0].textContent?.trim() || '';
    const price = cells[cells.length - 1].textContent?.trim() || '';

    if (!title || !price) return null;

    return {
      title,
      price,
      description: cells.length > 2 ? cells[1].textContent?.trim() : undefined
    };
  }

  /**
   * Extract item title
   */
  private static extractItemTitle(element: Element): string {
    // Try heading tags
    const heading = element.querySelector('h1, h2, h3, h4, h5, h6, [class*="title"], [class*="name"]');
    if (heading) {
      return heading.textContent?.trim() || '';
    }

    // Try strong/b tags
    const strong = element.querySelector('strong, b');
    if (strong) {
      return strong.textContent?.trim() || '';
    }

    // Try first text node (exclude price patterns)
    const text = element.textContent?.trim() || '';
    const parts = text.split(/[\$€£¥₹]/);
    if (parts.length > 0) {
      return parts[0].trim();
    }

    return '';
  }

  /**
   * Extract item price
   */
  private static extractItemPrice(element: Element): string {
    // Try price class elements
    const priceEl = element.querySelector('[class*="price"], [class*="cost"], [class*="amount"]');
    if (priceEl) {
      return priceEl.textContent?.trim() || '';
    }

    // Try data attribute
    const dataPrice = element.getAttribute('data-price');
    if (dataPrice) return dataPrice;

    // Extract from text content using regex
    const text = element.textContent || '';
    const priceMatch = text.match(/[\$€£¥₹]\s*\d+(?:[.,]\d{2})?|\d+(?:[.,]\d{2})?\s*[\$€£¥₹]/);
    if (priceMatch) {
      return priceMatch[0].trim();
    }

    return '';
  }

  /**
   * Extract item description
   */
  private static extractItemDescription(element: Element): string | undefined {
    // Try description class
    const desc = element.querySelector('p, [class*="description"], [class*="desc"], [class*="text"]');
    if (desc) {
      return desc.textContent?.trim() || undefined;
    }

    // Try small tag
    const small = element.querySelector('small, span');
    if (small) {
      const text = small.textContent?.trim();
      // Don't use if it looks like a price
      if (text && !text.match(/[\$€£¥₹]/)) {
        return text;
      }
    }

    return undefined;
  }

  /**
   * Extract item image
   */
  private static extractItemImage(element: Element): string | undefined {
    const img = element.querySelector('img');
    if (img) {
      return img.getAttribute('src') || img.getAttribute('data-src') || undefined;
    }

    // Check for background image
    if (element instanceof HTMLElement) {
      const bgImage = element.style.backgroundImage;
      const match = bgImage.match(/url\(['"]?([^'"]+)['"]?\)/);
      if (match) {
        return match[1];
      }
    }

    return undefined;
  }

  /**
   * Extract item link
   */
  private static extractItemLink(element: Element): string | undefined {
    // Check if element itself is a link
    if (element.tagName.toLowerCase() === 'a') {
      return element.getAttribute('href') || undefined;
    }

    // Check for link within element
    const link = element.querySelector('a');
    if (link) {
      return link.getAttribute('href') || undefined;
    }

    return undefined;
  }

  /**
   * Generate unique Elementor widget ID
   */
  private static generateUniqueId(): string {
    return Math.random().toString(36).substring(2, 11);
  }
}

export default PriceListMapper;
