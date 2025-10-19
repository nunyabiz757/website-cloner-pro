/**
 * Specialized Widget Helpers
 *
 * Helper functions for creating complex widgets:
 * - Icon widgets & icon lists
 * - Gallery widgets (grid, masonry, carousel)
 * - Carousel/Slider widgets
 * - Testimonial widgets
 * - Pricing table widgets
 * - Progress bar widgets
 * - Counter widgets
 */

import type { ComponentInfo } from '../types/builder.types.js';

/**
 * Icon widget configuration
 */
export interface IconWidget {
  icon: string; // Icon class or SVG path
  iconLibrary: 'fontawesome' | 'dashicons' | 'material' | 'svg' | 'custom';
  size: number; // Icon size in px
  color: string;
  hoverColor?: string;
  link?: string;
  linkTarget?: '_self' | '_blank';
  alignment?: 'left' | 'center' | 'right';
  rotation?: number; // degrees
  spacing?: {
    top?: number;
    right?: number;
    bottom?: number;
    left?: number;
  };
}

/**
 * Icon list widget configuration
 */
export interface IconListWidget {
  items: IconListItem[];
  layout: 'vertical' | 'horizontal';
  iconPosition: 'left' | 'right' | 'top';
  spacing: number;
  divider?: boolean;
}

export interface IconListItem {
  icon: string;
  iconLibrary: string;
  text: string;
  link?: string;
  iconColor?: string;
}

/**
 * Gallery widget configuration
 */
export interface GalleryWidget {
  images: GalleryImage[];
  layout: 'grid' | 'masonry' | 'justified' | 'carousel';
  columns: number | { mobile: number; tablet: number; desktop: number };
  gap: number;
  aspectRatio?: string; // '16:9', '4:3', '1:1', 'auto'
  lightbox?: boolean;
  captions?: boolean;
  hoverEffect?: 'zoom' | 'fade' | 'slide' | 'none';
  lazyLoad?: boolean;
}

export interface GalleryImage {
  url: string;
  thumbnail?: string;
  alt: string;
  title?: string;
  caption?: string;
  link?: string;
  width?: number;
  height?: number;
}

/**
 * Carousel/Slider widget configuration
 */
export interface CarouselWidget {
  slides: CarouselSlide[];
  autoplay?: boolean;
  autoplaySpeed?: number; // ms
  pauseOnHover?: boolean;
  infinite?: boolean;
  arrows?: boolean;
  dots?: boolean;
  slidesToShow?: number | { mobile: number; tablet: number; desktop: number };
  slidesToScroll?: number;
  effect?: 'slide' | 'fade' | 'cube' | 'coverflow';
  direction?: 'horizontal' | 'vertical';
  speed?: number; // transition speed in ms
}

export interface CarouselSlide {
  type: 'image' | 'content';
  image?: string;
  title?: string;
  subtitle?: string;
  content?: string;
  link?: string;
  linkText?: string;
}

/**
 * Testimonial widget configuration
 */
export interface TestimonialWidget {
  testimonials: Testimonial[];
  layout: 'single' | 'grid' | 'carousel';
  showImage?: boolean;
  showRating?: boolean;
  showDate?: boolean;
  imageShape?: 'circle' | 'square' | 'rounded';
  alignment?: 'left' | 'center' | 'right';
}

export interface Testimonial {
  content: string;
  authorName: string;
  authorTitle?: string;
  authorImage?: string;
  rating?: number; // 1-5
  date?: string;
  companyLogo?: string;
}

/**
 * Pricing table widget configuration
 */
export interface PricingTableWidget {
  plans: PricingPlan[];
  layout: 'columns' | 'toggle';
  currency: string;
  currencyPosition: 'before' | 'after';
  period?: string; // '/month', '/year', etc.
  highlightPlan?: number; // index of featured plan
}

export interface PricingPlan {
  title: string;
  price: number;
  period?: string;
  features: PricingFeature[];
  buttonText: string;
  buttonLink: string;
  ribbon?: string; // 'Popular', 'Best Value', etc.
  highlighted?: boolean;
}

export interface PricingFeature {
  text: string;
  included: boolean;
  tooltip?: string;
}

/**
 * Progress bar widget configuration
 */
