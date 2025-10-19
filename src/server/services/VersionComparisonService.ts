import * as cheerio from 'cheerio';
import * as Diff from 'diff';

export interface ComparisonResult {
  versionA: {
    id: string;
    name: string;
    createdAt: Date;
  };
  versionB: {
    id: string;
    name: string;
    createdAt: Date;
  };
  summary: {
    totalChanges: number;
    htmlChanges: number;
    cssChanges: number;
    jsChanges: number;
    assetChanges: number;
    similarity: number; // 0-100%
  };
  htmlDiff: FileDiff;
  cssDiff: FileDiff;
  jsDiff: FileDiff;
  assetDiffs: AssetDiff[];
  structuralChanges: StructuralChange[];
  visualChanges: VisualChange[];
}

export interface FileDiff {
  hasChanges: boolean;
  additions: number;
  deletions: number;
  modifications: number;
  hunks: DiffHunk[];
  unifiedDiff: string;
}

export interface DiffHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  changes: DiffChange[];
}

export interface DiffChange {
  type: 'add' | 'remove' | 'normal';
  lineNumber: number;
  content: string;
}

export interface AssetDiff {
  path: string;
  type: 'added' | 'removed' | 'modified' | 'unchanged';
  oldSize?: number;
  newSize?: number;
  sizeChange?: number;
  percentChange?: number;
}

export interface StructuralChange {
  type: 'element_added' | 'element_removed' | 'element_modified' | 'attribute_changed';
  selector: string;
  description: string;
  oldValue?: string;
  newValue?: string;
  impact: 'low' | 'medium' | 'high';
}

export interface VisualChange {
  type: 'layout' | 'styling' | 'content' | 'media';
  selector: string;
  property: string;
  oldValue: string;
  newValue: string;
  description: string;
}

export interface SideBySideComparison {
  html: {
    before: string;
    after: string;
    diff: string; // HTML with highlighted changes
  };
  css: {
    before: string;
    after: string;
    diff: string;
  };
  js: {
    before: string;
    after: string;
    diff: string;
  };
}

export class VersionComparisonService {
  /**
   * Compare two version snapshots
   */
  async compareVersions(
    versionAContent: { html: string; css: string; js: string; assets: any[] },
    versionBContent: { html: string; css: string; js: string; assets: any[] },
    versionAInfo: { id: string; name: string; createdAt: Date },
    versionBInfo: { id: string; name: string; createdAt: Date }
  ): Promise<ComparisonResult> {
    // Compare HTML
    const htmlDiff = this.compareText(versionAContent.html, versionBContent.html);

    // Compare CSS
    const cssDiff = this.compareText(versionAContent.css, versionBContent.css);

    // Compare JS
    const jsDiff = this.compareText(versionAContent.js, versionBContent.js);

    // Compare assets
    const assetDiffs = this.compareAssets(versionAContent.assets, versionBContent.assets);

    // Analyze structural changes in HTML
    const structuralChanges = this.analyzeStructuralChanges(
      versionAContent.html,
      versionBContent.html
    );

    // Analyze visual/styling changes
    const visualChanges = this.analyzeVisualChanges(
      versionAContent.html,
      versionBContent.html,
      versionAContent.css,
      versionBContent.css
    );

    // Calculate summary
    const totalChanges =
      htmlDiff.additions +
      htmlDiff.deletions +
      cssDiff.additions +
      cssDiff.deletions +
      jsDiff.additions +
      jsDiff.deletions +
      assetDiffs.filter((a) => a.type !== 'unchanged').length;

    const similarity = this.calculateSimilarity(
      versionAContent.html + versionAContent.css + versionAContent.js,
      versionBContent.html + versionBContent.css + versionBContent.js
    );

    return {
      versionA: versionAInfo,
      versionB: versionBInfo,
      summary: {
        totalChanges,
        htmlChanges: htmlDiff.additions + htmlDiff.deletions,
        cssChanges: cssDiff.additions + cssDiff.deletions,
        jsChanges: jsDiff.additions + jsDiff.deletions,
        assetChanges: assetDiffs.filter((a) => a.type !== 'unchanged').length,
        similarity,
      },
      htmlDiff,
      cssDiff,
      jsDiff,
      assetDiffs,
      structuralChanges,
      visualChanges,
    };
  }

