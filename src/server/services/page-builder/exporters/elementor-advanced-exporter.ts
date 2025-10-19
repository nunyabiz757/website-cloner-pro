/**
 * Advanced Elementor Exporter
 *
 * Exports components to Elementor with advanced features:
 * - Icon picker support
 * - Gallery widgets
 * - Slider/carousel widgets
 * - Responsive settings
 * - Hover effects
 * - Motion effects and animations
 * - Custom CSS per element
 * - Global colors and fonts
 * - Dynamic content placeholders
 */

import type {
  ElementorExport,
  ElementorSection,
  ElementorColumn,
  ElementorWidget,
  ElementorWidgetSettings,
  ElementorPageSettings,
  DimensionValue,
  MediaValue,
  IconValue,
  GalleryValue,
  MotionEffectsSettings,
  HoverSettings,
} from '../types/builder.types.js';
import type {
  ExtractedStyles,
  ResponsiveStyles,
  StylesWithStates,
  BehavioralAnalysis,
  AdvancedElementAnalysis,
} from '../types/component.types.js';

/**
 * Global colors registry
 */
const globalColors: Map<string, { id: string; title: string; color: string }> = new Map();

/**
 * Global fonts registry
 */
const globalFonts: Map<string, { id: string; title: string; fontFamily: string; fontWeight: string }> = new Map();

/**
 * Generate unique ID
 */
let idCounter = 1000;
function generateId(): string {
  return (idCounter++).toString(16);
}

/**
 * Register global color
 */
export function registerGlobalColor(color: string, title: string = 'Primary'): string {
  if (!color) return '';

  // Check if color already exists
  for (const [id, data] of globalColors.entries()) {
    if (data.color === color) {
      return id;
    }
  }

  // Create new global color
  const id = `color_${generateId()}`;
  globalColors.set(id, {
    id,
    title,
    color,
  });

  return id;
}

/**
 * Register global font
 */
export function registerGlobalFont(fontFamily: string, fontWeight: string = '400', title?: string): string {
  if (!fontFamily) return '';

  const key = `${fontFamily}_${fontWeight}`;

  // Check if font already exists
  for (const [id, data] of globalFonts.entries()) {
    if (data.fontFamily === fontFamily && data.fontWeight === fontWeight) {
      return id;
    }
  }

  // Create new global font
  const id = `font_${generateId()}`;
  globalFonts.set(id, {
    id,
    title: title || fontFamily,
    fontFamily,
    fontWeight,
  });

  return id;
}

/**
 * Parse dimension from CSS value
 */
function parseDimension(cssValue: string | undefined): DimensionValue | undefined {
  if (!cssValue) return undefined;

  // Handle BoxSpacing object
  if (typeof cssValue === 'object' && 'top' in cssValue) {
    return {
      top: parseInt(cssValue.top) || 0,
      right: parseInt(cssValue.right) || 0,
      bottom: parseInt(cssValue.bottom) || 0,
      left: parseInt(cssValue.left) || 0,
      unit: 'px',
      isLinked: false,
    };
  }

  // Handle simple values like "10px" or "1em"
  const match = cssValue.match(/^(\d+(?:\.\d+)?)(px|em|%|vh|vw)?$/);
  if (match) {
    const value = parseFloat(match[1]);
    const unit = (match[2] || 'px') as 'px' | 'em' | '%' | 'vh' | 'vw';

    return {
      top: value,
      right: value,
      bottom: value,
      left: value,
      unit,
      isLinked: true,
    };
  }

  // Handle complex values like "10px 20px 30px 40px"
  const parts = cssValue.split(/\s+/);
  if (parts.length > 0) {
    const values = parts.map(p => parseInt(p) || 0);
    return {
      top: values[0] || 0,
      right: values[1] || values[0] || 0,
      bottom: values[2] || values[0] || 0,
      left: values[3] || values[1] || values[0] || 0,
      unit: 'px',
      isLinked: false,
    };
  }

  return undefined;
}

/**
 * Extract responsive settings from responsive styles
 */