export interface ProgressBarWidget {
  bars: ProgressBar[];
  style: 'line' | 'circle' | 'semi-circle';
  showPercentage?: boolean;
  animated?: boolean;
  color?: string;
  backgroundColor?: string;
}

export interface ProgressBar {
  title: string;
  percentage: number;
  color?: string;
}

/**
 * Counter widget configuration
 */
export interface CounterWidget {
  startValue: number;
  endValue: number;
  duration: number; // animation duration in ms
  prefix?: string;
  suffix?: string;
  separator?: string; // thousands separator
  decimals?: number;
  title?: string;
  icon?: string;
}

/**
 * Detect and extract icon widget from component
 */
export function extractIconWidget(component: ComponentInfo): IconWidget | undefined {
  const icon = detectIcon(component);
  if (!icon) return undefined;

  return {
    icon: icon.value,
    iconLibrary: icon.library,
    size: parseInt(component.styles?.fontSize?.toString() || '24'),
    color: component.styles?.color?.toString() || '#000',
    hoverColor: component.advancedAnalysis?.interactiveStates?.hover?.color?.toString(),
    link: component.attributes?.href,
    linkTarget: component.attributes?.target as any,
    alignment: (component.styles?.textAlign as any) || 'left',
    rotation: extractRotation(component.styles?.transform),
  };
}

/**
 * Detect icon from component
 */
function detectIcon(component: ComponentInfo): { value: string; library: string } | undefined {
  const classes = component.className || '';

  // FontAwesome
  if (classes.includes('fa-') || classes.includes('fas ') || classes.includes('far ') || classes.includes('fab ')) {
    const iconMatch = classes.match(/fa-[\w-]+/);
    if (iconMatch) {
      return { value: iconMatch[0], library: 'fontawesome' };
    }
  }

  // Dashicons
  if (classes.includes('dashicons-')) {
    const iconMatch = classes.match(/dashicons-[\w-]+/);
    if (iconMatch) {
      return { value: iconMatch[0], library: 'dashicons' };
    }
  }

  // Material Icons
  if (classes.includes('material-icons')) {
    return { value: component.textContent || 'icon', library: 'material' };
  }

  // SVG
  if (component.tagName === 'svg') {
    return { value: component.innerHTML || '', library: 'svg' };
  }

  return undefined;
}

/**
 * Extract rotation from transform
 */
function extractRotation(transform: any): number {
  if (!transform) return 0;

  const transformStr = transform.toString();
  const rotateMatch = transformStr.match(/rotate\(([-\d.]+)deg\)/);
  if (rotateMatch) {
    return parseFloat(rotateMatch[1]);
  }

  return 0;
}

/**
 * Detect and extract icon list widget from component
 */
export function extractIconListWidget(component: ComponentInfo): IconListWidget | undefined {
  if (!component.children || component.children.length === 0) return undefined;

  // Check if children contain icons
  const items: IconListItem[] = [];

  for (const child of component.children) {
    const icon = detectIcon(child);
    if (icon) {
      items.push({
        icon: icon.value,
        iconLibrary: icon.library,
        text: child.textContent || '',
        link: child.attributes?.href,
        iconColor: child.styles?.color?.toString(),
      });
    }
  }

  if (items.length === 0) return undefined;

  return {
    items,
    layout: isHorizontalLayout(component) ? 'horizontal' : 'vertical',
    iconPosition: 'left',
    spacing: 10,
    divider: false,
  };
}

/**
 * Detect and extract gallery widget from component
 */
export function extractGalleryWidget(component: ComponentInfo): GalleryWidget | undefined {
  const images = extractImages(component);
  if (images.length < 2) return undefined; // Not a gallery if less than 2 images

  const layout = detectGalleryLayout(component);
  const columns = detectColumns(component);

  return {
    images,
    layout,
    columns,
    gap: parseInt(component.styles?.gap?.toString() || '10'),
    aspectRatio: 'auto',
    lightbox: true,
    captions: images.some(img => img.caption),
    hoverEffect: detectHoverEffect(component),
    lazyLoad: true,
  };
}

/**
 * Extract images from component
 */
