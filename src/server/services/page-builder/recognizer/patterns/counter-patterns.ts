/**
 * Counter Recognition Patterns
 *
 * Detects animated counter/number components
 * Common in statistics sections, milestones, achievements
 */

import type { RecognitionPattern } from '../../types/component.types.js';

export const counterPatterns: RecognitionPattern[] = [
  {
    componentType: 'counter',
    patterns: {
      // High confidence: Has counter data attributes
      attributes: {
        'data-count': true,
        'data-to': true,
        'data-value': true
      },
      classKeywords: [
        'counter',
        'count-up',
        'countup',
        'odometer',
        'animated-number',
        'stat-number',
        'number-counter'
      ]
    },
    confidence: 90,
    priority: 8,
    reason: 'Counter with data attributes'
  },
  {
    componentType: 'counter',
    patterns: {
      // Medium-high confidence: Has counter classes and numeric content
      classKeywords: [
        'counter',
        'count',
        'statistic',
        'stat',
        'achievement-number'
      ],
      contentPattern: /^\d+[+KkMmBb%€$£]*$/, // Numeric with optional suffix
      cssProperties: {
        fontSize: true, // Has font size (typically large)
        fontWeight: ['bold', '700', '600', '800', '900']
      }
    },
    confidence: 75,
    priority: 7,
    reason: 'Counter with numeric content and styling'
  },
  {
    componentType: 'counter',
    patterns: {
      // Medium confidence: Inside stats/achievements section with large numbers
      contentPattern: /^\d{2,}[+KkMmBb%€$£]*$/, // At least 2 digits
      cssProperties: {
        fontSize: true,
        textAlign: ['center']
      }
    },
    confidence: 65,
    priority: 6,
    reason: 'Large numeric content with center alignment'
  },
  {
    componentType: 'counter',
    patterns: {
      // Lower confidence: Has odometer/countUp classes
      classKeywords: [
        'odometer',
        'countup',
        'purecounter',
        'animatedCounter'
      ]
    },
    confidence: 80,
    priority: 7,
    reason: 'Popular counter library detected'
  }
];
