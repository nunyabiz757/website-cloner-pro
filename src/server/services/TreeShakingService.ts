import * as cheerio from 'cheerio';
import { minify as minifyJs } from 'terser';

interface TreeShakingOptions {
  removeUnusedFunctions?: boolean;
  removeUnusedVariables?: boolean;
  removeUnusedCSS?: boolean;
  removeDeadCode?: boolean;
  aggressiveMode?: boolean;
}

interface TreeShakingResult {
  originalSize: number;
  optimizedSize: number;
  savings: {
    bytes: number;
    percentage: number;
  };
  removed: {
    functions: number;
    variables: number;
    cssRules: number;
    deadCode: number;
  };
  optimizedHtml: string;
  optimizedJS: string;
  optimizedCSS: string;
  warnings: string[];
}

export class TreeShakingService {
  /**
   * Perform tree shaking on HTML, CSS, and JavaScript
   */
  async shakeTree(
    htmlContent: string,
    options: TreeShakingOptions = {}
  ): Promise<TreeShakingResult> {
    const defaults: TreeShakingOptions = {
      removeUnusedFunctions: true,
      removeUnusedVariables: true,
      removeUnusedCSS: true,
      removeDeadCode: true,
      aggressiveMode: false,
    };

    const opts = { ...defaults, ...options };

    const $ = cheerio.load(htmlContent);
    const originalSize = Buffer.byteLength(htmlContent, 'utf8');
    const warnings: string[] = [];
    const removed = {
      functions: 0,
      variables: 0,
      cssRules: 0,
      deadCode: 0,
    };

    let optimizedJS = '';
    let optimizedCSS = '';

    // 1. Remove unused CSS
    if (opts.removeUnusedCSS) {
      const cssResult = await this.removeUnusedCSS($);
      removed.cssRules = cssResult.removed;
      optimizedCSS = cssResult.optimizedCSS;

      if (cssResult.warnings.length > 0) {
        warnings.push(...cssResult.warnings);
      }
    }

    // 2. Remove dead code from JavaScript
    if (opts.removeDeadCode || opts.removeUnusedFunctions || opts.removeUnusedVariables) {
      const jsResult = await this.removeUnusedJS($, opts);
      removed.functions += jsResult.removedFunctions;
      removed.variables += jsResult.removedVariables;
      removed.deadCode = jsResult.deadCode;
      optimizedJS = jsResult.optimizedJS;

      if (jsResult.warnings.length > 0) {
        warnings.push(...jsResult.warnings);
      }
    }

    const optimizedHtml = $.html();
    const optimizedSize = Buffer.byteLength(optimizedHtml, 'utf8');

    return {
      originalSize,
      optimizedSize,
      savings: {
        bytes: originalSize - optimizedSize,
        percentage: ((originalSize - optimizedSize) / originalSize) * 100,
      },
      removed,
      optimizedHtml,
      optimizedJS,
      optimizedCSS,
      warnings,
    };
  }

  /**
   * Remove unused CSS rules
   */
  private async removeUnusedCSS($: cheerio.CheerioAPI): Promise<{
    optimizedCSS: string;
    removed: number;
    warnings: string[];
  }> {
    const warnings: string[] = [];
    let removed = 0;

    // Collect all used classes, IDs, and tags
    const usedSelectors = this.collectUsedSelectors($);

    // Process all style tags
    const styles = $('style').toArray();

    for (const style of styles) {
      const $style = $(style);
      const cssContent = $style.html() || '';

      if (!cssContent.trim()) continue;

      // Parse CSS and remove unused rules
      const { optimizedCSS, removedCount } = this.filterCSSRules(
        cssContent,
        usedSelectors
      );

      $style.html(optimizedCSS);
      removed += removedCount;
    }

    // Collect optimized CSS
    let allOptimizedCSS = '';
    $('style').each((_, style) => {
      allOptimizedCSS += $(style).html() + '\n';
    });

    return {
      optimizedCSS: allOptimizedCSS,
      removed,
      warnings,
    };
  }