function extractImages(component: ComponentInfo): GalleryImage[] {
  const images: GalleryImage[] = [];

  // Direct image
  if (component.tagName === 'img') {
    images.push({
      url: component.attributes?.src || '',
      alt: component.attributes?.alt || '',
      title: component.attributes?.title,
      width: parseInt(component.attributes?.width?.toString() || '0'),
      height: parseInt(component.attributes?.height?.toString() || '0'),
    });
  }

  // Find child images
  if (component.children) {
    for (const child of component.children) {
      if (child.tagName === 'img') {
        images.push({
          url: child.attributes?.src || '',
          alt: child.attributes?.alt || '',
          title: child.attributes?.title,
          caption: extractCaption(child),
          width: parseInt(child.attributes?.width?.toString() || '0'),
          height: parseInt(child.attributes?.height?.toString() || '0'),
        });
      } else {
        // Recursively search
        images.push(...extractImages(child));
      }
    }
  }

  return images;
}

/**
 * Extract caption from image element
 */
function extractCaption(imageComponent: ComponentInfo): string | undefined {
  // Look for figcaption sibling or parent
  const parent = imageComponent.context;
  // This is simplified - in reality you'd traverse the tree
  return undefined;
}

/**
 * Detect gallery layout
 */
function detectGalleryLayout(component: ComponentInfo): 'grid' | 'masonry' | 'justified' | 'carousel' {
  const classes = component.className || '';

  if (classes.includes('masonry')) return 'masonry';
  if (classes.includes('justified')) return 'justified';
  if (classes.includes('carousel') || classes.includes('slider')) return 'carousel';

  return 'grid';
}

/**
 * Detect columns
 */
function detectColumns(component: ComponentInfo): number | { mobile: number; tablet: number; desktop: number } {
  const gridColumns = component.styles?.gridTemplateColumns;

  if (gridColumns) {
    const columnCount = gridColumns.toString().split(' ').length;
    return columnCount;
  }

  // Check for responsive column classes
  const classes = component.className || '';
  const colMatch = classes.match(/col-(\d+)/);

  if (colMatch) {
    return parseInt(colMatch[1]);
  }

  return { mobile: 1, tablet: 2, desktop: 3 };
}

/**
 * Detect hover effect
 */
function detectHoverEffect(component: ComponentInfo): 'zoom' | 'fade' | 'slide' | 'none' {
  const hover = component.advancedAnalysis?.interactiveStates?.hover;

  if (!hover) return 'none';

  if (hover.transform?.includes('scale')) return 'zoom';
  if (hover.opacity !== component.styles?.opacity) return 'fade';
  if (hover.transform?.includes('translate')) return 'slide';

  return 'none';
}

/**
 * Detect if layout is horizontal
 */
function isHorizontalLayout(component: ComponentInfo): boolean {
  return component.styles?.flexDirection === 'row' ||
         component.styles?.display === 'inline-flex' ||
         (component.className || '').includes('horizontal');
}

/**
 * Detect and extract carousel widget from component
 */
export function extractCarouselWidget(component: ComponentInfo): CarouselWidget | undefined {
  const classes = component.className || '';

  if (!classes.includes('carousel') && !classes.includes('slider') && !classes.includes('swiper')) {
    return undefined;
  }

  const slides = extractSlides(component);
  if (slides.length === 0) return undefined;

  return {
    slides,
    autoplay: true,
    autoplaySpeed: 3000,
    pauseOnHover: true,
    infinite: true,
    arrows: true,
    dots: true,
    slidesToShow: 1,
    slidesToScroll: 1,
    effect: 'slide',
    direction: 'horizontal',
    speed: 300,
  };
}

/**
 * Extract slides from carousel component
 */
function extractSlides(component: ComponentInfo): CarouselSlide[] {
  const slides: CarouselSlide[] = [];

  if (!component.children) return slides;

  for (const child of component.children) {
    const images = extractImages(child);

    slides.push({
      type: images.length > 0 ? 'image' : 'content',
      image: images[0]?.url,
      title: extractTitle(child),
      subtitle: extractSubtitle(child),
      content: child.textContent,
      link: child.attributes?.href,
    });
  }

  return slides;
}

/**
 * Extract title from component
 */
function extractTitle(component: ComponentInfo): string | undefined {
  // Look for heading elements
  if (component.tagName?.match(/^h[1-6]$/)) {
    return component.textContent;
  }

  // Look in children
  if (component.children) {
    for (const child of component.children) {
      if (child.tagName?.match(/^h[1-6]$/)) {
        return child.textContent;
      }
    }
  }

  return undefined;
}

