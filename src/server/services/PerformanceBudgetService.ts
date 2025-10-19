import * as cheerio from 'cheerio';
import gzipSize from 'gzip-size';

/**
 * Performance Budget Configuration
 */
export interface PerformanceBudget {
  projectId?: string;
  projectName?: string;

  // Size budgets (in bytes)
  maxHTMLSize?: number;           // Default: 102400 (100KB)
  maxCSSSize?: number;            // Default: 51200 (50KB)
  maxJSSize?: number;             // Default: 102400 (100KB)
  maxImageSize?: number;          // Default: 512000 (500KB)
  maxTotalSize?: number;          // Default: 1048576 (1MB)

  // Gzip budgets (in bytes)
  maxHTMLGzipSize?: number;       // Default: 30720 (30KB)
  maxCSSGzipSize?: number;        // Default: 15360 (15KB)
  maxJSGzipSize?: number;         // Default: 30720 (30KB)
  maxTotalGzipSize?: number;      // Default: 307200 (300KB)

  // Resource counts
  maxHTTPRequests?: number;       // Default: 50
  maxImageCount?: number;         // Default: 30
  maxScriptCount?: number;        // Default: 10
  maxStylesheetCount?: number;    // Default: 5
  maxFontCount?: number;          // Default: 4

  // Performance metrics
  maxDOMNodes?: number;           // Default: 1500
  maxDOMDepth?: number;           // Default: 15
  maxCriticalCSSSize?: number;    // Default: 20480 (20KB)

  // Custom metrics
  customMetrics?: {
    [key: string]: {
      value: number;
      description: string;
    };
  };

  // Enforcement settings
  enforcement?: 'strict' | 'warning' | 'disabled'; // Default: 'warning'
  allowOverride?: boolean;        // Default: true

  createdAt?: Date;
  updatedAt?: Date;
}

/**
 * Performance Budget Validation Result
 */
export interface BudgetValidationResult {
  passed: boolean;
  violations: BudgetViolation[];
  warnings: BudgetWarning[];
  metrics: PerformanceMetrics;
  summary: {
    totalViolations: number;
    totalWarnings: number;
    criticalViolations: number;
    budgetUtilization: number; // Percentage
  };
  canExport: boolean;
  requiresOverride: boolean;
}

/**
 * Budget Violation
 */
export interface BudgetViolation {
  metric: string;
  budget: number;
  actual: number;
  percentage: number;          // Over budget percentage
  severity: 'critical' | 'high' | 'medium' | 'low';
  message: string;
  recommendations: string[];
}

/**
 * Budget Warning
 */
export interface BudgetWarning {
  metric: string;
  budget: number;
  actual: number;
  percentage: number;          // Utilization percentage
  message: string;
}

/**
 * Performance Metrics
 */
export interface PerformanceMetrics {
  // Size metrics (raw)
  htmlSize: number;
  cssSize: number;
  jsSize: number;
  imageSize: number;
  totalSize: number;

  // Size metrics (gzip)
  htmlGzipSize: number;
  cssGzipSize: number;
  jsGzipSize: number;
  totalGzipSize: number;

  // Resource counts
  httpRequests: number;
  imageCount: number;
  scriptCount: number;
  stylesheetCount: number;
  fontCount: number;

  // DOM metrics
  domNodes: number;
  domDepth: number;

  // Additional metrics
  criticalCSSSize?: number;
  customMetrics?: { [key: string]: number };
}

/**
 * Project Budget Storage
 */
interface ProjectBudgetStore {
  [projectId: string]: PerformanceBudget;
}

/**
 * Performance Budget Service
 * Enforces performance budgets with pre-export validation
 */
export class PerformanceBudgetService {
  private budgetStore: ProjectBudgetStore = {};

