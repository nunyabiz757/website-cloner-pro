/**
 * Text/Paragraph Recognition Patterns
 */

import { RecognitionPattern } from '../../types/component.types.js';

export const textPatterns: RecognitionPattern[] = [
  {
    componentType: 'paragraph',
    patterns: {
      tagNames: ['p'],
    },
    confidence: 95,
    priority: 100,
  },
  {
    componentType: 'text',
    patterns: {
      tagNames: ['span', 'div'],
      cssProperties: (styles) => {
        // Simple text if it's just plain display with text content
        return styles.display === 'block' || styles.display === 'inline';
      },
    },
    confidence: 60,
    priority: 40,
  },
  {
    componentType: 'blockquote',
    patterns: {
      tagNames: ['blockquote'],
    },
    confidence: 95,
    priority: 90,
  },
  {
    componentType: 'list',
    patterns: {
      tagNames: ['ul', 'ol'],
    },
    confidence: 95,
    priority: 90,
  },
];
