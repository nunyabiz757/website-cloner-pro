import * as cheerio from 'cheerio';
import { URL } from 'url';

interface SEOMetrics {
  score: number; // 0-100
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  issues: SEOIssue[];
  recommendations: string[];
}

interface SEOIssue {
  type: 'error' | 'warning' | 'info';
  category: string;
  message: string;
  impact: 'high' | 'medium' | 'low';
  element?: string;
}

interface MetaTags {
  title?: string;
  description?: string;
  keywords?: string;
  robots?: string;
  canonical?: string;
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;
  ogUrl?: string;
  ogType?: string;
  twitterCard?: string;
  twitterTitle?: string;
  twitterDescription?: string;
  twitterImage?: string;
  viewport?: string;
  charset?: string;
}

interface StructuredData {
  type: string;
  data: any;
  valid: boolean;
  errors: string[];
}

interface SEOAnalysisResult {
  metrics: SEOMetrics;
  metaTags: MetaTags;
  structuredData: StructuredData[];
  headings: {
    h1: string[];
    h2: string[];
    h3: string[];
    h4: string[];
    h5: string[];
    h6: string[];
  };
  links: {
    internal: number;
    external: number;
    broken: number;
    nofollow: number;
  };
  images: {
    total: number;
    withAlt: number;
    withoutAlt: number;
    missingAlt: string[];
  };
  content: {
    wordCount: number;
    readabilityScore: number;
    keywordDensity: { [key: string]: number };
  };
  technical: {
    hasRobotsTxt: boolean;
    hasSitemap: boolean;
    httpsEnabled: boolean;
    mobileResponsive: boolean;
    pageSpeed: number;
  };
}

export class SEOAnalysisService {
  /**
   * Perform comprehensive SEO analysis
   */
  async analyzeSEO(htmlContent: string, url: string): Promise<SEOAnalysisResult> {
    const $ = cheerio.load(htmlContent);
    const issues: SEOIssue[] = [];
    const recommendations: string[] = [];

    // Extract meta tags
    const metaTags = this.extractMetaTags($);

    // Extract structured data
    const structuredData = this.extractStructuredData($);

    // Analyze headings
    const headings = this.analyzeHeadings($);

    // Analyze links
    const links = this.analyzeLinks($, url);

    // Analyze images
    const images = this.analyzeImages($);

    // Analyze content
    const content = this.analyzeContent($);

    // Technical checks
    const technical = {
      hasRobotsTxt: false, // Would need actual check
      hasSitemap: false, // Would need actual check
      httpsEnabled: url.startsWith('https://'),
      mobileResponsive: this.checkMobileResponsive($),
      pageSpeed: 0, // Would need actual measurement
    };

    // Validate meta tags
    this.validateMetaTags(metaTags, issues, recommendations);

    // Validate headings
    this.validateHeadings(headings, issues, recommendations);

    // Validate images
    this.validateImages(images, issues, recommendations);

    // Validate content
    this.validateContent(content, issues, recommendations);

    // Validate structured data
    this.validateStructuredData(structuredData, issues, recommendations);

    // Validate technical SEO
    this.validateTechnical(technical, url, issues, recommendations);

    // Calculate SEO score
    const score = this.calculateSEOScore(issues);
    const grade = this.getGrade(score);

    return {
      metrics: {
        score,
        grade,
        issues,
        recommendations,
      },
      metaTags,
      structuredData,
      headings,
      links,
      images,
      content,
      technical,
    };
  }