  /**
   * Get default performance budget
   */
  getDefaultBudget(): PerformanceBudget {
    return {
      // Size budgets
      maxHTMLSize: 102400,        // 100KB
      maxCSSSize: 51200,          // 50KB
      maxJSSize: 102400,          // 100KB
      maxImageSize: 512000,       // 500KB
      maxTotalSize: 1048576,      // 1MB

      // Gzip budgets
      maxHTMLGzipSize: 30720,     // 30KB
      maxCSSGzipSize: 15360,      // 15KB
      maxJSGzipSize: 30720,       // 30KB
      maxTotalGzipSize: 307200,   // 300KB

      // Resource counts
      maxHTTPRequests: 50,
      maxImageCount: 30,
      maxScriptCount: 10,
      maxStylesheetCount: 5,
      maxFontCount: 4,

      // Performance metrics
      maxDOMNodes: 1500,
      maxDOMDepth: 15,
      maxCriticalCSSSize: 20480,  // 20KB

      // Enforcement
      enforcement: 'warning',
      allowOverride: true,
    };
  }

  /**
   * Create or update project budget
   */
  setProjectBudget(projectId: string, budget: Partial<PerformanceBudget>): PerformanceBudget {
    const existingBudget = this.budgetStore[projectId] || {};
    const defaultBudget = this.getDefaultBudget();

    const newBudget: PerformanceBudget = {
      ...defaultBudget,
      ...existingBudget,
      ...budget,
      projectId,
      updatedAt: new Date(),
    };

    if (!existingBudget.createdAt) {
      newBudget.createdAt = new Date();
    }

    this.budgetStore[projectId] = newBudget;
    return newBudget;
  }

  /**
   * Get project budget
   */
  getProjectBudget(projectId: string): PerformanceBudget {
    return this.budgetStore[projectId] || this.getDefaultBudget();
  }

  /**
   * Delete project budget
   */
  deleteProjectBudget(projectId: string): boolean {
    if (this.budgetStore[projectId]) {
      delete this.budgetStore[projectId];
      return true;
    }
    return false;
  }

  /**
   * List all project budgets
   */
  listProjectBudgets(): PerformanceBudget[] {
    return Object.values(this.budgetStore);
  }

  /**
   * Calculate performance metrics from content
   */
  async calculateMetrics(
    html: string,
    css: string[] = [],
    js: string[] = [],
    images: string[] = [],
    additionalAssets: Map<string, Buffer> = new Map()
  ): Promise<PerformanceMetrics> {
    const $ = cheerio.load(html);

    // Calculate sizes
    const htmlSize = Buffer.byteLength(html, 'utf8');
    const cssSize = css.reduce((sum, content) => sum + Buffer.byteLength(content, 'utf8'), 0);
    const jsSize = js.reduce((sum, content) => sum + Buffer.byteLength(content, 'utf8'), 0);

    // Calculate image sizes from assets map
    let imageSize = 0;
    for (const [path, buffer] of additionalAssets) {
      if (this.isImagePath(path)) {
        imageSize += buffer.length;
      }
    }

    const totalSize = htmlSize + cssSize + jsSize + imageSize;

    // Calculate gzip sizes
    const htmlGzipSize = await gzipSize(html);
    const cssGzipSize = await gzipSize(css.join('\n'));
    const jsGzipSize = await gzipSize(js.join('\n'));
    const totalGzipSize = htmlGzipSize + cssGzipSize + jsGzipSize;

    // Count resources
    const imageCount = $('img').length + $('picture').length;
    const scriptCount = $('script[src]').length + js.length;
    const stylesheetCount = $('link[rel="stylesheet"]').length + css.length;
    const fontCount = this.countFonts($, css);

    // Calculate HTTP requests
    const httpRequests = imageCount + scriptCount + stylesheetCount + fontCount + 1; // +1 for HTML

    // DOM metrics
    const domNodes = $('*').length;
    const domDepth = this.calculateDOMDepth($);

    return {
      htmlSize,
      cssSize,
      jsSize,
      imageSize,
      totalSize,
      htmlGzipSize,
      cssGzipSize,
      jsGzipSize,
      totalGzipSize,
      httpRequests,
      imageCount,
      scriptCount,
      stylesheetCount,
      fontCount,
      domNodes,
      domDepth,
    };
  }

