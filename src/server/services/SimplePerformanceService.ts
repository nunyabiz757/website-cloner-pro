/**
 * SimplePerformanceService - Lighthouse-free performance analysis
 *
 * Uses file size analysis and static code inspection
 * Trade-off: No real browser metrics or Core Web Vitals
 * Benefit: 50MB smaller, instant results, works in bolt.new
 */

import * as cheerio from 'cheerio';
import { gzipSync } from 'zlib';

interface PerformanceMetrics {
  score: number; // 0-100
  metrics: {
    htmlSize: number;
    cssSize: number;
    jsSize: number;
    imageCount: number;
    imageSize: number;
    totalSize: number;
    gzippedSize: number;
    externalResources: number;
    renderBlockingResources: number;
    inlineScripts: number;
    inlineStyles: number;
  };
  issues: PerformanceIssue[];
  recommendations: string[];
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
}

interface PerformanceIssue {
  priority: 'critical' | 'high' | 'medium' | 'low';
  category: string;
  title: string;
  description: string;
  impact: string;
  fix?: string;
}

export class SimplePerformanceService {
  /**
   * Analyze website performance from HTML/CSS/JS
   */
  async analyzePerformance(
    html: string,
    css: string[] = [],
    js: string[] = []
  ): Promise<PerformanceMetrics> {
    const $ = cheerio.load(html);

    // Calculate sizes
    const htmlSize = Buffer.byteLength(html, 'utf8');
    const cssSize = css.reduce((sum, c) => sum + Buffer.byteLength(c, 'utf8'), 0);
    const jsSize = js.reduce((sum, j) => sum + Buffer.byteLength(j, 'utf8'), 0);

    // Count images
    const images = $('img');
    const imageCount = images.length;
    const imageSize = this.estimateImageSize($);

    // Total size
    const totalSize = htmlSize + cssSize + jsSize + imageSize;
    const gzippedSize = gzipSync(html).length;

    // Count external resources
    const externalResources = this.countExternalResources($);
    const renderBlockingResources = this.countRenderBlockingResources($);
    const inlineScripts = $('script:not([src])').length;
    const inlineStyles = $('style').length;

    const metrics = {
      htmlSize,
      cssSize,
      jsSize,
      imageCount,
      imageSize,
      totalSize,
      gzippedSize,
      externalResources,
      renderBlockingResources,
      inlineScripts,
      inlineStyles,
    };

    // Detect issues
    const issues = this.detectIssues(metrics, $);

    // Generate recommendations
    const recommendations = this.generateRecommendations(metrics, issues);

    // Calculate score
    const score = this.calculateScore(metrics, issues);
    const grade = this.getGrade(score);

    return {
      score,
      metrics,
      issues,
      recommendations,
      grade,
    };
  }

