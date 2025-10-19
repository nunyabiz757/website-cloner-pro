import * as cheerio from 'cheerio';

type CSSFramework = 'bootstrap' | 'tailwind' | 'material-ui' | 'foundation' | 'bulma' | 'semantic-ui' | 'ant-design' | 'none';

interface FrameworkDetectionResult {
  framework: CSSFramework;
  version?: string;
  confidence: number;
  indicators: FrameworkIndicator[];
  usage: FrameworkUsage;
  recommendations: string[];
}

interface FrameworkIndicator {
  type: 'class' | 'attribute' | 'cdn' | 'meta';
  value: string;
  count?: number;
}

interface FrameworkUsage {
  totalElements: number;
  frameworkElements: number;
  customElements: number;
  percentageFramework: number;
  commonClasses: string[];
  components: DetectedComponent[];
}

interface DetectedComponent {
  name: string;
  count: number;
  framework: CSSFramework;
}

interface FrameworkMigrationPlan {
  from: CSSFramework;
  to: CSSFramework;
  steps: MigrationStep[];
  classMap: Map<string, string>;
  estimatedEffort: 'low' | 'medium' | 'high';
  breakingChanges: string[];
}

interface MigrationStep {
  step: number;
  description: string;
  action: string;
  priority: 'high' | 'medium' | 'low';
}

export class CSSFrameworkDetectionService {
  /**
   * Detect CSS framework from HTML
   */
  async detectFramework(htmlContent: string, cssContent?: string): Promise<FrameworkDetectionResult> {
    const $ = cheerio.load(htmlContent);
    const indicators: FrameworkIndicator[] = [];
    let framework: CSSFramework = 'none';
    let confidence = 0;
    let version: string | undefined;

    // Check CDN links
    const cdnResults = this.checkCDNLinks($);
    if (cdnResults.framework !== 'none') {
      framework = cdnResults.framework;
      confidence = 95;
      version = cdnResults.version;
      indicators.push(...cdnResults.indicators);
    }

    // Check class patterns if CDN detection failed
    if (framework === 'none') {
      const classResults = this.detectByClasses($, cssContent);
      framework = classResults.framework;
      confidence = classResults.confidence;
      indicators.push(...classResults.indicators);
    }

    // Analyze usage
    const usage = this.analyzeUsage($, framework);

    // Generate recommendations
    const recommendations = this.generateRecommendations(framework, usage, version);

    return {
      framework,
      version,
      confidence,
      indicators,
      usage,
      recommendations,
    };
  }

  /**
   * Check CDN links for framework detection
   */
  private checkCDNLinks($: cheerio.CheerioAPI): {
    framework: CSSFramework;
    version?: string;
    indicators: FrameworkIndicator[];
  } {
    const indicators: FrameworkIndicator[] = [];
    let framework: CSSFramework = 'none';
    let version: string | undefined;

    $('link[rel="stylesheet"], script[src]').each((_, el) => {
      const href = $(el).attr('href') || $(el).attr('src') || '';

      // Bootstrap
      if (href.includes('bootstrap')) {
        framework = 'bootstrap';
        const versionMatch = href.match(/bootstrap[/@](\d+\.\d+\.\d+)/);
        version = versionMatch ? versionMatch[1] : undefined;
        indicators.push({ type: 'cdn', value: href });
      }

      // Tailwind
      if (href.includes('tailwindcss') || href.includes('tailwind')) {
        framework = 'tailwind';
        indicators.push({ type: 'cdn', value: href });
      }

      // Material-UI
      if (href.includes('material') || href.includes('mui')) {
        framework = 'material-ui';
        indicators.push({ type: 'cdn', value: href });
      }

      // Foundation
      if (href.includes('foundation')) {
        framework = 'foundation';
        const versionMatch = href.match(/foundation[/@](\d+\.\d+\.\d+)/);
        version = versionMatch ? versionMatch[1] : undefined;
        indicators.push({ type: 'cdn', value: href });
      }

      // Bulma
      if (href.includes('bulma')) {
        framework = 'bulma';
        indicators.push({ type: 'cdn', value: href });
      }

      // Semantic UI
      if (href.includes('semantic-ui') || href.includes('semantic.')) {
        framework = 'semantic-ui';
        indicators.push({ type: 'cdn', value: href });
      }

      // Ant Design
      if (href.includes('antd') || href.includes('ant-design')) {
        framework = 'ant-design';
        indicators.push({ type: 'cdn', value: href });
      }
    });

    return { framework, version, indicators };
  }