  /**
   * Validate content against budget
   */
  async validateBudget(
    html: string,
    css: string[] = [],
    js: string[] = [],
    images: string[] = [],
    budget: PerformanceBudget,
    additionalAssets?: Map<string, Buffer>,
    criticalCSSSize?: number
  ): Promise<BudgetValidationResult> {
    const metrics = await this.calculateMetrics(html, css, js, images, additionalAssets);

    if (criticalCSSSize !== undefined) {
      metrics.criticalCSSSize = criticalCSSSize;
    }

    const violations: BudgetViolation[] = [];
    const warnings: BudgetWarning[] = [];

    // Check all budget constraints
    this.checkMetric(
      'HTML Size',
      metrics.htmlSize,
      budget.maxHTMLSize,
      violations,
      warnings,
      'high'
    );

    this.checkMetric(
      'CSS Size',
      metrics.cssSize,
      budget.maxCSSSize,
      violations,
      warnings,
      'medium'
    );

    this.checkMetric(
      'JavaScript Size',
      metrics.jsSize,
      budget.maxJSSize,
      violations,
      warnings,
      'high'
    );

    this.checkMetric(
      'Image Size',
      metrics.imageSize,
      budget.maxImageSize,
      violations,
      warnings,
      'medium'
    );

    this.checkMetric(
      'Total Size',
      metrics.totalSize,
      budget.maxTotalSize,
      violations,
      warnings,
      'critical'
    );

    // Gzip metrics
    this.checkMetric(
      'HTML Gzip Size',
      metrics.htmlGzipSize,
      budget.maxHTMLGzipSize,
      violations,
      warnings,
      'high'
    );

    this.checkMetric(
      'CSS Gzip Size',
      metrics.cssGzipSize,
      budget.maxCSSGzipSize,
      violations,
      warnings,
      'medium'
    );

    this.checkMetric(
      'JavaScript Gzip Size',
      metrics.jsGzipSize,
      budget.maxJSGzipSize,
      violations,
      warnings,
      'high'
    );

    this.checkMetric(
      'Total Gzip Size',
      metrics.totalGzipSize,
      budget.maxTotalGzipSize,
      violations,
      warnings,
      'critical'
    );

    // Resource counts
    this.checkMetric(
      'HTTP Requests',
      metrics.httpRequests,
      budget.maxHTTPRequests,
      violations,
      warnings,
      'high'
    );

    this.checkMetric(
      'Image Count',
      metrics.imageCount,
      budget.maxImageCount,
      violations,
      warnings,
      'medium'
    );

    this.checkMetric(
      'Script Count',
      metrics.scriptCount,
      budget.maxScriptCount,
      violations,
      warnings,
      'medium'
    );

    this.checkMetric(
      'Stylesheet Count',
      metrics.stylesheetCount,
      budget.maxStylesheetCount,
      violations,
      warnings,
      'medium'
    );

    this.checkMetric(
      'Font Count',
      metrics.fontCount,
      budget.maxFontCount,
      violations,
      warnings,
      'low'
    );

    // DOM metrics
    this.checkMetric(
      'DOM Nodes',
      metrics.domNodes,
      budget.maxDOMNodes,
      violations,
      warnings,
      'high'
    );

    this.checkMetric(
      'DOM Depth',
      metrics.domDepth,
      budget.maxDOMDepth,
      violations,
      warnings,
      'medium'
    );

    // Critical CSS
    if (metrics.criticalCSSSize !== undefined) {
      this.checkMetric(
        'Critical CSS Size',
        metrics.criticalCSSSize,
        budget.maxCriticalCSSSize,
        violations,
        warnings,
        'high'
      );
    }

    // Check custom metrics
    if (budget.customMetrics && metrics.customMetrics) {
      for (const [key, budgetValue] of Object.entries(budget.customMetrics)) {
        const actualValue = metrics.customMetrics[key];
        if (actualValue !== undefined) {
          this.checkMetric(
            key,
            actualValue,
            budgetValue.value,
            violations,
            warnings,
            'medium'
          );
        }
      }
    }

    const criticalViolations = violations.filter(v => v.severity === 'critical').length;
    const totalViolations = violations.length;
    const totalWarnings = warnings.length;

    // Calculate budget utilization (average)
    const utilizationPercentages: number[] = [];
    if (budget.maxTotalSize) {
      utilizationPercentages.push((metrics.totalSize / budget.maxTotalSize) * 100);
    }
    if (budget.maxHTTPRequests) {
      utilizationPercentages.push((metrics.httpRequests / budget.maxHTTPRequests) * 100);
    }
    if (budget.maxDOMNodes) {
      utilizationPercentages.push((metrics.domNodes / budget.maxDOMNodes) * 100);
    }

    const budgetUtilization = utilizationPercentages.length > 0
      ? utilizationPercentages.reduce((a, b) => a + b, 0) / utilizationPercentages.length
      : 0;

    // Determine if export is allowed
    const enforcement = budget.enforcement || 'warning';
    const allowOverride = budget.allowOverride !== false;

    let canExport = true;
    let requiresOverride = false;

    if (enforcement === 'strict' && totalViolations > 0) {
      canExport = false;
      requiresOverride = allowOverride;
    } else if (enforcement === 'warning' && criticalViolations > 0) {
      canExport = allowOverride;
      requiresOverride = true;
    }

    return {
      passed: totalViolations === 0,
      violations,
      warnings,
      metrics,
      summary: {
        totalViolations,
        totalWarnings,
        criticalViolations,
        budgetUtilization,
      },
      canExport,
      requiresOverride,
    };
  }