  /**
   * Calculate performance score (0-100)
   */
  private calculateScore(metrics: any, issues: PerformanceIssue[]): number {
    let score = 100;

    // Size penalties
    if (metrics.htmlSize > 100000) score -= 5; // >100KB HTML
    if (metrics.htmlSize > 200000) score -= 10; // >200KB HTML

    if (metrics.cssSize > 200000) score -= 10; // >200KB CSS
    if (metrics.cssSize > 500000) score -= 15; // >500KB CSS

    if (metrics.jsSize > 500000) score -= 15; // >500KB JS
    if (metrics.jsSize > 1000000) score -= 20; // >1MB JS

    if (metrics.totalSize > 2000000) score -= 15; // >2MB total
    if (metrics.totalSize > 5000000) score -= 25; // >5MB total

    // Resource count penalties
    if (metrics.externalResources > 20) score -= 5;
    if (metrics.externalResources > 50) score -= 10;

    if (metrics.renderBlockingResources > 3) score -= 10;
    if (metrics.renderBlockingResources > 6) score -= 15;

    if (metrics.imageCount > 30) score -= 5;
    if (metrics.imageCount > 50) score -= 10;

    // Issue penalties
    const criticalIssues = issues.filter((i) => i.priority === 'critical').length;
    const highIssues = issues.filter((i) => i.priority === 'high').length;

    score -= criticalIssues * 10;
    score -= highIssues * 5;

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Detect performance issues
   */
  private detectIssues(metrics: any, $: cheerio.CheerioAPI): PerformanceIssue[] {
    const issues: PerformanceIssue[] = [];

    // Large page size
    if (metrics.totalSize > 5000000) {
      issues.push({
        priority: 'critical',
        category: 'Page Weight',
        title: 'Page size exceeds 5MB',
        description: `Total page size is ${(metrics.totalSize / 1024 / 1024).toFixed(2)}MB`,
        impact: 'Slow load times on mobile and slow connections',
        fix: 'Compress images, minify code, remove unused assets',
      });
    } else if (metrics.totalSize > 2000000) {
      issues.push({
        priority: 'high',
        category: 'Page Weight',
        title: 'Page size exceeds 2MB',
        description: `Total page size is ${(metrics.totalSize / 1024 / 1024).toFixed(2)}MB`,
        impact: 'Moderate load time impact',
        fix: 'Optimize images and code',
      });
    }

    // Render-blocking resources
    if (metrics.renderBlockingResources > 6) {
      issues.push({
        priority: 'critical',
        category: 'Render Blocking',
        title: 'Too many render-blocking resources',
        description: `${metrics.renderBlockingResources} render-blocking CSS/JS files`,
        impact: 'Delayed first paint and interactivity',
        fix: 'Defer non-critical CSS/JS, inline critical CSS',
      });
    } else if (metrics.renderBlockingResources > 3) {
      issues.push({
        priority: 'high',
        category: 'Render Blocking',
        title: 'Multiple render-blocking resources',
        description: `${metrics.renderBlockingResources} render-blocking files`,
        impact: 'Slower initial page render',
        fix: 'Combine files or defer loading',
      });
    }

    // Missing lazy loading
    const imagesWithoutLazy = $('img:not([loading="lazy"])').length;
    if (imagesWithoutLazy > 5) {
      issues.push({
        priority: 'medium',
        category: 'Images',
        title: 'Images missing lazy loading',
        description: `${imagesWithoutLazy} images without lazy loading attribute`,
        impact: 'Unnecessary bandwidth usage',
        fix: 'Add loading="lazy" to offscreen images',
      });
    }

    // Missing image dimensions
    const imagesWithoutDimensions = $('img:not([width]):not([height])').length;
    if (imagesWithoutDimensions > 3) {
      issues.push({
        priority: 'medium',
        category: 'Layout Stability',
        title: 'Images missing dimensions',
        description: `${imagesWithoutDimensions} images without width/height attributes`,
        impact: 'Layout shifts (CLS issues)',
        fix: 'Add explicit width and height to all images',
      });
    }

    // Too many external resources
    if (metrics.externalResources > 50) {
      issues.push({
        priority: 'high',
        category: 'External Resources',
        title: 'Excessive external requests',
        description: `${metrics.externalResources} external resources`,
        impact: 'Slow load due to multiple HTTP requests',
        fix: 'Bundle resources, use CDN, remove unused scripts',
      });
    }

    // No viewport meta tag
    if ($('meta[name="viewport"]').length === 0) {
      issues.push({
        priority: 'high',
        category: 'Mobile',
        title: 'Missing viewport meta tag',
        description: 'No viewport meta tag found',
        impact: 'Poor mobile experience',
        fix: 'Add <meta name="viewport" content="width=device-width, initial-scale=1">',
      });
    }

    // Inline scripts
    if (metrics.inlineScripts > 5) {
      issues.push({
        priority: 'low',
        category: 'Code Organization',
        title: 'Multiple inline scripts',
        description: `${metrics.inlineScripts} inline script tags`,
        impact: 'Harder to cache and optimize',
        fix: 'Move scripts to external files',
      });
    }

    return issues;
  }

  /**
   * Generate recommendations
   */
  private generateRecommendations(metrics: any, issues: PerformanceIssue[]): string[] {
    const recommendations: string[] = [];

    if (metrics.imageCount > 0) {
      recommendations.push('Convert images to WebP/AVIF format for 30-50% size reduction');
      recommendations.push('Add lazy loading to offscreen images');
      recommendations.push('Generate responsive image srcsets for different screen sizes');
    }

    if (metrics.cssSize > 100000) {
      recommendations.push('Minify CSS to reduce file size');
      recommendations.push('Remove unused CSS rules with PurgeCSS');
      recommendations.push('Extract and inline critical CSS for above-the-fold content');
    }

    if (metrics.jsSize > 200000) {
      recommendations.push('Minify JavaScript with Terser');
      recommendations.push('Split code into smaller chunks for lazy loading');
      recommendations.push('Remove unused dependencies and dead code');
    }

    if (metrics.renderBlockingResources > 3) {
      recommendations.push('Defer non-critical CSS and JavaScript');
      recommendations.push('Use async or defer attributes on script tags');
      recommendations.push('Inline critical CSS for first paint');
    }

    if (metrics.externalResources > 20) {
      recommendations.push('Reduce number of third-party scripts');
      recommendations.push('Bundle multiple CSS/JS files together');
      recommendations.push('Use HTTP/2 server push for critical resources');
    }

    return recommendations;
  }

  /**
   * Estimate total image size
   */
  private estimateImageSize($: cheerio.CheerioAPI): number {
    // Rough estimate: average 100KB per image
    const imageCount = $('img').length;
    return imageCount * 100000;
  }

  /**
   * Count external resources
   */
  private countExternalResources($: cheerio.CheerioAPI): number {
    let count = 0;
    count += $('link[rel="stylesheet"]').length;
    count += $('script[src]').length;
    count += $('img[src^="http"]').length;
    return count;
  }

  /**
   * Count render-blocking resources
   */
  private countRenderBlockingResources($: cheerio.CheerioAPI): number {
    let count = 0;
    // CSS files without media queries or disabled
    count += $('link[rel="stylesheet"]:not([media]):not([disabled])').length;
    // Synchronous scripts in head
    count += $('head script[src]:not([async]):not([defer])').length;
    return count;
  }

  /**
   * Get letter grade from score
   */
  private getGrade(score: number): 'A' | 'B' | 'C' | 'D' | 'F' {
    if (score >= 90) return 'A';
    if (score >= 80) return 'B';
    if (score >= 70) return 'C';
    if (score >= 60) return 'D';
    return 'F';
  }

  /**
   * Generate simple performance report
   */
  async generateReport(metrics: PerformanceMetrics): Promise<string> {
    const { score, metrics: m, issues, recommendations, grade } = metrics;

    let report = `# Performance Analysis Report\n\n`;
    report += `## Overall Score: ${score}/100 (Grade: ${grade})\n\n`;

    report += `### Metrics\n`;
    report += `- HTML Size: ${(m.htmlSize / 1024).toFixed(2)} KB\n`;
    report += `- CSS Size: ${(m.cssSize / 1024).toFixed(2)} KB\n`;
    report += `- JavaScript Size: ${(m.jsSize / 1024).toFixed(2)} KB\n`;
    report += `- Total Size: ${(m.totalSize / 1024 / 1024).toFixed(2)} MB\n`;
    report += `- Gzipped Size: ${(m.gzippedSize / 1024).toFixed(2)} KB\n`;
    report += `- Image Count: ${m.imageCount}\n`;
    report += `- External Resources: ${m.externalResources}\n`;
    report += `- Render-Blocking Resources: ${m.renderBlockingResources}\n\n`;

    if (issues.length > 0) {
      report += `### Issues Found (${issues.length})\n\n`;
      issues.forEach((issue, i) => {
        report += `${i + 1}. **[${issue.priority.toUpperCase()}]** ${issue.title}\n`;
        report += `   - ${issue.description}\n`;
        report += `   - Impact: ${issue.impact}\n`;
        if (issue.fix) {
          report += `   - Fix: ${issue.fix}\n`;
        }
        report += `\n`;
      });
    }

    if (recommendations.length > 0) {
      report += `### Recommendations\n\n`;
      recommendations.forEach((rec, i) => {
        report += `${i + 1}. ${rec}\n`;
      });
    }

    return report;
  }
}
