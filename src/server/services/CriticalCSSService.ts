import puppeteer, { Browser, Page } from 'puppeteer';
import * as css from 'css';

interface CriticalCSSResult {
  criticalCSS: string;
  nonCriticalCSS: string;
  originalSize: number;
  criticalSize: number;
  savings: number;
  criticalSelectors: string[];
  aboveFoldElements: number;
}

export class CriticalCSSService {
  /**
   * Extract critical CSS (above-the-fold styles)
   */
  async extractCriticalCSS(
    url: string,
    cssContent: string[],
    viewportWidth: number = 1920,
    viewportHeight: number = 1080
  ): Promise<CriticalCSSResult> {
    let browser: Browser | null = null;

    try {
      browser = await puppeteer.launch({ headless: true });
      const page = await browser.newPage();
      await page.setViewport({ width: viewportWidth, height: viewportHeight });
      await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });

      // Get all elements above the fold
      const aboveFoldSelectors = await this.getAboveFoldSelectors(page);

      // Parse CSS and extract critical styles
      const allCSS = cssContent.join('\n\n');
      const { criticalCSS, nonCriticalCSS, criticalSelectors } = this.extractMatchingStyles(
        allCSS,
        aboveFoldSelectors
      );

      const originalSize = Buffer.byteLength(allCSS);
      const criticalSize = Buffer.byteLength(criticalCSS);
      const savings = ((1 - criticalSize / originalSize) * 100).toFixed(2);

      await browser.close();