  /**
   * Extract meta tags
   */
  private extractMetaTags($: cheerio.CheerioAPI): MetaTags {
    const metaTags: MetaTags = {};

    // Title
    metaTags.title = $('title').first().text().trim();

    // Meta tags
    $('meta').each((_, el) => {
      const $el = $(el);
      const name = $el.attr('name')?.toLowerCase();
      const property = $el.attr('property')?.toLowerCase();
      const content = $el.attr('content');

      if (name === 'description') metaTags.description = content;
      if (name === 'keywords') metaTags.keywords = content;
      if (name === 'robots') metaTags.robots = content;
      if (name === 'viewport') metaTags.viewport = content;

      // Open Graph
      if (property === 'og:title') metaTags.ogTitle = content;
      if (property === 'og:description') metaTags.ogDescription = content;
      if (property === 'og:image') metaTags.ogImage = content;
      if (property === 'og:url') metaTags.ogUrl = content;
      if (property === 'og:type') metaTags.ogType = content;

      // Twitter
      if (name === 'twitter:card') metaTags.twitterCard = content;
      if (name === 'twitter:title') metaTags.twitterTitle = content;
      if (name === 'twitter:description') metaTags.twitterDescription = content;
      if (name === 'twitter:image') metaTags.twitterImage = content;

      // Charset
      if ($el.attr('charset')) metaTags.charset = $el.attr('charset');
    });

    // Canonical
    metaTags.canonical = $('link[rel="canonical"]').attr('href');

    return metaTags;
  }

  /**
   * Extract structured data (JSON-LD, Microdata)
   */
  private extractStructuredData($: cheerio.CheerioAPI): StructuredData[] {
    const structuredData: StructuredData[] = [];

    // JSON-LD
    $('script[type="application/ld+json"]').each((_, el) => {
      try {
        const content = $(el).html();
        if (content) {
          const data = JSON.parse(content);
          structuredData.push({
            type: 'JSON-LD',
            data,
            valid: true,
            errors: [],
          });
        }
      } catch (error) {
        structuredData.push({
          type: 'JSON-LD',
          data: null,
          valid: false,
          errors: [error instanceof Error ? error.message : 'Invalid JSON'],
        });
      }
    });

    // Microdata (basic detection)
    const itemScopes = $('[itemscope]');
    if (itemScopes.length > 0) {
      structuredData.push({
        type: 'Microdata',
        data: { count: itemScopes.length },
        valid: true,
        errors: [],
      });
    }

    return structuredData;
  }

  /**
   * Analyze headings hierarchy
   */
  private analyzeHeadings($: cheerio.CheerioAPI) {
    return {
      h1: $('h1').toArray().map((el) => $(el).text().trim()),
      h2: $('h2').toArray().map((el) => $(el).text().trim()),
      h3: $('h3').toArray().map((el) => $(el).text().trim()),
      h4: $('h4').toArray().map((el) => $(el).text().trim()),
      h5: $('h5').toArray().map((el) => $(el).text().trim()),
      h6: $('h6').toArray().map((el) => $(el).text().trim()),
    };
  }

  /**
   * Analyze links
   */
  private analyzeLinks($: cheerio.CheerioAPI, baseUrl: string): {
    internal: number;
    external: number;
    broken: number;
    nofollow: number;
  } {
    let internal = 0;
    let external = 0;
    let nofollow = 0;

    try {
      const baseHostname = new URL(baseUrl).hostname;

      $('a[href]').each((_, el) => {
        const href = $(el).attr('href');
        const rel = $(el).attr('rel');

        if (!href) return;

        if (rel?.includes('nofollow')) {
          nofollow++;
        }

        if (href.startsWith('http://') || href.startsWith('https://')) {
          try {
            const linkHostname = new URL(href).hostname;
            if (linkHostname === baseHostname) {
              internal++;
            } else {
              external++;
            }
          } catch {}
        } else if (!href.startsWith('#') && !href.startsWith('mailto:') && !href.startsWith('tel:')) {
          internal++;
        }
      });
    } catch (error) {
      console.error('Failed to analyze links:', error);
    }

    return {
      internal,
      external,
      broken: 0, // Would need actual link checking
      nofollow,
    };
  }

  /**
   * Analyze images
   */
  private analyzeImages($: cheerio.CheerioAPI) {
    const images = $('img');
    const total = images.length;
    let withAlt = 0;
    const missingAlt: string[] = [];

    images.each((_, el) => {
      const $img = $(el);
      const alt = $img.attr('alt');
      const src = $img.attr('src');

      if (alt !== undefined && alt.trim()) {
        withAlt++;
      } else if (src) {
        missingAlt.push(src);
      }
    });

    return {
      total,
      withAlt,
      withoutAlt: total - withAlt,
      missingAlt,
    };
  }

