/**
 * Advanced Component Recognition Patterns
 *
 * Detects 28 advanced component types:
 * - Accordion/Toggle, Tabs, Modal/Popup
 * - Carousel/Slider, Image Gallery
 * - Testimonial, Pricing Table, Progress Bar, Countdown
 * - Social Share, Breadcrumbs, Pagination
 * - Tables, Lists, Blockquote, Code Blocks
 * - CTA, Feature Box, Icon Box
 * - Team Member, Blog Card, Product Card
 * - Search Bar, Video Embeds, Maps
 * - Social Feeds, Icons, Spacer/Divider
 */

import type { RecognitionPattern } from '../../types/component.types.js';

// ============================================================================
// ACCORDION / TOGGLE PATTERNS
// ============================================================================

export const accordionPatterns: RecognitionPattern[] = [
  {
    componentType: 'accordion',
    patterns: {
      classKeywords: ['accordion', 'collapse', 'expandable', 'faq'],
      cssProperties: (styles, element) => {
        if (!element) return false;
        // Multiple collapsible sections
        const sections = element.querySelectorAll('[class*="item"], [class*="panel"], [class*="section"]');
        const headers = element.querySelectorAll('[class*="header"], [class*="title"], [class*="trigger"]');
        return sections.length >= 2 && headers.length >= 2;
      },
    },
    confidence: 90,
    priority: 85,
  },
  {
    componentType: 'accordion',
    patterns: {
      ariaRole: 'tablist',
      cssProperties: (styles, element) => {
        if (!element) return false;
        const buttons = element.querySelectorAll('[aria-expanded]');
        return buttons.length >= 2;
      },
    },
    confidence: 95,
    priority: 90,
  },
  {
    componentType: 'accordion',
    patterns: {
      classKeywords: ['MuiAccordion', 'accordion-', 'collapse-', 'panel-group'],
    },
    confidence: 95,
    priority: 90,
  },
];

// ============================================================================
// TABS PATTERNS
// ============================================================================

export const tabsPatterns: RecognitionPattern[] = [
  {
    componentType: 'tabs',
    patterns: {
      classKeywords: ['tabs', 'tab-', 'tabbed'],
      cssProperties: (styles, element) => {
        if (!element) return false;
        const tabList = element.querySelector('[role="tablist"], [class*="tab-list"]');
        const tabPanels = element.querySelectorAll('[role="tabpanel"], [class*="tab-panel"]');
        return !!tabList && tabPanels.length >= 2;
      },
    },
    confidence: 90,
    priority: 85,
  },
  {
    componentType: 'tabs',
    patterns: {
      ariaRole: 'tablist',
    },
    confidence: 95,
    priority: 90,
  },
  {
    componentType: 'tabs',
    patterns: {
      classKeywords: ['nav-tabs', 'tab-container', 'MuiTabs'],
    },
    confidence: 95,
    priority: 90,
  },
];

// ============================================================================
// MODAL / POPUP PATTERNS
// ============================================================================

export const modalPatterns: RecognitionPattern[] = [
  {
    componentType: 'modal',
    patterns: {
      classKeywords: ['modal', 'popup', 'dialog', 'overlay', 'lightbox'],
      cssProperties: (styles) => {
        return styles.position === 'fixed' || styles.position === 'absolute';
      },
    },
    confidence: 85,
    priority: 85,
  },
  {
    componentType: 'modal',
    patterns: {
      ariaRole: 'dialog',
    },
    confidence: 95,
    priority: 95,
  },
  {
    componentType: 'modal',
    patterns: {
      classKeywords: ['MuiModal', 'modal-', 'fancybox', 'magnific-popup'],
    },
    confidence: 95,
    priority: 90,
  },
];

// ============================================================================
// CAROUSEL / SLIDER PATTERNS
// ============================================================================

export const carouselPatterns: RecognitionPattern[] = [
  {
    componentType: 'carousel',
    patterns: {
      classKeywords: ['carousel', 'slider', 'slideshow', 'swiper', 'slick'],
    },
    confidence: 90,
    priority: 85,
  },
  {
    componentType: 'carousel',
    patterns: {
      cssProperties: (styles, element) => {
        if (!element) return false;
        const slides = element.querySelectorAll('[class*="slide"], [class*="item"]');
        const hasPrevNext = element.querySelectorAll('[class*="prev"], [class*="next"]').length >= 2;
        return slides.length >= 2 && hasPrevNext;
      },
    },
    confidence: 85,
    priority: 80,
  },
  {
    componentType: 'carousel',
    patterns: {
      classKeywords: ['owl-carousel', 'flickity', 'glide', 'splide'],
    },
    confidence: 95,
    priority: 90,
  },
];

