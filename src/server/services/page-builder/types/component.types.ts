/**
 * Core Component Type Definitions
 *
 * Defines all types used across the component recognition and mapping system
 */

/**
 * Supported page builders
 */
export type PageBuilder = 'elementor' | 'gutenberg' | 'divi' | 'beaver' | 'bricks' | 'oxygen';

/**
 * Component types that can be recognized
 */
export type ComponentType =
  // Basic Components
  | 'button'
  | 'heading'
  | 'text'
  | 'paragraph'
  | 'image'
  | 'video'
  | 'icon'
  | 'spacer'
  | 'divider'
  | 'link'

  // Layout Components
  | 'container'
  | 'section'
  | 'column'
  | 'row'
  | 'grid'
  | 'card'
  | 'hero'
  | 'sidebar'
  | 'header'
  | 'footer'

  // Form Components
  | 'form'
  | 'input'
  | 'textarea'
  | 'select'
  | 'checkbox'
  | 'radio'
  | 'submit-button'
  | 'file-upload'

  // Advanced Components
  | 'accordion'
  | 'tabs'
  | 'modal'
  | 'carousel'
  | 'slider'
  | 'gallery'
  | 'testimonial'
  | 'pricing-table'
  | 'progress-bar'
  | 'countdown'
  | 'social-share'
  | 'breadcrumbs'
  | 'pagination'
  | 'table'
  | 'list'
  | 'blockquote'
  | 'code-block'
  | 'cta'
  | 'feature-box'
  | 'icon-box'
  | 'team-member'
  | 'blog-card'
  | 'product-card'
  | 'search-bar'
  | 'menu'
  | 'google-maps'
  | 'social-feed'
  | 'unknown';

/**
 * Extracted styles from computed CSS
 */
export interface ExtractedStyles {
  // Layout
  display?: string;
  position?: string;
  flexDirection?: string;
  flexWrap?: string;
  justifyContent?: string;
  alignItems?: string;
  gridTemplateColumns?: string;
  gridTemplateRows?: string;
  gridTemplateAreas?: string;
  gap?: string;

  // Box Model
  width?: string;
  height?: string;
  minWidth?: string;
  maxWidth?: string;
  minHeight?: string;
  maxHeight?: string;
  margin?: BoxSpacing;
  padding?: BoxSpacing;

  // Border
  border?: BorderStyle;
  borderRadius?: BorderRadius;

  // Colors
  backgroundColor?: string;
  color?: string;
  borderColor?: string;

  // Typography
  fontFamily?: string;
  fontSize?: string;
  fontWeight?: string;
  fontStyle?: string;
  lineHeight?: string;
  letterSpacing?: string;
  textAlign?: string;
  textDecoration?: string;
  textTransform?: string;

  // Effects
  boxShadow?: string;
  textShadow?: string;
  opacity?: string;
  transition?: string;
  transform?: string;
  filter?: string;

  // Background
  backgroundImage?: string;
  backgroundSize?: string;
  backgroundPosition?: string;
  backgroundRepeat?: string;

  // Advanced
  zIndex?: string;
  overflow?: string;
  cursor?: string;
  pointerEvents?: string;
  objectFit?: string;
}

export interface BoxSpacing {
  top: string;
  right: string;
  bottom: string;
  left: string;
}

export interface BorderStyle {
  width: string;
  style: string;
  color: string;
}

export interface BorderRadius {
  topLeft: string;
  topRight: string;
  bottomRight: string;
  bottomLeft: string;
}

/**
 * Responsive breakpoint styles
 */
export interface ResponsiveStyles {
  desktop?: ExtractedStyles; // 1920px
  laptop?: ExtractedStyles;  // 1366px
  tablet?: ExtractedStyles;  // 768px
  mobile?: ExtractedStyles;  // 375px
  custom?: Array<{
    minWidth?: number;
    maxWidth?: number;
    styles: ExtractedStyles;
  }>;
}

/**
 * Interactive state styles (hover, focus, active)
 */