/**
 * Extract subtitle from component
 */
function extractSubtitle(component: ComponentInfo): string | undefined {
  // Look for subtitle classes
  if (component.className?.includes('subtitle') || component.className?.includes('sub-title')) {
    return component.textContent;
  }

  // Look in children
  if (component.children) {
    for (const child of component.children) {
      if (child.className?.includes('subtitle') || child.className?.includes('sub-title')) {
        return child.textContent;
      }
    }
  }

  return undefined;
}

/**
 * Detect and extract testimonial widget from component
 */
export function extractTestimonialWidget(component: ComponentInfo): TestimonialWidget | undefined {
  const classes = component.className || '';

  if (!classes.includes('testimonial') && !classes.includes('review')) {
    return undefined;
  }

  const testimonials = extractTestimonials(component);
  if (testimonials.length === 0) return undefined;

  return {
    testimonials,
    layout: testimonials.length === 1 ? 'single' : 'grid',
    showImage: testimonials.some(t => t.authorImage),
    showRating: testimonials.some(t => t.rating !== undefined),
    showDate: testimonials.some(t => t.date !== undefined),
    imageShape: 'circle',
    alignment: 'center',
  };
}

/**
 * Extract testimonials from component
 */
function extractTestimonials(component: ComponentInfo): Testimonial[] {
  const testimonials: Testimonial[] = [];

  // Single testimonial
  if (component.className?.includes('testimonial-item')) {
    const testimonial = extractSingleTestimonial(component);
    if (testimonial) testimonials.push(testimonial);
  }

  // Multiple testimonials in children
  if (component.children) {
    for (const child of component.children) {
      if (child.className?.includes('testimonial-item') || child.className?.includes('review-item')) {
        const testimonial = extractSingleTestimonial(child);
        if (testimonial) testimonials.push(testimonial);
      }
    }
  }

  return testimonials;
}

/**
 * Extract single testimonial
 */
function extractSingleTestimonial(component: ComponentInfo): Testimonial | undefined {
  return {
    content: component.textContent || '',
    authorName: 'Author Name',
    authorTitle: undefined,
    authorImage: extractImages(component)[0]?.url,
    rating: extractRating(component),
  };
}

/**
 * Extract rating from component
 */
function extractRating(component: ComponentInfo): number | undefined {
  const classes = component.className || '';
  const ratingMatch = classes.match(/rating-(\d)/);

  if (ratingMatch) {
    return parseInt(ratingMatch[1]);
  }

  // Look for star elements
  if (component.children) {
    const stars = component.children.filter(child =>
      child.className?.includes('star') || child.className?.includes('rating')
    );

    if (stars.length > 0) {
      return Math.min(stars.length, 5);
    }
  }

  return undefined;
}

/**
 * Detect and extract pricing table widget from component
 */
export function extractPricingTableWidget(component: ComponentInfo): PricingTableWidget | undefined {
  const classes = component.className || '';

  if (!classes.includes('pricing') && !classes.includes('plan')) {
    return undefined;
  }

  const plans = extractPricingPlans(component);
  if (plans.length === 0) return undefined;

  return {
    plans,
    layout: 'columns',
    currency: '$',
    currencyPosition: 'before',
    period: '/month',
    highlightPlan: plans.findIndex(p => p.highlighted),
  };
}

/**
 * Extract pricing plans from component
 */
function extractPricingPlans(component: ComponentInfo): PricingPlan[] {
  const plans: PricingPlan[] = [];

  if (!component.children) return plans;

  for (const child of component.children) {
    if (child.className?.includes('pricing-plan') || child.className?.includes('plan-card')) {
      const plan = extractSinglePricingPlan(child);
      if (plan) plans.push(plan);
    }
  }

  return plans;
}

/**
 * Extract single pricing plan
 */
function extractSinglePricingPlan(component: ComponentInfo): PricingPlan | undefined {
  return {
    title: extractTitle(component) || 'Plan Name',
    price: 0,
    features: [],
    buttonText: 'Get Started',
    buttonLink: '#',
    highlighted: component.className?.includes('featured') || component.className?.includes('highlighted'),
  };
}
