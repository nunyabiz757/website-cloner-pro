import * as cheerio from 'cheerio';

/**
 * Plugin-Free Verification Service
 *
 * Scans WordPress exports for external dependencies and verifies plugin-free compatibility.
 * Generates comprehensive reports showing zero plugins needed for the export.
 */

export interface DependencyCheck {
  type: 'plugin' | 'theme' | 'external-script' | 'external-style' | 'shortcode' | 'widget' | 'hook';
  name: string;
  detected: boolean;
  location: string;
  severity: 'critical' | 'warning' | 'info';
  description: string;
  suggestion?: string;
}

export interface VerificationReport {
  isPluginFree: boolean;
  score: number; // 0-100, 100 = completely plugin-free
  summary: {
    totalChecks: number;
    passed: number;
    warnings: number;
    critical: number;
  };
  dependencies: DependencyCheck[];
  fileAnalysis: {
    php: FileAnalysisResult[];
    html: FileAnalysisResult[];
    css: FileAnalysisResult[];
    js: FileAnalysisResult[];
  };
  recommendations: string[];
  timestamp: Date;
}

export interface FileAnalysisResult {
  filePath: string;
  size: number;
  dependencies: string[];
  externalCalls: string[];
  pluginReferences: string[];
  isClean: boolean;
}

export interface VerificationOptions {
  strictMode?: boolean; // If true, any dependency fails verification
  allowWordPressCore?: boolean; // Allow core WordPress functions
  allowThemeFunctions?: boolean; // Allow standard theme functions
  customWhitelist?: string[]; // Custom allowed dependencies
}

export class PluginFreeVerificationService {
  // Known plugin signatures to detect
  private readonly PLUGIN_SIGNATURES = {
    elementor: [
      'elementor',
      'elementor-widget',
      'elementor-element',
      'data-elementor',
      'elementor/init',
      'elementor_pro',
    ],
    woocommerce: [
      'woocommerce',
      'wc-',
      'product_cat',
      'add_to_cart',
      'woocommerce_',
    ],
    yoast: [
      'yoast',
      'wpseo',
      'rank-math',
    ],
    jetpack: [
      'jetpack',
      'jp-',
      'jetpack_',
    ],
    acf: [
      'acf',
      'advanced-custom-fields',
      'get_field',
      'the_field',
      'acf_',
    ],
    wpbakery: [
      'vc_',
      'wpb_',
      'js_composer',
    ],
    contactForm7: [
      'wpcf7',
      'contact-form-7',
      'wpcf7_contact_form',
    ],
    gravityForms: [
      'gform',
      'gravity-forms',
      'gf_',
    ],
  };

  // WordPress core functions (allowed)
  private readonly WP_CORE_FUNCTIONS = [
    'wp_head',
    'wp_footer',
    'wp_body_open',
    'get_header',
    'get_footer',
    'get_sidebar',
    'get_template_part',
    'bloginfo',
    'wp_enqueue_style',
    'wp_enqueue_script',
    'the_content',
    'the_title',
    'the_permalink',
    'get_post_meta',
    'wp_get_attachment_image',
    'has_post_thumbnail',
    'the_post_thumbnail',
  ];

