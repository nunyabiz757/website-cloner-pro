/**
 * Call to Action Recognition Patterns
 *
 * Detects CTA sections with heading + description + button
 */

import type { RecognitionPattern } from '../../types/component.types.js';

export const ctaPatterns: RecognitionPattern[] = [
  {
    componentType: 'call-to-action',
    patterns: {
      // High confidence: Has heading + description + button
      childPattern: '(h1, h2, h3, h4) + (p, [class*="description"]) + (a, button)',
      classKeywords: [
        'cta',
        'call-to-action',
        'cta-section',
        'cta-block',
        'action-box',
        'signup-box',
        'conversion-section'
      ]
    },
    confidence: 90,
    priority: 8,
    reason: 'CTA with heading, description, and button'
  },
  {
    componentType: 'call-to-action',
    patterns: {
      // Medium-high confidence: Has CTA classes and button
      classKeywords: [
        'cta',
        'call-to-action',
        'conversion',
        'signup',
        'newsletter-cta'
      ],
      childPattern: 'button, a[class*="btn"]'
    },
    confidence: 80,
    priority: 7,
    reason: 'CTA classes with button present'
  },
  {
    componentType: 'call-to-action',
    patterns: {
      // Medium confidence: Centered content with button
      cssProperties: {
        textAlign: ['center'],
        padding: true
      },
      childPattern: '(h1, h2, h3) + (a, button)'
    },
    confidence: 70,
    priority: 6,
    reason: 'Centered section with heading and button'
  }
];
