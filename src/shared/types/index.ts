// ============================================================================
// SHARED TYPES - Used across client and server
// ============================================================================

export interface PerformanceMetrics {
  // Core Web Vitals
  lcp: MetricData;
  fid: MetricData;
  inp: MetricData;
  cls: MetricData;

  // Additional Metrics
  fcp: MetricData;
  tbt: MetricData;
  speedIndex: MetricData;
  tti: MetricData;
  ttfb: MetricData;

  // Overall Score
  performanceScore: number; // 0-100

  // Timestamp
  timestamp: string;
}

export interface MetricData {
  value: number;
  rating: 'good' | 'needs-improvement' | 'poor';
  target: number;
  unit: string;
}

export interface PerformanceIssue {
  id: string;
  title: string;
  description: string;
  category: IssueCategory;
  severity: 'critical' | 'high' | 'medium' | 'low';
  impact: number; // Estimated performance gain (0-100)
  estimatedSavings: {
    bytes?: number;
    ms?: number;
    requests?: number;
  };
  affectedMetrics: string[]; // e.g., ['LCP', 'FCP']
  fixComplexity: 'easy' | 'medium' | 'hard';
  autoFixable: boolean;
  element?: string; // CSS selector or element description
  codeLocation?: CodeLocation;
  suggestedFix?: string;
  beforeCode?: string;
  afterCode?: string;
}

export interface CodeLocation {
  file: string;
  line?: number;
  column?: number;
}

export type IssueCategory =
  | 'images'
  | 'css'
  | 'javascript'
  | 'fonts'
  | 'html'
  | 'render'
  | 'layout-stability'
  | 'third-party'
  | 'network';

export interface OptimizationResult {
  issueId: string;
  success: boolean;
  error?: string;
  changes: OptimizationChange[];
  metricsImprovement?: Partial<PerformanceMetrics>;
}

export interface OptimizationChange {
  type: 'add' | 'modify' | 'remove';
  file: string;
  description: string;
  beforeCode?: string;
  afterCode?: string;
  bytesSaved?: number;
}

export interface CloneRequest {
  type: 'url' | 'upload' | 'element-selector';
  source: string; // URL or file path
  options: CloneOptions;
}

export interface CloneOptions {
  multiPage?: boolean;
  maxDepth?: number;
  includeAssets?: boolean;
  selectiveElements?: string[]; // CSS selectors
  preserveJavaScript?: boolean;
  followExternalLinks?: boolean;
}

export interface ClonedWebsite {
  id: string;
  name: string;
  sourceUrl?: string;
  html: string;
  css: string[];
  javascript: string[];
  assets: Asset[];
  metadata: WebsiteMetadata;
  createdAt: string;
  status: 'cloning' | 'analyzing' | 'optimizing' | 'ready' | 'error';
}

export interface Asset {
  id: string;
  type: 'image' | 'font' | 'video' | 'icon' | 'other';
  originalUrl: string;
  localPath: string;
  size: number;
  optimizedSize?: number;
  format: string;
  optimizedFormat?: string;
  dimensions?: { width: number; height: number };
  metadata?: {
    blurPlaceholder?: string; // For images
    fontFamily?: string; // For fonts
    fontWeight?: string; // For fonts
    fontStyle?: string; // For fonts
    unicodeRange?: string; // For fonts
    glyphCount?: number; // For fonts
    [key: string]: any; // Allow additional metadata
  };
}

export interface WebsiteMetadata {
  title: string;
  description?: string;
  favicon?: string;
  framework?: string; // React, Vue, vanilla, etc.
  responsive: boolean;
  totalSize: number;
  assetCount: number;
  pageCount: number;
}

export interface DeploymentConfig {
  provider: 'vercel' | 'netlify' | 'github-pages';
  name: string;
  expiryDays?: number;
  password?: string;
  customDomain?: string;
}

export interface Deployment {
  id: string;
  websiteId: string;
  platform: 'vercel' | 'netlify';
  provider: 'vercel' | 'netlify';
  url: string;
  previewUrl?: string;
  originalUrl?: string;
  optimizedUrl?: string;
  status: 'deploying' | 'success' | 'failed' | 'expired';
  error?: string;
  createdAt: string;
  expiresAt?: string;
  performanceMetrics?: PerformanceMetrics;
  optimizedMetrics?: PerformanceMetrics;
  metadata?: any;
}

export interface WordPressBuilder {
  id: string;
  name: 'Elementor' | 'Gutenberg' | 'Divi' | 'Beaver Builder' | 'Bricks' | 'Oxygen';
  version?: string;
  supportsInlineCSS: boolean;
  supportsCustomJS: boolean;
}

export interface ExportConfig {
  builder: WordPressBuilder;
  optimizationLevel: 'maximum-performance' | 'balanced' | 'maximum-quality';
  includePerformanceReport: boolean;
  includeImportScript: boolean;
  verifyPluginFree: boolean;
}

export interface ExportPackage {
  id: string;
  websiteId: string;
  builder: WordPressBuilder;
  files: ExportFile[];
  performanceReport: PerformanceReport;
  verificationReport: VerificationReport;
  createdAt: string;
  downloadUrl: string;
}

