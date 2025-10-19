/**
 * Footer Recognition Patterns
 *
 * Detects footer elements
 */

import type { RecognitionPattern } from '../../types/component.types.js';

export const footerPatterns: RecognitionPattern[] = [
  // Pattern 1: Semantic <footer> tag
  {
    componentType: 'footer',
    patterns: {
      tagNames: ['footer'],
    },
    confidence: 95,
    priority: 100,
  },

  // Pattern 2: Footer class names
  {
    componentType: 'footer',
    patterns: {
      classKeywords: ['footer', 'site-footer', 'page-footer', 'bottom'],
    },
    confidence: 90,
    priority: 90,
  },

  // Pattern 3: ARIA role contentinfo (footer)
  {
    componentType: 'footer',
    patterns: {
      ariaRole: 'contentinfo',
    },
    confidence: 95,
    priority: 95,
  },

  // Pattern 4: Full-width element at bottom of page
  {
    componentType: 'footer',
    patterns: {
      cssProperties: (styles, element) => {
        if (!element) return false;

        const rect = element.getBoundingClientRect();
        const viewportWidth = window.innerWidth;
        const documentHeight = document.documentElement.scrollHeight;

        // Check if at bottom of page
        const isAtBottom = rect.bottom >= documentHeight - 200;

        // Check if full width
        const isFullWidth = rect.width >= viewportWidth * 0.9;

        return isAtBottom && isFullWidth;
      },
    },
    confidence: 85,
    priority: 85,
  },

  // Pattern 5: Contains typical footer content
  {
    componentType: 'footer',
    patterns: {
      cssProperties: (styles, element) => {
        if (!element) return false;

        const text = element.textContent?.toLowerCase() || '';
        const hasFooterContent = !!(
          /copyright|©|all rights reserved|\d{4}/.test(text) ||
          element.querySelector('[class*="social"]') ||
          element.querySelector('[class*="contact"]') ||
          element.querySelectorAll('a').length >= 5 // Footer links
        );

        return hasFooterContent;
      },
    },
    confidence: 80,
    priority: 80,
  },

  // Pattern 6: Dark background at bottom (common footer styling)
  {
    componentType: 'footer',
    patterns: {
      cssProperties: (styles, element) => {
        if (!element) return false;

        const rect = element.getBoundingClientRect();
        const documentHeight = document.documentElement.scrollHeight;
        const isAtBottom = rect.bottom >= documentHeight - 200;

        // Check for dark background
        const bgColor = styles.backgroundColor;
        const isDark = bgColor && (
          bgColor.includes('rgb(0, 0, 0)') ||
          bgColor.includes('rgba(0, 0, 0') ||
          /rgb\(([0-9]{1,2}), ([0-9]{1,2}), ([0-9]{1,2})\)/.test(bgColor) &&
          parseInt(RegExp.$1) < 100 &&
          parseInt(RegExp.$2) < 100 &&
          parseInt(RegExp.$3) < 100
        );

        return isAtBottom && isDark;
      },
    },
    confidence: 75,
    priority: 75,
  },

  // Pattern 7: Bootstrap footer
  {
    componentType: 'footer',
    patterns: {
      classKeywords: ['footer', 'py-', 'bg-dark', 'bg-light'],
      cssProperties: (styles, element) => {
        if (!element) return false;
        const rect = element.getBoundingClientRect();
        const documentHeight = document.documentElement.scrollHeight;
        return rect.bottom >= documentHeight - 200;
      },
    },
    confidence: 85,
    priority: 85,
  },
];

/**
 * Analyze footer structure
 */
export function analyzeFooterStructure(element: Element): {
  hasWidgets: boolean;
  hasSocialLinks: boolean;
  hasNewsletter: boolean;
  hasCopyright: boolean;
  columnCount: number;
  backgroundColor: string | undefined;
  textColor: string | undefined;
} {
  const computedStyle = window.getComputedStyle(element);
  const text = element.textContent?.toLowerCase() || '';

  // Check for widgets
  const widgets = Array.from(element.querySelectorAll('[class*="widget"], .footer-column, .footer-section'));
  const hasWidgets = widgets.length > 0;

  // Check for social links
  const hasSocialLinks = !!(
    element.querySelector('[class*="social"]') ||
    element.querySelector('a[href*="facebook"]') ||
    element.querySelector('a[href*="twitter"]') ||
    element.querySelector('a[href*="linkedin"]')
  );

  // Check for newsletter signup
  const hasNewsletter = !!(
    element.querySelector('input[type="email"]') ||
    element.querySelector('[class*="newsletter"]') ||
    element.querySelector('[class*="subscribe"]')
  );

  // Check for copyright
  const hasCopyright = /copyright|©|all rights reserved|\d{4}/.test(text);

  // Count columns
  let columnCount = 1;
  const columns = Array.from(element.querySelectorAll('[class*="col"], .footer-column, .widget'));
  if (columns.length > 0) {
    columnCount = columns.length;
  } else {
    // Try to detect from flex/grid
    if (computedStyle.display === 'grid' && computedStyle.gridTemplateColumns) {
      columnCount = computedStyle.gridTemplateColumns.split(/\s+/).length;
    }
  }

  return {
    hasWidgets,
    hasSocialLinks,
    hasNewsletter,
    hasCopyright,
    columnCount,
    backgroundColor: computedStyle.backgroundColor,
    textColor: computedStyle.color,
  };
}