// ============================================================================
// IMAGE GALLERY PATTERNS
// ============================================================================

export const galleryPatterns: RecognitionPattern[] = [
  {
    componentType: 'gallery',
    patterns: {
      classKeywords: ['gallery', 'photo-grid', 'image-grid', 'masonry', 'portfolio'],
      cssProperties: (styles, element) => {
        if (!element) return false;
        const images = element.querySelectorAll('img, picture');
        return images.length >= 4;
      },
    },
    confidence: 85,
    priority: 80,
  },
  {
    componentType: 'gallery',
    patterns: {
      cssProperties: (styles, element) => {
        if (!element) return false;
        const images = element.querySelectorAll('img, picture');
        const isGrid = styles.display === 'grid' || styles.display === 'flex';
        return images.length >= 4 && isGrid;
      },
    },
    confidence: 80,
    priority: 75,
  },
  {
    componentType: 'gallery',
    patterns: {
      classKeywords: ['lightgallery', 'photoswipe', 'justified-gallery'],
    },
    confidence: 95,
    priority: 90,
  },
];

// ============================================================================
// TESTIMONIAL PATTERNS
// ============================================================================

export const testimonialPatterns: RecognitionPattern[] = [
  {
    componentType: 'testimonial',
    patterns: {
      classKeywords: ['testimonial', 'review', 'quote', 'feedback'],
      cssProperties: (styles, element) => {
        if (!element) return false;
        const hasQuote = !!element.querySelector('blockquote, [class*="quote"]');
        const hasAuthor = !!element.querySelector('[class*="author"], [class*="name"]');
        return hasQuote || hasAuthor;
      },
    },
    confidence: 85,
    priority: 80,
  },
  {
    componentType: 'testimonial',
    patterns: {
      tagNames: ['blockquote'],
      cssProperties: (styles, element) => {
        if (!element) return false;
        const hasAuthor = !!element.querySelector('cite, [class*="author"]');
        const hasRating = !!element.querySelector('[class*="rating"], [class*="star"]');
        return hasAuthor || hasRating;
      },
    },
    confidence: 80,
    priority: 75,
  },
];

// ============================================================================
// PRICING TABLE PATTERNS
// ============================================================================

export const pricingTablePatterns: RecognitionPattern[] = [
  {
    componentType: 'pricing-table',
    patterns: {
      classKeywords: ['pricing', 'price-table', 'plan', 'package'],
      cssProperties: (styles, element) => {
        if (!element) return false;
        const hasPrice = !!element.querySelector('[class*="price"], [class*="cost"]');
        const hasFeatures = element.querySelectorAll('ul, [class*="feature"]').length > 0;
        return hasPrice && hasFeatures;
      },
    },
    confidence: 90,
    priority: 85,
  },
  {
    componentType: 'pricing-table',
    patterns: {
      cssProperties: (styles, element) => {
        if (!element) return false;
        const text = element.textContent?.toLowerCase() || '';
        const hasPriceIndicators = /\$|€|£|\d+\/month|\d+\/year|free|premium|pro|basic/.test(text);
        const hasPricingStructure = element.querySelectorAll('[class*="plan"], [class*="tier"]').length >= 2;
        return hasPriceIndicators && hasPricingStructure;
      },
    },
    confidence: 80,
    priority: 75,
  },
];

// ============================================================================
// PROGRESS BAR PATTERNS
// ============================================================================

export const progressBarPatterns: RecognitionPattern[] = [
  {
    componentType: 'progress-bar',
    patterns: {
      tagNames: ['progress'],
    },
    confidence: 95,
    priority: 95,
  },
  {
    componentType: 'progress-bar',
    patterns: {
      ariaRole: 'progressbar',
    },
    confidence: 95,
    priority: 95,
  },
  {
    componentType: 'progress-bar',
    patterns: {
      classKeywords: ['progress', 'progress-bar', 'skill-bar', 'loading'],
    },
    confidence: 85,
    priority: 80,
  },
];

// ============================================================================
// COUNTDOWN TIMER PATTERNS
// ============================================================================

export const countdownPatterns: RecognitionPattern[] = [
  {
    componentType: 'countdown',
    patterns: {
      classKeywords: ['countdown', 'timer', 'clock', 'count-down'],
    },
    confidence: 90,
    priority: 85,
  },
  {
    componentType: 'countdown',
    patterns: {
      cssProperties: (styles, element) => {
        if (!element) return false;
        const hasTimeUnits = !!(
          element.querySelector('[class*="days"]') ||
          element.querySelector('[class*="hours"]') ||
          element.querySelector('[class*="minutes"]')
        );
        return hasTimeUnits;
      },
    },
    confidence: 85,
    priority: 80,
  },
];

