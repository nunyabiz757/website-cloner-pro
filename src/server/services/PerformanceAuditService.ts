import { CoreWebVitalsService } from './CoreWebVitalsService.js';
import { PerformanceMetricsService } from './PerformanceMetricsService.js';
import { AssetOptimizationService } from './AssetOptimizationService.js';
import { CriticalCSSService } from './CriticalCSSService.js';
import { ResponsiveBreakpointService } from './ResponsiveBreakpointService.js';
import { AnimationPreservationService } from './AnimationPreservationService.js';
import { FrameworkDetectionService } from './FrameworkDetectionService.js';
import { DependencyInliningService } from './DependencyInliningService.js';
import { ThirdPartyIntegrationService } from './ThirdPartyIntegrationService.js';

interface AuditOptions {
  url: string;
  htmlContent?: string;
  cssContent?: string[];
  jsContent?: string[];
  includeWebVitals?: boolean;
  includeAssetOptimization?: boolean;
  includeCriticalCSS?: boolean;
  includeResponsive?: boolean;
  includeAnimations?: boolean;
  includeFrameworks?: boolean;
  includeDependencies?: boolean;
  includeThirdParty?: boolean;
}

interface ComprehensiveAudit {
  summary: {
    overallScore: number;
    performanceScore: number;
    optimizationScore: number;
    securityScore: number;
    totalIssues: number;
    criticalIssues: number;
  };
  webVitals?: any;
  performanceMetrics?: any;
  assetOptimization?: any;
  criticalCSS?: any;
  responsive?: any;
  animations?: any;
  frameworks?: any;
  dependencies?: any;
  thirdParty?: any;
  recommendations: {
    priority: 'critical' | 'high' | 'medium' | 'low';
    category: string;
    title: string;
    description: string;
    impact: string;
    effort: 'easy' | 'medium' | 'hard';
  }[];
  executionTime: number;
}

export class PerformanceAuditService {
  private coreWebVitalsService: CoreWebVitalsService;
  private performanceMetricsService: PerformanceMetricsService;
  private assetOptimizationService: AssetOptimizationService;
  private criticalCSSService: CriticalCSSService;
  private responsiveBreakpointService: ResponsiveBreakpointService;
  private animationPreservationService: AnimationPreservationService;
  private frameworkDetectionService: FrameworkDetectionService;
  private dependencyInliningService: DependencyInliningService;
  private thirdPartyIntegrationService: ThirdPartyIntegrationService;

  constructor() {
    this.coreWebVitalsService = new CoreWebVitalsService();
    this.performanceMetricsService = new PerformanceMetricsService();
    this.assetOptimizationService = new AssetOptimizationService();
    this.criticalCSSService = new CriticalCSSService();
    this.responsiveBreakpointService = new ResponsiveBreakpointService();
    this.animationPreservationService = new AnimationPreservationService();
    this.frameworkDetectionService = new FrameworkDetectionService();
    this.dependencyInliningService = new DependencyInliningService();
    this.thirdPartyIntegrationService = new ThirdPartyIntegrationService();
  }