      return {
        criticalCSS,
        nonCriticalCSS,
        originalSize,
        criticalSize,
        savings: parseFloat(savings),
        criticalSelectors,
        aboveFoldElements: aboveFoldSelectors.length,
      };
    } catch (error) {
      if (browser) await browser.close();
      throw error;
    }
  }

  /**
   * Get selectors for elements above the fold
   */
  private async getAboveFoldSelectors(page: Page): Promise<string[]> {
    return await page.evaluate(() => {
      const selectors: string[] = [];
      const viewportHeight = window.innerHeight;

      const elements = document.querySelectorAll('*');
      elements.forEach((element) => {
        const rect = element.getBoundingClientRect();

        // Check if element is above the fold (at least partially visible)
        if (rect.top < viewportHeight && rect.bottom > 0) {
          // Generate selector
          let selector = element.tagName.toLowerCase();

          // Add ID if exists
          if (element.id) {
            selector = `#${element.id}`;
          } else {
            // Add classes
            const classes = Array.from(element.classList).filter((c) => c.trim());
            if (classes.length > 0) {
              selector += `.${classes.join('.')}`;
            }
          }

          selectors.push(selector);
        }
      });

      return [...new Set(selectors)];
    });
  }

  /**
   * Extract matching styles for critical selectors
   */
  private extractMatchingStyles(
    cssContent: string,
    criticalSelectors: string[]
  ): {
    criticalCSS: string;
    nonCriticalCSS: string;
    criticalSelectors: string[];
  } {
    try {
      const ast = css.parse(cssContent);
      const criticalRules: any[] = [];
      const nonCriticalRules: any[] = [];
      const matchedSelectors = new Set<string>();

      if (ast.stylesheet?.rules) {
        for (const rule of ast.stylesheet.rules) {
          if (rule.type === 'rule' && (rule as any).selectors) {
            const ruleSelectors = (rule as any).selectors || [];
            const isCritical = ruleSelectors.some((selector: string) =>
              this.selectorMatches(selector, criticalSelectors)
            );

            if (isCritical) {
              criticalRules.push(rule);
              ruleSelectors.forEach((s: string) => matchedSelectors.add(s));
            } else {
              nonCriticalRules.push(rule);
            }
          } else if (rule.type === 'media') {
            // Handle media queries - include if they contain critical styles
            const mediaRule = rule as any;
            if (mediaRule.rules) {
              const criticalMediaRules: any[] = [];
              const nonCriticalMediaRules: any[] = [];

              for (const innerRule of mediaRule.rules) {
                if (innerRule.type === 'rule' && innerRule.selectors) {
                  const isCritical = innerRule.selectors.some((selector: string) =>
                    this.selectorMatches(selector, criticalSelectors)
                  );

                  if (isCritical) {
                    criticalMediaRules.push(innerRule);
                  } else {
                    nonCriticalMediaRules.push(innerRule);
                  }
                }
              }

              if (criticalMediaRules.length > 0) {
                criticalRules.push({
                  ...mediaRule,
                  rules: criticalMediaRules,
                });
              }

              if (nonCriticalMediaRules.length > 0) {
                nonCriticalRules.push({
                  ...mediaRule,
                  rules: nonCriticalMediaRules,
                });
              }
            }
          } else if (rule.type === 'keyframes' || rule.type === 'font-face') {
            // Include keyframes and font-faces in critical CSS
            criticalRules.push(rule);
          } else {
            // Include other rules (imports, charsets) in critical CSS
            criticalRules.push(rule);
          }
        }
      }

      const criticalCSS = css.stringify({
        type: 'stylesheet',
        stylesheet: { rules: criticalRules },
      });

      const nonCriticalCSS = css.stringify({
        type: 'stylesheet',
        stylesheet: { rules: nonCriticalRules },
      });

      return {
        criticalCSS,
        nonCriticalCSS,
        criticalSelectors: Array.from(matchedSelectors),
      };
    } catch (error) {
      console.error('Failed to extract critical CSS:', error);
      return {
        criticalCSS: '',
        nonCriticalCSS: cssContent,
        criticalSelectors: [],
      };
    }
  }

  /**
   * Check if selector matches any critical selector
   */
  private selectorMatches(selector: string, criticalSelectors: string[]): boolean {
    // Remove pseudo-classes and pseudo-elements for matching
    const cleanSelector = selector.split(':')[0].split('::')[0].trim();

    for (const critical of criticalSelectors) {
      const cleanCritical = critical.split(':')[0].split('::')[0].trim();

      // Exact match
      if (cleanSelector === cleanCritical) {
        return true;
      }

      // Partial match (e.g., ".header" matches ".header .nav")
      if (cleanSelector.includes(cleanCritical) || cleanCritical.includes(cleanSelector)) {
        return true;
      }

      // Tag name match
      const selectorTag = cleanSelector.match(/^[a-z]+/)?.[0];
      const criticalTag = cleanCritical.match(/^[a-z]+/)?.[0];
      if (selectorTag && criticalTag && selectorTag === criticalTag) {
        return true;
      }

      // Class match
      const selectorClasses = cleanSelector.match(/\.[a-zA-Z0-9_-]+/g) || [];
      const criticalClasses = cleanCritical.match(/\.[a-zA-Z0-9_-]+/g) || [];
      if (
        selectorClasses.some((sc) => criticalClasses.includes(sc)) ||
        criticalClasses.some((cc) => selectorClasses.includes(cc))
      ) {
        return true;
      }

      // ID match
      const selectorId = cleanSelector.match(/#[a-zA-Z0-9_-]+/)?.[0];
      const criticalId = cleanCritical.match(/#[a-zA-Z0-9_-]+/)?.[0];
      if (selectorId && criticalId && selectorId === criticalId) {
        return true;
      }
    }

    return false;
  }

  /**
   * Generate HTML with critical CSS inlined and non-critical CSS lazy-loaded
   */
  generateOptimizedHTML(
    originalHTML: string,
    criticalCSS: string,
    nonCriticalCSSUrl: string
  ): string {
    // Remove existing stylesheet links
    let optimizedHTML = originalHTML.replace(
      /<link[^>]+rel=["']stylesheet["'][^>]*>/gi,
      ''
    );

    // Inject critical CSS inline in head
    const headCloseIndex = optimizedHTML.indexOf('</head>');
    if (headCloseIndex !== -1) {
      const criticalStyleTag = `
  <!-- Critical CSS (inline) -->
  <style>
    ${criticalCSS}
  </style>

  <!-- Preload non-critical CSS -->
  <link rel="preload" href="${nonCriticalCSSUrl}" as="style" onload="this.onload=null;this.rel='stylesheet'">
  <noscript><link rel="stylesheet" href="${nonCriticalCSSUrl}"></noscript>
`;

      optimizedHTML =
        optimizedHTML.slice(0, headCloseIndex) +
        criticalStyleTag +
        optimizedHTML.slice(headCloseIndex);
    }

    return optimizedHTML;
  }

  /**
   * Extract critical CSS for multiple viewports
   */
  async extractCriticalCSSMultiViewport(
    url: string,
    cssContent: string[],
    viewports: Array<{ width: number; height: number; name: string }>
  ): Promise<
    Array<{
      viewport: string;
      width: number;
      height: number;
      result: CriticalCSSResult;
    }>
  > {
    const results = [];

    for (const viewport of viewports) {
      const result = await this.extractCriticalCSS(
        url,
        cssContent,
        viewport.width,
        viewport.height
      );

      results.push({
        viewport: viewport.name,
        width: viewport.width,
        height: viewport.height,
        result,
      });
    }

    return results;
  }
}
