/**
 * Header/Navigation Recognition Patterns
 *
 * Detects header elements and navigation menus
 */

import type { RecognitionPattern } from '../../types/component.types.js';

export const headerPatterns: RecognitionPattern[] = [
  // Pattern 1: Semantic <header> tag
  {
    componentType: 'header',
    patterns: {
      tagNames: ['header'],
    },
    confidence: 95,
    priority: 100,
  },

  // Pattern 2: Header class names
  {
    componentType: 'header',
    patterns: {
      classKeywords: ['header', 'site-header', 'page-header', 'top-bar', 'navbar'],
    },
    confidence: 90,
    priority: 90,
  },

  // Pattern 3: ARIA role banner (header)
  {
    componentType: 'header',
    patterns: {
      ariaRole: 'banner',
    },
    confidence: 95,
    priority: 95,
  },

  // Pattern 4: Full-width element at top of page with nav
  {
    componentType: 'header',
    patterns: {
      cssProperties: (styles, element) => {
        if (!element) return false;

        const rect = element.getBoundingClientRect();
        const viewportWidth = window.innerWidth;

        // Check if at top of page
        const isAtTop = rect.top <= 100;

        // Check if full width
        const isFullWidth = rect.width >= viewportWidth * 0.9;

        // Check if contains navigation
        const hasNav = !!element.querySelector('nav, [role="navigation"], [class*="nav"], [class*="menu"]');

        return isAtTop && isFullWidth && hasNav;
      },
    },
    confidence: 85,
    priority: 85,
  },

  // Pattern 5: Sticky/Fixed header
  {
    componentType: 'header',
    patterns: {
      cssProperties: (styles) => {
        return styles.position === 'fixed' || styles.position === 'sticky';
      },
      classKeywords: ['header', 'nav', 'top'],
    },
    confidence: 90,
    priority: 90,
  },

  // Pattern 6: Bootstrap navbar
  {
    componentType: 'header',
    patterns: {
      classKeywords: ['navbar', 'navbar-expand', 'navbar-light', 'navbar-dark'],
    },
    confidence: 95,
    priority: 95,
  },
];

/**
 * Navigation-specific patterns
 */
export const navigationPatterns: RecognitionPattern[] = [
  // Pattern 1: Semantic <nav> tag
  {
    componentType: 'menu',
    patterns: {
      tagNames: ['nav'],
    },
    confidence: 95,
    priority: 100,
  },

  // Pattern 2: ARIA role navigation
  {
    componentType: 'menu',
    patterns: {
      ariaRole: 'navigation',
    },
    confidence: 95,
    priority: 95,
  },

  // Pattern 3: Navigation class names
  {
    componentType: 'menu',
    patterns: {
      classKeywords: ['nav', 'navigation', 'menu', 'navbar', 'nav-menu'],
    },
    confidence: 90,
    priority: 90,
  },

  // Pattern 4: List of links (navigation pattern)
  {
    componentType: 'menu',
    patterns: {
      cssProperties: (styles, element) => {
        if (!element) return false;

        // Check for <ul> with multiple <li><a> children
        const isUl = element.tagName.toLowerCase() === 'ul';
        const links = Array.from(element.querySelectorAll('a'));
        const hasMultipleLinks = links.length >= 3;

        // Check if links are navigation-like (short text)
        const navLike = links.every(link => (link.textContent?.trim().length || 0) < 30);

        return isUl && hasMultipleLinks && navLike;
      },
    },
    confidence: 85,
    priority: 85,
  },

  // Pattern 5: Horizontal menu (flexbox row)
  {
    componentType: 'menu',
    patterns: {
      cssProperties: (styles, element) => {
        if (!element) return false;

        const isHorizontal = styles.display === 'flex' && styles.flexDirection !== 'column';
        const hasLinks = element.querySelectorAll('a').length >= 3;

        return isHorizontal && hasLinks;
      },
    },
    confidence: 80,
    priority: 80,
  },

  // Pattern 6: Hamburger menu (mobile navigation)
  {
    componentType: 'menu',
    patterns: {
      classKeywords: ['hamburger', 'mobile-menu', 'toggle-nav', 'menu-toggle'],
    },
    confidence: 90,
    priority: 90,
  },

  // Pattern 7: Mega menu
  {
    componentType: 'menu',
    patterns: {
      classKeywords: ['mega-menu', 'dropdown', 'submenu'],
      cssProperties: (styles, element) => {
        if (!element) return false;
        const hasNestedLists = element.querySelectorAll('ul ul').length > 0;
        return hasNestedLists;
      },
    },
    confidence: 85,
    priority: 85,
  },
];

/**
 * Analyze header structure
 */
export function analyzeHeaderStructure(element: Element): {
  hasLogo: boolean;
  hasNav: boolean;
  hasSearch: boolean;
  hasCTA: boolean;
  isSticky: boolean;
  position: 'fixed' | 'absolute' | 'sticky' | 'relative' | 'static';
} {
  const computedStyle = window.getComputedStyle(element);

  // Check for logo
  const hasLogo = !!(
    element.querySelector('img[alt*="logo" i]') ||
    element.querySelector('[class*="logo"]')
  );

  // Check for navigation
  const hasNav = !!element.querySelector('nav, [role="navigation"], [class*="nav"]');

  // Check for search
  const hasSearch = !!(
    element.querySelector('input[type="search"]') ||
    element.querySelector('[class*="search"]')
  );

  // Check for CTA button
  const hasCTA = !!element.querySelector('button, a[class*="btn"], [class*="cta"]');

  // Check if sticky/fixed
  const isSticky = computedStyle.position === 'fixed' || computedStyle.position === 'sticky';
  const position = computedStyle.position as 'fixed' | 'absolute' | 'sticky' | 'relative' | 'static';

  return {
    hasLogo,
    hasNav,
    hasSearch,
    hasCTA,
    isSticky,
    position,
  };
}

/**
 * Analyze navigation structure
 */
export function analyzeNavigationStructure(element: Element): {
  linkCount: number;
  menuType: 'horizontal' | 'vertical' | 'dropdown' | 'mega' | 'hamburger';
  hasDropdowns: boolean;
  levels: number;
} {
  const links = Array.from(element.querySelectorAll('a'));
  const computedStyle = window.getComputedStyle(element);

  // Detect menu type
  let menuType: 'horizontal' | 'vertical' | 'dropdown' | 'mega' | 'hamburger' = 'horizontal';

  const classes = Array.from(element.classList).join(' ').toLowerCase();
  if (/hamburger|mobile|toggle/.test(classes)) {
    menuType = 'hamburger';
  } else if (/mega/.test(classes)) {
    menuType = 'mega';
  } else if (computedStyle.flexDirection === 'column') {
    menuType = 'vertical';
  } else if (element.querySelectorAll('ul ul').length > 0) {
    menuType = 'dropdown';
  }

  // Check for dropdowns
  const hasDropdowns = element.querySelectorAll('ul ul, .dropdown, .submenu').length > 0;

  // Count levels
  let levels = 1;
  const nestedLists = Array.from(element.querySelectorAll('ul'));
  nestedLists.forEach(ul => {
    let currentLevel = 1;
    let parent = ul.parentElement;
    while (parent && parent !== element) {
      if (parent.tagName.toLowerCase() === 'li') {
        currentLevel++;
      }
      parent = parent.parentElement;
    }
    levels = Math.max(levels, currentLevel);
  });

  return {
    linkCount: links.length,
    menuType,
    hasDropdowns,
    levels,
  };
}