  /**
   * Run comprehensive performance audit
   */
  async runComprehensiveAudit(options: AuditOptions): Promise<ComprehensiveAudit> {
    const startTime = Date.now();
    const audit: Partial<ComprehensiveAudit> = {
      recommendations: [],
    };

    try {
      // Run Core Web Vitals analysis
      if (options.includeWebVitals !== false) {
        console.log('Running Core Web Vitals analysis...');
        audit.webVitals = await this.coreWebVitalsService.measureWebVitals(options.url);
      }

      // Run Performance Metrics analysis
      if (options.includeWebVitals !== false) {
        console.log('Running Performance Metrics analysis...');
        audit.performanceMetrics = await this.performanceMetricsService.measurePerformance(
          options.url
        );
      }

      // Run Asset Optimization analysis
      if (options.includeAssetOptimization !== false) {
        console.log('Running Asset Optimization analysis...');
        audit.assetOptimization = await this.assetOptimizationService.analyzeAssets(
          options.url
        );
      }

      // Run Critical CSS extraction
      if (options.includeCriticalCSS !== false && options.cssContent) {
        console.log('Extracting Critical CSS...');
        audit.criticalCSS = await this.criticalCSSService.extractCriticalCSS(
          options.url,
          options.cssContent
        );
      }

      // Run Responsive analysis
      if (options.includeResponsive !== false) {
        console.log('Analyzing Responsive Design...');
        audit.responsive = await this.responsiveBreakpointService.analyzeResponsiveDesign(
          options.url,
          options.cssContent
        );
      }

      // Run Animation analysis
      if (options.includeAnimations !== false && options.htmlContent) {
        console.log('Analyzing Animations...');
        audit.animations = await this.animationPreservationService.analyzeAnimations(
          options.url,
          options.htmlContent,
          options.cssContent
        );
      }

      // Run Framework detection
      if (options.includeFrameworks !== false && options.htmlContent) {
        console.log('Detecting Frameworks...');
        audit.frameworks = await this.frameworkDetectionService.detectFrameworks(
          options.htmlContent,
          options.jsContent,
          options.cssContent
        );
      }

      // Run Dependency analysis
      if (options.includeDependencies !== false && options.htmlContent) {
        console.log('Analyzing Dependencies...');
        audit.dependencies = await this.dependencyInliningService.inlineDependencies(
          options.htmlContent,
          options.url
        );
      }

      // Run Third-party integration analysis
      if (options.includeThirdParty !== false && options.htmlContent) {
        console.log('Analyzing Third-party Integrations...');
        audit.thirdParty = await this.thirdPartyIntegrationService.analyzeIntegrations(
          options.htmlContent,
          options.jsContent
        );
      }

      // Generate consolidated recommendations
      audit.recommendations = this.generateConsolidatedRecommendations(audit);

      // Calculate scores
      const summary = this.calculateScores(audit);
      audit.summary = summary;

      audit.executionTime = Date.now() - startTime;

      return audit as ComprehensiveAudit;
    } catch (error) {
      console.error('Audit failed:', error);
      throw error;
    }
  }

  /**
   * Calculate overall scores
   */
  private calculateScores(audit: Partial<ComprehensiveAudit>): ComprehensiveAudit['summary'] {
    let performanceScore = 100;
    let optimizationScore = 100;
    let securityScore = 100;
    let totalIssues = 0;
    let criticalIssues = 0;

    // Core Web Vitals impact on performance score
    if (audit.webVitals) {
      if (audit.webVitals.lcp?.rating === 'poor') performanceScore -= 15;
      else if (audit.webVitals.lcp?.rating === 'needs-improvement') performanceScore -= 7;

      if (audit.webVitals.fid?.rating === 'poor') performanceScore -= 15;
      else if (audit.webVitals.fid?.rating === 'needs-improvement') performanceScore -= 7;

      if (audit.webVitals.cls?.rating === 'poor') performanceScore -= 15;
      else if (audit.webVitals.cls?.rating === 'needs-improvement') performanceScore -= 7;
    }

    // Performance Metrics impact
    if (audit.performanceMetrics) {
      if (audit.performanceMetrics.tbt?.rating === 'poor') performanceScore -= 10;
      if (audit.performanceMetrics.tti?.rating === 'poor') performanceScore -= 10;
    }

    // Asset optimization impact
    if (audit.assetOptimization) {
      const savingsPercent =
        (audit.assetOptimization.potentialSavings / audit.assetOptimization.totalSize) * 100;
      if (savingsPercent > 50) optimizationScore -= 30;
      else if (savingsPercent > 30) optimizationScore -= 20;
      else if (savingsPercent > 15) optimizationScore -= 10;

      totalIssues += audit.assetOptimization.assets.filter((a: any) => a.issues.length > 0)
        .length;
    }

    // Third-party integration impact on security
    if (audit.thirdParty) {
      if (audit.thirdParty.trackingFound && !audit.thirdParty.gdprCompliant) {
        securityScore -= 40;
        criticalIssues += 1;
      }

      const highPrivacyIntegrations = audit.thirdParty.integrations.filter(
        (i: any) => i.privacyImpact === 'high'
      );
      securityScore -= highPrivacyIntegrations.length * 5;
      totalIssues += audit.thirdParty.integrations.length;
    }

    // Framework issues
    if (audit.frameworks) {
      totalIssues += audit.frameworks.recommendations?.length || 0;
    }

    // Responsive issues
    if (audit.responsive) {
      totalIssues += audit.responsive.recommendations?.length || 0;
    }

    // Animation issues
    if (audit.animations) {
      totalIssues += audit.animations.recommendations?.length || 0;
    }

    const overallScore = Math.round(
      (performanceScore * 0.4 + optimizationScore * 0.3 + securityScore * 0.3)
    );

    return {
      overallScore: Math.max(0, overallScore),
      performanceScore: Math.max(0, Math.round(performanceScore)),
      optimizationScore: Math.max(0, Math.round(optimizationScore)),
      securityScore: Math.max(0, Math.round(securityScore)),
      totalIssues,
      criticalIssues,
    };
  }

