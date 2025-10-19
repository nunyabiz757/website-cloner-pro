/**
 * Page Builder Type Definitions
 *
 * Defines export formats for each supported page builder
 */

import { ComponentType } from './component.types.js';

/**
 * ============================================
 * ELEMENTOR TYPES
 * ============================================
 */

/**
 * Common dimension value type
 */
export interface DimensionValue {
  top?: number;
  right?: number;
  bottom?: number;
  left?: number;
  unit?: 'px' | 'em' | '%' | 'vh' | 'vw';
  isLinked?: boolean;
}

/**
 * Icon value type
 */
export interface IconValue {
  value?: string; // Icon class or SVG
  library?: 'solid' | 'regular' | 'brands' | 'svg';
}

/**
 * Image/Media value type
 */
export interface MediaValue {
  id?: number | string;
  url: string;
  alt?: string;
  caption?: string;
  width?: number;
  height?: number;
}

/**
 * Gallery value type
 */
export interface GalleryValue {
  id: number | string;
  url: string;
  thumbnail?: string;
  alt?: string;
  caption?: string;
}

/**
 * Hover animation settings
 */
export interface HoverSettings {
  _hover_animation?: string;
  hover_transition_duration?: { size: number; unit: string };
}

/**
 * Motion effects settings
 */
export interface MotionEffectsSettings {
  motion_fx_motion_fx_scrolling?: 'yes' | '';
  motion_fx_motion_fx_mouse?: 'yes' | '';

  // Translate
  motion_fx_translateY_effect?: 'yes' | '';
  motion_fx_translateY_direction?: 'up' | 'down';
  motion_fx_translateY_speed?: { size: number };
  motion_fx_translateY_affectedRange?: { start: number; end: number };

  motion_fx_translateX_effect?: 'yes' | '';
  motion_fx_translateX_direction?: 'left' | 'right';
  motion_fx_translateX_speed?: { size: number };

  // Rotate
  motion_fx_rotateZ_effect?: 'yes' | '';
  motion_fx_rotateZ_direction?: 'clockwise' | 'counter-clockwise';
  motion_fx_rotateZ_speed?: { size: number };

  // Scale
  motion_fx_scale_effect?: 'yes' | '';
  motion_fx_scale_direction?: 'in' | 'out';
  motion_fx_scale_speed?: { size: number };

  // Opacity
  motion_fx_opacity_effect?: 'yes' | '';
  motion_fx_opacity_level?: { size: number };
  motion_fx_opacity_range?: { start: number; end: number };

  // Blur
  motion_fx_blur_effect?: 'yes' | '';
  motion_fx_blur_level?: { size: number };
}

/**
 * Global colors and fonts
 */
export interface GlobalSettings {
  __globals__?: Record<string, string>; // e.g., { "color": "globals/colors?id=primary" }
}

export interface ElementorExport {
  version: string;
  title: string;
  type: 'page' | 'post' | 'section' | 'widget';
  content: ElementorSection[];
  page_settings?: ElementorPageSettings;
}

export interface ElementorPageSettings extends Record<string, any> {
  post_status?: 'draft' | 'publish' | 'pending';
  template?: 'default' | 'elementor_canvas' | 'elementor_header_footer';

  // Global colors
  custom_colors?: Array<{
    _id: string;
    title: string;
    color: string;
  }>;

  // Global fonts
  custom_fonts?: Array<{
    _id: string;
    title: string;
    font_family: string;
    font_weight: string;
  }>;

  // Page style
  page_custom_css?: string;
}

export interface ElementorSection {
  id: string;
  elType: 'section';
  settings: ElementorSectionSettings;
  elements: ElementorColumn[];
}

export interface ElementorSectionSettings {
  structure?: string; // "10", "20", "30", etc.
  layout?: 'boxed' | 'full_width';
  gap?: 'default' | 'no' | 'narrow' | 'extended' | 'wide' | 'wider';
  content_width?: string;
  height?: 'default' | 'min-height' | 'full';
  custom_height?: { size: number; unit: string };

  // Background
  background_background?: 'classic' | 'gradient' | 'video' | 'slideshow';
  background_color?: string;
  background_image?: { url: string; id: number | string };
  background_gradient_type?: 'linear' | 'radial';
  background_gradient_angle?: { size: number; unit: string };
  background_gradient_position?: string;
  background_gradient_color?: string;
  background_video_link?: string;
  background_slideshow_gallery?: Array<{ url: string; id: number | string }>;

  // Spacing
  padding?: DimensionValue;
  padding_tablet?: DimensionValue;
  padding_mobile?: DimensionValue;
  margin?: DimensionValue;
  margin_tablet?: DimensionValue;
  margin_mobile?: DimensionValue;

  // Border
  border_border?: 'none' | 'solid' | 'double' | 'dotted' | 'dashed';
  border_width?: DimensionValue;
  border_color?: string;
  border_radius?: DimensionValue;

  // Advanced
  custom_css?: string;
  _animation?: string;
  animation_duration?: number;
  _element_id?: string;
  css_classes?: string;

  // Motion Effects
  motion_fx_motion_fx_scrolling?: 'yes' | '';
  motion_fx_translateY_effect?: 'yes' | '';
  motion_fx_translateY_speed?: { size: number };
  motion_fx_opacity_effect?: 'yes' | '';
  motion_fx_blur_effect?: 'yes' | '';

  [key: string]: any;
}

export interface ElementorColumn {
  id: string;
  elType: 'column';
  settings: ElementorColumnSettings;
  elements: ElementorWidget[];
}

