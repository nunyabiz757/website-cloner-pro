/**
 * Price Table Recognition Patterns
 *
 * Detects pricing table/plan components
 */

import type { RecognitionPattern } from '../types.js';

export const priceTablePatterns: RecognitionPattern[] = [
  // Explicit pricing tables
  {
    componentType: 'price-table',
    patterns: {
      childPattern: '[class*="price"], [class*="feature"]',
      classKeywords: ['pricing-table', 'price-table', 'pricing-plan', 'price-box'],
      structurePattern: {
        requiredChildren: ['[class*="price"]'],
      },
    },
    confidence: 95,
    priority: 8,
  },

  // Plan containers
  {
    componentType: 'price-table',
    patterns: {
      classKeywords: ['plan', 'pricing', 'subscription'],
      structurePattern: {
        requiredChildren: ['[class*="price"]', 'ul, ol'],
      },
    },
    confidence: 85,
    priority: 7,
  },

  // Featured/popular plans
  {
    componentType: 'price-table',
    patterns: {
      classKeywords: ['featured-plan', 'popular-plan', 'recommended'],
      attributePatterns: {
        'data-plan': '*',
        'data-price': '*',
      },
    },
    confidence: 80,
    priority: 7,
  },

  // Generic pricing containers
  {
    componentType: 'price-table',
    patterns: {
      childPattern: '[class*="price"], [class*="cost"], [class*="amount"]',
      classKeywords: ['package', 'tier', 'membership'],
      dataAttributes: ['price', 'plan', 'tier'],
    },
    confidence: 70,
    priority: 6,
  },
];