  /**
   * Generate consolidated recommendations
   */
  private generateConsolidatedRecommendations(
    audit: Partial<ComprehensiveAudit>
  ): ComprehensiveAudit['recommendations'] {
    const recommendations: ComprehensiveAudit['recommendations'] = [];

    // Web Vitals recommendations
    if (audit.webVitals) {
      if (audit.webVitals.lcp?.rating === 'poor') {
        recommendations.push({
          priority: 'critical',
          category: 'Performance',
          title: 'Improve Largest Contentful Paint (LCP)',
          description: `LCP is ${audit.webVitals.lcp.value}ms (threshold: 2500ms). Optimize largest content element loading.`,
          impact: 'High - Directly affects user experience and Core Web Vitals score',
          effort: 'medium',
        });
      }

      if (audit.webVitals.cls?.rating === 'poor') {
        recommendations.push({
          priority: 'critical',
          category: 'Performance',
          title: 'Fix Cumulative Layout Shift (CLS)',
          description: `CLS score is ${audit.webVitals.cls.value} (threshold: 0.1). Add size attributes to images and avoid dynamic content insertion.`,
          impact: 'High - Prevents layout instability and improves user experience',
          effort: 'easy',
        });
      }
    }

    // Asset optimization recommendations
    if (audit.assetOptimization) {
      const savingsMB = audit.assetOptimization.potentialSavings / 1024 / 1024;
      if (savingsMB > 1) {
        recommendations.push({
          priority: 'high',
          category: 'Optimization',
          title: 'Optimize Assets',
          description: `Potential savings: ${savingsMB.toFixed(2)} MB through image compression, modern formats, and code minification.`,
          impact: 'High - Reduces bandwidth usage and improves load times',
          effort: 'easy',
        });
      }
    }

    // Critical CSS recommendations
    if (audit.criticalCSS && audit.criticalCSS.savings > 50) {
      recommendations.push({
        priority: 'high',
        category: 'Optimization',
        title: 'Implement Critical CSS',
        description: `Inline critical CSS to reduce render-blocking. Potential ${audit.criticalCSS.savings}% reduction in initial CSS.`,
        impact: 'High - Improves First Contentful Paint (FCP)',
        effort: 'medium',
      });
    }

    // Third-party integration recommendations
    if (audit.thirdParty) {
      if (audit.thirdParty.trackingFound && !audit.thirdParty.gdprCompliant) {
        recommendations.push({
          priority: 'critical',
          category: 'Security',
          title: 'Implement GDPR-Compliant Cookie Consent',
          description:
            'Tracking detected without visible consent mechanism. Add cookie consent banner.',
          impact: 'Critical - Legal compliance and user privacy',
          effort: 'easy',
        });
      }

      if (audit.thirdParty.thirdPartyDomains?.length > 10) {
        recommendations.push({
          priority: 'medium',
          category: 'Performance',
          title: 'Reduce Third-Party Scripts',
          description: `${audit.thirdParty.thirdPartyDomains.length} third-party domains detected. Consider consolidating or lazy-loading.`,
          impact: 'Medium - Reduces DNS lookups and improves security',
          effort: 'medium',
        });
      }
    }

    // Framework recommendations
    if (audit.frameworks && audit.frameworks.frameworks?.length > 1) {
      recommendations.push({
        priority: 'medium',
        category: 'Architecture',
        title: 'Consolidate Frameworks',
        description: `Multiple frameworks detected: ${audit.frameworks.frameworks.map((f: any) => f.name).join(', ')}. Consider using a single framework.`,
        impact: 'Medium - Reduces bundle size and complexity',
        effort: 'hard',
      });
    }

    // Responsive recommendations
    if (audit.responsive && audit.responsive.breakpoints?.length === 0) {
      recommendations.push({
        priority: 'high',
        category: 'Design',
        title: 'Add Responsive Breakpoints',
        description: 'No responsive breakpoints detected. Implement mobile-first design.',
        impact: 'High - Improves mobile user experience',
        effort: 'medium',
      });
    }

    // Sort by priority
    const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    recommendations.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

    return recommendations;
  }

