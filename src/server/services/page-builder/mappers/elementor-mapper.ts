/**
 * Elementor Widget Mapper
 *
 * Maps recognized components to Elementor widget configurations
 */

import {
  ComponentType,
  ExtractedStyles,
  ComponentProps,
  RecognizedComponent,
} from '../types/component.types.js';
import { ElementorWidget, PropertyMapping } from '../types/builder.types.js';
import { parsePixels } from '../analyzer/style-extractor.js';

// Import new widget mappers
import IconBoxMapper from '../exporters/elementor/widgets/icon-box.mapper.js';
import StarRatingMapper from '../exporters/elementor/widgets/star-rating.mapper.js';
import SocialIconsMapper from '../exporters/elementor/widgets/social-icons.mapper.js';
import ProgressBarMapper from '../exporters/elementor/widgets/progress-bar.mapper.js';
import CounterMapper from '../exporters/elementor/widgets/counter.mapper.js';
import TestimonialMapper from '../exporters/elementor/widgets/testimonial.mapper.js';
import ImageCarouselMapper from '../exporters/elementor/widgets/image-carousel.mapper.js';
import PostsGridMapper from '../exporters/elementor/widgets/posts-grid.mapper.js';
import CallToActionMapper from '../exporters/elementor/widgets/call-to-action.mapper.js';
import PriceListMapper from '../exporters/elementor/widgets/price-list.mapper.js';
import AlertMapper from '../exporters/elementor/widgets/alert.mapper.js';
import TabsMapper from '../exporters/elementor/widgets/tabs.mapper.js';
import ToggleMapper from '../exporters/elementor/widgets/toggle.mapper.js';
import FlipBoxMapper from '../exporters/elementor/widgets/flip-box.mapper.js';
import PriceTableMapper from '../exporters/elementor/widgets/price-table.mapper.js';
import ImageGalleryMapper from '../exporters/elementor/widgets/image-gallery.mapper.js';
import VideoPlaylistMapper from '../exporters/elementor/widgets/video-playlist.mapper.js';

/**
 * Elementor Widget Type Mappings
 */
const ELEMENTOR_MAPPINGS: Record<ComponentType, PropertyMapping> = {
  button: {
    widgetType: 'button',
    propertyMap: {
      textContent: 'text',
      href: 'link.url',
      backgroundColor: 'button_background_color',
      color: 'button_text_color',
      fontSize: 'typography_font_size.size',
      fontFamily: 'typography_font_family',
      fontWeight: 'typography_font_weight',
      textAlign: 'align',
      borderRadius: 'border_radius.size',
      padding: 'button_padding',
    },
    defaultSettings: {
      button_type: 'primary',
      size: 'md',
    },
  },

  heading: {
    widgetType: 'heading',
    propertyMap: {
      textContent: 'title',
      tagName: 'header_size',
      color: 'title_color',
      fontSize: 'typography_font_size.size',
      fontFamily: 'typography_font_family',
      fontWeight: 'typography_font_weight',
      lineHeight: 'typography_line_height.size',
      letterSpacing: 'typography_letter_spacing.size',
      textAlign: 'align',
      textTransform: 'typography_text_transform',
    },
  },

  text: {
    widgetType: 'text-editor',
    propertyMap: {
      innerHTML: 'editor',
      color: 'text_color',
      fontSize: 'typography_font_size.size',
      fontFamily: 'typography_font_family',
      textAlign: 'align',
    },
  },

  paragraph: {
    widgetType: 'text-editor',
    propertyMap: {
      innerHTML: 'editor',
      color: 'text_color',
      fontSize: 'typography_font_size.size',
      fontFamily: 'typography_font_family',
      textAlign: 'align',
    },
  },

  image: {
    widgetType: 'image',
    propertyMap: {
      src: 'image.url',
      alt: 'image_alt',
      width: 'image_size',
      href: 'link.url',
      borderRadius: 'image_border_radius.size',
      objectFit: 'object_fit',
    },
  },

  icon: {
    widgetType: 'icon',
    propertyMap: {
      iconClass: 'icon',
      color: 'primary_color',
      fontSize: 'size.size',
      href: 'link.url',
    },
  },

  spacer: {
    widgetType: 'spacer',
    propertyMap: {
      height: 'space.size',
    },
  },

  divider: {
    widgetType: 'divider',
    propertyMap: {
      borderColor: 'color',
      borderWidth: 'weight.size',
      borderStyle: 'style',
      width: 'width.size',
    },
  },

  // Fallback for unknown components
  unknown: {
    widgetType: 'html',
    propertyMap: {
      innerHTML: 'html',
    },
  },
} as any;