export interface InteractiveStates {
  normal: ExtractedStyles;
  hover?: ExtractedStyles;
  focus?: ExtractedStyles;
  active?: ExtractedStyles;
  before?: ExtractedStyles; // ::before pseudo-element
  after?: ExtractedStyles;  // ::after pseudo-element
}

/**
 * Styles with all interactive states (alias for backward compatibility)
 */
export type StylesWithStates = InteractiveStates;

/**
 * Animation information
 */
export interface AnimationInfo {
  name: string;
  duration: string;
  timingFunction: string;
  delay: string;
  iterationCount: string;
  direction: string;
  fillMode: string;
}

/**
 * Transition information
 */
export interface TransitionInfo {
  property: string;
  duration: string;
  timingFunction: string;
  delay: string;
}

/**
 * Behavioral analysis of an element
 */
export interface BehavioralAnalysis {
  hasEventListeners: boolean;
  eventTypes: string[]; // ['click', 'mouseover', 'submit', etc.]
  hasAnimations: boolean;
  animations: AnimationInfo[];
  hasTransitions: boolean;
  transitions: TransitionInfo[];
  isInteractive: boolean; // Is the element clickable/focusable?
}

/**
 * Media query information
 */
export interface MediaQueryInfo {
  query: string; // e.g., "(min-width: 768px)"
  breakpoint: number; // e.g., 768
  rules: string[]; // CSS rules within this media query
}

/**
 * Media query analysis
 */
export interface MediaQueryAnalysis {
  queries: MediaQueryInfo[];
  breakpoints: number[]; // All breakpoints found, sorted
}

/**
 * CSS Custom Properties (Variables)
 */
export interface CSSVariables {
  variables: Record<string, string>; // All CSS variables found
  resolvedValues: Record<string, string>; // Resolved computed values
  usedInElement: string[]; // Variables actually used in this element
}

/**
 * SVG-specific styles and attributes
 */
export interface SVGStyles {
  isSVG: boolean;
  svgType?: 'inline' | 'image' | 'background' | 'object' | 'embed';

  // SVG-specific presentation attributes
  fill?: string;
  stroke?: string;
  strokeWidth?: string;
  strokeLinecap?: string;
  strokeLinejoin?: string;
  strokeDasharray?: string;
  strokeDashoffset?: string;
  opacity?: string;
  fillOpacity?: string;
  strokeOpacity?: string;

  // SVG structure
  viewBox?: string;
  preserveAspectRatio?: string;
  width?: string;
  height?: string;

  // Transforms
  transform?: string;

  // Filters and effects
  filter?: string;
  clipPath?: string;
  mask?: string;

  // Text-specific (for SVG text elements)
  textAnchor?: string;
  dominantBaseline?: string;

  // Additional attributes
  attributes?: Record<string, string>;
}

/**
 * Advanced element analysis (Puppeteer-based)
 */
export interface AdvancedElementAnalysis {
  baseStyles: ExtractedStyles;
  responsiveStyles?: ResponsiveStyles;
  interactiveStates?: StylesWithStates;
  pseudoElements?: {
    before?: ExtractedStyles;
    after?: ExtractedStyles;
  };
  behavior?: BehavioralAnalysis;
  mediaQueries?: MediaQueryAnalysis;
  shadowDOMElements?: AdvancedElementAnalysis[];
  cssVariables?: CSSVariables;
  svgStyles?: SVGStyles;
  isShadowDOMElement?: boolean;
}

/**
 * Element context in the DOM
 */
export interface ElementContext {
  insideHero: boolean;
  insideForm: boolean;
  insideCard: boolean;
  insideNav: boolean;
  insideHeader: boolean;
  insideFooter: boolean;
  insideSection: boolean;
  depth: number;
  parentType?: ComponentType;
  siblingTypes: ComponentType[];
}

/**
 * Analyzed HTML element
 */
