/**
 * Price List Recognition Patterns
 *
 * Detects service menus, pricing lists, restaurant menus
 */

import type { RecognitionPattern } from '../../types/component.types.js';

export const priceListPatterns: RecognitionPattern[] = [
  {
    componentType: 'price-list',
    patterns: {
      // High confidence: List with price indicators
      classKeywords: [
        'price-list',
        'pricing-list',
        'menu-list',
        'service-list',
        'price-menu',
        'services-pricing'
      ],
      childPattern: 'li, [class*="item"]',
      contentPattern: /[\$€£¥₹]\s*\d+/ // Contains price symbols
    },
    confidence: 90,
    priority: 8,
    reason: 'Price list with items and currency symbols'
  },
  {
    componentType: 'price-list',
    patterns: {
      // Medium-high confidence: Table with prices
      tagNames: ['table'],
      contentPattern: /[\$€£¥₹]\s*\d+/
    },
    confidence: 80,
    priority: 7,
    reason: 'Table containing prices'
  },
  {
    componentType: 'price-list',
    patterns: {
      // Medium confidence: Menu-related classes
      classKeywords: [
        'menu',
        'pricing',
        'services',
        'products-list'
      ],
      childPattern: '[class*="price"], [class*="cost"]'
    },
    confidence: 75,
    priority: 7,
    reason: 'Menu or pricing container with price elements'
  }
];
