/**
 * Icon Box Recognition Patterns
 *
 * Detects icon box components (icon + title + description)
 * Common in feature sections, service listings, benefits
 */

import type { RecognitionPattern } from '../../types/component.types.js';

export const iconBoxPatterns: RecognitionPattern[] = [
  {
    componentType: 'icon-box',
    patterns: {
      // High confidence: Icon + Title + Description structure
      childPattern: '(i[class*="fa-"], svg, img[class*="icon"]) + (h2, h3, h4, h5) + p',
      cssProperties: {
        display: ['flex', 'block', 'grid'],
        flexDirection: ['column', 'row']
      },
      classKeywords: [
        'icon-box',
        'feature-box',
        'service-box',
        'info-box',
        'icon-block',
        'feature-item',
        'service-item',
        'feature-card',
        'icon-card',
        'benefit-box'
      ],
      structureKeywords: ['icon', 'feature', 'service']
    },
    confidence: 85,
    priority: 8,
    reason: 'Icon box with icon, title, and description'
  },
  {
    componentType: 'icon-box',
    patterns: {
      // Medium-high confidence: Has icon and heading
      childPattern: 'i[class*="fa-"], svg',
      requiresChildren: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'],
      classKeywords: [
        'feature',
        'service',
        'icon',
        'benefit'
      ]
    },
    confidence: 75,
    priority: 7,
    reason: 'Container with icon and heading'
  },
  {
    componentType: 'icon-box',
    patterns: {
      // Medium confidence: Has Font Awesome icon and text content
      childPattern: 'i[class*="fa-"]',
      contentPattern: /.{20,}/, // Has substantial text (20+ chars)
      cssProperties: {
        textAlign: ['center', 'left']
      }
    },
    confidence: 70,
    priority: 6,
    reason: 'Font Awesome icon with text content'
  },
  {
    componentType: 'icon-box',
    patterns: {
      // Lower confidence: Has SVG and structured content
      childPattern: 'svg',
      requiresChildren: ['h2', 'h3', 'h4', 'p'],
      cssProperties: {
        padding: true // Has padding
      }
    },
    confidence: 65,
    priority: 5,
    reason: 'SVG icon with structured content'
  }
];