  /**
   * Detect framework by class patterns
   */
  private detectByClasses($: cheerio.CheerioAPI, cssContent?: string): {
    framework: CSSFramework;
    confidence: number;
    indicators: FrameworkIndicator[];
  } {
    const classPatterns: Map<CSSFramework, RegExp[]> = new Map([
      ['bootstrap', [/^btn-/, /^col-/, /^container/, /^row$/, /^navbar/, /^alert-/, /^card/]],
      ['tailwind', [/^flex/, /^grid/, /^text-/, /^bg-/, /^p-\d+/, /^m-\d+/, /^w-\d+/, /^h-\d+/]],
      ['material-ui', [/^Mui/, /^mui-/, /^MuiButton/, /^MuiCard/, /^MuiTextField/]],
      ['foundation', [/^callout/, /^button/, /^grid-x/, /^cell/, /^menu/]],
      ['bulma', [/^button/, /^hero/, /^section/, /^column/, /^notification/]],
      ['semantic-ui', [/^ui /, /^ui\./, /segment$/, /menu$/, /button$/]],
      ['ant-design', [/^ant-/, /^ant-btn/, /^ant-card/, /^ant-table/]],
    ]);

    const classCount: Map<CSSFramework, number> = new Map();
    const indicators: Map<CSSFramework, FrameworkIndicator[]> = new Map();

    // Count classes matching each framework
    $('[class]').each((_, el) => {
      const classes = $(el).attr('class')?.split(/\s+/) || [];

      classes.forEach((cls) => {
        classPatterns.forEach((patterns, fw) => {
          if (patterns.some((pattern) => pattern.test(cls))) {
            classCount.set(fw, (classCount.get(fw) || 0) + 1);

            if (!indicators.has(fw)) {
              indicators.set(fw, []);
            }
            indicators.get(fw)!.push({
              type: 'class',
              value: cls,
              count: 1,
            });
          }
        });
      });
    });

    // Find framework with most matches
    let maxCount = 0;
    let detectedFramework: CSSFramework = 'none';

    classCount.forEach((count, fw) => {
      if (count > maxCount) {
        maxCount = count;
        detectedFramework = fw;
      }
    });

    // Calculate confidence based on match count
    const totalElements = $('[class]').length;
    const confidence = totalElements > 0 ? Math.min(90, (maxCount / totalElements) * 100) : 0;

    return {
      framework: confidence > 10 ? detectedFramework : 'none',
      confidence,
      indicators: indicators.get(detectedFramework) || [],
    };
  }

  /**
   * Analyze framework usage
   */
  private analyzeUsage($: cheerio.CheerioAPI, framework: CSSFramework): FrameworkUsage {
    const totalElements = $('*').length;
    let frameworkElements = 0;
    const classFrequency: Map<string, number> = new Map();
    const components: DetectedComponent[] = [];

    // Count framework elements
    $('[class]').each((_, el) => {
      const classes = $(el).attr('class')?.split(/\s+/) || [];
      let hasFrameworkClass = false;

      classes.forEach((cls) => {
        if (this.isFrameworkClass(cls, framework)) {
          hasFrameworkClass = true;
          classFrequency.set(cls, (classFrequency.get(cls) || 0) + 1);
        }
      });

      if (hasFrameworkClass) {
        frameworkElements++;
      }
    });

    // Get most common classes
    const commonClasses = Array.from(classFrequency.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([cls]) => cls);

    // Detect components
    components.push(...this.detectComponents($, framework));

    const customElements = totalElements - frameworkElements;
    const percentageFramework = totalElements > 0 ? (frameworkElements / totalElements) * 100 : 0;

    return {
      totalElements,
      frameworkElements,
      customElements,
      percentageFramework,
      commonClasses,
      components,
    };
  }