  /**
   * Generate side-by-side comparison with highlighted changes
   */
  async generateSideBySide(
    versionAContent: { html: string; css: string; js: string },
    versionBContent: { html: string; css: string; js: string }
  ): Promise<SideBySideComparison> {
    return {
      html: {
        before: versionAContent.html,
        after: versionBContent.html,
        diff: this.generateHighlightedDiff(versionAContent.html, versionBContent.html),
      },
      css: {
        before: versionAContent.css,
        after: versionBContent.css,
        diff: this.generateHighlightedDiff(versionAContent.css, versionBContent.css),
      },
      js: {
        before: versionAContent.js,
        after: versionBContent.js,
        diff: this.generateHighlightedDiff(versionAContent.js, versionBContent.js),
      },
    };
  }

  /**
   * Compare text content and generate detailed diff
   */
  private compareText(textA: string, textB: string): FileDiff {
    const patches = Diff.structuredPatch('', '', textA, textB, '', '');

    let additions = 0;
    let deletions = 0;
    let modifications = 0;

    const hunks: DiffHunk[] = patches.hunks.map((hunk) => {
      const changes: DiffChange[] = [];
      let lineNumber = hunk.newStart;

      hunk.lines.forEach((line) => {
        const type = line[0];
        const content = line.slice(1);

        if (type === '+') {
          changes.push({ type: 'add', lineNumber: lineNumber++, content });
          additions++;
        } else if (type === '-') {
          changes.push({ type: 'remove', lineNumber: lineNumber, content });
          deletions++;
        } else {
          changes.push({ type: 'normal', lineNumber: lineNumber++, content });
        }
      });

      if (hunk.lines.some((l) => l[0] === '+') && hunk.lines.some((l) => l[0] === '-')) {
        modifications++;
      }

      return {
        oldStart: hunk.oldStart,
        oldLines: hunk.oldLines,
        newStart: hunk.newStart,
        newLines: hunk.newLines,
        changes,
      };
    });

    const unifiedDiff = Diff.createPatch('', textA, textB, '', '');

    return {
      hasChanges: additions > 0 || deletions > 0,
      additions,
      deletions,
      modifications,
      hunks,
      unifiedDiff,
    };
  }

  /**
   * Compare asset arrays
   */
  private compareAssets(assetsA: any[], assetsB: any[]): AssetDiff[] {
    const diffs: AssetDiff[] = [];
    const assetsAMap = new Map(assetsA.map((a) => [a.path, a]));
    const assetsBMap = new Map(assetsB.map((a) => [a.path, a]));

    // Check for added and modified assets
    for (const [path, assetB] of assetsBMap) {
      const assetA = assetsAMap.get(path);

      if (!assetA) {
        // Asset added
        diffs.push({
          path,
          type: 'added',
          newSize: assetB.content?.length || 0,
        });
      } else {
        // Check if modified
        const oldSize = assetA.content?.length || 0;
        const newSize = assetB.content?.length || 0;
        const sizeChange = newSize - oldSize;
        const percentChange = oldSize > 0 ? (sizeChange / oldSize) * 100 : 0;

        const isModified =
          assetA.content?.toString('base64') !== assetB.content?.toString('base64');

        diffs.push({
          path,
          type: isModified ? 'modified' : 'unchanged',
          oldSize,
          newSize,
          sizeChange,
          percentChange,
        });
      }
    }

    // Check for removed assets
    for (const [path, assetA] of assetsAMap) {
      if (!assetsBMap.has(path)) {
        diffs.push({
          path,
          type: 'removed',
          oldSize: assetA.content?.length || 0,
        });
      }
    }

    return diffs;
  }