  /**
   * Collect all used CSS selectors from HTML
   */
  private collectUsedSelectors($: cheerio.CheerioAPI): {
    classes: Set<string>;
    ids: Set<string>;
    tags: Set<string>;
    attributes: Set<string>;
  } {
    const classes = new Set<string>();
    const ids = new Set<string>();
    const tags = new Set<string>();
    const attributes = new Set<string>();

    $('*').each((_, el) => {
      // Collect tag names
      const tag = el.tagName?.toLowerCase();
      if (tag) {
        tags.add(tag);
      }

      // Collect classes
      const classList = $(el).attr('class')?.split(/\s+/) || [];
      classList.forEach((cls) => {
        if (cls.trim()) classes.add(cls.trim());
      });

      // Collect IDs
      const id = $(el).attr('id');
      if (id) {
        ids.add(id);
      }

      // Collect attributes
      Object.keys(el.attribs || {}).forEach((attr) => {
        attributes.add(attr);
      });
    });

    return { classes, ids, tags, attributes };
  }

  /**
   * Filter CSS rules to remove unused ones
   */
  private filterCSSRules(
    cssContent: string,
    usedSelectors: {
      classes: Set<string>;
      ids: Set<string>;
      tags: Set<string>;
      attributes: Set<string>;
    }
  ): { optimizedCSS: string; removedCount: number } {
    let optimizedCSS = '';
    let removedCount = 0;

    // Parse CSS rules (simplified)
    const rules = this.parseCSSRules(cssContent);

    for (const rule of rules) {
      // Keep @-rules (media queries, keyframes, font-face)
      if (rule.selector.startsWith('@')) {
        optimizedCSS += `${rule.selector} ${rule.declarations}\n`;
        continue;
      }

      // Check if selector is used
      const selectors = rule.selector.split(',').map((s) => s.trim());
      const usedSelectorList = selectors.filter((sel) =>
        this.isSelectorUsed(sel, usedSelectors)
      );

      if (usedSelectorList.length > 0) {
        optimizedCSS += `${usedSelectorList.join(', ')} ${rule.declarations}\n`;
      } else {
        removedCount++;
      }
    }

    return { optimizedCSS, removedCount };
  }

