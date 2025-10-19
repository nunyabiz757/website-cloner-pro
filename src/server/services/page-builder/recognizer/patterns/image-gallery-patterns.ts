/**
 * Image Gallery Recognition Patterns
 *
 * Detects image gallery and grid components
 */

import type { RecognitionPattern } from '../types.js';

export const imageGalleryPatterns: RecognitionPattern[] = [
  // Explicit gallery containers
  {
    componentType: 'image-gallery',
    patterns: {
      childPattern: 'img',
      classKeywords: ['gallery', 'image-gallery', 'photo-gallery'],
      structurePattern: {
        minChildren: 3,
        childSelector: 'img',
      },
    },
    confidence: 95,
    priority: 8,
  },

  // Masonry/grid layouts
  {
    componentType: 'image-gallery',
    patterns: {
      childPattern: 'img',
      classKeywords: ['masonry', 'grid-gallery', 'image-grid'],
      structurePattern: {
        minChildren: 3,
      },
    },
    confidence: 90,
    priority: 8,
  },

  // Lightbox galleries
  {
    componentType: 'image-gallery',
    patterns: {
      childPattern: 'a[rel*="lightbox"], a[data-lightbox]',
      classKeywords: ['lightbox', 'fancybox', 'photoswipe'],
      structurePattern: {
        minChildren: 2,
      },
    },
    confidence: 85,
    priority: 7,
  },

  // Portfolio/work grids
  {
    componentType: 'image-gallery',
    patterns: {
      childPattern: 'img',
      classKeywords: ['portfolio', 'work-grid', 'project-grid'],
      structurePattern: {
        minChildren: 3,
      },
    },
    confidence: 80,
    priority: 7,
  },
];