  /**
   * Analyze structural changes in HTML
   */
  private analyzeStructuralChanges(htmlA: string, htmlB: string): StructuralChange[] {
    const changes: StructuralChange[] = [];

    try {
      const $a = cheerio.load(htmlA);
      const $b = cheerio.load(htmlB);

      // Compare major structural elements
      const elementsA = this.extractElements($a);
      const elementsB = this.extractElements($b);

      // Find added elements
      for (const [selector, dataB] of elementsB) {
        if (!elementsA.has(selector)) {
          changes.push({
            type: 'element_added',
            selector,
            description: `Added ${dataB.tag} element`,
            newValue: dataB.outerHTML,
            impact: this.determineImpact(dataB.tag),
          });
        }
      }

      // Find removed elements
      for (const [selector, dataA] of elementsA) {
        if (!elementsB.has(selector)) {
          changes.push({
            type: 'element_removed',
            selector,
            description: `Removed ${dataA.tag} element`,
            oldValue: dataA.outerHTML,
            impact: this.determineImpact(dataA.tag),
          });
        }
      }

      // Find modified elements (comparing by ID or class)
      const commonSelectors = Array.from(elementsA.keys()).filter((s) => elementsB.has(s));

      for (const selector of commonSelectors) {
        const dataA = elementsA.get(selector)!;
        const dataB = elementsB.get(selector)!;

        // Compare attributes
        const attrsA = dataA.attributes || {};
        const attrsB = dataB.attributes || {};

        for (const [attr, valueB] of Object.entries(attrsB)) {
          if (attrsA[attr] !== valueB) {
            changes.push({
              type: 'attribute_changed',
              selector,
              description: `Changed ${attr} attribute`,
              oldValue: attrsA[attr] || '',
              newValue: valueB,
              impact: attr === 'class' || attr === 'id' ? 'high' : 'medium',
            });
          }
        }

        // Check for removed attributes
        for (const attr of Object.keys(attrsA)) {
          if (!(attr in attrsB)) {
            changes.push({
              type: 'attribute_changed',
              selector,
              description: `Removed ${attr} attribute`,
              oldValue: attrsA[attr],
              impact: 'medium',
            });
          }
        }
      }
    } catch (error) {
      console.error('Error analyzing structural changes:', error);
    }

    return changes;
  }

  /**
   * Analyze visual/styling changes
   */
  private analyzeVisualChanges(
    htmlA: string,
    htmlB: string,
    cssA: string,
    cssB: string
  ): VisualChange[] {
    const changes: VisualChange[] = [];

    try {
      // Analyze inline style changes
      const $a = cheerio.load(htmlA);
      const $b = cheerio.load(htmlB);

      // Compare elements with inline styles
      $b('[style]').each((_, elem) => {
        const $elem = $b(elem);
        const selector = this.generateSelector($elem, $b);
        const styleB = $elem.attr('style') || '';

        const $elemA = $a(selector);
        const styleA = $elemA.attr('style') || '';

        if (styleA !== styleB) {
          changes.push({
            type: 'styling',
            selector,
            property: 'inline-style',
            oldValue: styleA,
            newValue: styleB,
            description: 'Inline style changed',
          });
        }
      });

      // Analyze CSS changes
      if (cssA !== cssB) {
        const cssChanges = this.analyzeCSSChanges(cssA, cssB);
        changes.push(...cssChanges);
      }
    } catch (error) {
      console.error('Error analyzing visual changes:', error);
    }

    return changes;
  }

  /**
   * Analyze CSS rule changes
   */
  private analyzeCSSChanges(cssA: string, cssB: string): VisualChange[] {
    const changes: VisualChange[] = [];

    // Simple CSS parsing - could be enhanced with a proper CSS parser
    const rulesA = this.parseSimpleCSS(cssA);
    const rulesB = this.parseSimpleCSS(cssB);

    for (const [selector, propsB] of rulesB) {
      const propsA = rulesA.get(selector);

      if (!propsA) {
        // New CSS rule
        changes.push({
          type: 'styling',
          selector,
          property: 'new-rule',
          oldValue: '',
          newValue: Object.entries(propsB).map(([k, v]) => `${k}: ${v}`).join('; '),
          description: 'New CSS rule added',
        });
      } else {
        // Check for changed properties
        for (const [prop, valueB] of Object.entries(propsB)) {
          const valueA = propsA[prop];
          if (valueA !== valueB) {
            changes.push({
              type: 'styling',
              selector,
              property: prop,
              oldValue: valueA || '',
              newValue: valueB,
              description: `CSS property ${prop} changed`,
            });
          }
        }
      }
    }

    return changes;
  }

