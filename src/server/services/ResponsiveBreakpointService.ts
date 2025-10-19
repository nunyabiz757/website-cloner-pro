import puppeteer, { Browser, Page } from 'puppeteer';
import * as css from 'css';

interface Breakpoint {
  minWidth?: number;
  maxWidth?: number;
  mediaQuery: string;
  rules: CSSRule[];
  affectedElements: number;
}

interface CSSRule {
  selector: string;
  properties: Record<string, string>;
}

interface ViewportSize {
  width: number;
  height: number;
  name: string;
}

interface LayoutDifference {
  selector: string;
  changes: {
    property: string;
    valueBefore: string;
    valueAfter: string;
  }[];
}

interface ResponsiveAnalysis {
  breakpoints: Breakpoint[];
  detectedViewports: ViewportSize[];
  layoutChanges: Map<string, LayoutDifference[]>;
  recommendations: string[];
  mobileFirst: boolean;
  fluidDesign: boolean;
}

export class ResponsiveBreakpointService {
  private readonly commonViewports: ViewportSize[] = [
    { width: 320, height: 568, name: 'Mobile S (iPhone SE)' },
    { width: 375, height: 667, name: 'Mobile M (iPhone 8)' },
    { width: 414, height: 896, name: 'Mobile L (iPhone XR)' },
    { width: 768, height: 1024, name: 'Tablet (iPad)' },
    { width: 1024, height: 768, name: 'Tablet Landscape' },
    { width: 1280, height: 720, name: 'Laptop' },
    { width: 1440, height: 900, name: 'Desktop' },
    { width: 1920, height: 1080, name: 'Full HD' },
    { width: 2560, height: 1440, name: '4K' },
  ];

  /**
   * Analyze responsive breakpoints from CSS and runtime testing
   */
  async analyzeResponsiveDesign(
    url: string,
    cssContent?: string[]
  ): Promise<ResponsiveAnalysis> {
    let browser: Browser | null = null;

    try {
      // Parse breakpoints from CSS
      const breakpoints = cssContent
        ? this.extractBreakpointsFromCSS(cssContent)
        : [];

      // Test across viewports
      browser = await puppeteer.launch({ headless: true });
      const page = await browser.newPage();
      await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });

      // Determine which viewports to test
      const viewportsToTest = this.determineViewportsToTest(breakpoints);

      // Capture layout at each viewport
      const layoutChanges = await this.detectLayoutChanges(page, viewportsToTest);

      // Analyze design patterns
      const mobileFirst = this.isMobileFirst(breakpoints);
      const fluidDesign = await this.detectFluidDesign(page);

      // Generate recommendations
      const recommendations = this.generateRecommendations(
        breakpoints,
        layoutChanges,
        mobileFirst,
        fluidDesign
      );

      await browser.close();

