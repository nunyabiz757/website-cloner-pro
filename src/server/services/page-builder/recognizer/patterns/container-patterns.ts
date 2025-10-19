/**
 * Container/Section/Layout Recognition Patterns
 */

import { RecognitionPattern } from '../../types/component.types.js';

export const containerPatterns: RecognitionPattern[] = [
  {
    componentType: 'section',
    patterns: {
      tagNames: ['section'],
    },
    confidence: 90,
    priority: 100,
  },
  {
    componentType: 'container',
    patterns: {
      tagNames: ['div'],
      classKeywords: ['container', 'wrapper', 'content', 'main'],
    },
    confidence: 75,
    priority: 80,
  },
  {
    componentType: 'row',
    patterns: {
      tagNames: ['div'],
      classKeywords: ['row', 'flex', 'grid'],
      cssProperties: (styles) => {
        return styles.display === 'flex' || styles.display === 'grid';
      },
    },
    confidence: 70,
    priority: 70,
  },
  {
    componentType: 'column',
    patterns: {
      tagNames: ['div'],
      classKeywords: ['col', 'column', 'grid-item'],
    },
    confidence: 65,
    priority: 60,
  },
  {
    componentType: 'hero',
    patterns: {
      tagNames: ['section', 'div'],
      classKeywords: ['hero', 'banner', 'jumbotron'],
    },
    confidence: 85,
    priority: 90,
  },
  {
    componentType: 'header',
    patterns: {
      tagNames: ['header'],
    },
    confidence: 95,
    priority: 100,
  },
  {
    componentType: 'footer',
    patterns: {
      tagNames: ['footer'],
    },
    confidence: 95,
    priority: 100,
  },
];