// ============================================================================
// SOCIAL SHARE BUTTONS PATTERNS
// ============================================================================

export const socialSharePatterns: RecognitionPattern[] = [
  {
    componentType: 'social-share',
    patterns: {
      classKeywords: ['share', 'social-share', 'share-buttons'],
      cssProperties: (styles, element) => {
        if (!element) return false;
        const links = Array.from(element.querySelectorAll('a'));
        const socialLinks = links.filter(a => {
          const href = a.getAttribute('href') || '';
          return /facebook|twitter|linkedin|pinterest|whatsapp|telegram/i.test(href);
        });
        return socialLinks.length >= 2;
      },
    },
    confidence: 90,
    priority: 85,
  },
  {
    componentType: 'social-share',
    patterns: {
      classKeywords: ['addthis', 'sharethis', 'social-icons'],
      cssProperties: (styles, element) => {
        if (!element) return false;
        const hasShareLinks = element.querySelectorAll('a[href*="share"]').length >= 1;
        return hasShareLinks;
      },
    },
    confidence: 85,
    priority: 80,
  },
];

// ============================================================================
// BREADCRUMBS PATTERNS
// ============================================================================

export const breadcrumbsPatterns: RecognitionPattern[] = [
  {
    componentType: 'breadcrumbs',
    patterns: {
      ariaRole: 'navigation',
      classKeywords: ['breadcrumb'],
    },
    confidence: 95,
    priority: 90,
  },
  {
    componentType: 'breadcrumbs',
    patterns: {
      classKeywords: ['breadcrumb', 'breadcrumbs', 'crumbs'],
    },
    confidence: 90,
    priority: 85,
  },
  {
    componentType: 'breadcrumbs',
    patterns: {
      cssProperties: (styles, element) => {
        if (!element) return false;
        const links = element.querySelectorAll('a');
        const hasSeparators = !!(
          element.textContent?.includes('/') ||
          element.textContent?.includes('>') ||
          element.querySelector('[class*="separator"]')
        );
        return links.length >= 2 && hasSeparators;
      },
    },
    confidence: 80,
    priority: 75,
  },
];

// ============================================================================
// PAGINATION PATTERNS
// ============================================================================

export const paginationPatterns: RecognitionPattern[] = [
  {
    componentType: 'pagination',
    patterns: {
      ariaRole: 'navigation',
      classKeywords: ['pagination'],
    },
    confidence: 95,
    priority: 90,
  },
  {
    componentType: 'pagination',
    patterns: {
      classKeywords: ['pagination', 'pager', 'page-numbers'],
    },
    confidence: 90,
    priority: 85,
  },
  {
    componentType: 'pagination',
    patterns: {
      cssProperties: (styles, element) => {
        if (!element) return false;
        const links = Array.from(element.querySelectorAll('a, button'));
        const hasNumbers = links.some(l => /^\d+$/.test(l.textContent?.trim() || ''));
        const hasPrevNext = links.some(l => /prev|next|previous/i.test(l.textContent || ''));
        return hasNumbers && hasPrevNext;
      },
    },
    confidence: 85,
    priority: 80,
  },
];

// ============================================================================
// TABLE PATTERNS
// ============================================================================

export const tablePatterns: RecognitionPattern[] = [
  {
    componentType: 'table',
    patterns: {
      tagNames: ['table'],
    },
    confidence: 95,
    priority: 90,
  },
  {
    componentType: 'table',
    patterns: {
      ariaRole: 'table',
    },
    confidence: 90,
    priority: 85,
  },
  {
    componentType: 'table',
    patterns: {
      classKeywords: ['table', 'data-table', 'grid', 'datagrid'],
      cssProperties: (styles, element) => {
        if (!element) return false;
        const rows = element.querySelectorAll('[role="row"], tr, [class*="row"]');
        return rows.length >= 2;
      },
    },
    confidence: 80,
    priority: 75,
  },
];

// ============================================================================
// LIST PATTERNS
// ============================================================================

export const listPatterns: RecognitionPattern[] = [
  {
    componentType: 'list',
    patterns: {
      tagNames: ['ul', 'ol'],
      cssProperties: (styles, element) => {
        if (!element) return false;
        const items = element.querySelectorAll('li');
        return items.length >= 2;
      },
    },
    confidence: 90,
    priority: 80,
  },
  {
    componentType: 'list',
    patterns: {
      ariaRole: 'list',
    },
    confidence: 90,
    priority: 80,
  },
  {
    componentType: 'list',
    patterns: {
      classKeywords: ['list', 'checklist', 'feature-list'],
      cssProperties: (styles, element) => {
        if (!element) return false;
        const items = element.querySelectorAll('[role="listitem"], [class*="item"]');
        return items.length >= 2;
      },
    },
    confidence: 75,
    priority: 70,
  },
];