      return {
        breakpoints,
        detectedViewports: viewportsToTest,
        layoutChanges,
        recommendations,
        mobileFirst,
        fluidDesign,
      };
    } catch (error) {
      if (browser) await browser.close();
      throw error;
    }
  }

  /**
   * Extract breakpoints from CSS media queries
   */
  private extractBreakpointsFromCSS(cssFiles: string[]): Breakpoint[] {
    const breakpointsMap = new Map<string, Breakpoint>();

    for (const cssContent of cssFiles) {
      try {
        const ast = css.parse(cssContent);

        if (ast.stylesheet?.rules) {
          this.traverseRules(ast.stylesheet.rules, breakpointsMap);
        }
      } catch (error) {
        console.error('Failed to parse CSS:', error);
      }
    }

    // Sort breakpoints by min-width
    return Array.from(breakpointsMap.values()).sort((a, b) => {
      const aMin = a.minWidth || 0;
      const bMin = b.minWidth || 0;
      return aMin - bMin;
    });
  }

  /**
   * Traverse CSS rules to find media queries
   */
  private traverseRules(
    rules: any[],
    breakpointsMap: Map<string, Breakpoint>
  ): void {
    for (const rule of rules) {
      if (rule.type === 'media') {
        const mediaQuery = rule.media || '';
        const { minWidth, maxWidth } = this.parseMediaQuery(mediaQuery);

        const breakpointKey = `${minWidth || 0}-${maxWidth || Infinity}`;

        if (!breakpointsMap.has(breakpointKey)) {
          breakpointsMap.set(breakpointKey, {
            minWidth,
            maxWidth,
            mediaQuery,
            rules: [],
            affectedElements: 0,
          });
        }

        const breakpoint = breakpointsMap.get(breakpointKey)!;

        // Extract rules from media query
        if (rule.rules) {
          for (const innerRule of rule.rules) {
            if (innerRule.type === 'rule' && innerRule.selectors) {
              const properties: Record<string, string> = {};

              if (innerRule.declarations) {
                for (const decl of innerRule.declarations) {
                  if (decl.type === 'declaration' && decl.property && decl.value) {
                    properties[decl.property] = decl.value;
                  }
                }
              }

              for (const selector of innerRule.selectors) {
                breakpoint.rules.push({ selector, properties });
                breakpoint.affectedElements++;
              }
            }
          }
        }
      }
    }
  }

  /**
   * Parse media query to extract min/max width
   */
  private parseMediaQuery(mediaQuery: string): {
    minWidth?: number;
    maxWidth?: number;
  } {
    const result: { minWidth?: number; maxWidth?: number } = {};

    // Match min-width
    const minMatch = mediaQuery.match(/min-width:\s*(\d+)(px|em|rem)?/i);
    if (minMatch) {
      result.minWidth = this.convertToPixels(
        parseInt(minMatch[1]),
        minMatch[2] || 'px'
      );
    }

    // Match max-width
    const maxMatch = mediaQuery.match(/max-width:\s*(\d+)(px|em|rem)?/i);
    if (maxMatch) {
      result.maxWidth = this.convertToPixels(
        parseInt(maxMatch[1]),
        maxMatch[2] || 'px'
      );
    }

    return result;
  }

  /**
   * Convert em/rem to pixels (assuming 16px base)
   */
  private convertToPixels(value: number, unit: string): number {
    switch (unit.toLowerCase()) {
      case 'em':
      case 'rem':
        return value * 16;
      default:
        return value;
    }
  }

  /**
   * Determine which viewports to test based on breakpoints
   */
  private determineViewportsToTest(breakpoints: Breakpoint[]): ViewportSize[] {
    const viewports: ViewportSize[] = [];

    if (breakpoints.length === 0) {
      // Test common viewports if no breakpoints found
      return this.commonViewports;
    }

    // Add viewports around each breakpoint
    for (const breakpoint of breakpoints) {
      if (breakpoint.minWidth) {
        // Test just before breakpoint
        const beforeViewport = this.commonViewports.find(
          (v) => v.width <= breakpoint.minWidth! - 1
        );
        if (beforeViewport && !viewports.some((v) => v.width === beforeViewport.width)) {
          viewports.push(beforeViewport);
        }

        // Test just after breakpoint
        const afterViewport = this.commonViewports.find(
          (v) => v.width >= breakpoint.minWidth!
        );
        if (afterViewport && !viewports.some((v) => v.width === afterViewport.width)) {
          viewports.push(afterViewport);
        }
      }
    }

    // Ensure we have at least mobile, tablet, and desktop
    const requiredWidths = [375, 768, 1440];
    for (const width of requiredWidths) {
      if (!viewports.some((v) => v.width === width)) {
        const viewport = this.commonViewports.find((v) => v.width === width);
        if (viewport) viewports.push(viewport);
      }
    }

    return viewports.sort((a, b) => a.width - b.width);
  }

  /**
   * Detect layout changes across different viewports
   */
  private async detectLayoutChanges(
    page: Page,
    viewports: ViewportSize[]
  ): Promise<Map<string, LayoutDifference[]>> {
    const layoutMap = new Map<string, LayoutDifference[]>();
    const elementsToTrack = [
      'header',
      'nav',
      'main',
      'aside',
      'footer',
      '.container',
      '.wrapper',
      '.content',
      '.sidebar',
    ];

    let previousViewportData: Map<string, any> | null = null;

    for (let i = 0; i < viewports.length; i++) {
      const viewport = viewports[i];
      await page.setViewport({ width: viewport.width, height: viewport.height });
      await page.waitForTimeout(500); // Wait for layout to settle

      // Get computed styles for tracked elements
      const currentData = await this.getElementStyles(page, elementsToTrack);

      if (previousViewportData) {
        const differences = this.compareLayoutData(previousViewportData, currentData);
        if (differences.length > 0) {
          const key = `${viewports[i - 1].name} → ${viewport.name}`;
          layoutMap.set(key, differences);
        }
      }

      previousViewportData = currentData;
    }

    return layoutMap;
  }

  /**
   * Get computed styles for specified elements
   */
  private async getElementStyles(
    page: Page,
    selectors: string[]
  ): Promise<Map<string, any>> {
    return await page.evaluate((selectors) => {
      const data = new Map();

      for (const selector of selectors) {
        const elements = document.querySelectorAll(selector);

        elements.forEach((element, index) => {
          const styles = window.getComputedStyle(element);
          const key = `${selector}[${index}]`;

          data.set(key, {
            display: styles.display,
            flexDirection: styles.flexDirection,
            gridTemplateColumns: styles.gridTemplateColumns,
            width: styles.width,
            maxWidth: styles.maxWidth,
            padding: styles.padding,
            margin: styles.margin,
            fontSize: styles.fontSize,
            float: styles.float,
            position: styles.position,
          });
        });
      }

      return Array.from(data.entries());
    }, selectors);
  }

  /**
   * Compare layout data between two viewports
   */
  private compareLayoutData(
    before: Map<string, any>,
    after: Map<string, any>
  ): LayoutDifference[] {
    const differences: LayoutDifference[] = [];

    for (const [selector, beforeStyles] of before.entries()) {
      const afterStyles = after.get(selector);
      if (!afterStyles) continue;

      const changes: { property: string; valueBefore: string; valueAfter: string }[] = [];

      for (const [property, valueBefore] of Object.entries(beforeStyles)) {
        const valueAfter = afterStyles[property];
        if (valueBefore !== valueAfter) {
          changes.push({
            property,
            valueBefore: valueBefore as string,
            valueAfter: valueAfter as string,
          });
        }
      }

      if (changes.length > 0) {
        differences.push({ selector, changes });
      }
    }

    return differences;
  }

  /**
   * Detect if design uses mobile-first approach
   */
  private isMobileFirst(breakpoints: Breakpoint[]): boolean {
    if (breakpoints.length === 0) return false;

    // Mobile-first typically uses min-width
    const minWidthCount = breakpoints.filter((b) => b.minWidth && !b.maxWidth).length;
    const maxWidthCount = breakpoints.filter((b) => b.maxWidth && !b.minWidth).length;

    return minWidthCount > maxWidthCount;
  }

  /**
   * Detect if design uses fluid/flexible layout
   */
  private async detectFluidDesign(page: Page): Promise<boolean> {
    return await page.evaluate(() => {
      const allElements = document.querySelectorAll('*');
      let fluidCount = 0;
      let totalCount = 0;

      for (const element of allElements) {
        const styles = window.getComputedStyle(element);
        const width = styles.width;
        const maxWidth = styles.maxWidth;

        totalCount++;

        // Check for percentage-based or viewport-based units
        if (
          width.includes('%') ||
          width.includes('vw') ||
          width.includes('vh') ||
          maxWidth.includes('%') ||
          maxWidth.includes('vw') ||
          styles.display === 'flex' ||
          styles.display === 'grid'
        ) {
          fluidCount++;
        }
      }

      // If more than 30% of elements use fluid units, consider it fluid design
      return fluidCount / totalCount > 0.3;
    });
  }

  /**
   * Generate recommendations based on analysis
   */
  private generateRecommendations(
    breakpoints: Breakpoint[],
    layoutChanges: Map<string, LayoutDifference[]>,
    mobileFirst: boolean,
    fluidDesign: boolean
  ): string[] {
    const recommendations: string[] = [];

    // Check breakpoint count
    if (breakpoints.length === 0) {
      recommendations.push(
        'No responsive breakpoints detected. Consider adding media queries for mobile and tablet devices.'
      );
    } else if (breakpoints.length > 8) {
      recommendations.push(
        `Found ${breakpoints.length} breakpoints. Consider consolidating to 3-5 main breakpoints for easier maintenance.`
      );
    }

    // Mobile-first recommendation
    if (!mobileFirst && breakpoints.length > 0) {
      recommendations.push(
        'Design appears to use desktop-first approach (max-width). Consider mobile-first (min-width) for better performance.'
      );
    }

    // Fluid design recommendation
    if (!fluidDesign) {
      recommendations.push(
        'Design uses fixed widths. Consider using flexible units (%, vw, flexbox, grid) for better scalability.'
      );
    }

    // Common breakpoint recommendations
    const commonBreakpoints = [768, 1024, 1440];
    const detectedWidths = breakpoints
      .map((b) => b.minWidth || b.maxWidth)
      .filter((w): w is number => w !== undefined);

    const missingBreakpoints = commonBreakpoints.filter(
      (width) => !detectedWidths.some((w) => Math.abs(w - width) < 50)
    );

    if (missingBreakpoints.length > 0) {
      recommendations.push(
        `Consider adding breakpoints for: ${missingBreakpoints.join('px, ')}px (common device widths)`
      );
    }

    // Layout change recommendations
    if (layoutChanges.size === 0) {
      recommendations.push(
        'No significant layout changes detected across viewports. Ensure responsive behavior is working correctly.'
      );
    }

    return recommendations;
  }

  /**
   * Get breakpoints as CSS media queries
   */
  getBreakpointsAsCSS(breakpoints: Breakpoint[]): string {
    let css = '/* Detected Responsive Breakpoints */\n\n';

    for (const breakpoint of breakpoints) {
      css += `/* ${breakpoint.mediaQuery} */\n`;
      css += `@media ${breakpoint.mediaQuery} {\n`;
      css += `  /* ${breakpoint.affectedElements} affected elements */\n`;

      for (const rule of breakpoint.rules.slice(0, 5)) {
        // Show first 5 rules
        css += `  ${rule.selector} {\n`;
        for (const [prop, value] of Object.entries(rule.properties)) {
          css += `    ${prop}: ${value};\n`;
        }
        css += `  }\n`;
      }

      if (breakpoint.rules.length > 5) {
        css += `  /* ... and ${breakpoint.rules.length - 5} more rules */\n`;
      }

      css += `}\n\n`;
    }

    return css;
  }
}