export interface AnalyzedElement {
  element: string; // HTML string or serialized representation
  tagName: string;
  id?: string;
  classes: string[];
  attributes: Record<string, string>;
  textContent: string;
  innerHTML: string;
  styles: ExtractedStyles;
  responsiveStyles?: ResponsiveStyles;
  interactiveStates?: InteractiveStates;
  context: ElementContext;
  children: AnalyzedElement[];
  position: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

/**
 * Component recognition pattern
 */
export interface RecognitionPattern {
  componentType: ComponentType;
  patterns: {
    tagNames?: string[];
    classKeywords?: string[];
    cssProperties?: Partial<ExtractedStyles> | ((styles: ExtractedStyles, element?: Element) => boolean);
    contentPattern?: RegExp;
    childPattern?: string | ((children: AnalyzedElement[]) => boolean);
    ariaRole?: string;
    contextRequired?: Partial<ElementContext>;
  };
  confidence: number; // 0-100
  priority: number;   // Higher = check first
}

/**
 * Recognition result
 */
export interface RecognitionResult {
  componentType: ComponentType;
  confidence: number; // 0-100
  matchedPatterns: string[];
  fallbackType?: ComponentType;
  manualReviewNeeded: boolean;
  reason: string;
}

/**
 * Recognized component with full metadata
 */
export interface RecognizedComponent {
  id: string;
  componentType: ComponentType;
  recognition: RecognitionResult;
  element: AnalyzedElement;
  props: ComponentProps;
  children: RecognizedComponent[];
}

/**
 * Generic component properties
 */
export interface ComponentProps {
  // Content
  textContent?: string;
  innerHTML?: string;

  // Links
  href?: string;
  target?: string;

  // Media
  src?: string;
  alt?: string;
  poster?: string;

  // Form
  type?: string;
  name?: string;
  placeholder?: string;
  value?: string;
  required?: boolean;

  // Layout
  width?: string;
  height?: string;

  // Style references
  className?: string;
  customCSS?: string;

  // Advanced
  dataAttributes?: Record<string, string>;
  ariaAttributes?: Record<string, string>;