// ============================================================================
// BLOCKQUOTE PATTERNS
// ============================================================================

export const blockquotePatterns: RecognitionPattern[] = [
  {
    componentType: 'blockquote',
    patterns: {
      tagNames: ['blockquote'],
    },
    confidence: 95,
    priority: 90,
  },
  {
    componentType: 'blockquote',
    patterns: {
      classKeywords: ['quote', 'pullquote', 'blockquote'],
      cssProperties: (styles, element) => {
        if (!element) return false;
        const hasCite = !!element.querySelector('cite, [class*="author"], footer');
        const hasQuoteMarks = !!(styles.content?.includes('"') || element.textContent?.startsWith('"'));
        return hasCite || hasQuoteMarks;
      },
    },
    confidence: 80,
    priority: 75,
  },
];

// ============================================================================
// CODE BLOCK PATTERNS
// ============================================================================

export const codeBlockPatterns: RecognitionPattern[] = [
  {
    componentType: 'code-block',
    patterns: {
      tagNames: ['pre'],
      cssProperties: (styles, element) => {
        if (!element) return false;
        return !!element.querySelector('code');
      },
    },
    confidence: 95,
    priority: 90,
  },
  {
    componentType: 'code-block',
    patterns: {
      tagNames: ['code'],
      cssProperties: (styles, element) => {
        if (!element) return false;
        const text = element.textContent || '';
        const isBlock = styles.display === 'block' || text.length > 100;
        return isBlock;
      },
    },
    confidence: 80,
    priority: 75,
  },
  {
    componentType: 'code-block',
    patterns: {
      classKeywords: ['code', 'highlight', 'prism', 'hljs', 'syntax'],
    },
    confidence: 90,
    priority: 85,
  },
];

// ============================================================================
// CTA (Call-to-Action) PATTERNS
// ============================================================================

export const ctaPatterns: RecognitionPattern[] = [
  {
    componentType: 'cta',
    patterns: {
      classKeywords: ['cta', 'call-to-action', 'banner'],
      cssProperties: (styles, element) => {
        if (!element) return false;
        const hasHeading = !!element.querySelector('h1, h2, h3');
        const hasButton = !!element.querySelector('button, a[class*="btn"]');
        return hasHeading && hasButton;
      },
    },
    confidence: 90,
    priority: 85,
  },
  {
    componentType: 'cta',
    patterns: {
      cssProperties: (styles, element) => {
        if (!element) return false;
        const classes = Array.from(element.classList).join(' ').toLowerCase();
        const hasCtaIndicators = /action|sign-?up|get-started|try-free|download|subscribe/.test(classes);
        const hasButton = !!element.querySelector('button, a[class*="btn"]');
        return hasCtaIndicators && hasButton;
      },
    },
    confidence: 80,
    priority: 75,
  },
];

// ============================================================================
// FEATURE BOX / ICON BOX PATTERNS
// ============================================================================

export const featureBoxPatterns: RecognitionPattern[] = [
  {
    componentType: 'feature-box',
    patterns: {
      classKeywords: ['feature', 'icon-box', 'service', 'benefit'],
      cssProperties: (styles, element) => {
        if (!element) return false;
        const hasIcon = !!(
          element.querySelector('i[class*="fa-"], svg, [class*="icon"]') ||
          element.querySelector('img[src*="icon"]')
        );
        const hasHeading = !!element.querySelector('h3, h4, [class*="title"]');
        return hasIcon && hasHeading;
      },
    },
    confidence: 85,
    priority: 80,
  },
  {
    componentType: 'icon-box',
    patterns: {
      classKeywords: ['icon-box', 'iconbox', 'feature-box'],
    },
    confidence: 90,
    priority: 85,
  },
];

// ============================================================================
// TEAM MEMBER CARD PATTERNS
// ============================================================================

export const teamMemberPatterns: RecognitionPattern[] = [
  {
    componentType: 'team-member',
    patterns: {
      classKeywords: ['team', 'member', 'staff', 'author', 'profile'],
      cssProperties: (styles, element) => {
        if (!element) return false;
        const hasImage = !!element.querySelector('img');
        const hasName = !!element.querySelector('[class*="name"], h3, h4');
        const hasRole = !!element.querySelector('[class*="role"], [class*="title"], [class*="position"]');
        return hasImage && hasName && hasRole;
      },
    },
    confidence: 85,
    priority: 80,
  },
];