function extractResponsiveSettings(
  responsiveStyles?: ResponsiveStyles
): {
  desktop?: Partial<ElementorWidgetSettings>;
  tablet?: Partial<ElementorWidgetSettings>;
  mobile?: Partial<ElementorWidgetSettings>;
} {
  if (!responsiveStyles) return {};

  const result: {
    desktop?: Partial<ElementorWidgetSettings>;
    tablet?: Partial<ElementorWidgetSettings>;
    mobile?: Partial<ElementorWidgetSettings>;
  } = {};

  // Desktop (default)
  if (responsiveStyles.desktop) {
    result.desktop = {
      _padding: parseDimension(responsiveStyles.desktop.padding as any),
      _margin: parseDimension(responsiveStyles.desktop.margin as any),
    };
  }

  // Tablet
  if (responsiveStyles.tablet) {
    result.tablet = {
      _padding_tablet: parseDimension(responsiveStyles.tablet.padding as any),
      _margin_tablet: parseDimension(responsiveStyles.tablet.margin as any),
      hide_tablet: responsiveStyles.tablet.display === 'none' ? 'yes' : '',
    };
  }

  // Mobile
  if (responsiveStyles.mobile) {
    result.mobile = {
      _padding_mobile: parseDimension(responsiveStyles.mobile.padding as any),
      _margin_mobile: parseDimension(responsiveStyles.mobile.margin as any),
      hide_mobile: responsiveStyles.mobile.display === 'none' ? 'yes' : '',
    };
  }

  return result;
}

/**
 * Extract hover effects from interactive states
 */
function extractHoverEffects(interactiveStates?: StylesWithStates): HoverSettings {
  if (!interactiveStates?.hover) return {};

  const settings: HoverSettings = {};

  // Detect hover animation type
  const hoverStyles = interactiveStates.hover;

  if (hoverStyles.transform) {
    if (hoverStyles.transform.includes('scale')) {
      settings._hover_animation = 'grow';
    } else if (hoverStyles.transform.includes('translateY')) {
      settings._hover_animation = 'float';
    } else if (hoverStyles.transform.includes('rotate')) {
      settings._hover_animation = 'rotate';
    }
  }

  // Extract transition duration
  if (hoverStyles.transition) {
    const match = hoverStyles.transition.match(/(\d+(?:\.\d+)?)(s|ms)/);
    if (match) {
      const value = parseFloat(match[1]);
      const unit = match[2];
      settings.hover_transition_duration = {
        size: unit === 's' ? value * 1000 : value,
        unit: 'ms',
      };
    }
  }

  return settings;
}

/**
 * Extract motion effects from behavioral analysis
 */
function extractMotionEffects(behavior?: BehavioralAnalysis): MotionEffectsSettings {
  if (!behavior || !behavior.hasAnimations) return {};

  const settings: MotionEffectsSettings = {};

  // Check for scroll-based animations
  const animations = behavior.animations || [];
  const hasScrollAnimation = animations.some(
    anim => anim.name.includes('fade') || anim.name.includes('slide')
  );

  if (hasScrollAnimation) {
    settings.motion_fx_motion_fx_scrolling = 'yes';

    // Detect animation type
    const fadeAnim = animations.find(a => a.name.includes('fade'));
    if (fadeAnim) {
      settings.motion_fx_opacity_effect = 'yes';
      settings.motion_fx_opacity_level = { size: 0.5 };
    }

    const slideAnim = animations.find(a => a.name.includes('slide') || a.name.includes('translate'));
    if (slideAnim) {
      settings.motion_fx_translateY_effect = 'yes';
      settings.motion_fx_translateY_direction = 'down';
      settings.motion_fx_translateY_speed = { size: 0.5 };
    }
  }

  return settings;
}

/**
 * Extract animation settings
 */