  /**
   * Check individual metric against budget
   */
  private checkMetric(
    name: string,
    actual: number,
    budget: number | undefined,
    violations: BudgetViolation[],
    warnings: BudgetWarning[],
    severity: 'critical' | 'high' | 'medium' | 'low'
  ): void {
    if (budget === undefined) return;

    const percentage = (actual / budget) * 100;

    // Violation (over budget)
    if (actual > budget) {
      const overPercentage = percentage - 100;
      violations.push({
        metric: name,
        budget,
        actual,
        percentage: overPercentage,
        severity,
        message: `${name} exceeds budget by ${overPercentage.toFixed(1)}% (${this.formatBytes(actual)} > ${this.formatBytes(budget)})`,
        recommendations: this.getRecommendations(name, actual, budget),
      });
    }
    // Warning (approaching budget: 80-100%)
    else if (percentage >= 80) {
      warnings.push({
        metric: name,
        budget,
        actual,
        percentage,
        message: `${name} is at ${percentage.toFixed(1)}% of budget (${this.formatBytes(actual)} / ${this.formatBytes(budget)})`,
      });
    }
  }

  /**
   * Get recommendations for budget violations
   */
  private getRecommendations(metric: string, actual: number, budget: number): string[] {
    const recommendations: string[] = [];

    if (metric.includes('HTML')) {
      recommendations.push('Minify HTML content');
      recommendations.push('Remove unnecessary whitespace and comments');
      recommendations.push('Consider code splitting for large pages');
    } else if (metric.includes('CSS')) {
      recommendations.push('Minify CSS files');
      recommendations.push('Remove unused CSS rules');
      recommendations.push('Use critical CSS extraction');
      recommendations.push('Consider CSS-in-JS for component-specific styles');
    } else if (metric.includes('JavaScript')) {
      recommendations.push('Minify JavaScript files');
      recommendations.push('Enable tree shaking to remove dead code');
      recommendations.push('Use code splitting and lazy loading');
      recommendations.push('Consider using lighter alternatives to heavy libraries');
    } else if (metric.includes('Image')) {
      recommendations.push('Compress images using modern formats (WebP, AVIF)');
      recommendations.push('Implement lazy loading for images');
      recommendations.push('Use responsive images with srcset');
      recommendations.push('Consider using CSS sprites for small icons');
    } else if (metric.includes('HTTP Requests')) {
      recommendations.push('Combine multiple files where possible');
      recommendations.push('Use asset embedding for small resources');
      recommendations.push('Enable HTTP/2 for better multiplexing');
      recommendations.push('Implement resource bundling');
    } else if (metric.includes('DOM')) {
      recommendations.push('Simplify HTML structure');
      recommendations.push('Reduce nesting depth');
      recommendations.push('Remove unnecessary wrapper elements');
      recommendations.push('Use CSS Grid/Flexbox instead of nested divs');
    }

    return recommendations;
  }

