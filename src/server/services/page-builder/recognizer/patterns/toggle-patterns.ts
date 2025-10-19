/**
 * Toggle/Accordion Recognition Patterns
 *
 * Detects collapsible/expandable content sections
 */

import type { RecognitionPattern } from '../../types/component.types.js';

export const togglePatterns: RecognitionPattern[] = [
  {
    componentType: 'toggle',
    patterns: {
      // High confidence: Bootstrap accordion
      classKeywords: [
        'accordion',
        'accordion-item',
        'collapse'
      ]
    },
    confidence: 90,
    priority: 8,
    reason: 'Bootstrap accordion classes detected'
  },
  {
    componentType: 'toggle',
    patterns: {
      // High confidence: Native HTML details elements
      tagNames: ['div'],
      childPattern: 'details'
    },
    confidence: 85,
    priority: 8,
    reason: 'Container with details elements (native toggles)'
  },
  {
    componentType: 'toggle',
    patterns: {
      // Medium-high confidence: ARIA accordion
      childPattern: '[aria-expanded], [aria-controls]'
    },
    confidence: 80,
    priority: 7,
    reason: 'ARIA accordion pattern detected'
  },
  {
    componentType: 'toggle',
    patterns: {
      // Medium confidence: Generic toggle classes
      classKeywords: [
        'toggle',
        'collapsible',
        'expandable',
        'faq',
        'accordion-container'
      ]
    },
    confidence: 75,
    priority: 7,
    reason: 'Toggle/collapsible classes present'
  }
];
