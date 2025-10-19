/**
 * Sidebar Recognition Patterns
 *
 * Detects sidebar/aside elements
 */

import type { RecognitionPattern } from '../../types/component.types.js';

export const sidebarPatterns: RecognitionPattern[] = [
  // Pattern 1: Semantic <aside> tag
  {
    componentType: 'sidebar',
    patterns: {
      tagNames: ['aside'],
    },
    confidence: 95,
    priority: 100,
  },

  // Pattern 2: Sidebar class names
  {
    componentType: 'sidebar',
    patterns: {
      classKeywords: ['sidebar', 'aside', 'side-nav', 'rail'],
    },
    confidence: 90,
    priority: 90,
  },

  // Pattern 3: Narrow column positioned on left/right
  {
    componentType: 'sidebar',
    patterns: {
      cssProperties: (styles, element) => {
        if (!element) return false;

        const rect = element.getBoundingClientRect();
        const viewportWidth = window.innerWidth;

        // Check if narrow (< 30% of viewport)
        const isNarrow = rect.width < viewportWidth * 0.3;

        // Check if positioned on left or right edge
        const isOnLeftEdge = rect.left <= 50;
        const isOnRightEdge = rect.right >= viewportWidth - 50;

        // Check if tall (at least 50% of viewport height)
        const isTall = rect.height >= window.innerHeight * 0.5;

        return isNarrow && (isOnLeftEdge || isOnRightEdge) && isTall;
      },
    },
    confidence: 80,
    priority: 80,
  },

  // Pattern 4: ARIA role sidebar
  {
    componentType: 'sidebar',
    patterns: {
      ariaRole: 'complementary',
    },
    confidence: 90,
    priority: 90,
  },

  // Pattern 5: Sidebar with typical widgets (search, categories, etc.)
  {
    componentType: 'sidebar',
    patterns: {
      cssProperties: (styles, element) => {
        if (!element) return false;

        const children = Array.from(element.children);
        const hasTypicalWidgets = children.some(child => {
          const classes = Array.from(child.classList).join(' ').toLowerCase();
          return /widget|search|categories|tags|recent|archive/.test(classes);
        });

        return hasTypicalWidgets;
      },
    },
    confidence: 85,
    priority: 85,
  },
];

/**
 * Analyze sidebar structure
 */
export function analyzeSidebarStructure(element: Element): {
  position: 'left' | 'right';
  width: number;
  height: number;
  widgetCount: number;
  isSticky: boolean;
} {
  const rect = element.getBoundingClientRect();
  const viewportWidth = window.innerWidth;
  const computedStyle = window.getComputedStyle(element);

  // Determine position
  const position: 'left' | 'right' = rect.left <= viewportWidth / 2 ? 'left' : 'right';

  // Count widgets
  const widgets = Array.from(element.querySelectorAll('[class*="widget"], section, .block'));
  const widgetCount = widgets.length;

  // Check if sticky
  const isSticky = computedStyle.position === 'sticky' || computedStyle.position === 'fixed';

  return {
    position,
    width: rect.width,
    height: rect.height,
    widgetCount,
    isSticky,
  };
}