  /**
   * Check if path is an image
   */
  private isImagePath(path: string): boolean {
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp', '.avif', '.bmp', '.ico'];
    return imageExtensions.some(ext => path.toLowerCase().endsWith(ext));
  }

  /**
   * Count fonts in CSS
   */
  private countFonts($: cheerio.CheerioAPI, css: string[]): number {
    let fontCount = 0;

    // Count from link tags
    $('link[href*="fonts"]').each(() => fontCount++);

    // Count from CSS @font-face rules
    const cssContent = css.join('\n');
    const fontFaceMatches = cssContent.match(/@font-face/g);
    if (fontFaceMatches) {
      fontCount += fontFaceMatches.length;
    }

    return fontCount;
  }

  /**
   * Calculate maximum DOM depth
   */
  private calculateDOMDepth($: cheerio.CheerioAPI): number {
    let maxDepth = 0;

    const traverse = (element: cheerio.Element, depth: number) => {
      maxDepth = Math.max(maxDepth, depth);
      $(element).children().each((_, child) => {
        traverse(child, depth + 1);
      });
    };

    $('body').each((_, body) => traverse(body, 0));

    return maxDepth;
  }

  /**
   * Format bytes to human-readable string
   */
  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';

    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  }

  /**
   * Generate budget report
   */
  generateReport(result: BudgetValidationResult): string {
    const lines: string[] = [
      '# Performance Budget Validation Report',
      '',
      `Status: ${result.passed ? '✅ PASSED' : '❌ FAILED'}`,
      `Can Export: ${result.canExport ? 'Yes' : 'No'}`,
      `Requires Override: ${result.requiresOverride ? 'Yes' : 'No'}`,
      '',
      '## Summary',
      `- Total Violations: ${result.summary.totalViolations}`,
      `- Critical Violations: ${result.summary.criticalViolations}`,
      `- Warnings: ${result.summary.totalWarnings}`,
      `- Budget Utilization: ${result.summary.budgetUtilization.toFixed(1)}%`,
      '',
      '## Metrics',
      `- HTML Size: ${this.formatBytes(result.metrics.htmlSize)} (Gzip: ${this.formatBytes(result.metrics.htmlGzipSize)})`,
      `- CSS Size: ${this.formatBytes(result.metrics.cssSize)} (Gzip: ${this.formatBytes(result.metrics.cssGzipSize)})`,
      `- JavaScript Size: ${this.formatBytes(result.metrics.jsSize)} (Gzip: ${this.formatBytes(result.metrics.jsGzipSize)})`,
      `- Image Size: ${this.formatBytes(result.metrics.imageSize)}`,
      `- Total Size: ${this.formatBytes(result.metrics.totalSize)} (Gzip: ${this.formatBytes(result.metrics.totalGzipSize)})`,
      `- HTTP Requests: ${result.metrics.httpRequests}`,
      `- DOM Nodes: ${result.metrics.domNodes}`,
      `- DOM Depth: ${result.metrics.domDepth}`,
      '',
    ];

    if (result.violations.length > 0) {
      lines.push('## Violations');
      result.violations.forEach(v => {
        lines.push(`### ${v.metric} [${v.severity.toUpperCase()}]`);
        lines.push(`- ${v.message}`);
        lines.push('- Recommendations:');
        v.recommendations.forEach(r => lines.push(`  - ${r}`));
        lines.push('');
      });
    }

    if (result.warnings.length > 0) {
      lines.push('## Warnings');
      result.warnings.forEach(w => {
        lines.push(`- ${w.message}`);
      });
      lines.push('');
    }

    return lines.join('\n');
  }
}

// Export singleton instance
export default new PerformanceBudgetService();