function extractAnimationSettings(behavior?: BehavioralAnalysis): {
  _animation?: string;
  animation_duration?: number;
  _animation_delay?: number;
} {
  if (!behavior || !behavior.hasAnimations) return {};

  const animations = behavior.animations || [];
  if (animations.length === 0) return {};

  const firstAnim = animations[0];

  // Map CSS animation names to Elementor animation classes
  const animationMap: Record<string, string> = {
    'fadeIn': 'fadeIn',
    'fadeInUp': 'fadeInUp',
    'fadeInDown': 'fadeInDown',
    'fadeInLeft': 'fadeInLeft',
    'fadeInRight': 'fadeInRight',
    'slideInUp': 'slideInUp',
    'slideInDown': 'slideInDown',
    'slideInLeft': 'slideInLeft',
    'slideInRight': 'slideInRight',
    'zoomIn': 'zoomIn',
    'bounceIn': 'bounceIn',
    'rotateIn': 'rotateIn',
  };

  const animationName = animationMap[firstAnim.name] || 'fadeIn';

  const durationMatch = firstAnim.duration.match(/(\d+(?:\.\d+)?)(s|ms)/);
  const duration = durationMatch
    ? parseFloat(durationMatch[1]) * (durationMatch[2] === 's' ? 1000 : 1)
    : 1000;

  const delayMatch = firstAnim.delay.match(/(\d+(?:\.\d+)?)(s|ms)/);
  const delay = delayMatch
    ? parseFloat(delayMatch[1]) * (delayMatch[2] === 's' ? 1000 : 1)
    : 0;

  return {
    _animation: animationName,
    animation_duration: duration,
    _animation_delay: delay,
  };
}

/**
 * Create advanced Elementor widget with all features
 */
export function createAdvancedWidget(
  widgetType: string,
  baseSettings: Record<string, any>,
  advancedAnalysis?: AdvancedElementAnalysis,
  customCSS?: string
): ElementorWidget {
  const settings: ElementorWidgetSettings = {
    ...baseSettings,
  };

  // Add responsive settings
  if (advancedAnalysis?.responsiveStyles) {
    const responsive = extractResponsiveSettings(advancedAnalysis.responsiveStyles);
    Object.assign(settings, responsive.desktop, responsive.tablet, responsive.mobile);
  }

  // Add hover effects
  if (advancedAnalysis?.interactiveStates) {
    const hoverSettings = extractHoverEffects(advancedAnalysis.interactiveStates);
    Object.assign(settings, hoverSettings);
  }

  // Add motion effects
  if (advancedAnalysis?.behavior) {
    const motionSettings = extractMotionEffects(advancedAnalysis.behavior);
    Object.assign(settings, motionSettings);

    // Add entrance animation
    const animationSettings = extractAnimationSettings(advancedAnalysis.behavior);
    Object.assign(settings, animationSettings);
  }

  // Add custom CSS
  if (customCSS) {
    settings._custom_css = customCSS;
  }

  // Add base styles with global colors/fonts
  if (advancedAnalysis?.baseStyles) {
    const styles = advancedAnalysis.baseStyles;

    // Background
    if (styles.backgroundColor) {
      const colorId = registerGlobalColor(styles.backgroundColor, 'Background');
      settings._background_background = 'classic';
      settings._background_color = styles.backgroundColor;
      settings.__globals__ = {
        ...(settings.__globals__ || {}),
        _background_color: `globals/colors?id=${colorId}`,
      };
    }

    // Typography color
    if (styles.color) {
      const colorId = registerGlobalColor(styles.color, 'Text');
      settings.__globals__ = {
        ...(settings.__globals__ || {}),
        color: `globals/colors?id=${colorId}`,
      };
    }

    // Font family
    if (styles.fontFamily) {
      const fontId = registerGlobalFont(
        styles.fontFamily,
        styles.fontWeight || '400',
        'Primary Font'
      );
      settings.__globals__ = {
        ...(settings.__globals__ || {}),
        typography_font_family: `globals/fonts?id=${fontId}`,
      };
    }

    // Spacing
    settings._padding = parseDimension(styles.padding as any);
    settings._margin = parseDimension(styles.margin as any);

    // Border
    if (styles.border) {
      settings._border_border = 'solid';
      settings._border_width = parseDimension('1px');
      settings._border_color = styles.borderColor;
      settings._border_radius = parseDimension(styles.borderRadius as any);
    }

    // Box shadow
    if (styles.boxShadow && styles.boxShadow !== 'none') {
      settings._box_shadow_box_shadow_type = 'yes';
      // Parse box shadow values
      const shadowMatch = styles.boxShadow.match(
        /([\d.]+)px\s+([\d.]+)px\s+([\d.]+)px\s+([\d.]+)px\s+([^\s]+)/
      );
      if (shadowMatch) {
        settings._box_shadow_box_shadow = {
          horizontal: parseFloat(shadowMatch[1]),
          vertical: parseFloat(shadowMatch[2]),
          blur: parseFloat(shadowMatch[3]),
          spread: parseFloat(shadowMatch[4]),
          color: shadowMatch[5],
        };
      }
    }
  }

  return {
    id: generateId(),
    elType: 'widget',
    widgetType,
    settings,
  };
}