/**
 * Map component to Elementor widget
 */
export function mapToElementorWidget(
  component: RecognizedComponent,
  index: number = 0
): ElementorWidget {
  // Use specialized mappers for new widgets
  switch (component.componentType) {
    case 'icon-box':
      return IconBoxMapper.mapToElementor(component);
    case 'star-rating':
      return StarRatingMapper.mapToElementor(component);
    case 'social-icons':
      return SocialIconsMapper.mapToElementor(component);
    case 'progress-bar':
    case 'progress':
      return ProgressBarMapper.mapToElementor(component);
    case 'counter':
      return CounterMapper.mapToElementor(component);
    case 'testimonial':
      return TestimonialMapper.mapToElementor(component);
    case 'image-carousel':
    case 'carousel':
    case 'slider':
      return ImageCarouselMapper.mapToElementor(component);
    case 'posts-grid':
    case 'posts':
    case 'blog-grid':
      return PostsGridMapper.mapToElementor(component);
    case 'call-to-action':
    case 'cta':
      return CallToActionMapper.mapToElementor(component);
    case 'price-list':
      return PriceListMapper.mapToElementor(component);
    case 'alert':
      return AlertMapper.mapToElementor(component);
    case 'tabs':
      return TabsMapper.mapToElementor(component);
    case 'toggle':
    case 'accordion':
      return ToggleMapper.mapToElementor(component);
    case 'flip-box':
    case 'flipbox':
      return FlipBoxMapper.mapToElementor(component);
    case 'price-table':
    case 'pricing-table':
      return PriceTableMapper.mapToElementor(component);
    case 'image-gallery':
    case 'gallery':
      return ImageGalleryMapper.mapToElementor(component);
    case 'video-playlist':
    case 'playlist':
      return VideoPlaylistMapper.mapToElementor(component);
  }

  // Use legacy mapping for older widgets
  const mapping = ELEMENTOR_MAPPINGS[component.componentType] || ELEMENTOR_MAPPINGS.unknown;

  const settings: Record<string, any> = {
    ...mapping.defaultSettings,
  };

  // Map properties
  for (const [sourceKey, targetKey] of Object.entries(mapping.propertyMap)) {
    let value: any;

    // Get value from component props or styles
    if (component.props[sourceKey] !== undefined) {
      value = component.props[sourceKey];
    } else if (component.element.styles[sourceKey as keyof ExtractedStyles] !== undefined) {
      value = component.element.styles[sourceKey as keyof ExtractedStyles];
    }

    if (value === undefined) continue;

    // Map to Elementor format
    const mappedValue = mapValue(sourceKey, value, component);
    setNestedProperty(settings, targetKey, mappedValue);
  }

  // Component-specific mapping for legacy widgets
  switch (component.componentType) {
    case 'button':
      mapButtonSpecific(settings, component);
      break;
    case 'heading':
      mapHeadingSpecific(settings, component);
      break;
    case 'image':
      mapImageSpecific(settings, component);
      break;
  }

  return {
    id: generateElementorId(),
    elType: 'widget',
    widgetType: mapping.widgetType,
    settings,
  };
}

/**
 * Map button-specific properties
 */