// ============================================================================
// BLOG CARD PATTERNS
// ============================================================================

export const blogCardPatterns: RecognitionPattern[] = [
  {
    componentType: 'blog-card',
    patterns: {
      classKeywords: ['post', 'article', 'blog', 'entry'],
      cssProperties: (styles, element) => {
        if (!element) return false;
        const hasImage = !!element.querySelector('img');
        const hasTitle = !!element.querySelector('h2, h3, [class*="title"]');
        const hasDate = !!element.querySelector('time, [class*="date"]');
        const hasExcerpt = !!element.querySelector('[class*="excerpt"], [class*="summary"], p');
        return hasTitle && (hasDate || hasExcerpt);
      },
    },
    confidence: 85,
    priority: 80,
  },
];

// ============================================================================
// PRODUCT CARD PATTERNS
// ============================================================================

export const productCardPatterns: RecognitionPattern[] = [
  {
    componentType: 'product-card',
    patterns: {
      classKeywords: ['product', 'item', 'woocommerce', 'shop'],
      cssProperties: (styles, element) => {
        if (!element) return false;
        const hasImage = !!element.querySelector('img');
        const hasPrice = !!element.querySelector('[class*="price"], [class*="cost"]');
        const hasTitle = !!element.querySelector('h3, h4, [class*="title"], [class*="name"]');
        return hasImage && hasPrice && hasTitle;
      },
    },
    confidence: 90,
    priority: 85,
  },
  {
    componentType: 'product-card',
    patterns: {
      cssProperties: (styles, element) => {
        if (!element) return false;
        const text = element.textContent || '';
        const hasPrice = /\$\d+|\d+\.\d{2}|€\d+|£\d+/.test(text);
        const hasAddToCart = !!element.querySelector('[class*="add-to-cart"], button');
        return hasPrice && hasAddToCart;
      },
    },
    confidence: 85,
    priority: 80,
  },
];

// ============================================================================
// SEARCH BAR PATTERNS
// ============================================================================

export const searchBarPatterns: RecognitionPattern[] = [
  {
    componentType: 'search-bar',
    patterns: {
      ariaRole: 'search',
    },
    confidence: 95,
    priority: 90,
  },
  {
    componentType: 'search-bar',
    patterns: {
      classKeywords: ['search', 'search-form', 'searchbar'],
      cssProperties: (styles, element) => {
        if (!element) return false;
        return !!element.querySelector('input[type="search"], input[type="text"][placeholder*="search" i]');
      },
    },
    confidence: 90,
    priority: 85,
  },
];

// ============================================================================
// VIDEO EMBED PATTERNS
// ============================================================================

export const videoEmbedPatterns: RecognitionPattern[] = [
  {
    componentType: 'video',
    patterns: {
      tagNames: ['video', 'iframe'],
      cssProperties: (styles, element) => {
        if (!element) return false;
        if (element.tagName.toLowerCase() === 'video') return true;
        const src = element.getAttribute('src') || '';
        return /youtube|vimeo|dailymotion|wistia/i.test(src);
      },
    },
    confidence: 95,
    priority: 90,
  },
  {
    componentType: 'video',
    patterns: {
      classKeywords: ['video', 'youtube', 'vimeo', 'video-wrapper', 'embed-responsive'],
    },
    confidence: 85,
    priority: 80,
  },
];

// ============================================================================
// GOOGLE MAPS PATTERNS
// ============================================================================

export const mapsPatterns: RecognitionPattern[] = [
  {
    componentType: 'google-maps',
    patterns: {
      tagNames: ['iframe'],
      cssProperties: (styles, element) => {
        if (!element) return false;
        const src = element.getAttribute('src') || '';
        return /maps\.google|google\.com\/maps/i.test(src);
      },
    },
    confidence: 95,
    priority: 95,
  },
  {
    componentType: 'google-maps',
    patterns: {
      classKeywords: ['map', 'google-map', 'gmap'],
    },
    confidence: 80,
    priority: 75,
  },
];

// ============================================================================
// SOCIAL FEED PATTERNS
// ============================================================================

export const socialFeedPatterns: RecognitionPattern[] = [
  {
    componentType: 'social-feed',
    patterns: {
      classKeywords: ['twitter-feed', 'instagram-feed', 'facebook-feed', 'social-feed'],
    },
    confidence: 90,
    priority: 85,
  },
  {
    componentType: 'social-feed',
    patterns: {
      tagNames: ['iframe'],
      cssProperties: (styles, element) => {
        if (!element) return false;
        const src = element.getAttribute('src') || '';
        return /twitter|instagram|facebook/i.test(src);
      },
    },
    confidence: 85,
    priority: 80,
  },
];

