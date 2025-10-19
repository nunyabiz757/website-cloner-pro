/**
 * Image Recognition Patterns
 */

import { RecognitionPattern } from '../../types/component.types.js';

export const imagePatterns: RecognitionPattern[] = [
  {
    componentType: 'image',
    patterns: {
      tagNames: ['img'],
    },
    confidence: 98,
    priority: 100,
  },
  {
    componentType: 'image',
    patterns: {
      tagNames: ['picture'],
    },
    confidence: 95,
    priority: 95,
  },
  {
    componentType: 'image',
    patterns: {
      tagNames: ['div', 'span'],
      ariaRole: 'img',
    },
    confidence: 80,
    priority: 80,
  },
  {
    componentType: 'image',
    patterns: {
      tagNames: ['div', 'span'],
      cssProperties: (styles) => {
        return !!styles.backgroundImage && styles.backgroundImage.length > 0;
      },
    },
    confidence: 70,
    priority: 70,
  },
  {
    componentType: 'icon',
    patterns: {
      tagNames: ['i', 'svg'],
      classKeywords: ['fa-', 'icon', 'material-icons', 'glyphicon'],
    },
    confidence: 90,
    priority: 90,
  },
];