function mapButtonSpecific(settings: Record<string, any>, component: RecognizedComponent): void {
  const styles = component.element.styles;

  // Map padding
  if (styles.padding) {
    settings.button_padding = {
      top: parsePixels(styles.padding.top),
      right: parsePixels(styles.padding.right),
      bottom: parsePixels(styles.padding.bottom),
      left: parsePixels(styles.padding.left),
      unit: 'px',
      isLinked: false,
    };
  }

  // Map border radius
  if (styles.borderRadius) {
    const radius = parsePixels(styles.borderRadius.topLeft);
    settings.border_radius = {
      size: radius,
      unit: 'px',
    };
  }

  // Map typography
  if (styles.fontSize) {
    settings.typography_font_size = {
      size: parsePixels(styles.fontSize),
      unit: 'px',
    };
  }

  // Map link
  if (component.props.href) {
    settings.link = {
      url: component.props.href,
      is_external: component.props.target === '_blank' ? 'on' : '',
      nofollow: '',
    };
  }

  // Map text
  if (component.props.textContent) {
    settings.text = component.props.textContent;
  }
}

/**
 * Map heading-specific properties
 */
function mapHeadingSpecific(settings: Record<string, any>, component: RecognizedComponent): void {
  const styles = component.element.styles;

  // Map heading tag
  const tagName = component.element.tagName.toLowerCase();
  if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tagName)) {
    settings.header_size = tagName;
  } else {
    settings.header_size = 'h2'; // Default
  }

  // Map title
  settings.title = component.props.textContent || component.element.textContent;

  // Map typography
  if (styles.fontSize) {
    settings.typography_font_size = {
      size: parsePixels(styles.fontSize),
      unit: 'px',
    };
  }

  if (styles.lineHeight) {
    settings.typography_line_height = {
      size: parseFloat(styles.lineHeight),
      unit: '',
    };
  }

  if (styles.letterSpacing) {
    settings.typography_letter_spacing = {
      size: parsePixels(styles.letterSpacing),
      unit: 'px',
    };
  }

  // Map alignment
  if (styles.textAlign) {
    settings.align = styles.textAlign;
  }
}

/**
 * Map image-specific properties
 */
function mapImageSpecific(settings: Record<string, any>, component: RecognizedComponent): void {
  const styles = component.element.styles;

  // Map image source
  if (component.props.src) {
    settings.image = {
      url: component.props.src,
      id: '',
    };
    settings.image_alt = component.props.alt || '';
  } else if (styles.backgroundImage) {
    // Background image
    settings.image = {
      url: styles.backgroundImage,
      id: '',
    };
  }

  // Map image size
  if (styles.width) {
    settings.image_size = 'custom';
    settings.image_custom_dimension = {
      width: parsePixels(styles.width),
      height: parsePixels(styles.height || '0'),
    };
  }

  // Map border radius
  if (styles.borderRadius) {
    settings.image_border_radius = {
      size: parsePixels(styles.borderRadius.topLeft),
      unit: 'px',
    };
  }

  // Map link
  if (component.props.href) {
    settings.link = {
      url: component.props.href,
      is_external: component.props.target === '_blank' ? 'on' : '',
    };
  }
}

/**
 * Map value to Elementor format
 */
function mapValue(key: string, value: any, component: RecognizedComponent): any {
  // Handle special cases
  if (key === 'innerHTML' || key === 'textContent') {
    return value;
  }

  if (key === 'fontSize' || key === 'width' || key === 'height') {
    return parsePixels(value);
  }

  if (key === 'fontWeight') {
    return value;
  }

  if (key === 'borderRadius' && typeof value === 'object') {
    return parsePixels(value.topLeft);
  }

  return value;
}

/**
 * Set nested property using dot notation
 */
function setNestedProperty(obj: any, path: string, value: any): void {
  const keys = path.split('.');
  let current = obj;

  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    if (!(key in current)) {
      current[key] = {};
    }
    current = current[key];
  }

  current[keys[keys.length - 1]] = value;
}

/**
 * Generate unique Elementor element ID
 */
let elementorIdCounter = 1000;
function generateElementorId(): string {
  return (elementorIdCounter++).toString(16);
}