  /**
   * Check if class belongs to framework
   */
  private isFrameworkClass(cls: string, framework: CSSFramework): boolean {
    const patterns: { [key in CSSFramework]: RegExp[] } = {
      bootstrap: [/^btn/, /^col-/, /^container/, /^row/, /^navbar/, /^alert/, /^card/],
      tailwind: [/^(flex|grid|text-|bg-|p-|m-|w-|h-|space-|divide-)/],
      'material-ui': [/^(Mui|mui-)/],
      foundation: [/^(callout|button|grid-|cell|menu)/],
      bulma: [/^(button|hero|section|column|notification|box|card)/],
      'semantic-ui': [/^ui\s/, /^ui\./],
      'ant-design': [/^ant-/],
      none: [],
    };

    return patterns[framework]?.some((pattern) => pattern.test(cls)) || false;
  }

  /**
   * Detect framework components
   */
  private detectComponents($: cheerio.CheerioAPI, framework: CSSFramework): DetectedComponent[] {
    const components: DetectedComponent[] = [];

    const componentSelectors: { [key in CSSFramework]?: string[] } = {
      bootstrap: [
        '.navbar', '.card', '.modal', '.alert', '.btn-group', '.dropdown',
        '.accordion', '.carousel', '.toast', '.pagination',
      ],
      tailwind: [], // Tailwind doesn't have predefined components
      'material-ui': [
        '.MuiButton-root', '.MuiCard-root', '.MuiTextField-root',
        '.MuiDialog-root', '.MuiAppBar-root',
      ],
      bulma: [
        '.hero', '.navbar', '.card', '.modal', '.notification', '.menu',
      ],
      'ant-design': [
        '.ant-btn', '.ant-card', '.ant-table', '.ant-modal', '.ant-menu',
      ],
    };

    const selectors = componentSelectors[framework] || [];

    selectors.forEach((selector) => {
      const count = $(selector).length;
      if (count > 0) {
        components.push({
          name: selector.replace(/^\./, ''),
          count,
          framework,
        });
      }
    });

    return components.sort((a, b) => b.count - a.count);
  }

  /**
   * Generate recommendations
   */
  private generateRecommendations(
    framework: CSSFramework,
    usage: FrameworkUsage,
    version?: string
  ): string[] {
    const recommendations: string[] = [];

    if (framework === 'none') {
      recommendations.push('No CSS framework detected. Consider using a framework for faster development.');
      recommendations.push('Popular options: Bootstrap (comprehensive), Tailwind (utility-first), Material-UI (React)');
      return recommendations;
    }

    // Check usage percentage
    if (usage.percentageFramework < 20) {
      recommendations.push(
        `Low ${framework} usage (${usage.percentageFramework.toFixed(1)}%). Consider removing the framework or using it more consistently.`
      );
    }

    // Version-specific recommendations
    if (framework === 'bootstrap') {
      if (version && version.startsWith('3')) {
        recommendations.push('Bootstrap 3 detected. Consider upgrading to Bootstrap 5 for better features and smaller size.');
      }
      recommendations.push('Use Bootstrap utilities classes instead of custom CSS where possible.');
    }

    if (framework === 'tailwind') {
      recommendations.push('Configure PurgeCSS to remove unused Tailwind classes in production.');
      recommendations.push('Consider using @apply directive for commonly repeated utility combinations.');
    }

    if (framework === 'material-ui') {
      recommendations.push('Use MUI theming for consistent styling across components.');
      recommendations.push('Consider tree-shaking to reduce bundle size.');
    }

    // Component recommendations
    if (usage.components.length === 0) {
      recommendations.push(`No ${framework} components detected. Leverage pre-built components for faster development.`);
    }

    return recommendations;
  }

