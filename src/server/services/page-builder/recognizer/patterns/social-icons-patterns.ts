/**
 * Social Icons Recognition Patterns
 *
 * Detects social media icon lists
 * Common in headers, footers, contact sections
 */

import type { RecognitionPattern } from '../../types/component.types.js';

export const socialIconsPatterns: RecognitionPattern[] = [
  {
    componentType: 'social-icons',
    patterns: {
      // High confidence: Multiple social media links
      childPattern: 'a[href*="facebook"], a[href*="twitter"], a[href*="instagram"]',
      classKeywords: [
        'social',
        'social-links',
        'social-icons',
        'social-media',
        'follow-us'
      ]
    },
    confidence: 90,
    priority: 9,
    reason: 'Social media links container'
  },
  {
    componentType: 'social-icons',
    patterns: {
      // High confidence: Font Awesome social icons
      childPattern: 'a i[class*="fa-facebook"], a i[class*="fa-twitter"], a i[class*="fa-instagram"]',
      tagName: ['ul', 'nav', 'div']
    },
    confidence: 88,
    priority: 9,
    reason: 'Font Awesome social icons'
  },
  {
    componentType: 'social-icons',
    patterns: {
      // Medium confidence: List of links with social classes
      childPattern: 'a',
      classKeywords: ['social', 'follow'],
      minChildren: 2
    },
    confidence: 75,
    priority: 7,
    reason: 'Social link list'
  }
];
