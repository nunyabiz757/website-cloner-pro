import puppeteer, { Browser } from 'puppeteer';
import lighthouse from 'lighthouse';
import * as cheerio from 'cheerio';
import type {
  PerformanceAnalysis,
  PerformanceMetrics,
  PerformanceIssue,
  MetricData,
  LighthouseReport,
  Diagnostic,
  ClonedWebsite,
} from '../../shared/types/index.js';
import crypto from 'crypto';

export class PerformanceService {
  private browser: Browser | null = null;

  async initialize() {
    if (!this.browser) {
      this.browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--remote-debugging-port=9222'],
      });
    }
  }

  async shutdown() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  /**
   * Run comprehensive performance analysis on a cloned website
   */
  async analyzePerformance(
    website: ClonedWebsite,
    url?: string
  ): Promise<PerformanceAnalysis> {
    await this.initialize();

    const targetUrl = url || this.createLocalUrl(website.id);

    // Run Lighthouse audit
    const lighthouseResult = await this.runLighthouse(targetUrl);

    // Extract Core Web Vitals and other metrics
    const metrics = this.extractMetrics(lighthouseResult);

    // Identify performance issues
    const issues = await this.identifyIssues(website, lighthouseResult);

    // Extract diagnostics
    const diagnostics = this.extractDiagnostics(lighthouseResult);

    const analysis: PerformanceAnalysis = {
      id: crypto.randomUUID(),
      websiteId: website.id,
      metrics,
      issues: issues.filter((i) => i.severity === 'critical' || i.severity === 'high'),
      opportunities: issues.filter((i) => i.severity === 'medium' || i.severity === 'low'),
      diagnostics,
      lighthouse: this.formatLighthouseReport(lighthouseResult),
      analyzedAt: new Date().toISOString(),
    };

    return analysis;
  }

  /**
   * Run Lighthouse audit
   */
  private async runLighthouse(url: string): Promise<any> {
    try {
      const result = await lighthouse(url, {
        port: 9222,
        output: 'json',
        onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'],
      });

      return result;
    } catch (error) {
      console.error('Lighthouse audit failed:', error);
      throw new Error('Failed to run performance analysis');
    }
  }

  /**
   * Extract performance metrics from Lighthouse result
   */
  private extractMetrics(lighthouseResult: any): PerformanceMetrics {
    const audits = lighthouseResult.lhr.audits;

    return {
      lcp: this.createMetricData(audits['largest-contentful-paint'], 2500, 4000, 'ms'),
      fid: this.createMetricData(audits['max-potential-fid'], 100, 300, 'ms'),
      inp: this.createMetricData(
        audits['experimental-interaction-to-next-paint'],
        100,
        300,
        'ms'
      ),
      cls: this.createMetricData(audits['cumulative-layout-shift'], 0.1, 0.25, ''),
      fcp: this.createMetricData(audits['first-contentful-paint'], 1800, 3000, 'ms'),
      tbt: this.createMetricData(audits['total-blocking-time'], 200, 600, 'ms'),
      speedIndex: this.createMetricData(audits['speed-index'], 3400, 5800, 'ms'),
      tti: this.createMetricData(audits['interactive'], 3800, 7300, 'ms'),
      ttfb: this.createMetricData(audits['server-response-time'], 600, 1800, 'ms'),
      performanceScore: Math.round((lighthouseResult.lhr.categories.performance?.score || 0) * 100),
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Create metric data with rating
   */
  private createMetricData(
    audit: any,
    goodThreshold: number,
    poorThreshold: number,
    unit: string
  ): MetricData {
    const value = audit?.numericValue || 0;

    let rating: 'good' | 'needs-improvement' | 'poor';
    if (value <= goodThreshold) {
      rating = 'good';
    } else if (value <= poorThreshold) {
      rating = 'needs-improvement';
    } else {
      rating = 'poor';
    }

    return {
      value,
      rating,
      target: goodThreshold,
      unit,
    };
  }

  /**
   * Identify performance issues from Lighthouse and custom analysis
   */
  private async identifyIssues(
    website: ClonedWebsite,
    lighthouseResult: any
  ): Promise<PerformanceIssue[]> {
    const issues: PerformanceIssue[] = [];
    const audits = lighthouseResult.lhr.audits;

    // Image optimization issues
    if (audits['modern-image-formats'] && audits['modern-image-formats'].score < 1) {
      issues.push(this.createImageFormatIssue(audits['modern-image-formats']));
    }

    if (audits['uses-optimized-images'] && audits['uses-optimized-images'].score < 1) {
      issues.push(this.createImageOptimizationIssue(audits['uses-optimized-images']));
    }

    if (audits['offscreen-images'] && audits['offscreen-images'].score < 1) {
      issues.push(this.createLazyLoadIssue(audits['offscreen-images']));
    }

    // CSS optimization issues
    if (audits['unused-css-rules'] && audits['unused-css-rules'].score < 1) {
      issues.push(this.createUnusedCSSIssue(audits['unused-css-rules']));
    }

    if (audits['render-blocking-resources'] && audits['render-blocking-resources'].score < 1) {
      issues.push(this.createRenderBlockingIssue(audits['render-blocking-resources']));
    }

    // JavaScript issues
    if (audits['unused-javascript'] && audits['unused-javascript'].score < 1) {
      issues.push(this.createUnusedJSIssue(audits['unused-javascript']));
    }

    if (audits['unminified-javascript'] && audits['unminified-javascript'].score < 1) {
      issues.push(this.createUnminifiedJSIssue(audits['unminified-javascript']));
    }

    // Font optimization
    if (audits['font-display'] && audits['font-display'].score < 1) {
      issues.push(this.createFontDisplayIssue(audits['font-display']));
    }

    // Layout stability
    if (audits['cumulative-layout-shift'] && audits['cumulative-layout-shift'].score < 0.9) {
      issues.push(this.createCLSIssue(audits['cumulative-layout-shift'], website));
    }

    // Third-party scripts
    if (audits['third-party-summary'] && audits['third-party-summary'].details) {
      const thirdPartyIssue = this.createThirdPartyIssue(audits['third-party-summary']);
      if (thirdPartyIssue) issues.push(thirdPartyIssue);
    }

    // Custom analysis: missing image dimensions
    const missingDimensionsIssue = await this.checkMissingImageDimensions(website);
    if (missingDimensionsIssue) issues.push(missingDimensionsIssue);

    return issues;
  }

  /**
   * Create specific issue types
   */
  private createImageFormatIssue(audit: any): PerformanceIssue {
    return {
      id: crypto.randomUUID(),
      title: 'Serve images in next-gen formats',
      description: 'Image formats like WebP and AVIF provide better compression than PNG or JPEG.',
      category: 'images',
      severity: 'high',
      impact: 75,
      estimatedSavings: {
        bytes: audit.details?.overallSavingsBytes || 0,
        ms: audit.details?.overallSavingsMs || 0,
      },
      affectedMetrics: ['LCP', 'FCP'],
      fixComplexity: 'easy',
      autoFixable: true,
      suggestedFix: 'Convert images to WebP format with JPEG/PNG fallbacks',
      beforeCode: '<img src="image.jpg" alt="Example">',
      afterCode: `<picture>
  <source srcset="image.webp" type="image/webp">
  <img src="image.jpg" alt="Example" width="800" height="600" loading="lazy">
</picture>`,
    };
  }

  private createImageOptimizationIssue(audit: any): PerformanceIssue {
    return {
      id: crypto.randomUUID(),
      title: 'Optimize images',
      description: 'Properly sized and compressed images can significantly reduce page weight.',
      category: 'images',
      severity: 'high',
      impact: 80,
      estimatedSavings: {
        bytes: audit.details?.overallSavingsBytes || 0,
        ms: audit.details?.overallSavingsMs || 0,
      },
      affectedMetrics: ['LCP', 'FCP', 'TBT'],
      fixComplexity: 'easy',
      autoFixable: true,
      suggestedFix: 'Compress images and generate responsive srcset',
    };
  }

  private createLazyLoadIssue(audit: any): PerformanceIssue {
    return {
      id: crypto.randomUUID(),
      title: 'Defer offscreen images',
      description: 'Images below the fold should be lazy loaded to improve initial load time.',
      category: 'images',
      severity: 'medium',
      impact: 60,
      estimatedSavings: {
        bytes: audit.details?.overallSavingsBytes || 0,
        ms: audit.details?.overallSavingsMs || 0,
      },
      affectedMetrics: ['LCP', 'TBT'],
      fixComplexity: 'easy',
      autoFixable: true,
      suggestedFix: 'Add loading="lazy" attribute to offscreen images',
      afterCode: '<img src="image.jpg" alt="Example" loading="lazy" width="800" height="600">',
    };
  }

  private createUnusedCSSIssue(audit: any): PerformanceIssue {
    return {
      id: crypto.randomUUID(),
      title: 'Remove unused CSS',
      description: 'Unused CSS rules increase file size and parsing time.',
      category: 'css',
      severity: 'medium',
      impact: 55,
      estimatedSavings: {
        bytes: audit.details?.overallSavingsBytes || 0,
        ms: audit.details?.overallSavingsMs || 0,
      },
      affectedMetrics: ['FCP', 'TBT'],
      fixComplexity: 'medium',
      autoFixable: true,
      suggestedFix: 'Use PurgeCSS to remove unused styles',
    };
  }

  private createRenderBlockingIssue(audit: any): PerformanceIssue {
    return {
      id: crypto.randomUUID(),
      title: 'Eliminate render-blocking resources',
      description: 'Resources are blocking the first paint of your page.',
      category: 'render',
      severity: 'critical',
      impact: 90,
      estimatedSavings: {
        ms: audit.details?.overallSavingsMs || 0,
      },
      affectedMetrics: ['FCP', 'LCP', 'Speed Index'],
      fixComplexity: 'medium',
      autoFixable: true,
      suggestedFix: 'Inline critical CSS and defer non-critical stylesheets',
      afterCode: `<style>/* Critical CSS */</style>
<link rel="preload" href="styles.css" as="style" onload="this.rel='stylesheet'">`,
    };
  }

  private createUnusedJSIssue(audit: any): PerformanceIssue {
    return {
      id: crypto.randomUUID(),
      title: 'Remove unused JavaScript',
      description: 'Unused JavaScript increases parse and execution time.',
      category: 'javascript',
      severity: 'medium',
      impact: 50,
      estimatedSavings: {
        bytes: audit.details?.overallSavingsBytes || 0,
        ms: audit.details?.overallSavingsMs || 0,
      },
      affectedMetrics: ['TBT', 'TTI'],
      fixComplexity: 'hard',
      autoFixable: false,
      suggestedFix: 'Use code splitting and tree shaking',
    };
  }

  private createUnminifiedJSIssue(audit: any): PerformanceIssue {
    return {
      id: crypto.randomUUID(),
      title: 'Minify JavaScript',
      description: 'Minifying JavaScript files can reduce payload sizes and script parse time.',
      category: 'javascript',
      severity: 'medium',
      impact: 45,
      estimatedSavings: {
        bytes: audit.details?.overallSavingsBytes || 0,
        ms: audit.details?.overallSavingsMs || 0,
      },
      affectedMetrics: ['TBT', 'TTI'],
      fixComplexity: 'easy',
      autoFixable: true,
      suggestedFix: 'Use Terser to minify JavaScript files',
    };
  }

  private createFontDisplayIssue(audit: any): PerformanceIssue {
    return {
      id: crypto.randomUUID(),
      title: 'Optimize font loading',
      description: 'Font loading can cause layout shifts and delayed text rendering.',
      category: 'fonts',
      severity: 'medium',
      impact: 40,
      estimatedSavings: {
        ms: audit.details?.overallSavingsMs || 0,
      },
      affectedMetrics: ['CLS', 'FCP'],
      fixComplexity: 'easy',
      autoFixable: true,
      suggestedFix: 'Add font-display: swap to @font-face declarations',
      afterCode: `@font-face {
  font-family: 'MyFont';
  font-display: swap;
  src: url('font.woff2') format('woff2');
}`,
    };
  }

  private createCLSIssue(audit: any, website: ClonedWebsite): PerformanceIssue {
    return {
      id: crypto.randomUUID(),
      title: 'Reduce Cumulative Layout Shift',
      description: 'Layout shifts can be caused by images without dimensions, fonts, or dynamic content.',
      category: 'layout-stability',
      severity: audit.score < 0.5 ? 'critical' : 'high',
      impact: 85,
      estimatedSavings: {},
      affectedMetrics: ['CLS'],
      fixComplexity: 'medium',
      autoFixable: true,
      suggestedFix: 'Add explicit width/height to images and reserve space for dynamic content',
      afterCode: '<img src="image.jpg" alt="Example" width="800" height="600">',
    };
  }

  private createThirdPartyIssue(audit: any): PerformanceIssue | null {
    const savings = audit.details?.overallSavingsMs || 0;
    if (savings < 100) return null;

    return {
      id: crypto.randomUUID(),
      title: 'Reduce third-party script impact',
      description: 'Third-party scripts can significantly slow down your page.',
      category: 'third-party',
      severity: savings > 1000 ? 'high' : 'medium',
      impact: 65,
      estimatedSavings: {
        ms: savings,
      },
      affectedMetrics: ['TBT', 'TTI'],
      fixComplexity: 'medium',
      autoFixable: false,
      suggestedFix: 'Defer non-critical third-party scripts and consider facades for heavy embeds',
    };
  }

  private async checkMissingImageDimensions(website: ClonedWebsite): Promise<PerformanceIssue | null> {
    const $ = cheerio.load(website.html);
    const imagesWithoutDimensions = $('img:not([width]):not([height])').length;

    if (imagesWithoutDimensions === 0) return null;

    return {
      id: crypto.randomUUID(),
      title: 'Add explicit image dimensions',
      description: `${imagesWithoutDimensions} images are missing width/height attributes, causing layout shifts.`,
      category: 'layout-stability',
      severity: 'high',
      impact: 70,
      estimatedSavings: {},
      affectedMetrics: ['CLS'],
      fixComplexity: 'easy',
      autoFixable: true,
      suggestedFix: 'Add width and height attributes to all images',
      afterCode: '<img src="image.jpg" alt="Example" width="800" height="600">',
    };
  }

  /**
   * Extract diagnostics from Lighthouse
   */
  private extractDiagnostics(lighthouseResult: any): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    const audits = lighthouseResult.lhr.audits;

    // Network diagnostics
    if (audits['network-requests']) {
      diagnostics.push({
        id: crypto.randomUUID(),
        title: 'Network Requests',
        description: 'Analysis of all network requests',
        details: audits['network-requests'].details,
      });
    }

    // Main thread work
    if (audits['mainthread-work-breakdown']) {
      diagnostics.push({
        id: crypto.randomUUID(),
        title: 'Main Thread Work',
        description: 'Breakdown of main thread activity',
        details: audits['mainthread-work-breakdown'].details,
      });
    }

    return diagnostics;
  }

  /**
   * Format Lighthouse report
   */
  private formatLighthouseReport(lighthouseResult: any): LighthouseReport {
    const categories = lighthouseResult.lhr.categories;

    return {
      performanceScore: Math.round((categories.performance?.score || 0) * 100),
      accessibilityScore: Math.round((categories.accessibility?.score || 0) * 100),
      bestPracticesScore: Math.round((categories['best-practices']?.score || 0) * 100),
      seoScore: Math.round((categories.seo?.score || 0) * 100),
      audits: lighthouseResult.lhr.audits,
    };
  }

  /**
   * Create local URL for testing (for development)
   */
  private createLocalUrl(websiteId: string): string {
    return `http://localhost:5000/uploads/${websiteId}/index.html`;
  }
}

export default new PerformanceService();