export interface ExportFile {
  path: string;
  type: 'builder-json' | 'asset' | 'documentation' | 'script';
  size: number;
  description: string;
}

export interface PerformanceReport {
  summary: string;
  originalMetrics: PerformanceMetrics;
  optimizedMetrics: PerformanceMetrics;
  improvements: PerformanceImprovement[];
  appliedOptimizations: string[];
  recommendations: string[];
}

export interface PerformanceImprovement {
  metric: string;
  before: number;
  after: number;
  improvement: number; // percentage
  unit: string;
}

export interface VerificationReport {
  pluginFree: boolean;
  dependencies: DependencyCheck[];
  compatibilityIssues: string[];
  performanceStandards: PerformanceStandardCheck[];
  passed: boolean;
}

export interface DependencyCheck {
  name: string;
  type: 'plugin' | 'external-script' | 'external-stylesheet' | 'third-party-service';
  required: boolean;
  eliminated: boolean;
  alternative?: string;
}

export interface PerformanceStandardCheck {
  metric: string;
  target: number;
  actual: number;
  passed: boolean;
  unit: string;
}

export interface Project {
  id: string;
  name: string;
  website: ClonedWebsite;
  performanceAnalysis?: PerformanceAnalysis;
  optimizations: OptimizationResult[];
  deployment?: Deployment;
  export?: ExportPackage;
  createdAt: string;
  updatedAt: string;
}

export interface PerformanceAnalysis {
  id: string;
  websiteId: string;
  metrics: PerformanceMetrics;
  issues: PerformanceIssue[];
  opportunities: PerformanceIssue[];
  diagnostics: Diagnostic[];
  lighthouse: LighthouseReport;
  analyzedAt: string;
}

export interface Diagnostic {
  id: string;
  title: string;
  description: string;
  details: any;
}

export interface LighthouseReport {
  performanceScore: number;
  accessibilityScore: number;
  bestPracticesScore: number;
  seoScore: number;
  audits: Record<string, any>;
  fullReport?: string; // URL to full HTML report
}

export interface OptimizationSettings {
  images: ImageOptimizationSettings;
  css: CSSOptimizationSettings;
  javascript: JSOptimizationSettings;
  fonts: FontOptimizationSettings;
  html: HTMLOptimizationSettings;
}

export interface ImageOptimizationSettings {
  quality: number; // 0-100
  format: 'webp' | 'avif' | 'jpeg' | 'png' | 'auto';
  responsive: boolean;
  lazyLoad: boolean;
  lazyLoading?: boolean; // Alias for lazyLoad
  compressionType: 'lossy' | 'lossless';
  maxWidth?: number;
  generateSrcset: boolean;
  generateResponsive?: boolean; // Generate responsive sizes
  breakpoints?: number[]; // Responsive breakpoints
  generateBlurPlaceholder?: boolean; // Generate blur-up placeholder
  progressive?: boolean; // Progressive JPEG
  optimizeSVG?: boolean; // Optimize SVG images
}

export interface CSSOptimizationSettings {
  extractCritical: boolean;
  removeUnused: boolean;
  minify: boolean;
  inline: boolean;
  inlineThreshold: number; // bytes
  inlineCritical?: boolean; // Inline critical CSS
  deferNonCritical?: boolean; // Defer non-critical CSS
}

export interface JSOptimizationSettings {
  minify: boolean;
  removeUnused: boolean;
  defer: boolean;
  async: boolean;
  splitBundles: boolean;
  removeConsole?: boolean; // Remove console statements
  removeDebugger?: boolean; // Remove debugger statements
}

export interface FontOptimizationSettings {
  fontDisplay: 'auto' | 'block' | 'swap' | 'fallback' | 'optional';
  subset: boolean;
  preload: boolean;
  selfHost: boolean;
  format: 'woff2' | 'woff' | 'ttf';
  unicodeRange?: string; // e.g., 'latin', 'latin-ext', 'cyrillic', or custom range
  subsetCharacters?: string; // Custom characters to include in subset
  preloadStrategy?: 'critical' | 'all' | 'none'; // Which fonts to preload
}

export interface HTMLOptimizationSettings {
  minify: boolean;
  addResourceHints: boolean;
  lazyLoadIframes: boolean;
  addDimensions: boolean;
  removeComments?: boolean; // Remove HTML comments
}

// API Response types
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface ProgressUpdate {
  stage: string;
  progress: number; // 0-100
  message: string;
  timestamp: string;
}

// AI Integration types
export interface AIInsight {
  id: string;
  type: 'suggestion' | 'warning' | 'opportunity' | 'best-practice';
  category: 'performance' | 'accessibility' | 'seo' | 'security' | 'code-quality';
  title: string;
  description: string;
  reasoning: string;
  impact: 'high' | 'medium' | 'low';
  effort: 'easy' | 'medium' | 'hard';
  priority: number; // 1-10
  suggestedFix?: string;
  codeExample?: string;
  resources?: string[];
}

export interface AIChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}