  /**
   * Calculate similarity percentage between two texts
   */
  private calculateSimilarity(textA: string, textB: string): number {
    if (!textA && !textB) return 100;
    if (!textA || !textB) return 0;

    const changes = Diff.diffChars(textA, textB);
    let sameChars = 0;
    let totalChars = 0;

    changes.forEach((change) => {
      const count = change.value.length;
      totalChars += count;
      if (!change.added && !change.removed) {
        sameChars += count;
      }
    });

    return totalChars > 0 ? Math.round((sameChars / totalChars) * 100) : 0;
  }

  /**
   * Generate highlighted diff HTML
   */
  private generateHighlightedDiff(textA: string, textB: string): string {
    const changes = Diff.diffLines(textA, textB);
    let html = '<div class="diff-view">';

    changes.forEach((change, index) => {
      const value = this.escapeHtml(change.value);
      if (change.added) {
        html += `<div class="diff-line added" data-line="${index}"><span class="diff-marker">+</span>${value}</div>`;
      } else if (change.removed) {
        html += `<div class="diff-line removed" data-line="${index}"><span class="diff-marker">-</span>${value}</div>`;
      } else {
        html += `<div class="diff-line unchanged" data-line="${index}"><span class="diff-marker"> </span>${value}</div>`;
      }
    });

    html += '</div>';
    return html;
  }

  /**
   * Extract elements from HTML with metadata
   */
  private extractElements($: cheerio.CheerioAPI): Map<string, any> {
    const elements = new Map();

    $('*').each((_, elem) => {
      const $elem = $(elem);
      const tag = elem.tagName;
      const id = $elem.attr('id');
      const classes = $elem.attr('class');

      // Generate a selector
      let selector = tag;
      if (id) {
        selector = `#${id}`;
      } else if (classes) {
        selector = `${tag}.${classes.split(' ')[0]}`;
      }

      // Store element data
      elements.set(selector, {
        tag,
        attributes: $elem.attr(),
        outerHTML: $.html(elem).slice(0, 200), // First 200 chars
      });
    });

    return elements;
  }

  /**
   * Generate CSS selector for an element
   */
  private generateSelector($elem: cheerio.Cheerio<any>, $: cheerio.CheerioAPI): string {
    const id = $elem.attr('id');
    if (id) return `#${id}`;

    const classes = $elem.attr('class');
    if (classes) {
      return `${$elem.prop('tagName')?.toLowerCase()}.${classes.split(' ')[0]}`;
    }

    return $elem.prop('tagName')?.toLowerCase() || 'unknown';
  }

  /**
   * Determine impact level of a change
   */
  private determineImpact(tag: string): 'low' | 'medium' | 'high' {
    const highImpact = ['body', 'html', 'head', 'main', 'header', 'footer', 'nav'];
    const mediumImpact = ['section', 'article', 'aside', 'div', 'form'];

    if (highImpact.includes(tag.toLowerCase())) return 'high';
    if (mediumImpact.includes(tag.toLowerCase())) return 'medium';
    return 'low';
  }

  /**
   * Parse simple CSS (basic implementation)
   */
  private parseSimpleCSS(css: string): Map<string, Record<string, string>> {
    const rules = new Map();
    const ruleRegex = /([^{]+)\{([^}]+)\}/g;
    let match;

    while ((match = ruleRegex.exec(css)) !== null) {
      const selector = match[1].trim();
      const declarations = match[2].trim();
      const props: Record<string, string> = {};

      declarations.split(';').forEach((decl) => {
        const [prop, value] = decl.split(':').map((s) => s.trim());
        if (prop && value) {
          props[prop] = value;
        }
      });

      rules.set(selector, props);
    }

    return rules;
  }

  /**
   * Escape HTML for safe display
   */
  private escapeHtml(text: string): string {
    const map: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;',
    };
    return text.replace(/[&<>"']/g, (m) => map[m]);
  }
}