// ============================================================================
// ICON PATTERNS
// ============================================================================

export const iconPatterns: RecognitionPattern[] = [
  {
    componentType: 'icon',
    patterns: {
      tagNames: ['i'],
      classKeywords: ['fa-', 'fas', 'far', 'fab', 'fal', 'icon', 'material-icons'],
    },
    confidence: 95,
    priority: 90,
  },
  {
    componentType: 'icon',
    patterns: {
      tagNames: ['svg'],
      cssProperties: (styles, element) => {
        if (!element) return false;
        const width = parseInt(styles.width || '0');
        const height = parseInt(styles.height || '0');
        return width <= 100 && height <= 100;
      },
    },
    confidence: 85,
    priority: 80,
  },
  {
    componentType: 'icon',
    patterns: {
      tagNames: ['img'],
      cssProperties: (styles, element) => {
        if (!element) return false;
        const src = element.getAttribute('src') || '';
        const alt = element.getAttribute('alt') || '';
        const isSmall = parseInt(styles.width || '100') <= 64;
        return isSmall && (/icon|logo|symbol/.test(src + alt));
      },
    },
    confidence: 75,
    priority: 70,
  },
];

// ============================================================================
// SPACER / DIVIDER PATTERNS
// ============================================================================

export const spacerPatterns: RecognitionPattern[] = [
  {
    componentType: 'spacer',
    patterns: {
      classKeywords: ['spacer', 'space', 'gap', 'separator'],
      cssProperties: (styles) => {
        const height = parseInt(styles.height || '0');
        return height > 0 && height <= 200 && !styles.backgroundColor;
      },
    },
    confidence: 80,
    priority: 75,
  },
  {
    componentType: 'spacer',
    patterns: {
      tagNames: ['hr'],
      cssProperties: (styles) => {
        return styles.borderWidth === '0px' || styles.opacity === '0';
      },
    },
    confidence: 85,
    priority: 80,
  },
];

export const dividerPatterns: RecognitionPattern[] = [
  {
    componentType: 'divider',
    patterns: {
      tagNames: ['hr'],
    },
    confidence: 95,
    priority: 90,
  },
  {
    componentType: 'divider',
    patterns: {
      classKeywords: ['divider', 'separator', 'line', 'border'],
      cssProperties: (styles) => {
        const hasBorder = !!(styles.border || styles.borderTop || styles.borderBottom);
        const height = parseInt(styles.height || '0');
        return hasBorder && height <= 10;
      },
    },
    confidence: 85,
    priority: 80,
  },
];

// Export all patterns
export const allAdvancedPatterns = [
  ...accordionPatterns,
  ...tabsPatterns,
  ...modalPatterns,
  ...carouselPatterns,
  ...galleryPatterns,
  ...testimonialPatterns,
  ...pricingTablePatterns,
  ...progressBarPatterns,
  ...countdownPatterns,
  ...socialSharePatterns,
  ...breadcrumbsPatterns,
  ...paginationPatterns,
  ...tablePatterns,
  ...listPatterns,
  ...blockquotePatterns,
  ...codeBlockPatterns,
  ...ctaPatterns,
  ...featureBoxPatterns,
  ...teamMemberPatterns,
  ...blogCardPatterns,
  ...productCardPatterns,
  ...searchBarPatterns,
  ...videoEmbedPatterns,
  ...mapsPatterns,
  ...socialFeedPatterns,
  ...iconPatterns,
  ...spacerPatterns,
  ...dividerPatterns,
];

// ============================================================================
// ANALYSIS FUNCTIONS
// ============================================================================

/**
 * Analyze accordion structure
 */
export function analyzeAccordion(element: Element): {
  itemCount: number;
  hasIcons: boolean;
  allowMultiple: boolean;
  defaultOpen?: number;
  accordionType: 'standard' | 'flush' | 'bordered';
} {
  const items = element.querySelectorAll('[class*="item"], [class*="panel"], [class*="section"]');
  const headers = element.querySelectorAll('[class*="header"], [class*="title"], [class*="trigger"]');
  const icons = element.querySelectorAll('i, svg, [class*="icon"]');

  const classes = Array.from(element.classList).join(' ').toLowerCase();
  let accordionType: 'standard' | 'flush' | 'bordered' = 'standard';
  if (classes.includes('flush')) accordionType = 'flush';
  else if (classes.includes('border')) accordionType = 'bordered';

  // Check for multiple open sections
  const openItems = element.querySelectorAll('[class*="open"], [class*="active"], [aria-expanded="true"]');
  const allowMultiple = openItems.length > 1;

  // Find default open index
  let defaultOpen: number | undefined;
  if (openItems.length === 1) {
    const allItems = Array.from(items);
    defaultOpen = allItems.indexOf(openItems[0] as Element);
  }

  return {
    itemCount: items.length || headers.length,
    hasIcons: icons.length > 0,
    allowMultiple,
    defaultOpen,
    accordionType,
  };
}

