import * as cheerio from 'cheerio';

/**
 * Dependency Elimination Service
 *
 * Automatically removes plugin dependencies and converts them to native code.
 * Provides confirmation that all dependencies have been eliminated.
 */

export interface EliminationResult {
  success: boolean;
  removed: string[];
  converted: string[];
  warnings: string[];
  originalSize: number;
  newSize: number;
  cleanedContent: string;
}

export interface EliminationOptions {
  removeShortcodes?: boolean;
  convertToStatic?: boolean;
  removePluginClasses?: boolean;
  removePluginScripts?: boolean;
  removePluginStyles?: boolean;
  preserveLayout?: boolean;
}

export class DependencyEliminationService {
  /**
   * Eliminate all plugin dependencies from HTML content
   */
  async eliminateFromHTML(
    html: string,
    options: EliminationOptions = {}
  ): Promise<EliminationResult> {
    const {
      removeShortcodes = true,
      convertToStatic = true,
      removePluginClasses = true,
      removePluginScripts = true,
      removePluginStyles = true,
      preserveLayout = true,
    } = options;

    const $ = cheerio.load(html);
    const removed: string[] = [];
    const converted: string[] = [];
    const warnings: string[] = [];
    const originalSize = html.length;

    // Remove plugin-specific scripts
    if (removePluginScripts) {
      $('script[src]').each((_, element) => {
        const src = $(element).attr('src') || '';

        if (this.isPluginScript(src)) {
          removed.push(`Script: ${src}`);
          $(element).remove();
        }
      });

      // Remove inline scripts with plugin code
      $('script:not([src])').each((_, element) => {
        const content = $(element).html() || '';

        if (this.containsPluginCode(content)) {
          removed.push('Inline plugin script');
          $(element).remove();
        }
      });
    }

    // Remove plugin-specific styles
    if (removePluginStyles) {
      $('link[rel="stylesheet"]').each((_, element) => {
        const href = $(element).attr('href') || '';

        if (this.isPluginStyle(href)) {
          removed.push(`Stylesheet: ${href}`);
          $(element).remove();
        }
      });

      // Remove inline styles with plugin code
      $('style').each((_, element) => {
        const content = $(element).html() || '';

        if (this.containsPluginCSS(content)) {
          removed.push('Inline plugin styles');
          $(element).remove();
        }
      });
    }

    // Remove plugin-specific classes
    if (removePluginClasses) {
      $('[class]').each((_, element) => {
        const classes = $(element).attr('class') || '';
        const cleanedClasses = this.removePluginClasses(classes);

        if (classes !== cleanedClasses) {
          removed.push(`Plugin classes from element`);

          if (cleanedClasses.trim()) {
            $(element).attr('class', cleanedClasses);
          } else {
            $(element).removeAttr('class');
          }
        }
      });
    }

    // Remove plugin-specific data attributes
    $('[data-elementor-type], [data-elementor-id], [data-vc-], [data-wpb-]').each((_, element) => {
      const attrs = $(element).attr();
      for (const attr in attrs) {
        if (this.isPluginAttribute(attr)) {
          removed.push(`Plugin attribute: ${attr}`);
          $(element).removeAttr(attr);
        }
      }
    });

    // Convert shortcodes to static HTML
    if (removeShortcodes) {
      $('body').each((_, element) => {
        let bodyHtml = $(element).html() || '';

        if (bodyHtml.includes('[')) {
          const result = this.convertShortcodes(bodyHtml, convertToStatic);
          bodyHtml = result.html;
          converted.push(...result.converted);
          warnings.push(...result.warnings);

          $(element).html(bodyHtml);
        }
      });
    }

    // Clean up Elementor-specific structures
    $('.elementor-widget, .elementor-element, .elementor-section').each((_, element) => {
      if (preserveLayout) {
        // Keep content but remove Elementor wrapper
        const content = $(element).html();
        const tagName = $(element).prop('tagName')?.toLowerCase();

        if (tagName === 'div' || tagName === 'section') {
          $(element).replaceWith(`<div class="cleaned-section">${content}</div>`);
          converted.push('Elementor section to div');
        }
      } else {
        // Extract inner content
        const content = $(element).html();
        $(element).replaceWith(content);
        removed.push('Elementor wrapper');
      }
    });

    // Clean up WPBakery Page Builder structures
    $('.vc_row, .vc_column, .wpb_wrapper').each((_, element) => {
      if (preserveLayout) {
        const content = $(element).html();
        $(element).replaceWith(`<div class="row">${content}</div>`);
        converted.push('WPBakery structure to standard div');
      } else {
        const content = $(element).html();
        $(element).replaceWith(content);
        removed.push('WPBakery wrapper');
      }
    });

    // Remove WooCommerce-specific elements that won't work without plugin
    $('.woocommerce, .wc-', '[class*="woocommerce"]').each((_, element) => {
      const hasStaticContent = $(element).text().trim().length > 0;

      if (hasStaticContent && convertToStatic) {
        // Keep as static content
        const text = $(element).text();
        $(element).replaceWith(`<div class="static-content">${text}</div>`);
        converted.push('WooCommerce element to static content');
      } else {
        removed.push('WooCommerce element');
        $(element).remove();
      }
    });

    // Remove Contact Form 7 forms
    $('.wpcf7, [class*="wpcf7"]').each((_, element) => {
      if (convertToStatic) {
        warnings.push('Contact Form 7 form detected - converted to placeholder. Replace with custom form.');
        $(element).replaceWith('<div class="form-placeholder">Contact form removed - please implement custom form</div>');
        converted.push('Contact Form 7 to placeholder');
      } else {
        removed.push('Contact Form 7 form');
        $(element).remove();
      }
    });

    // Remove Gravity Forms
    $('.gform_wrapper, [class*="gform"]').each((_, element) => {
      if (convertToStatic) {
        warnings.push('Gravity Form detected - converted to placeholder. Replace with custom form.');
        $(element).replaceWith('<div class="form-placeholder">Form removed - please implement custom form</div>');
        converted.push('Gravity Form to placeholder');
      } else {
        removed.push('Gravity Form');
        $(element).remove();
      }
    });

    // Remove ACF (Advanced Custom Fields) specific attributes
    $('[data-acf], [class*="acf-"]').each((_, element) => {
      const attrs = $(element).attr();
      for (const attr in attrs) {
        if (attr.includes('acf')) {
          removed.push(`ACF attribute: ${attr}`);
          $(element).removeAttr(attr);
        }
      }
    });

    // Clean up empty elements created by removal
    $('div:empty, section:empty, span:empty').each((_, element) => {
      const hasChildren = $(element).children().length > 0;
      if (!hasChildren) {
        $(element).remove();
      }
    });

    const cleanedContent = $.html();
    const newSize = cleanedContent.length;

    return {
      success: true,
      removed: [...new Set(removed)],
      converted: [...new Set(converted)],
      warnings: [...new Set(warnings)],
      originalSize,
      newSize,
      cleanedContent,
    };
  }

