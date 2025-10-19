/**
 * Flip Box Recognition Patterns
 *
 * Detects flip box/card components with front and back sides
 */

import type { RecognitionPattern } from '../types.js';

export const flipBoxPatterns: RecognitionPattern[] = [
  // Bootstrap-style flip cards
  {
    componentType: 'flip-box',
    patterns: {
      childPattern: '.flip-box-front, .flip-box-back',
      classKeywords: ['flip-box', 'flip-card', 'card-flip'],
      structurePattern: {
        requiredChildren: ['.flip-box-front', '.flip-box-back'],
      },
    },
    confidence: 95,
    priority: 8,
  },

  // Generic flip containers
  {
    componentType: 'flip-box',
    patterns: {
      childPattern: '.front, .back',
      classKeywords: ['flip', 'flipper', 'rotator'],
      structurePattern: {
        requiredChildren: ['.front', '.back'],
      },
    },
    confidence: 85,
    priority: 7,
  },

  // CSS3 flip cards
  {
    componentType: 'flip-box',
    patterns: {
      classKeywords: ['flip-container', 'flip-wrapper', 'hover-flip'],
      attributePatterns: {
        'data-flip': '*',
        'data-hover-flip': '*',
      },
    },
    confidence: 80,
    priority: 7,
  },

  // Library-based flip boxes (FlipCard.js, etc.)
  {
    componentType: 'flip-box',
    patterns: {
      classKeywords: ['flipcard', 'flip-animation', 'card-3d'],
      dataAttributes: ['flip-direction', 'flip-effect'],
    },
    confidence: 75,
    priority: 6,
  },
];