  // Component-specific props
  [key: string]: any;
}

/**
 * Component hierarchy (tree structure)
 */
export interface ComponentHierarchy {
  type: 'section' | 'container' | 'row' | 'column' | 'widget';
  componentType: ComponentType;
  id: string;
  props: ComponentProps;
  styles: ExtractedStyles;
  responsiveStyles?: ResponsiveStyles;
  children: ComponentHierarchy[];
}

/**
 * Fallback strategy when component can't be mapped
 */
export interface FallbackStrategy {
  strategy: 'html-widget' | 'custom-css' | 'image-replacement' | 'manual-review';
  reason: string;
  originalHTML: string;
  suggestions: string[];
  alternativeComponentType?: ComponentType;
}

/**
 * Conversion options
 */
export interface ConversionOptions {
  targetBuilder: PageBuilder;
  preserveCustomCSS: boolean;
  includeResponsive: boolean;
  includeAnimations: boolean;
  optimizeAssets: boolean;
  minConfidence: number; // Minimum confidence to auto-convert (0-100)
  fallbackToHTML: boolean; // Use HTML widget for low-confidence components
}

/**
 * Conversion result
 */
export interface ConversionResult {
  success: boolean;
  builder: PageBuilder;
  exportData: any; // Builder-specific export format
  components: RecognizedComponent[];
  hierarchy: ComponentHierarchy[];
  fallbacks: FallbackStrategy[];
  validation: ValidationResult;
  stats: ConversionStats;
}

/**
 * Conversion statistics
 */
export interface ConversionStats {
  totalElements: number;
  recognizedComponents: number;
  nativeWidgets: number; // Converted to native builder widgets
  htmlFallbacks: number; // Fell back to HTML widget
  manualReview: number;  // Need manual review
  conversionTime: number; // ms
  confidenceAverage: number; // Average confidence score
}

/**
 * Visual comparison result
 */
export interface VisualComparisonResult {
  screenshotOriginal: string; // Base64 or file path
  screenshotConverted: string; // Base64 or file path
  diffImage?: string; // Base64 or file path (highlighted differences)
  similarityScore: number; // 0-100%
  pixelDifference: number; // Number of different pixels
  totalPixels: number;
  diffPercentage: number; // Percentage of different pixels
  comparisonMetrics: ComparisonMetrics;
  dimensions: {
    original: { width: number; height: number };
    converted: { width: number; height: number };
    dimensionsMatch: boolean;
  };
  timestamp: Date;
}

/**
 * Detailed comparison metrics
 */
export interface ComparisonMetrics {
  structuralSimilarity: number; // SSIM score (0-1)
  colorDifference: number; // Average color diff (0-255)
  layoutShift: number; // CLS-like metric
  missingElements: string[]; // Selectors of missing elements
  extraElements: string[]; // Selectors of extra elements
  styleDiscrepancies: StyleDiscrepancy[];
}

/**
 * Style discrepancy between original and converted
 */
export interface StyleDiscrepancy {
  selector: string;
  property: string;
  originalValue: string;
  convertedValue: string;
  severity: 'minor' | 'moderate' | 'major';
}

/**
 * Asset verification result
 */
export interface AssetVerificationResult {
  totalAssets: number;
  verifiedAssets: number;
  missingAssets: MissingAsset[];
  brokenAssets: BrokenAsset[];
  assetsByType: {
    images: AssetStatus;
    fonts: AssetStatus;
    videos: AssetStatus;
    stylesheets: AssetStatus;
    scripts: AssetStatus;
  };
  verificationScore: number; // 0-100%
  timestamp: Date;
}

/**
 * Asset status summary
 */
export interface AssetStatus {
  total: number;
  verified: number;
  missing: number;
  broken: number;
  urls: string[];
}

/**
 * Missing asset details
 */
export interface MissingAsset {
  type: 'image' | 'font' | 'video' | 'stylesheet' | 'script';
  url: string;
  usedIn: string[]; // Selectors where this asset is referenced
  severity: 'critical' | 'warning' | 'info';
  suggestion?: string;
}

/**
 * Broken asset details
 */
export interface BrokenAsset {
  type: 'image' | 'font' | 'video' | 'stylesheet' | 'script';
  url: string;
  error: string;
  statusCode?: number;
  usedIn: string[];
}

/**
 * Custom code detection result
 */
export interface CustomCodeDetection {
  hasCustomJS: boolean;
  hasCustomCSS: boolean;
  canBeConverted: boolean;
  conversionWarnings: ConversionWarning[];
  detectedFeatures: DetectedFeature[];
  incompatibilities: Incompatibility[];
  conversionScore: number; // 0-100% (how much can be converted)
}

/**
 * Conversion warning
 */
export interface ConversionWarning {
  type: 'javascript' | 'css' | 'html';
  severity: 'critical' | 'warning' | 'info';
  message: string;
  location: {
    file?: string;
    line?: number;
    column?: number;
    selector?: string;
  };
  suggestion?: string;
  canAutoFix: boolean;
}

/**
 * Detected feature in custom code
 */
export interface DetectedFeature {
  type: 'javascript' | 'css';
  feature: string;
  description: string;
  isSupported: boolean;
  alternative?: string;
  examples: string[];
}

/**
 * Incompatibility with page builder
 */
export interface Incompatibility {
  type: 'javascript' | 'css' | 'html' | 'library';
  name: string;
  reason: string;
  impact: 'blocking' | 'degraded' | 'minimal';
  workaround?: string;
}

/**
 * Validation result
 */
export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  suggestions: string[];
  visualComparison?: VisualComparisonResult;
  assetVerification?: AssetVerificationResult;
  customCodeDetection?: CustomCodeDetection;
  overallScore?: number; // 0-100%
}

export interface ValidationError {
  type: string;
  message: string;
  component: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
}

export interface ValidationWarning {
  type: string;
  message: string;
  component: string;
  severity: 'high' | 'medium' | 'low';
}