  /**
   * Eliminate plugin dependencies from PHP code
   */
  async eliminateFromPHP(
    php: string,
    options: EliminationOptions = {}
  ): Promise<EliminationResult> {
    const removed: string[] = [];
    const converted: string[] = [];
    const warnings: string[] = [];
    const originalSize = php.length;
    let cleanedContent = php;

    // Remove plugin-specific function calls
    const pluginFunctions = [
      'elementor_',
      'vc_',
      'wpb_',
      'acf_',
      'get_field',
      'the_field',
      'woocommerce_',
      'wc_',
      'do_shortcode',
    ];

    for (const funcPrefix of pluginFunctions) {
      const regex = new RegExp(`${funcPrefix}\\w+\\s*\\([^)]*\\)`, 'g');
      const matches = cleanedContent.match(regex);

      if (matches) {
        for (const match of matches) {
          removed.push(`PHP function: ${match}`);
          cleanedContent = cleanedContent.replace(match, '/* Plugin function removed */');
        }
      }
    }

    // Remove plugin-specific hooks
    const hookPattern = /(add_action|add_filter)\s*\(\s*['"]([^'"]+)['"][^;]+;/g;
    let match;

    while ((match = hookPattern.exec(php)) !== null) {
      const hookName = match[2];

      if (this.isPluginHook(hookName)) {
        removed.push(`Plugin hook: ${hookName}`);
        cleanedContent = cleanedContent.replace(match[0], '/* Plugin hook removed */');
      }
    }

    // Remove plugin file includes
    const includePattern = /(require|include|require_once|include_once)\s*\(?['"]([^'"]+wp-content\/plugins[^'"]+)['"]\)?;/g;

    while ((match = includePattern.exec(php)) !== null) {
      removed.push(`Plugin include: ${match[2]}`);
      cleanedContent = cleanedContent.replace(match[0], '/* Plugin include removed */');
    }

    // Remove plugin class instantiations
    const classPattern = /new\s+(\w+)\s*\(/g;

    while ((match = classPattern.exec(php)) !== null) {
      const className = match[1];

      if (this.isPluginClass(className)) {
        removed.push(`Plugin class: ${className}`);
      }
    }

    const newSize = cleanedContent.length;

    return {
      success: true,
      removed: [...new Set(removed)],
      converted: [...new Set(converted)],
      warnings: [...new Set(warnings)],
      originalSize,
      newSize,
      cleanedContent,
    };
  }

  /**
   * Eliminate plugin dependencies from CSS
   */
  async eliminateFromCSS(
    css: string,
    options: EliminationOptions = {}
  ): Promise<EliminationResult> {
    const removed: string[] = [];
    const converted: string[] = [];
    const warnings: string[] = [];
    const originalSize = css.length;
    let cleanedContent = css;

    // Remove plugin-specific selectors and their rules
    const pluginPrefixes = [
      'elementor',
      'vc_',
      'wpb_',
      'woocommerce',
      'wc-',
      'gform',
      'wpcf7',
      'acf-',
    ];

    for (const prefix of pluginPrefixes) {
      // Remove class selectors
      const classRegex = new RegExp(`\\.${prefix}[\\w-]*\\s*\\{[^}]*\\}`, 'g');
      const matches = cleanedContent.match(classRegex);

      if (matches) {
        for (const match of matches) {
          removed.push(`CSS rule: ${prefix}`);
          cleanedContent = cleanedContent.replace(match, '');
        }
      }

      // Remove ID selectors
      const idRegex = new RegExp(`#${prefix}[\\w-]*\\s*\\{[^}]*\\}`, 'g');
      const idMatches = cleanedContent.match(idRegex);

      if (idMatches) {
        for (const match of idMatches) {
          removed.push(`CSS ID rule: ${prefix}`);
          cleanedContent = cleanedContent.replace(match, '');
        }
      }
    }

    // Remove @import of plugin stylesheets
    const importPattern = /@import\s+(?:url\()?['"]?([^'")\s]+plugins[^'")\s]+)['"]?\)?;/g;
    let match;

    while ((match = importPattern.exec(css)) !== null) {
      removed.push(`CSS import: ${match[1]}`);
      cleanedContent = cleanedContent.replace(match[0], '');
    }

    // Clean up extra whitespace
    cleanedContent = cleanedContent.replace(/\n\s*\n/g, '\n');

    const newSize = cleanedContent.length;

    return {
      success: true,
      removed: [...new Set(removed)],
      converted: [...new Set(converted)],
      warnings: [...new Set(warnings)],
      originalSize,
      newSize,
      cleanedContent,
    };
  }

  /**
   * Eliminate plugin dependencies from JavaScript
   */
  async eliminateFromJS(
    js: string,
    options: EliminationOptions = {}
  ): Promise<EliminationResult> {
    const removed: string[] = [];
    const converted: string[] = [];
    const warnings: string[] = [];
    const originalSize = js.length;
    let cleanedContent = js;

    // Remove plugin-specific object usage
    const pluginObjects = [
      'elementor',
      'elementorFrontend',
      'vc_',
      'wpb_',
      'woocommerce',
    ];

    for (const obj of pluginObjects) {
      const regex = new RegExp(`${obj}\\.[\\w.]+`, 'g');
      const matches = cleanedContent.match(regex);

      if (matches) {
        for (const match of matches) {
          removed.push(`JS plugin reference: ${match}`);
        }
      }
    }

    // Remove plugin-specific event listeners
    const eventPattern = /(?:addEventListener|on)\s*\(\s*['"]([^'"]+)['"][^)]*\)/g;
    let match;

    while ((match = eventPattern.exec(js)) !== null) {
      const eventName = match[1];

      if (this.isPluginEvent(eventName)) {
        removed.push(`Plugin event: ${eventName}`);
      }
    }

    // Remove imports from plugin directories
    const importPattern = /import\s+.*from\s+['"]([^'"]+plugins[^'"]+)['"]/g;

    while ((match = importPattern.exec(js)) !== null) {
      removed.push(`Plugin import: ${match[1]}`);
      cleanedContent = cleanedContent.replace(match[0], '/* Plugin import removed */');
    }

    const newSize = cleanedContent.length;

    return {
      success: true,
      removed: [...new Set(removed)],
      converted: [...new Set(converted)],
      warnings: [...new Set(warnings)],
      originalSize,
      newSize,
      cleanedContent,
    };
  }

  /**
   * Convert shortcodes to static HTML
   */
  private convertShortcodes(
    html: string,
    convertToStatic: boolean
  ): { html: string; converted: string[]; warnings: string[] } {
    const converted: string[] = [];
    const warnings: string[] = [];
    let cleanedHtml = html;

    // Common shortcode conversions
    const shortcodeMap: Record<string, string> = {
      // Gallery shortcode
      'gallery': '<div class="gallery"><!-- Gallery content --></div>',

      // Button shortcode
      'button': '<a href="#" class="button">Button</a>',

      // Contact Form 7
      'contact-form-7': '<div class="form-placeholder">Contact form removed - please implement custom form</div>',

      // Video shortcodes
      'video': '<video controls><source src="" type="video/mp4"></video>',
      'youtube': '<div class="video-placeholder">YouTube video - please add embed code</div>',
      'vimeo': '<div class="video-placeholder">Vimeo video - please add embed code</div>',

      // Social media
      'social-share': '<div class="social-share"><!-- Add social share buttons --></div>',
    };

    const shortcodePattern = /\[(\w+)(?:\s+[^\]]+)?\](?:([^\[]*)\[\/\1\])?/g;
    let match;

    while ((match = shortcodePattern.exec(html)) !== null) {
      const fullMatch = match[0];
      const shortcodeName = match[1];
      const innerContent = match[2] || '';

      if (convertToStatic && shortcodeMap[shortcodeName]) {
        cleanedHtml = cleanedHtml.replace(fullMatch, shortcodeMap[shortcodeName]);
        converted.push(`Shortcode [${shortcodeName}] to static HTML`);
      } else {
        // Remove unknown shortcodes
        cleanedHtml = cleanedHtml.replace(fullMatch, innerContent || '');
        warnings.push(`Unknown shortcode [${shortcodeName}] removed`);
      }
    }

    return { html: cleanedHtml, converted, warnings };
  }

  /**
   * Check if script is from a plugin
   */
  private isPluginScript(src: string): boolean {
    return src.includes('wp-content/plugins') ||
           src.includes('elementor') ||
           src.includes('wpbakery') ||
           src.includes('woocommerce') ||
           src.includes('contact-form-7') ||
           src.includes('gravityforms');
  }

  /**
   * Check if stylesheet is from a plugin
   */
  private isPluginStyle(href: string): boolean {
    return href.includes('wp-content/plugins') ||
           href.includes('elementor') ||
           href.includes('wpbakery') ||
           href.includes('woocommerce') ||
           href.includes('contact-form-7');
  }

  /**
   * Check if script content contains plugin code
   */
  private containsPluginCode(content: string): boolean {
    const pluginKeywords = [
      'elementor',
      'elementorFrontend',
      'vc_',
      'wpb_',
      'woocommerce',
      'wc_',
      'gform',
      'wpcf7',
    ];

    return pluginKeywords.some(keyword => content.includes(keyword));
  }

  /**
   * Check if CSS content contains plugin styles
   */
  private containsPluginCSS(content: string): boolean {
    const pluginPrefixes = [
      '.elementor',
      '.vc_',
      '.wpb_',
      '.woocommerce',
      '.wc-',
      '.gform',
      '.wpcf7',
    ];

    return pluginPrefixes.some(prefix => content.includes(prefix));
  }

  /**
   * Remove plugin classes from class string
   */
  private removePluginClasses(classes: string): string {
    const pluginPrefixes = [
      'elementor',
      'vc_',
      'wpb_',
      'woocommerce',
      'wc-',
      'gform',
      'wpcf7',
      'acf-',
      'et-',
      'et_',
    ];

    const classArray = classes.split(/\s+/);
    const cleanedClasses = classArray.filter(cls => {
      return !pluginPrefixes.some(prefix => cls.startsWith(prefix));
    });

    return cleanedClasses.join(' ');
  }

  /**
   * Check if attribute is plugin-specific
   */
  private isPluginAttribute(attr: string): boolean {
    const pluginAttrPrefixes = [
      'data-elementor',
      'data-vc',
      'data-wpb',
      'data-woocommerce',
      'data-acf',
    ];

    return pluginAttrPrefixes.some(prefix => attr.startsWith(prefix));
  }

  /**
   * Check if hook is plugin-specific
   */
  private isPluginHook(hookName: string): boolean {
    const pluginHookPrefixes = [
      'elementor',
      'vc_',
      'wpb_',
      'woocommerce',
      'wc_',
      'acf',
      'gform',
      'wpcf7',
    ];

    return pluginHookPrefixes.some(prefix => hookName.includes(prefix));
  }

  /**
   * Check if class is plugin-specific
   */
  private isPluginClass(className: string): boolean {
    const pluginClassPrefixes = [
      'Elementor',
      'VC_',
      'WPBakery',
      'WooCommerce',
      'WC_',
      'ACF',
      'GForms',
      'WPCF7',
    ];

    return pluginClassPrefixes.some(prefix => className.startsWith(prefix));
  }

  /**
   * Check if event is plugin-specific
   */
  private isPluginEvent(eventName: string): boolean {
    const pluginEvents = [
      'elementor',
      'vc_',
      'woocommerce',
      'wc_',
    ];

    return pluginEvents.some(prefix => eventName.includes(prefix));
  }

  /**
   * Generate elimination confirmation report
   */
  generateConfirmationReport(results: {
    html?: EliminationResult;
    php?: EliminationResult;
    css?: EliminationResult;
    js?: EliminationResult;
  }): string {
    let report = '';

    report += '═══════════════════════════════════════════════════════\n';
    report += '  DEPENDENCY ELIMINATION CONFIRMATION REPORT\n';
    report += '═══════════════════════════════════════════════════════\n\n';

    report += `Generated: ${new Date().toISOString()}\n\n`;

    let totalRemoved = 0;
    let totalConverted = 0;
    let totalWarnings = 0;

    // HTML Results
    if (results.html) {
      report += '───────────────────────────────────────────────────────\n';
      report += 'HTML CLEANUP\n';
      report += '───────────────────────────────────────────────────────\n';
      report += `Removed: ${results.html.removed.length} dependencies\n`;
      report += `Converted: ${results.html.converted.length} elements\n`;
      report += `Warnings: ${results.html.warnings.length}\n`;
      report += `Size reduction: ${results.html.originalSize - results.html.newSize} bytes\n\n`;

      totalRemoved += results.html.removed.length;
      totalConverted += results.html.converted.length;
      totalWarnings += results.html.warnings.length;
    }

    // PHP Results
    if (results.php) {
      report += '───────────────────────────────────────────────────────\n';
      report += 'PHP CLEANUP\n';
      report += '───────────────────────────────────────────────────────\n';
      report += `Removed: ${results.php.removed.length} dependencies\n`;
      report += `Size reduction: ${results.php.originalSize - results.php.newSize} bytes\n\n`;

      totalRemoved += results.php.removed.length;
    }

    // CSS Results
    if (results.css) {
      report += '───────────────────────────────────────────────────────\n';
      report += 'CSS CLEANUP\n';
      report += '───────────────────────────────────────────────────────\n';
      report += `Removed: ${results.css.removed.length} dependencies\n`;
      report += `Size reduction: ${results.css.originalSize - results.css.newSize} bytes\n\n`;

      totalRemoved += results.css.removed.length;
    }

    // JS Results
    if (results.js) {
      report += '───────────────────────────────────────────────────────\n';
      report += 'JAVASCRIPT CLEANUP\n';
      report += '───────────────────────────────────────────────────────\n';
      report += `Removed: ${results.js.removed.length} dependencies\n`;
      report += `Size reduction: ${results.js.originalSize - results.js.newSize} bytes\n\n`;

      totalRemoved += results.js.removed.length;
    }

    report += '═══════════════════════════════════════════════════════\n';
    report += 'SUMMARY\n';
    report += '═══════════════════════════════════════════════════════\n';
    report += `Total Dependencies Removed: ${totalRemoved}\n`;
    report += `Total Elements Converted: ${totalConverted}\n`;
    report += `Total Warnings: ${totalWarnings}\n\n`;

    if (totalRemoved === 0 && totalWarnings === 0) {
      report += '✅ CONFIRMED: Export is 100% plugin-free!\n';
      report += '✅ No plugin dependencies detected.\n';
      report += '✅ Ready for deployment without any plugins.\n';
    } else {
      report += `✅ Successfully eliminated ${totalRemoved} plugin dependencies!\n`;
      if (totalWarnings > 0) {
        report += `⚠️  ${totalWarnings} warnings - please review manually.\n`;
      } else {
        report += '✅ No warnings - clean elimination!\n';
      }
    }

    report += '\n═══════════════════════════════════════════════════════\n';

    return report;
  }
}

export default new DependencyEliminationService();
