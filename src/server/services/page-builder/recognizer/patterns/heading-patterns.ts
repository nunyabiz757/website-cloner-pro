/**
 * Heading Recognition Patterns
 */

import { RecognitionPattern } from '../../types/component.types.js';
import { looksLikeHeading } from '../../analyzer/style-extractor.js';

export const headingPatterns: RecognitionPattern[] = [
  {
    componentType: 'heading',
    patterns: {
      tagNames: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'],
    },
    confidence: 95,
    priority: 100,
  },
  {
    componentType: 'heading',
    patterns: {
      tagNames: ['div', 'span', 'p'],
      classKeywords: ['title', 'heading', 'headline', 'header', 'h1', 'h2', 'h3'],
    },
    confidence: 75,
    priority: 70,
  },
  {
    componentType: 'heading',
    patterns: {
      tagNames: ['div', 'span', 'p'],
      ariaRole: 'heading',
    },
    confidence: 85,
    priority: 80,
  },
  {
    componentType: 'heading',
    patterns: {
      tagNames: ['div', 'span', 'p'],
      cssProperties: (styles) => looksLikeHeading(styles),
    },
    confidence: 65,
    priority: 60,
  },
];