  /**
   * Check if a CSS selector is used in the HTML
   */
  private isSelectorUsed(
    selector: string,
    usedSelectors: {
      classes: Set<string>;
      ids: Set<string>;
      tags: Set<string>;
      attributes: Set<string>;
    }
  ): boolean {
    // Remove pseudo-classes and pseudo-elements
    const cleanSelector = selector.split(':')[0].split('::')[0].trim();

    // Always keep universal and keyframe selectors
    if (cleanSelector === '*' || selector.startsWith('@keyframes')) {
      return true;
    }

    // Check for tag selectors
    const tagMatch = cleanSelector.match(/^([a-z]+)/);
    if (tagMatch && usedSelectors.tags.has(tagMatch[1])) {
      return true;
    }

    // Check for class selectors
    const classMatches = cleanSelector.match(/\.([a-zA-Z0-9_-]+)/g) || [];
    if (
      classMatches.some((cls) =>
        usedSelectors.classes.has(cls.substring(1))
      )
    ) {
      return true;
    }

    // Check for ID selectors
    const idMatch = cleanSelector.match(/#([a-zA-Z0-9_-]+)/);
    if (idMatch && usedSelectors.ids.has(idMatch[1])) {
      return true;
    }

    // Check for attribute selectors
    const attrMatch = cleanSelector.match(/\[([a-z-]+)/);
    if (attrMatch && usedSelectors.attributes.has(attrMatch[1])) {
      return true;
    }

    return false;
  }

  /**
   * Parse CSS into rules
   */
  private parseCSSRules(css: string): Array<{ selector: string; declarations: string }> {
    const rules: Array<{ selector: string; declarations: string }> = [];

    // Remove comments
    css = css.replace(/\/\*[\s\S]*?\*\//g, '');

    // Match CSS rules
    const ruleRegex = /([^{]+)\{([^}]+)\}/g;
    let match;

    while ((match = ruleRegex.exec(css)) !== null) {
      const selector = match[1].trim();
      const declarations = `{${match[2].trim()}}`;

      rules.push({ selector, declarations });
    }

    return rules;
  }

  /**
   * Remove unused JavaScript
   */
  private async removeUnusedJS(
    $: cheerio.CheerioAPI,
    options: TreeShakingOptions
  ): Promise<{
    optimizedJS: string;
    removedFunctions: number;
    removedVariables: number;
    deadCode: number;
    warnings: string[];
  }> {
    const warnings: string[] = [];
    let removedFunctions = 0;
    let removedVariables = 0;
    let deadCode = 0;
    let allOptimizedJS = '';

    const scripts = $('script:not([src])').toArray();

    for (const script of scripts) {
      const $script = $(script);
      const jsContent = $script.html() || '';

      if (!jsContent.trim()) continue;

      try {
        // Use Terser for dead code elimination
        const result = await minifyJs(jsContent, {
          compress: {
            dead_code: options.removeDeadCode,
            unused: options.removeUnusedVariables,
            passes: options.aggressiveMode ? 3 : 2,
            drop_console: false,
            drop_debugger: true,
          },
          mangle: false, // Don't mangle for tree shaking
          format: {
            beautify: true, // Keep readable for analysis
            comments: false,
          },
        });

        if (result.code) {
          $script.html(result.code);
          allOptimizedJS += result.code + '\n\n';

          // Estimate removed items (rough heuristic)
          const originalLines = jsContent.split('\n').length;
          const optimizedLines = result.code.split('\n').length;
          const linesRemoved = originalLines - optimizedLines;

          if (linesRemoved > 0) {
            deadCode += linesRemoved;
          }
        }
      } catch (error) {
        warnings.push(
          `Failed to optimize JavaScript: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
        allOptimizedJS += jsContent + '\n\n';
      }
    }

    return {
      optimizedJS: allOptimizedJS,
      removedFunctions,
      removedVariables,
      deadCode,
      warnings,
    };
  }

  /**
   * Analyze tree shaking opportunities
   */
  async analyzeTreeShakingOpportunities(htmlContent: string): Promise<{
    unusedCSSRules: number;
    unusedCSSPercentage: number;
    deadCode: number;
    totalFunctions: number;
    totalVariables: number;
    potentialSavings: number;
    recommendations: string[];
  }> {
    const $ = cheerio.load(htmlContent);
    const recommendations: string[] = [];

    // Analyze CSS
    const usedSelectors = this.collectUsedSelectors($);
    let totalCSSRules = 0;
    let unusedCSSRules = 0;

    $('style').each((_, style) => {
      const cssContent = $(style).html() || '';
      const rules = this.parseCSSRules(cssContent);

      totalCSSRules += rules.length;

      rules.forEach((rule) => {
        if (!rule.selector.startsWith('@')) {
          const selectors = rule.selector.split(',');
          const hasUsedSelector = selectors.some((sel) =>
            this.isSelectorUsed(sel.trim(), usedSelectors)
          );

          if (!hasUsedSelector) {
            unusedCSSRules++;
          }
        }
      });
    });

    const unusedCSSPercentage =
      totalCSSRules > 0 ? (unusedCSSRules / totalCSSRules) * 100 : 0;

    // Analyze JavaScript (rough estimates)
    let totalFunctions = 0;
    let totalVariables = 0;
    let deadCode = 0;

    $('script:not([src])').each((_, script) => {
      const jsContent = $(script).html() || '';

      // Count function declarations
      const functionMatches = jsContent.match(/function\s+\w+/g) || [];
      totalFunctions += functionMatches.length;

      // Count variable declarations
      const varMatches = jsContent.match(/(?:var|let|const)\s+\w+/g) || [];
      totalVariables += varMatches.length;

      // Detect potential dead code (unreachable code after return)
      const deadCodeMatches = jsContent.match(/return[^}]*;\s+\S/g) || [];
      deadCode += deadCodeMatches.length;
    });

    // Estimate potential savings
    const totalSize = Buffer.byteLength(htmlContent, 'utf8');
    const potentialSavings = Math.floor(totalSize * (unusedCSSPercentage / 100));

    // Generate recommendations
    if (unusedCSSRules > 0) {
      recommendations.push(
        `${unusedCSSRules} unused CSS rule(s) detected (${unusedCSSPercentage.toFixed(1)}% of total). Remove them to reduce file size.`
      );
    }

    if (deadCode > 0) {
      recommendations.push(
        `${deadCode} potential dead code block(s) found in JavaScript. Enable dead code elimination.`
      );
    }

    if (totalFunctions > 50) {
      recommendations.push(
        `High function count (${totalFunctions}). Consider tree shaking to remove unused functions.`
      );
    }

    if (unusedCSSPercentage > 30) {
      recommendations.push(
        `More than 30% of CSS rules appear unused. Aggressive tree shaking recommended.`
      );
    }

    return {
      unusedCSSRules,
      unusedCSSPercentage,
      deadCode,
      totalFunctions,
      totalVariables,
      potentialSavings,
      recommendations,
    };
  }
}