  /**
   * Analyze content
   */
  private analyzeContent($: cheerio.CheerioAPI) {
    // Get text content
    const text = $('body').text().trim();
    const words = text.split(/\s+/).filter((w) => w.length > 0);
    const wordCount = words.length;

    // Calculate readability (Flesch Reading Ease approximation)
    const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0);
    const avgWordsPerSentence = wordCount / Math.max(sentences.length, 1);
    const avgSyllablesPerWord = 1.5; // Rough estimate
    const readabilityScore = Math.max(
      0,
      Math.min(100, 206.835 - 1.015 * avgWordsPerSentence - 84.6 * avgSyllablesPerWord)
    );

    // Calculate keyword density (top 10 words)
    const wordFreq: { [key: string]: number } = {};
    const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for']);

    words.forEach((word) => {
      const lower = word.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (lower.length > 3 && !stopWords.has(lower)) {
        wordFreq[lower] = (wordFreq[lower] || 0) + 1;
      }
    });

    const keywordDensity: { [key: string]: number } = {};
    Object.entries(wordFreq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .forEach(([word, count]) => {
        keywordDensity[word] = (count / wordCount) * 100;
      });

    return {
      wordCount,
      readabilityScore,
      keywordDensity,
    };
  }

  /**
   * Check mobile responsiveness
   */
  private checkMobileResponsive($: cheerio.CheerioAPI): boolean {
    const viewport = $('meta[name="viewport"]').attr('content');
    return !!viewport && viewport.includes('width=device-width');
  }

  /**
   * Validate meta tags
   */
  private validateMetaTags(
    metaTags: MetaTags,
    issues: SEOIssue[],
    recommendations: string[]
  ): void {
    // Title
    if (!metaTags.title) {
      issues.push({
        type: 'error',
        category: 'Meta Tags',
        message: 'Missing page title',
        impact: 'high',
        element: '<title>',
      });
    } else if (metaTags.title.length < 30) {
      issues.push({
        type: 'warning',
        category: 'Meta Tags',
        message: `Title too short (${metaTags.title.length} characters). Recommended: 50-60 characters.`,
        impact: 'medium',
      });
    } else if (metaTags.title.length > 60) {
      issues.push({
        type: 'warning',
        category: 'Meta Tags',
        message: `Title too long (${metaTags.title.length} characters). May be truncated in search results.`,
        impact: 'medium',
      });
    }

    // Description
    if (!metaTags.description) {
      issues.push({
        type: 'error',
        category: 'Meta Tags',
        message: 'Missing meta description',
        impact: 'high',
        element: '<meta name="description">',
      });
    } else if (metaTags.description.length < 120) {
      issues.push({
        type: 'warning',
        category: 'Meta Tags',
        message: `Meta description too short (${metaTags.description.length} characters). Recommended: 150-160 characters.`,
        impact: 'medium',
      });
    } else if (metaTags.description.length > 160) {
      issues.push({
        type: 'warning',
        category: 'Meta Tags',
        message: `Meta description too long (${metaTags.description.length} characters). May be truncated.`,
        impact: 'low',
      });
    }

    // Canonical
    if (!metaTags.canonical) {
      recommendations.push('Add canonical URL to prevent duplicate content issues');
    }

    // Open Graph
    if (!metaTags.ogTitle || !metaTags.ogDescription || !metaTags.ogImage) {
      recommendations.push('Add Open Graph tags for better social media sharing');
    }

    // Twitter Card
    if (!metaTags.twitterCard) {
      recommendations.push('Add Twitter Card tags for better Twitter sharing');
    }

    // Viewport
    if (!metaTags.viewport) {
      issues.push({
        type: 'error',
        category: 'Mobile',
        message: 'Missing viewport meta tag',
        impact: 'high',
        element: '<meta name="viewport">',
      });
    }
  }