  /**
   * Create migration plan between frameworks
   */
  async createMigrationPlan(
    from: CSSFramework,
    to: CSSFramework
  ): Promise<FrameworkMigrationPlan> {
    const steps: MigrationStep[] = [];
    const classMap = new Map<string, string>();
    let estimatedEffort: 'low' | 'medium' | 'high' = 'medium';
    const breakingChanges: string[] = [];

    // Generate class mappings
    this.generateClassMappings(from, to, classMap);

    // Generate migration steps
    steps.push({
      step: 1,
      description: `Install ${to} and dependencies`,
      action: `npm install ${this.getPackageName(to)}`,
      priority: 'high',
    });

    steps.push({
      step: 2,
      description: `Update imports and configuration`,
      action: `Replace ${from} imports with ${to} imports in your code`,
      priority: 'high',
    });

    steps.push({
      step: 3,
      description: 'Update class names',
      action: `Replace ${from} classes with ${to} equivalents`,
      priority: 'high',
    });

    steps.push({
      step: 4,
      description: 'Test components',
      action: 'Verify all components render correctly',
      priority: 'high',
    });

    steps.push({
      step: 5,
      description: 'Update responsive breakpoints',
      action: 'Adjust breakpoints to match new framework',
      priority: 'medium',
    });

    steps.push({
      step: 6,
      description: 'Remove old framework',
      action: `Uninstall ${from} and remove unused code`,
      priority: 'low',
    });

    // Determine effort level
    if ((from === 'bootstrap' && to === 'tailwind') || (from === 'tailwind' && to === 'bootstrap')) {
      estimatedEffort = 'high';
      breakingChanges.push('Complete paradigm shift between utility-first and component-based');
      breakingChanges.push('All class names need to be rewritten');
    } else if (from === 'material-ui' || to === 'material-ui') {
      estimatedEffort = 'high';
      breakingChanges.push('Material-UI is React-specific');
      breakingChanges.push('Component API completely different');
    } else {
      estimatedEffort = 'medium';
    }

    return {
      from,
      to,
      steps,
      classMap,
      estimatedEffort,
      breakingChanges,
    };
  }

  /**
   * Generate class mappings between frameworks
   */
  private generateClassMappings(
    from: CSSFramework,
    to: CSSFramework,
    classMap: Map<string, string>
  ): void {
    // Bootstrap to Tailwind
    if (from === 'bootstrap' && to === 'tailwind') {
      classMap.set('btn', 'px-4 py-2 rounded');
      classMap.set('btn-primary', 'bg-blue-500 text-white hover:bg-blue-600');
      classMap.set('container', 'container mx-auto');
      classMap.set('row', 'flex flex-wrap');
      classMap.set('col', 'flex-1');
      classMap.set('text-center', 'text-center');
      classMap.set('d-flex', 'flex');
      classMap.set('justify-content-center', 'justify-center');
      classMap.set('align-items-center', 'items-center');
    }

    // Tailwind to Bootstrap
    if (from === 'tailwind' && to === 'bootstrap') {
      classMap.set('flex', 'd-flex');
      classMap.set('justify-center', 'justify-content-center');
      classMap.set('items-center', 'align-items-center');
      classMap.set('bg-blue-500', 'bg-primary');
      classMap.set('text-white', 'text-white');
      classMap.set('rounded', 'rounded');
      classMap.set('p-4', 'p-3');
      classMap.set('m-4', 'm-3');
    }
  }

  /**
   * Get package name for framework
   */
  private getPackageName(framework: CSSFramework): string {
    const packages: { [key in CSSFramework]: string } = {
      bootstrap: 'bootstrap',
      tailwind: 'tailwindcss',
      'material-ui': '@mui/material @emotion/react @emotion/styled',
      foundation: 'foundation-sites',
      bulma: 'bulma',
      'semantic-ui': 'semantic-ui-css',
      'ant-design': 'antd',
      none: '',
    };

    return packages[framework];
  }

  /**
   * Convert HTML from one framework to another
   */
  async convertFramework(
    htmlContent: string,
    from: CSSFramework,
    to: CSSFramework
  ): Promise<{
    convertedHtml: string;
    changesCount: number;
    warnings: string[];
  }> {
    const $ = cheerio.load(htmlContent);
    let changesCount = 0;
    const warnings: string[] = [];

    const classMap = new Map<string, string>();
    this.generateClassMappings(from, to, classMap);

    // Convert classes
    $('[class]').each((_, el) => {
      const $el = $(el);
      const classes = $el.attr('class')?.split(/\s+/) || [];
      const newClasses: string[] = [];

      classes.forEach((cls) => {
        if (classMap.has(cls)) {
          newClasses.push(classMap.get(cls)!);
          changesCount++;
        } else if (this.isFrameworkClass(cls, from)) {
          warnings.push(`No mapping found for class: ${cls}`);
          newClasses.push(cls);
        } else {
          newClasses.push(cls);
        }
      });

      $el.attr('class', newClasses.join(' '));
    });

    return {
      convertedHtml: $.html(),
      changesCount,
      warnings,
    };
  }
}