  /**
   * Generate audit report (HTML format)
   */
  generateHTMLReport(audit: ComprehensiveAudit): string {
    const scoreColor = (score: number) => {
      if (score >= 90) return '#4CAF50';
      if (score >= 70) return '#FF9800';
      return '#f44336';
    };

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Performance Audit Report</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background: #f5f5f5; }
    .container { max-width: 1200px; margin: 0 auto; background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
    h1 { color: #333; border-bottom: 3px solid #2196F3; padding-bottom: 10px; }
    .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin: 30px 0; }
    .score-card { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 8px; text-align: center; }
    .score-card h3 { margin: 0 0 10px 0; font-size: 14px; opacity: 0.9; }
    .score-card .score { font-size: 48px; font-weight: bold; margin: 10px 0; }
    .recommendations { margin-top: 30px; }
    .recommendation { background: #fff; border-left: 4px solid #2196F3; padding: 15px; margin: 15px 0; border-radius: 4px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    .recommendation.critical { border-left-color: #f44336; }
    .recommendation.high { border-left-color: #FF9800; }
    .recommendation.medium { border-left-color: #FFC107; }
    .recommendation.low { border-left-color: #4CAF50; }
    .recommendation h4 { margin: 0 0 10px 0; color: #333; }
    .recommendation p { margin: 5px 0; color: #666; font-size: 14px; }
    .badge { display: inline-block; padding: 4px 8px; border-radius: 3px; font-size: 12px; font-weight: bold; margin-right: 10px; }
    .badge.critical { background: #ffebee; color: #c62828; }
    .badge.high { background: #fff3e0; color: #e65100; }
    .badge.medium { background: #fff9c4; color: #f57f17; }
    .badge.low { background: #e8f5e9; color: #2e7d32; }
  </style>
</head>
<body>
  <div class="container">
    <h1>📊 Performance Audit Report</h1>
    <p><strong>Execution Time:</strong> ${(audit.executionTime / 1000).toFixed(2)}s</p>

    <div class="summary">
      <div class="score-card" style="background: linear-gradient(135deg, ${scoreColor(audit.summary.overallScore)} 0%, ${scoreColor(audit.summary.overallScore)}dd 100%);">
        <h3>Overall Score</h3>
        <div class="score">${audit.summary.overallScore}</div>
      </div>
      <div class="score-card">
        <h3>Performance</h3>
        <div class="score">${audit.summary.performanceScore}</div>
      </div>
      <div class="score-card">
        <h3>Optimization</h3>
        <div class="score">${audit.summary.optimizationScore}</div>
      </div>
      <div class="score-card">
        <h3>Security</h3>
        <div class="score">${audit.summary.securityScore}</div>
      </div>
    </div>

    <div style="background: #e3f2fd; padding: 15px; border-radius: 4px; margin: 20px 0;">
      <strong>Total Issues:</strong> ${audit.summary.totalIssues} &nbsp;|&nbsp;
      <strong>Critical Issues:</strong> ${audit.summary.criticalIssues}
    </div>

    <div class="recommendations">
      <h2>🎯 Recommendations</h2>
      ${audit.recommendations
        .map(
          (rec) => `
        <div class="recommendation ${rec.priority}">
          <h4>
            <span class="badge ${rec.priority}">${rec.priority.toUpperCase()}</span>
            ${rec.title}
          </h4>
          <p><strong>Category:</strong> ${rec.category}</p>
          <p><strong>Description:</strong> ${rec.description}</p>
          <p><strong>Impact:</strong> ${rec.impact}</p>
          <p><strong>Effort:</strong> ${rec.effort}</p>
        </div>
      `
        )
        .join('')}
    </div>
  </div>
</body>
</html>
    `;
  }
}