/**
 * Export page settings with global colors and fonts
 */
export function createPageSettings(
  customCSS?: string
): ElementorPageSettings {
  const settings: ElementorPageSettings = {
    post_status: 'draft',
    template: 'default',
  };

  // Add global colors
  if (globalColors.size > 0) {
    settings.custom_colors = Array.from(globalColors.values());
  }

  // Add global fonts
  if (globalFonts.size > 0) {
    settings.custom_fonts = Array.from(globalFonts.values());
  }

  // Add custom CSS
  if (customCSS) {
    settings.page_custom_css = customCSS;
  }

  return settings;
}

/**
 * Create icon widget settings
 */
export function createIconWidgetSettings(
  iconClass: string,
  styles?: ExtractedStyles,
  link?: string
): Record<string, any> {
  const icon: IconValue = {
    value: iconClass,
    library: iconClass.startsWith('fa-') ? 'solid' : 'svg',
  };

  const settings: Record<string, any> = {
    selected_icon: icon,
    view: 'default',
    shape: 'circle',
  };

  if (link) {
    settings.link = {
      url: link,
      is_external: link.startsWith('http'),
      nofollow: false,
    };
  }

  if (styles) {
    settings.primary_color = styles.color;
    settings.secondary_color = styles.backgroundColor;
    settings.size = parseDimension(styles.fontSize);
    settings.icon_padding = parseDimension(styles.padding as any);
    settings.rotate = styles.transform?.includes('rotate')
      ? { size: 45, unit: 'deg' }
      : undefined;
  }

  return settings;
}

/**
 * Create image gallery widget settings
 */
export function createGalleryWidgetSettings(
  images: string[],
  styles?: ExtractedStyles
): Record<string, any> {
  const gallery: GalleryValue[] = images.map((url, index) => ({
    id: generateId(),
    url,
    thumbnail: url,
    alt: `Image ${index + 1}`,
  }));

  const settings: Record<string, any> = {
    gallery,
    gallery_layout: 'grid',
    columns: 3,
    columns_tablet: 2,
    columns_mobile: 1,
    image_size: 'medium',
    image_size_tablet: 'medium',
    image_size_mobile: 'thumbnail',
    gap: { size: 10, unit: 'px' },
    link_to: 'file',
    open_lightbox: 'yes',
    gallery_rand: false,
    view: 'default',
  };

  if (styles?.gridTemplateColumns) {
    const columnCount = styles.gridTemplateColumns.split(' ').length;
    settings.columns = columnCount;
  }

  return settings;
}

/**
 * Create slider/carousel widget settings
 */
export function createCarouselWidgetSettings(
  slides: Array<{ image: string; heading?: string; description?: string; buttonText?: string; buttonLink?: string }>,
  autoplay: boolean = false,
  navigation: boolean = true,
  pagination: boolean = true
): Record<string, any> {
  const slidesList = slides.map((slide, index) => ({
    _id: generateId(),
    heading: slide.heading || `Slide ${index + 1}`,
    description: slide.description || '',
    button_text: slide.buttonText || '',
    link: slide.buttonLink ? { url: slide.buttonLink } : undefined,
    background_image: { url: slide.image, id: generateId() },
  }));

  return {
    slides: slidesList,
    navigation: navigation ? 'both' : 'none',
    pagination: pagination ? 'bullets' : 'none',
    autoplay: autoplay ? 'yes' : '',
    autoplay_speed: { size: 5000 },
    infinite: 'yes',
    effect: 'slide',
    speed: { size: 500 },
    direction: 'ltr',
  };
}

/**
 * Reset global registries (call between different exports)
 */
export function resetGlobalRegistries(): void {
  globalColors.clear();
  globalFonts.clear();
  idCounter = 1000;
}

/**
 * Get current global colors count
 */
export function getGlobalColorsCount(): number {
  return globalColors.size;
}

/**
 * Get current global fonts count
 */
export function getGlobalFontsCount(): number {
  return globalFonts.size;
}
