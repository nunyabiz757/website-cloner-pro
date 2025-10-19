/**
 * Grid Layout Recognition Patterns
 *
 * Detects grid layouts with 2-col, 3-col, 4-col, and custom configurations
 */

import type { RecognitionPattern } from '../../types/component.types.js';

/**
 * Helper: Check if element looks like a grid
 */
function looksLikeGrid(styles: any): boolean {
  // CSS Grid
  if (styles.display === 'grid') {
    return true;
  }

  // Flexbox with wrapping (grid-like)
  if (
    styles.display === 'flex' &&
    styles.flexWrap === 'wrap' &&
    styles.gap
  ) {
    return true;
  }

  return false;
}

/**
 * Helper: Detect grid column count
 */
function detectGridColumns(element: Element, styles: any): number {
  // CSS Grid with explicit columns
  if (styles.gridTemplateColumns) {
    const columns = styles.gridTemplateColumns.split(/\s+/).length;
    return columns;
  }

  // Count immediate children to guess column count
  const children = Array.from(element.children);
  const visibleChildren = children.filter(child => {
    const childStyle = window.getComputedStyle(child);
    return childStyle.display !== 'none';
  });

  // Common patterns
  if (visibleChildren.length === 2) return 2;
  if (visibleChildren.length === 3) return 3;
  if (visibleChildren.length === 4) return 4;
  if (visibleChildren.length === 6) return 3; // 2 rows × 3 cols
  if (visibleChildren.length === 8) return 4; // 2 rows × 4 cols
  if (visibleChildren.length === 9) return 3; // 3 rows × 3 cols
  if (visibleChildren.length === 12) return 4; // 3 rows × 4 cols

  // Default: Assume 3-column grid
  return 3;
}

export const gridPatterns: RecognitionPattern[] = [
  // Pattern 1: CSS Grid with explicit columns (highest confidence)
  {
    componentType: 'grid',
    patterns: {
      cssProperties: (styles, element) => {
        return styles.display === 'grid' && !!styles.gridTemplateColumns;
      },
    },
    confidence: 95,
    priority: 100,
  },

  // Pattern 2: CSS Grid with grid-template-areas
  {
    componentType: 'grid',
    patterns: {
      cssProperties: (styles) => {
        return styles.display === 'grid' && !!styles.gridTemplateAreas;
      },
    },
    confidence: 95,
    priority: 95,
  },

  // Pattern 3: Flexbox with wrap and gap (grid-like)
  {
    componentType: 'grid',
    patterns: {
      cssProperties: (styles) => {
        return (
          styles.display === 'flex' &&
          styles.flexWrap === 'wrap' &&
          !!styles.gap
        );
      },
    },
    confidence: 85,
    priority: 80,
  },

  // Pattern 4: Grid-related class names
  {
    componentType: 'grid',
    patterns: {
      classKeywords: ['grid', 'row', 'columns', 'col-', 'gallery', 'masonry'],
      cssProperties: (styles) => {
        return styles.display === 'grid' || styles.display === 'flex';
      },
    },
    confidence: 80,
    priority: 70,
  },

  // Pattern 5: Multiple column children (visual heuristic)
  {
    componentType: 'grid',
    patterns: {
      cssProperties: (styles, element) => {
        if (!element) return false;

        const children = Array.from(element.children);
        if (children.length < 2) return false;

        // Check if children are arranged side-by-side
        const childWidths = children.map(child => {
          const rect = child.getBoundingClientRect();
          return rect.width;
        });

        // If multiple children have similar widths, likely a grid
        const avgWidth = childWidths.reduce((a, b) => a + b, 0) / childWidths.length;
        const similarWidths = childWidths.filter(
          w => Math.abs(w - avgWidth) < avgWidth * 0.2
        );

        return similarWidths.length >= 2 && (styles.display === 'flex' || styles.display === 'grid');
      },
    },
    confidence: 70,
    priority: 60,
  },

  // Pattern 6: Bootstrap/Foundation grid classes
  {
    componentType: 'grid',
    patterns: {
      classKeywords: [
        'container',
        'row',
        'col-',
        'grid-',
        'columns',
        'small-',
        'medium-',
        'large-',
      ],
    },
    confidence: 75,
    priority: 65,
  },

  // Pattern 7: Tailwind CSS grid classes
  {
    componentType: 'grid',
    patterns: {
      classKeywords: [
        'grid',
        'grid-cols-',
        'gap-',
        'flex',
        'flex-wrap',
        'space-x-',
      ],
    },
    confidence: 75,
    priority: 65,
  },
];

/**
 * Analyze grid structure and determine column count
 */
export function analyzeGridStructure(element: Element, styles: any): {
  columnCount: number;
  rowCount: number;
  gridType: '2-col' | '3-col' | '4-col' | 'custom';
  isResponsive: boolean;
} {
  const columnCount = detectGridColumns(element, styles);

  let gridType: '2-col' | '3-col' | '4-col' | 'custom';
  switch (columnCount) {
    case 2:
      gridType = '2-col';
      break;
    case 3:
      gridType = '3-col';
      break;
    case 4:
      gridType = '4-col';
      break;
    default:
      gridType = 'custom';
  }

  const children = Array.from(element.children);
  const rowCount = Math.ceil(children.length / columnCount);

  // Check if responsive (has media queries or responsive classes)
  const classes = Array.from(element.classList).join(' ');
  const isResponsive = /col-(xs|sm|md|lg|xl)|grid-cols-\[|@media/.test(
    classes + styles.gridTemplateColumns
  );

  return {
    columnCount,
    rowCount,
    gridType,
    isResponsive,
  };
}
