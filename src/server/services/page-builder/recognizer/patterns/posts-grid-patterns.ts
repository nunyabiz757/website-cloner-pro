/**
 * Posts Grid Recognition Patterns
 *
 * Detects blog post grids, article listings, portfolio grids
 * Common in blog pages, news sections, portfolio showcases
 */

import type { RecognitionPattern } from '../../types/component.types.js';

export const postsGridPatterns: RecognitionPattern[] = [
  {
    componentType: 'posts-grid',
    patterns: {
      // High confidence: Container with multiple article elements
      childPattern: 'article, [class*="post"], [class*="blog"]',
      classKeywords: [
        'posts-grid',
        'blog-grid',
        'post-list',
        'posts-list',
        'articles-grid',
        'blog-posts',
        'post-grid',
        'portfolio-grid'
      ],
      cssProperties: {
        display: ['grid', 'flex'],
        gap: true // Has gap between items
      }
    },
    confidence: 90,
    priority: 8,
    reason: 'Posts grid with article elements'
  },
  {
    componentType: 'posts-grid',
    patterns: {
      // Medium-high confidence: Grid layout with post cards
      childPattern: '[class*="post-card"], [class*="blog-card"], [class*="article-card"]',
      cssProperties: {
        display: ['grid', 'flex']
      }
    },
    confidence: 85,
    priority: 8,
    reason: 'Grid layout with post cards'
  },
  {
    componentType: 'posts-grid',
    patterns: {
      // Medium confidence: Has multiple items with images and headings
      requiresChildren: ['img', 'h1, h2, h3, h4'],
      classKeywords: [
        'blog',
        'posts',
        'articles',
        'portfolio',
        'grid',
        'masonry'
      ],
      cssProperties: {
        display: ['grid', 'flex']
      }
    },
    confidence: 75,
    priority: 7,
    reason: 'Grid with images and headings'
  },
  {
    componentType: 'posts-grid',
    patterns: {
      // Lower confidence: Multiple article-like structures
      childPattern: 'article',
      cssProperties: {
        display: ['grid', 'flex']
      }
    },
    confidence: 70,
    priority: 6,
    reason: 'Container with multiple articles'
  },
  {
    componentType: 'posts-grid',
    patterns: {
      // Masonry layout detection
      classKeywords: [
        'masonry',
        'isotope',
        'packery',
        'grid-layout'
      ],
      childPattern: '[class*="grid-item"], [class*="masonry-item"]'
    },
    confidence: 85,
    priority: 8,
    reason: 'Masonry/Isotope grid detected'
  }
];
