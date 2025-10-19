/**
 * Star Rating Recognition Patterns
 *
 * Detects star rating components
 * Common in reviews, testimonials, product ratings
 */

import type { RecognitionPattern } from '../../types/component.types.js';

export const starRatingPatterns: RecognitionPattern[] = [
  {
    componentType: 'star-rating',
    patterns: {
      // High confidence: Font Awesome stars
      childPattern: 'i[class*="fa-star"]',
      classKeywords: [
        'rating',
        'stars',
        'review-stars',
        'star-rating',
        'product-rating'
      ],
      attributes: {
        'data-rating': true,
        'aria-label': /(rating|stars)/i
      }
    },
    confidence: 90,
    priority: 9,
    reason: 'Font Awesome star rating'
  },
  {
    componentType: 'star-rating',
    patterns: {
      // High confidence: Unicode stars
      contentPattern: /[★☆⭐]{3,}/,
      classKeywords: ['rating', 'stars', 'review']
    },
    confidence: 85,
    priority: 8,
    reason: 'Unicode star rating'
  },
  {
    componentType: 'star-rating',
    patterns: {
      // Medium confidence: Rating class with stars
      classKeywords: ['rating', 'stars'],
      childPattern: '.star, [class*="star"]'
    },
    confidence: 75,
    priority: 7,
    reason: 'Rating container with star elements'
  }
];