/**
 * Analyze tabs structure
 */
export function analyzeTabs(element: Element): {
  tabCount: number;
  orientation: 'horizontal' | 'vertical';
  activeTab: number;
  hasIcons: boolean;
  tabStyle: 'standard' | 'pills' | 'underline';
} {
  const tabs = element.querySelectorAll('[role="tab"], [class*="tab"]:not([role="tabpanel"])');
  const activeTab = Array.from(tabs).findIndex(tab =>
    tab.classList.contains('active') || tab.getAttribute('aria-selected') === 'true'
  );

  const tabList = element.querySelector('[role="tablist"], [class*="tab-list"]');
  const computedStyle = tabList ? window.getComputedStyle(tabList) : null;
  const orientation: 'horizontal' | 'vertical' =
    computedStyle?.flexDirection === 'column' ? 'vertical' : 'horizontal';

  const icons = element.querySelectorAll('i, svg, [class*="icon"]');
  const classes = Array.from(element.classList).join(' ').toLowerCase();

  let tabStyle: 'standard' | 'pills' | 'underline' = 'standard';
  if (classes.includes('pill')) tabStyle = 'pills';
  else if (classes.includes('underline') || classes.includes('border-bottom')) tabStyle = 'underline';

  return {
    tabCount: tabs.length,
    orientation,
    activeTab: activeTab >= 0 ? activeTab : 0,
    hasIcons: icons.length > 0,
    tabStyle,
  };
}

/**
 * Analyze carousel structure
 */
export function analyzeCarousel(element: Element): {
  slideCount: number;
  hasAutoplay: boolean;
  hasControls: boolean;
  hasIndicators: boolean;
  transition: 'slide' | 'fade';
  isInfinite: boolean;
} {
  const slides = element.querySelectorAll('[class*="slide"], [class*="item"]');
  const hasPrevNext = element.querySelectorAll('[class*="prev"], [class*="next"]').length >= 2;
  const indicators = element.querySelectorAll('[class*="indicator"], [class*="dot"]');

  const classes = Array.from(element.classList).join(' ').toLowerCase();
  const hasAutoplay = classes.includes('autoplay') || !!element.getAttribute('data-autoplay');
  const transition: 'slide' | 'fade' = classes.includes('fade') ? 'fade' : 'slide';
  const isInfinite = !classes.includes('no-loop') && !classes.includes('no-wrap');

  return {
    slideCount: slides.length,
    hasAutoplay,
    hasControls: hasPrevNext,
    hasIndicators: indicators.length > 0,
    transition,
    isInfinite,
  };
}

/**
 * Analyze gallery structure
 */
export function analyzeGallery(element: Element): {
  imageCount: number;
  columns: number;
  hasLightbox: boolean;
  layout: 'grid' | 'masonry' | 'justified';
  hasCaptions: boolean;
} {
  const images = element.querySelectorAll('img, picture');
  const computedStyle = window.getComputedStyle(element);

  let columns = 1;
  if (computedStyle.display === 'grid' && computedStyle.gridTemplateColumns) {
    columns = computedStyle.gridTemplateColumns.split(/\s+/).length;
  }

  const classes = Array.from(element.classList).join(' ').toLowerCase();
  let layout: 'grid' | 'masonry' | 'justified' = 'grid';
  if (classes.includes('masonry')) layout = 'masonry';
  else if (classes.includes('justified')) layout = 'justified';

  const hasLightbox = !!(
    classes.includes('lightbox') ||
    classes.includes('fancybox') ||
    element.querySelector('[data-lightbox], [data-fancybox]')
  );

  const captions = element.querySelectorAll('figcaption, [class*="caption"]');

  return {
    imageCount: images.length,
    columns,
    hasLightbox,
    layout,
    hasCaptions: captions.length > 0,
  };
}

/**
 * Analyze pricing table structure
 */