  // Known shortcode patterns
  private readonly SHORTCODE_PATTERN = /\[(\w+)(?:\s+[^\]]+)?\]/g;

  /**
   * Verify if a WordPress export is plugin-free
   */
  async verifyPluginFree(
    exportPath: string,
    files: {
      php: string[];
      html: string[];
      css: string[];
      js: string[];
    },
    options: VerificationOptions = {}
  ): Promise<VerificationReport> {
    const {
      strictMode = false,
      allowWordPressCore = true,
      allowThemeFunctions = true,
      customWhitelist = [],
    } = options;

    const dependencies: DependencyCheck[] = [];
    const fileAnalysis: VerificationReport['fileAnalysis'] = {
      php: [],
      html: [],
      css: [],
      js: [],
    };

    // Scan PHP files
    for (const phpFile of files.php) {
      const analysis = await this.analyzePHPFile(phpFile, allowWordPressCore, customWhitelist);
      fileAnalysis.php.push(analysis);
      dependencies.push(...this.convertAnalysisToChecks(analysis, 'PHP'));
    }

    // Scan HTML files
    for (const htmlFile of files.html) {
      const analysis = await this.analyzeHTMLFile(htmlFile);
      fileAnalysis.html.push(analysis);
      dependencies.push(...this.convertAnalysisToChecks(analysis, 'HTML'));
    }

    // Scan CSS files
    for (const cssFile of files.css) {
      const analysis = await this.analyzeCSSFile(cssFile);
      fileAnalysis.css.push(analysis);
      dependencies.push(...this.convertAnalysisToChecks(analysis, 'CSS'));
    }

    // Scan JS files
    for (const jsFile of files.js) {
      const analysis = await this.analyzeJSFile(jsFile);
      fileAnalysis.js.push(analysis);
      dependencies.push(...this.convertAnalysisToChecks(analysis, 'JavaScript'));
    }

    // Calculate summary
    const critical = dependencies.filter(d => d.severity === 'critical').length;
    const warnings = dependencies.filter(d => d.severity === 'warning').length;
    const passed = dependencies.filter(d => !d.detected).length;
    const totalChecks = dependencies.length;

    // Calculate score (100 = perfect, 0 = many critical issues)
    let score = 100;
    score -= critical * 20; // Each critical issue: -20 points
    score -= warnings * 5;  // Each warning: -5 points
    score = Math.max(0, score);

    // Determine if plugin-free
    const isPluginFree = strictMode ? (critical === 0 && warnings === 0) : (critical === 0);

    // Generate recommendations
    const recommendations = this.generateRecommendations(dependencies, fileAnalysis);

    return {
      isPluginFree,
      score,
      summary: {
        totalChecks,
        passed,
        warnings,
        critical,
      },
      dependencies,
      fileAnalysis,
      recommendations,
      timestamp: new Date(),
    };
  }

  /**
   * Analyze PHP file for plugin dependencies
   */
  private async analyzePHPFile(
    content: string,
    allowWordPressCore: boolean,
    customWhitelist: string[]
  ): Promise<FileAnalysisResult> {
    const dependencies: string[] = [];
    const externalCalls: string[] = [];
    const pluginReferences: string[] = [];

    // Check for plugin function calls
    const functionCallPattern = /(\w+)\s*\(/g;
    let match;
    while ((match = functionCallPattern.exec(content)) !== null) {
      const funcName = match[1];

      // Skip if WordPress core function and allowed
      if (allowWordPressCore && this.WP_CORE_FUNCTIONS.includes(funcName)) {
        continue;
      }

      // Skip if in custom whitelist
      if (customWhitelist.includes(funcName)) {
        continue;
      }

      // Check for plugin signatures
      for (const [plugin, signatures] of Object.entries(this.PLUGIN_SIGNATURES)) {
        for (const signature of signatures) {
          if (funcName.toLowerCase().includes(signature.toLowerCase())) {
            pluginReferences.push(`${plugin}: ${funcName}`);
            dependencies.push(funcName);
            break;
          }
        }
      }
    }

    // Check for plugin-specific hooks
    const hookPattern = /(add_action|add_filter)\s*\(\s*['"]([^'"]+)['"]/g;
    while ((match = hookPattern.exec(content)) !== null) {
      const hookName = match[2];

      // Check if hook is plugin-specific
      for (const [plugin, signatures] of Object.entries(this.PLUGIN_SIGNATURES)) {
        for (const signature of signatures) {
          if (hookName.toLowerCase().includes(signature.toLowerCase())) {
            pluginReferences.push(`${plugin} hook: ${hookName}`);
            dependencies.push(hookName);
            break;
          }
        }
      }
    }

    // Check for require/include of plugin files
    const includePattern = /(require|include|require_once|include_once)\s*\(?['"]([^'"]+)['"]/g;
    while ((match = includePattern.exec(content)) !== null) {
      const includePath = match[2];

      if (includePath.includes('wp-content/plugins')) {
        const pluginName = includePath.match(/wp-content\/plugins\/([^\/]+)/)?.[1];
        if (pluginName) {
          pluginReferences.push(`Plugin file: ${pluginName}`);
          dependencies.push(pluginName);
        }
      }
    }

    // Check for external API calls
    const externalCallPattern = /(wp_remote_get|wp_remote_post|curl_exec|file_get_contents)\s*\(/g;
    while ((match = externalCallPattern.exec(content)) !== null) {
      externalCalls.push(match[1]);
    }

    const isClean = dependencies.length === 0 && pluginReferences.length === 0;

    return {
      filePath: 'php-content',
      size: content.length,
      dependencies: [...new Set(dependencies)],
      externalCalls: [...new Set(externalCalls)],
      pluginReferences: [...new Set(pluginReferences)],
      isClean,
    };
  }

  /**
   * Analyze HTML file for plugin dependencies
   */
  private async analyzeHTMLFile(content: string): Promise<FileAnalysisResult> {
    const $ = cheerio.load(content);
    const dependencies: string[] = [];
    const externalCalls: string[] = [];
    const pluginReferences: string[] = [];

    // Check for plugin-specific classes
    $('[class]').each((_, element) => {
      const classes = $(element).attr('class') || '';

      for (const [plugin, signatures] of Object.entries(this.PLUGIN_SIGNATURES)) {
        for (const signature of signatures) {
          if (classes.toLowerCase().includes(signature.toLowerCase())) {
            pluginReferences.push(`${plugin} class: ${signature}`);
            dependencies.push(signature);
          }
        }
      }
    });

    // Check for plugin-specific data attributes
    $('[data-elementor-type], [data-elementor-id], [data-vc-], [data-wpb-]').each((_, element) => {
      const attrs = $(element).attr();
      for (const attr in attrs) {
        if (attr.startsWith('data-')) {
          pluginReferences.push(`Data attribute: ${attr}`);
          dependencies.push(attr);
        }
      }
    });

    // Check for shortcodes in content
    const bodyText = $('body').html() || '';
    const shortcodes = bodyText.match(this.SHORTCODE_PATTERN);
    if (shortcodes) {
      for (const shortcode of shortcodes) {
        const shortcodeName = shortcode.match(/\[(\w+)/)?.[1];
        if (shortcodeName) {
          pluginReferences.push(`Shortcode: ${shortcodeName}`);
          dependencies.push(shortcodeName);
        }
      }
    }

    // Check for external scripts
    $('script[src]').each((_, element) => {
      const src = $(element).attr('src') || '';

      // Check if external (not relative path)
      if (src.startsWith('http') && !src.includes('{site_url}')) {
        externalCalls.push(src);

        // Check if from known plugin CDNs
        if (src.includes('elementor') || src.includes('wpbakery') || src.includes('wp-content/plugins')) {
          const pluginMatch = src.match(/plugins\/([^\/]+)/);
          if (pluginMatch) {
            pluginReferences.push(`External plugin script: ${pluginMatch[1]}`);
            dependencies.push(pluginMatch[1]);
          }
        }
      }
    });

    // Check for external styles
    $('link[rel="stylesheet"]').each((_, element) => {
      const href = $(element).attr('href') || '';

      if (href.startsWith('http') && !href.includes('{site_url}')) {
        externalCalls.push(href);

        if (href.includes('wp-content/plugins')) {
          const pluginMatch = href.match(/plugins\/([^\/]+)/);
          if (pluginMatch) {
            pluginReferences.push(`External plugin style: ${pluginMatch[1]}`);
            dependencies.push(pluginMatch[1]);
          }
        }
      }
    });

    const isClean = dependencies.length === 0 && pluginReferences.length === 0 && externalCalls.length === 0;

    return {
      filePath: 'html-content',
      size: content.length,
      dependencies: [...new Set(dependencies)],
      externalCalls: [...new Set(externalCalls)],
      pluginReferences: [...new Set(pluginReferences)],
      isClean,
    };
  }

  /**
   * Analyze CSS file for plugin dependencies
   */
  private async analyzeCSSFile(content: string): Promise<FileAnalysisResult> {
    const dependencies: string[] = [];
    const externalCalls: string[] = [];
    const pluginReferences: string[] = [];

    // Check for plugin-specific class selectors
    for (const [plugin, signatures] of Object.entries(this.PLUGIN_SIGNATURES)) {
      for (const signature of signatures) {
        const regex = new RegExp(`\\.${signature}[\\w-]*`, 'gi');
        const matches = content.match(regex);
        if (matches) {
          pluginReferences.push(`${plugin} CSS class: ${signature}`);
          dependencies.push(signature);
        }
      }
    }

    // Check for @import of external stylesheets
    const importPattern = /@import\s+(?:url\()?['"]?([^'")\s]+)['"]?\)?/g;
    let match;
    while ((match = importPattern.exec(content)) !== null) {
      const importUrl = match[1];

      if (importUrl.startsWith('http') || importUrl.includes('wp-content/plugins')) {
        externalCalls.push(importUrl);

        const pluginMatch = importUrl.match(/plugins\/([^\/]+)/);
        if (pluginMatch) {
          pluginReferences.push(`Imported plugin CSS: ${pluginMatch[1]}`);
          dependencies.push(pluginMatch[1]);
        }
      }
    }

    // Check for external fonts
    const fontPattern = /url\(['"]?([^'")\s]+\.(?:woff2?|ttf|eot|otf))['"]?\)/g;
    while ((match = fontPattern.exec(content)) !== null) {
      const fontUrl = match[1];

      if (fontUrl.startsWith('http') && !fontUrl.includes('fonts.googleapis.com') && !fontUrl.includes('fonts.gstatic.com')) {
        externalCalls.push(fontUrl);
      }
    }

    const isClean = dependencies.length === 0 && pluginReferences.length === 0;

    return {
      filePath: 'css-content',
      size: content.length,
      dependencies: [...new Set(dependencies)],
      externalCalls: [...new Set(externalCalls)],
      pluginReferences: [...new Set(pluginReferences)],
      isClean,
    };
  }

  /**
   * Analyze JavaScript file for plugin dependencies
   */
  private async analyzeJSFile(content: string): Promise<FileAnalysisResult> {
    const dependencies: string[] = [];
    const externalCalls: string[] = [];
    const pluginReferences: string[] = [];

    // Check for plugin-specific object/namespace usage
    for (const [plugin, signatures] of Object.entries(this.PLUGIN_SIGNATURES)) {
      for (const signature of signatures) {
        const regex = new RegExp(`\\b${signature}\\w*`, 'gi');
        const matches = content.match(regex);
        if (matches) {
          pluginReferences.push(`${plugin} JS reference: ${signature}`);
          dependencies.push(signature);
        }
      }
    }

    // Check for jQuery plugin calls
    const jqueryPluginPattern = /\$\([^)]+\)\.(\w+)\(/g;
    let match;
    while ((match = jqueryPluginPattern.exec(content)) !== null) {
      const pluginName = match[1];

      // Check if known plugin jQuery method
      if (['slick', 'owlCarousel', 'magnificPopup', 'select2', 'datepicker'].includes(pluginName)) {
        pluginReferences.push(`jQuery plugin: ${pluginName}`);
        dependencies.push(pluginName);
      }
    }

    // Check for external API calls
    const ajaxPattern = /(?:fetch|axios|jQuery\.ajax|jQuery\.get|jQuery\.post)\s*\(\s*['"]([^'"]+)['"]/g;
    while ((match = ajaxPattern.exec(content)) !== null) {
      const url = match[1];

      if (url.startsWith('http') || url.includes('/wp-admin/admin-ajax.php')) {
        externalCalls.push(url);
      }
    }

    // Check for script imports
    const importPattern = /import\s+.*from\s+['"]([^'"]+)['"]/g;
    while ((match = importPattern.exec(content)) !== null) {
      const importPath = match[1];

      if (importPath.includes('wp-content/plugins')) {
        const pluginMatch = importPath.match(/plugins\/([^\/]+)/);
        if (pluginMatch) {
          pluginReferences.push(`Imported plugin module: ${pluginMatch[1]}`);
          dependencies.push(pluginMatch[1]);
        }
      }
    }

    const isClean = dependencies.length === 0 && pluginReferences.length === 0;

    return {
      filePath: 'js-content',
      size: content.length,
      dependencies: [...new Set(dependencies)],
      externalCalls: [...new Set(externalCalls)],
      pluginReferences: [...new Set(pluginReferences)],
      isClean,
    };
  }

  /**
   * Convert file analysis results to dependency checks
   */
  private convertAnalysisToChecks(analysis: FileAnalysisResult, fileType: string): DependencyCheck[] {
    const checks: DependencyCheck[] = [];

    // Check plugin references
    for (const ref of analysis.pluginReferences) {
      checks.push({
        type: 'plugin',
        name: ref,
        detected: true,
        location: `${fileType} file`,
        severity: 'critical',
        description: `Plugin dependency detected: ${ref}`,
        suggestion: 'Remove plugin dependency or replace with native code',
      });
    }

    // Check external calls
    for (const call of analysis.externalCalls) {
      const isGoogleFonts = call.includes('fonts.googleapis.com') || call.includes('fonts.gstatic.com');

      checks.push({
        type: 'external-script',
        name: call,
        detected: true,
        location: `${fileType} file`,
        severity: isGoogleFonts ? 'info' : 'warning',
        description: `External resource: ${call}`,
        suggestion: isGoogleFonts ? 'Google Fonts are acceptable' : 'Consider hosting resource locally',
      });
    }

    return checks;
  }

  /**
   * Generate recommendations based on analysis
   */
  private generateRecommendations(
    dependencies: DependencyCheck[],
    fileAnalysis: VerificationReport['fileAnalysis']
  ): string[] {
    const recommendations: string[] = [];

    // Count critical issues
    const criticalCount = dependencies.filter(d => d.severity === 'critical').length;

    if (criticalCount === 0) {
      recommendations.push('✅ Excellent! No plugin dependencies detected.');
      recommendations.push('✅ This export is 100% plugin-free and ready to use.');
    } else {
      recommendations.push(`⚠️ Found ${criticalCount} plugin dependencies that need attention.`);
    }

    // Check specific plugins
    const elementorDeps = dependencies.filter(d => d.name.toLowerCase().includes('elementor'));
    if (elementorDeps.length > 0) {
      recommendations.push('🔧 Elementor dependencies detected. Consider using the Elementor export option or remove Elementor-specific classes.');
    }

    const wooCommerceDeps = dependencies.filter(d => d.name.toLowerCase().includes('woocommerce') || d.name.toLowerCase().includes('wc-'));
    if (wooCommerceDeps.length > 0) {
      recommendations.push('🛒 WooCommerce dependencies detected. These require the WooCommerce plugin to function properly.');
    }

    const shortcodeDeps = dependencies.filter(d => d.type === 'shortcode');
    if (shortcodeDeps.length > 0) {
      recommendations.push(`📝 ${shortcodeDeps.length} shortcodes detected. Shortcodes may require specific plugins. Consider replacing with static HTML.`);
    }

    // Check external resources
    const externalResources = dependencies.filter(d => d.type === 'external-script' || d.type === 'external-style');
    if (externalResources.length > 0) {
      recommendations.push(`🌐 ${externalResources.length} external resources detected. Consider hosting these locally for better performance.`);
    }

    // Overall file cleanliness
    const totalFiles = fileAnalysis.php.length + fileAnalysis.html.length + fileAnalysis.css.length + fileAnalysis.js.length;
    const cleanFiles = [
      ...fileAnalysis.php,
      ...fileAnalysis.html,
      ...fileAnalysis.css,
      ...fileAnalysis.js,
    ].filter(f => f.isClean).length;

    const cleanPercentage = totalFiles > 0 ? Math.round((cleanFiles / totalFiles) * 100) : 100;
    recommendations.push(`📊 File cleanliness: ${cleanPercentage}% (${cleanFiles}/${totalFiles} files are plugin-free)`);

    if (cleanPercentage === 100) {
      recommendations.push('🎉 Perfect score! All files are completely plugin-free.');
    } else if (cleanPercentage >= 80) {
      recommendations.push('👍 Good! Most files are plugin-free. Clean up remaining dependencies for a perfect score.');
    } else if (cleanPercentage >= 50) {
      recommendations.push('⚡ Fair. Consider using plugin-free export option to eliminate dependencies.');
    } else {
      recommendations.push('⚠️ Many plugin dependencies detected. Strongly recommend using plugin-free export option.');
    }

    return recommendations;
  }

  /**
   * Generate a human-readable verification report
   */
  generateTextReport(report: VerificationReport): string {
    let text = '';

    text += '═══════════════════════════════════════════════════════\n';
    text += '  PLUGIN-FREE VERIFICATION REPORT\n';
    text += '═══════════════════════════════════════════════════════\n\n';

    text += `Generated: ${report.timestamp.toISOString()}\n`;
    text += `Status: ${report.isPluginFree ? '✅ PLUGIN-FREE' : '❌ PLUGINS REQUIRED'}\n`;
    text += `Score: ${report.score}/100\n\n`;

    text += '───────────────────────────────────────────────────────\n';
    text += 'SUMMARY\n';
    text += '───────────────────────────────────────────────────────\n';
    text += `Total Checks: ${report.summary.totalChecks}\n`;
    text += `Passed: ${report.summary.passed} ✅\n`;
    text += `Warnings: ${report.summary.warnings} ⚠️\n`;
    text += `Critical Issues: ${report.summary.critical} ❌\n\n`;

    if (report.dependencies.length > 0) {
      text += '───────────────────────────────────────────────────────\n';
      text += 'DETECTED DEPENDENCIES\n';
      text += '───────────────────────────────────────────────────────\n';

      const criticalDeps = report.dependencies.filter(d => d.severity === 'critical');
      const warningDeps = report.dependencies.filter(d => d.severity === 'warning');
      const infoDeps = report.dependencies.filter(d => d.severity === 'info');

      if (criticalDeps.length > 0) {
        text += '\n❌ CRITICAL ISSUES:\n';
        criticalDeps.forEach(dep => {
          text += `  • ${dep.name} (${dep.type})\n`;
          text += `    Location: ${dep.location}\n`;
          text += `    ${dep.description}\n`;
          if (dep.suggestion) {
            text += `    💡 ${dep.suggestion}\n`;
          }
          text += '\n';
        });
      }

      if (warningDeps.length > 0) {
        text += '\n⚠️  WARNINGS:\n';
        warningDeps.forEach(dep => {
          text += `  • ${dep.name} (${dep.type})\n`;
          text += `    Location: ${dep.location}\n`;
          text += `    ${dep.description}\n`;
          if (dep.suggestion) {
            text += `    💡 ${dep.suggestion}\n`;
          }
          text += '\n';
        });
      }

      if (infoDeps.length > 0) {
        text += '\nℹ️  INFORMATIONAL:\n';
        infoDeps.forEach(dep => {
          text += `  • ${dep.name} (${dep.type})\n`;
          text += `    ${dep.description}\n`;
          text += '\n';
        });
      }
    }

    text += '───────────────────────────────────────────────────────\n';
    text += 'RECOMMENDATIONS\n';
    text += '───────────────────────────────────────────────────────\n';
    report.recommendations.forEach(rec => {
      text += `${rec}\n`;
    });
    text += '\n';

    text += '═══════════════════════════════════════════════════════\n';

    return text;
  }

  /**
   * Quick check if content is plugin-free
   */
  async quickCheck(content: string, type: 'php' | 'html' | 'css' | 'js'): Promise<boolean> {
    let analysis: FileAnalysisResult;

    switch (type) {
      case 'php':
        analysis = await this.analyzePHPFile(content, true, []);
        break;
      case 'html':
        analysis = await this.analyzeHTMLFile(content);
        break;
      case 'css':
        analysis = await this.analyzeCSSFile(content);
        break;
      case 'js':
        analysis = await this.analyzeJSFile(content);
        break;
    }

    return analysis.isClean;
  }
}

export default new PluginFreeVerificationService();