export interface ElementorColumnSettings extends GlobalSettings, MotionEffectsSettings, HoverSettings {
  // Size
  _column_size?: number; // 16, 20, 25, 33, 50, 66, 75, 100
  _inline_size?: number;
  _inline_size_tablet?: number;
  _inline_size_mobile?: number;

  // Background
  background_background?: 'classic' | 'gradient' | 'video' | 'slideshow';
  background_color?: string;
  background_image?: MediaValue;
  background_gradient_type?: 'linear' | 'radial';

  // Spacing
  padding?: DimensionValue;
  padding_tablet?: DimensionValue;
  padding_mobile?: DimensionValue;
  margin?: DimensionValue;
  margin_tablet?: DimensionValue;
  margin_mobile?: DimensionValue;

  // Border
  border_border?: 'none' | 'solid' | 'double' | 'dotted' | 'dashed';
  border_width?: DimensionValue;
  border_color?: string;
  border_radius?: DimensionValue;

  // Advanced
  custom_css?: string;
  _animation?: string;
  _element_id?: string;
  css_classes?: string;

  [key: string]: any;
}

export interface ElementorWidget extends GlobalSettings, MotionEffectsSettings, HoverSettings {
  id: string;
  elType: 'widget';
  widgetType: string;
  settings: ElementorWidgetSettings;
}

/**
 * Base widget settings (common to all widgets)
 */
export interface ElementorWidgetSettings extends GlobalSettings, MotionEffectsSettings, HoverSettings {
  // Common settings
  _element_id?: string;
  _css_classes?: string;
  _animation?: string;
  _animation_delay?: number;
  animation_duration?: number;

  // Custom CSS
  _custom_css?: string;

  // Responsive visibility
  _responsive_description?: string;
  hide_desktop?: 'yes' | '';
  hide_tablet?: 'yes' | '';
  hide_mobile?: 'yes' | '';

  // Spacing
  _margin?: DimensionValue;
  _margin_tablet?: DimensionValue;
  _margin_mobile?: DimensionValue;
  _padding?: DimensionValue;
  _padding_tablet?: DimensionValue;
  _padding_mobile?: DimensionValue;

  // Border
  _border_border?: 'none' | 'solid' | 'double' | 'dotted' | 'dashed';
  _border_width?: DimensionValue;
  _border_color?: string;
  _border_radius?: DimensionValue;

  // Box Shadow
  _box_shadow_box_shadow_type?: 'yes' | '';
  _box_shadow_box_shadow?: {
    horizontal?: number;
    vertical?: number;
    blur?: number;
    spread?: number;
    color?: string;
  };

  // Background
  _background_background?: 'classic' | 'gradient';
  _background_color?: string;
  _background_image?: MediaValue;

  // Hover effects
  _background_hover_transition?: { size: number; unit: string };

  // Widget-specific settings (dynamic based on widgetType)
  [key: string]: any;
}

/**
 * ============================================
 * GUTENBERG TYPES
 * ============================================
 */

export interface GutenbergExport {
  __file: string;
  title: string;
  description: string;
  category: string;
  icon: string;
  keywords: string[];
  content: string; // HTML comments format
  blocks: GutenbergBlock[];
}

export interface GutenbergBlock {
  blockName: string; // e.g., "core/paragraph"
  attrs: Record<string, any>;
  innerBlocks?: GutenbergBlock[];
  innerHTML?: string;
  innerContent?: (string | null)[];
}

/**
 * ============================================
 * DIVI TYPES
 * ============================================
 */

export interface DiviExport {
  version: string;
  content: string; // Shortcode format
  modules: DiviModule[];
}

export interface DiviModule {
  type: string; // "et_pb_section", "et_pb_row", etc.
  attrs: Record<string, any>;
  content?: DiviModule[];
  shortcode: string;
}

/**
 * ============================================
 * BEAVER BUILDER TYPES
 * ============================================
 */

export interface BeaverExport {
  version: string;
  rows: BeaverRow[];
}

export interface BeaverRow {
  id: string;
  type: 'row';
  settings: Record<string, any>;
  columns: BeaverColumn[];
}

export interface BeaverColumn {
  id: string;
  type: 'column';
  settings: Record<string, any>;
  modules: BeaverModule[];
}

export interface BeaverModule {
  id: string;
  type: string; // Module type
  settings: Record<string, any>;
}

/**
 * ============================================
 * BRICKS TYPES
 * ============================================
 */

export interface BricksExport {
  version: string;
  elements: BricksElement[];
}

export interface BricksElement {
  id: string;
  name: string; // Element type
  parent?: string;
  settings: Record<string, any>;
  children?: BricksElement[];
}

/**
 * ============================================
 * OXYGEN TYPES
 * ============================================
 */

export interface OxygenExport {
  version: string;
  ct_builder_shortcodes: string;
  ct_builder_json: OxygenComponent[];
}

export interface OxygenComponent {
  id: string;
  name: string; // Component type
  options: Record<string, any>;
  children?: OxygenComponent[];
}

/**
 * ============================================
 * PROPERTY MAPPINGS
 * ============================================
 */

export interface PropertyMapping {
  widgetType: string; // Target widget/block/module type
  propertyMap: Record<string, string | PropertyMapper>;
  defaultSettings?: Record<string, any>;
  requiredSettings?: string[];
}

export type PropertyMapper = (value: any, context?: any) => any;

/**
 * Builder-specific widget mappings
 */
export interface BuilderMappings {
  [componentType: string]: PropertyMapping;
}