  /**
   * Validate headings
   */
  private validateHeadings(
    headings: SEOAnalysisResult['headings'],
    issues: SEOIssue[],
    recommendations: string[]
  ): void {
    // H1
    if (headings.h1.length === 0) {
      issues.push({
        type: 'error',
        category: 'Content',
        message: 'Missing H1 heading',
        impact: 'high',
      });
    } else if (headings.h1.length > 1) {
      issues.push({
        type: 'warning',
        category: 'Content',
        message: `Multiple H1 headings found (${headings.h1.length}). Recommended: 1 per page.`,
        impact: 'medium',
      });
    }

    // Empty headings
    Object.entries(headings).forEach(([level, texts]) => {
      texts.forEach((text, index) => {
        if (!text || text.length < 3) {
          issues.push({
            type: 'warning',
            category: 'Content',
            message: `Empty or very short ${level.toUpperCase()} heading`,
            impact: 'low',
          });
        }
      });
    });
  }

  /**
   * Validate images
   */
  private validateImages(
    images: SEOAnalysisResult['images'],
    issues: SEOIssue[],
    recommendations: string[]
  ): void {
    if (images.withoutAlt > 0) {
      issues.push({
        type: 'warning',
        category: 'Accessibility',
        message: `${images.withoutAlt} image(s) missing alt text`,
        impact: 'medium',
      });
      recommendations.push('Add descriptive alt text to all images for better accessibility and SEO');
    }
  }

  /**
   * Validate content
   */
  private validateContent(
    content: SEOAnalysisResult['content'],
    issues: SEOIssue[],
    recommendations: string[]
  ): void {
    if (content.wordCount < 300) {
      issues.push({
        type: 'warning',
        category: 'Content',
        message: `Low word count (${content.wordCount}). Recommended: 300+ words for better SEO.`,
        impact: 'medium',
      });
    }

    if (content.readabilityScore < 30) {
      recommendations.push('Content is difficult to read. Consider simplifying language.');
    }
  }

  /**
   * Validate structured data
   */
  private validateStructuredData(
    structuredData: StructuredData[],
    issues: SEOIssue[],
    recommendations: string[]
  ): void {
    if (structuredData.length === 0) {
      recommendations.push('Add structured data (JSON-LD) for rich snippets in search results');
    }

    structuredData.forEach((data) => {
      if (!data.valid) {
        issues.push({
          type: 'error',
          category: 'Structured Data',
          message: `Invalid ${data.type}: ${data.errors.join(', ')}`,
          impact: 'medium',
        });
      }
    });
  }

  /**
   * Validate technical SEO
   */
  private validateTechnical(
    technical: SEOAnalysisResult['technical'],
    url: string,
    issues: SEOIssue[],
    recommendations: string[]
  ): void {
    if (!technical.httpsEnabled) {
      issues.push({
        type: 'error',
        category: 'Security',
        message: 'Site not using HTTPS',
        impact: 'high',
      });
    }

    if (!technical.mobileResponsive) {
      issues.push({
        type: 'error',
        category: 'Mobile',
        message: 'Site not mobile responsive',
        impact: 'high',
      });
    }

    if (!technical.hasRobotsTxt) {
      recommendations.push('Create robots.txt file to control search engine crawling');
    }

    if (!technical.hasSitemap) {
      recommendations.push('Create XML sitemap to help search engines discover content');
    }
  }

  /**
   * Calculate SEO score
   */
  private calculateSEOScore(issues: SEOIssue[]): number {
    let score = 100;

    issues.forEach((issue) => {
      if (issue.type === 'error') {
        if (issue.impact === 'high') score -= 15;
        else if (issue.impact === 'medium') score -= 10;
        else score -= 5;
      } else if (issue.type === 'warning') {
        if (issue.impact === 'high') score -= 8;
        else if (issue.impact === 'medium') score -= 5;
        else score -= 2;
      }
    });

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Get grade from score
   */
  private getGrade(score: number): 'A' | 'B' | 'C' | 'D' | 'F' {
    if (score >= 90) return 'A';
    if (score >= 80) return 'B';
    if (score >= 70) return 'C';
    if (score >= 60) return 'D';
    return 'F';
  }
}