export function analyzePricingTable(element: Element): {
  planCount: number;
  hasFeaturedPlan: boolean;
  billingPeriod: 'monthly' | 'yearly' | 'both' | 'unknown';
  hasDiscounts: boolean;
  currency: string;
} {
  const plans = element.querySelectorAll('[class*="plan"], [class*="tier"], [class*="package"]');
  const featured = element.querySelector('[class*="featured"], [class*="popular"], [class*="recommended"]');

  const text = element.textContent?.toLowerCase() || '';
  let billingPeriod: 'monthly' | 'yearly' | 'both' | 'unknown' = 'unknown';
  const hasMonthly = /month|monthly|\/mo/i.test(text);
  const hasYearly = /year|yearly|annual|\/yr/i.test(text);
  if (hasMonthly && hasYearly) billingPeriod = 'both';
  else if (hasMonthly) billingPeriod = 'monthly';
  else if (hasYearly) billingPeriod = 'yearly';

  const hasDiscounts = /save|discount|off|% off/i.test(text);

  let currency = '$';
  if (text.includes('€')) currency = '€';
  else if (text.includes('£')) currency = '£';
  else if (text.includes('¥')) currency = '¥';

  return {
    planCount: plans.length,
    hasFeaturedPlan: !!featured,
    billingPeriod,
    hasDiscounts,
    currency,
  };
}

/**
 * Analyze table structure
 */
export function analyzeTable(element: Element): {
  rowCount: number;
  columnCount: number;
  hasHeader: boolean;
  hasFooter: boolean;
  isSortable: boolean;
  isResponsive: boolean;
  tableType: 'data' | 'pricing' | 'comparison' | 'standard';
} {
  const rows = element.querySelectorAll('tr, [role="row"]');
  const header = element.querySelector('thead, [role="rowgroup"]:first-child');
  const footer = element.querySelector('tfoot');

  let columnCount = 0;
  const firstRow = element.querySelector('tr, [role="row"]');
  if (firstRow) {
    columnCount = firstRow.querySelectorAll('td, th, [role="cell"], [role="columnheader"]').length;
  }

  const classes = Array.from(element.classList).join(' ').toLowerCase();
  const isSortable = !!(
    classes.includes('sortable') ||
    element.querySelector('[class*="sort"]') ||
    element.querySelector('th[data-sort]')
  );

  const isResponsive = !!(
    classes.includes('responsive') ||
    classes.includes('table-responsive') ||
    element.closest('.table-responsive')
  );

  let tableType: 'data' | 'pricing' | 'comparison' | 'standard' = 'standard';
  const text = element.textContent?.toLowerCase() || '';
  if (classes.includes('pricing') || /\$|€|£|\d+\/month/.test(text)) tableType = 'pricing';
  else if (classes.includes('comparison') || classes.includes('compare')) tableType = 'comparison';
  else if (isSortable || classes.includes('data')) tableType = 'data';

  return {
    rowCount: rows.length,
    columnCount,
    hasHeader: !!header,
    hasFooter: !!footer,
    isSortable,
    isResponsive,
    tableType,
  };
}

/**
 * Analyze progress bar
 */
export function analyzeProgressBar(element: Element): {
  value: number;
  max: number;
  percentage: number;
  hasLabel: boolean;
  isAnimated: boolean;
  variant: 'standard' | 'striped' | 'gradient';
  color?: string;
} {
  const progressEl = element.tagName.toLowerCase() === 'progress' ? element : element.querySelector('progress');

  let value = 0;
  let max = 100;

  if (progressEl) {
    value = parseFloat(progressEl.getAttribute('value') || '0');
    max = parseFloat(progressEl.getAttribute('max') || '100');
  } else {
    const valueAttr = element.getAttribute('aria-valuenow') || element.getAttribute('data-value');
    const maxAttr = element.getAttribute('aria-valuemax') || element.getAttribute('data-max');
    value = parseFloat(valueAttr || '0');
    max = parseFloat(maxAttr || '100');
  }

  const percentage = max > 0 ? (value / max) * 100 : 0;
  const hasLabel = !!(element.querySelector('[class*="label"]') || element.textContent?.trim());

  const classes = Array.from(element.classList).join(' ').toLowerCase();
  const isAnimated = classes.includes('animated') || classes.includes('progress-bar-animated');

  let variant: 'standard' | 'striped' | 'gradient' = 'standard';
  if (classes.includes('striped')) variant = 'striped';
  else if (classes.includes('gradient')) variant = 'gradient';

  const computedStyle = window.getComputedStyle(element);
  const color = computedStyle.backgroundColor;

  return {
    value,
    max,
    percentage: Math.round(percentage),
    hasLabel,
    isAnimated,
    variant,
    color,
  };
}
