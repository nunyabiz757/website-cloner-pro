/**
 * Tabs Recognition Patterns
 *
 * Detects tabbed content interfaces
 */

import type { RecognitionPattern } from '../../types/component.types.js';

export const tabsPatterns: RecognitionPattern[] = [
  {
    componentType: 'tabs',
    patterns: {
      // High confidence: Has ARIA tablist role
      attributes: {
        'role': /tablist/i
      },
      childPattern: '[role="tab"], [role="tabpanel"]'
    },
    confidence: 95,
    priority: 9,
    reason: 'ARIA tablist with tab/tabpanel elements'
  },
  {
    componentType: 'tabs',
    patterns: {
      // Medium-high confidence: Bootstrap tabs
      classKeywords: [
        'nav-tabs',
        'tab-content',
        'tab-pane'
      ]
    },
    confidence: 90,
    priority: 8,
    reason: 'Bootstrap tabs classes detected'
  },
  {
    componentType: 'tabs',
    patterns: {
      // Medium confidence: Generic tab classes
      classKeywords: [
        'tabs',
        'tab-list',
        'tabbed-content',
        'tabs-container'
      ],
      childPattern: '[class*="tab"]'
    },
    confidence: 80,
    priority: 7,
    reason: 'Tab-related classes with tab children'
  },
  {
    componentType: 'tabs',
    patterns: {
      // Lower confidence: Multiple details elements (native HTML tabs)
      tagNames: ['div'],
      childPattern: 'details'
    },
    confidence: 70,
    priority: 6,
    reason: 'Container with multiple details elements'
  }
];
