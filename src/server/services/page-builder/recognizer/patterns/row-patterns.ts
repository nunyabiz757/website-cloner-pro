/**
 * Row/Flex Container Recognition Patterns
 *
 * Detects horizontal flex containers and rows
 */

import type { RecognitionPattern } from '../../types/component.types.js';

/**
 * Helper: Check if element is a horizontal flex container
 */
function looksLikeRow(styles: any): boolean {
  return (
    styles.display === 'flex' &&
    (styles.flexDirection === 'row' || !styles.flexDirection) &&
    styles.flexWrap !== 'wrap'
  );
}

export const rowPatterns: RecognitionPattern[] = [
  // Pattern 1: Flexbox row (no wrap)
  {
    componentType: 'row',
    patterns: {
      cssProperties: (styles) => {
        return (
          styles.display === 'flex' &&
          (styles.flexDirection === 'row' || !styles.flexDirection) &&
          styles.flexWrap !== 'wrap'
        );
      },
    },
    confidence: 90,
    priority: 90,
  },

  // Pattern 2: Inline-flex row
  {
    componentType: 'row',
    patterns: {
      cssProperties: (styles) => {
        return (
          styles.display === 'inline-flex' &&
          (styles.flexDirection === 'row' || !styles.flexDirection)
        );
      },
    },
    confidence: 90,
    priority: 90,
  },

  // Pattern 3: Row class names
  {
    componentType: 'row',
    patterns: {
      classKeywords: ['row', 'flex-row', 'horizontal', 'd-flex'],
      cssProperties: (styles) => {
        return styles.display === 'flex' || styles.display === 'inline-flex';
      },
    },
    confidence: 85,
    priority: 80,
  },

  // Pattern 4: Flexbox with justify-content/align-items (layout container)
  {
    componentType: 'row',
    patterns: {
      cssProperties: (styles) => {
        return (
          styles.display === 'flex' &&
          (styles.justifyContent || styles.alignItems) &&
          styles.flexDirection !== 'column'
        );
      },
    },
    confidence: 80,
    priority: 75,
  },

  // Pattern 5: Multiple children arranged horizontally
  {
    componentType: 'row',
    patterns: {
      cssProperties: (styles, element) => {
        if (!element) return false;

        const children = Array.from(element.children);
        if (children.length < 2) return false;

        // Check if children are side-by-side
        const rects = children.map(child => child.getBoundingClientRect());

        // Check if horizontally arranged (y-positions similar)
        const firstY = rects[0]?.y || 0;
        const horizontallyArranged = rects.every(
          rect => Math.abs(rect.y - firstY) < 20
        );

        return horizontallyArranged && styles.display === 'flex';
      },
    },
    confidence: 75,
    priority: 70,
  },

  // Pattern 6: Bootstrap row
  {
    componentType: 'row',
    patterns: {
      classKeywords: ['row', 'form-row'],
    },
    confidence: 80,
    priority: 75,
  },

  // Pattern 7: Tailwind flex row
  {
    componentType: 'row',
    patterns: {
      classKeywords: ['flex', 'flex-row', 'items-center', 'justify-'],
    },
    confidence: 75,
    priority: 70,
  },
];

/**
 * Analyze row structure
 */
export function analyzeRowStructure(element: Element, styles: any): {
  childrenCount: number;
  justifyContent: string | undefined;
  alignItems: string | undefined;
  gap: string | undefined;
  isResponsive: boolean;
} {
  const children = Array.from(element.children);
  const classes = Array.from(element.classList).join(' ');

  return {
    childrenCount: children.length,
    justifyContent: styles.justifyContent,
    alignItems: styles.alignItems,
    gap: styles.gap,
    isResponsive: /col-(xs|sm|md|lg|xl)|flex-(sm|md|lg|xl)/.test(classes),
  };
}
