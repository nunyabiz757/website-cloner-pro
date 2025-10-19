/**
 * Optimization Mode Service
 *
 * Maps optimization modes to specific configuration options
 * Supports: Safe, Balanced, Aggressive, and Custom modes
 */

export type OptimizationMode = 'safe' | 'balanced' | 'aggressive' | 'custom';

export interface OptimizationModeConfig {
  mode: OptimizationMode;
  customFixes?: string[];
  dryRun?: boolean;
}

export interface OptimizationOptions {
  aggressive: boolean;
  dryRun?: boolean;
  images: {
    convertToWebP?: boolean;
    convertToAvif?: boolean;
    compress?: boolean;
    generateResponsive?: boolean;
    addDimensions?: boolean;
    lazyLoad?: boolean;
    quality?: number;
    blurPlaceholder?: boolean;
  };
  css: {
    extractCritical?: boolean;
    removeUnused?: boolean;
    minify?: boolean;
    defer?: boolean;
    combine?: boolean;
  };
  javascript: {
    defer?: boolean;
    minify?: boolean;
    treeshake?: boolean;
    removeUnused?: boolean;
    combine?: boolean;
  };
  fonts: {
    fontDisplay?: boolean;
    selfHost?: boolean;
    subset?: boolean;
    preload?: boolean;
  };
  html: {
    minify?: boolean;
    addResourceHints?: boolean;
    lazyLoadIframes?: boolean;
    removeComments?: boolean;
  };
}

export class OptimizationModeService {
  /**
   * Get optimization configuration based on mode
   */
  static getConfigForMode(config: OptimizationModeConfig): OptimizationOptions {
    if (config.mode === 'custom' && config.customFixes) {
      return this.buildCustomConfig(config.customFixes, config.dryRun);
    }

    const baseConfigs: Record<Exclude<OptimizationMode, 'custom'>, OptimizationOptions> = {
      safe: {
        aggressive: false,
        dryRun: config.dryRun,
        images: {
          convertToWebP: false,
          convertToAvif: false,
          compress: false,
          generateResponsive: false,
          addDimensions: true,
          lazyLoad: true,
          quality: 90,
          blurPlaceholder: false
        },
        css: {
          extractCritical: false,
          removeUnused: false,
          minify: true,
          defer: false,
          combine: false
        },
        javascript: {
          defer: true,
          minify: false,
          treeshake: false,
          removeUnused: false,
          combine: false
        },
        fonts: {
          fontDisplay: false,
          selfHost: false,
          subset: false,
          preload: false
        },
        html: {
          minify: true,
          addResourceHints: true,
          lazyLoadIframes: true,
          removeComments: false
        }
      },

      balanced: {
        aggressive: false,
        dryRun: config.dryRun,
        images: {
          convertToWebP: true,
          convertToAvif: false,
          compress: true,
          generateResponsive: true,
          addDimensions: true,
          lazyLoad: true,
          quality: 80,
          blurPlaceholder: false
        },
        css: {
          extractCritical: true,
          removeUnused: true,
          minify: true,
          defer: true,
          combine: false
        },
        javascript: {
          defer: true,
          minify: true,
          treeshake: true,
          removeUnused: false,
          combine: false
        },
        fonts: {
          fontDisplay: true,
          selfHost: true,
          subset: false,
          preload: true
        },
        html: {
          minify: true,
          addResourceHints: true,
          lazyLoadIframes: true,
          removeComments: false
        }
      },

      aggressive: {
        aggressive: true,
        dryRun: config.dryRun,
        images: {
          convertToWebP: true,
          convertToAvif: true,
          compress: true,
          generateResponsive: true,
          addDimensions: true,
          lazyLoad: true,
          quality: 70,
          blurPlaceholder: true
        },
        css: {
          extractCritical: true,
          removeUnused: true,
          minify: true,
          defer: true,
          combine: true
        },
        javascript: {
          defer: true,
          minify: true,
          treeshake: true,
          removeUnused: true,
          combine: true
        },
        fonts: {
          fontDisplay: true,
          selfHost: true,
          subset: true,
          preload: true
        },
        html: {
          minify: true,
          addResourceHints: true,
          lazyLoadIframes: true,
          removeComments: true
        }
      }
    };

    return baseConfigs[config.mode];
  }

  /**
   * Build custom configuration from selected fixes
   */
  private static buildCustomConfig(selectedFixes: string[], dryRun?: boolean): OptimizationOptions {
    const config: OptimizationOptions = {
      aggressive: false,
      dryRun,
      images: {},
      css: {},
      javascript: {},
      fonts: {},
      html: {}
    };

    // Map fix IDs to configuration options
    const fixMappings: Record<string, { path: string; value: any; extra?: Record<string, any> }> = {
      // Images
      'webp-conversion': { path: 'images.convertToWebP', value: true },
      'avif-conversion': { path: 'images.convertToAvif', value: true },
      'responsive-srcset': { path: 'images.generateResponsive', value: true },
      'lazy-loading': { path: 'images.lazyLoad', value: true },
      'image-dimensions': { path: 'images.addDimensions', value: true },
      'compress-images-80': { path: 'images.compress', value: true, extra: { quality: 80 } },
      'compress-images-70': { path: 'images.compress', value: true, extra: { quality: 70 } },
      'blur-placeholder': { path: 'images.blurPlaceholder', value: true },

      // CSS
      'critical-css': { path: 'css.extractCritical', value: true },
      'remove-unused-css': { path: 'css.removeUnused', value: true },
      'minify-css': { path: 'css.minify', value: true },
      'defer-css': { path: 'css.defer', value: true },
      'combine-css': { path: 'css.combine', value: true },

      // JavaScript
      'defer-js': { path: 'javascript.defer', value: true },
      'minify-js': { path: 'javascript.minify', value: true },
      'tree-shaking': { path: 'javascript.treeshake', value: true },
      'remove-unused-js': { path: 'javascript.removeUnused', value: true },
      'combine-js': { path: 'javascript.combine', value: true },

      // Fonts
      'font-display-swap': { path: 'fonts.fontDisplay', value: true },
      'self-host-fonts': { path: 'fonts.selfHost', value: true },
      'font-subsetting': { path: 'fonts.subset', value: true },
      'preload-fonts': { path: 'fonts.preload', value: true },

      // HTML
      'minify-html': { path: 'html.minify', value: true },
      'resource-hints': { path: 'html.addResourceHints', value: true },
      'lazy-iframes': { path: 'html.lazyLoadIframes', value: true }
    };

    // Check if aggressive fixes are selected
    const aggressiveFixes = ['avif-conversion', 'compress-images-70', 'remove-unused-css', 'remove-unused-js'];
    const hasAggressiveFixes = aggressiveFixes.some(fix => selectedFixes.includes(fix));
    config.aggressive = hasAggressiveFixes;

    // Apply selected fixes
    selectedFixes.forEach(fixId => {
      const mapping = fixMappings[fixId];
      if (mapping) {
        this.setNestedProperty(config, mapping.path, mapping.value);

        // Apply extra properties (like quality)
        if (mapping.extra) {
          Object.entries(mapping.extra).forEach(([key, value]) => {
            const basePath = mapping.path.split('.')[0]; // e.g., 'images'
            this.setNestedProperty(config, `${basePath}.${key}`, value);
          });
        }
      }
    });

    return config;
  }

  /**
   * Set nested property using dot notation
   */
  private static setNestedProperty(obj: any, path: string, value: any): void {
    const keys = path.split('.');
    const lastKey = keys.pop()!;

    const target = keys.reduce((acc, key) => {
      if (!acc[key]) {
        acc[key] = {};
      }
      return acc[key];
    }, obj);

    target[lastKey] = value;
  }

  /**
   * Get human-readable description of current config
   */
  static getConfigDescription(config: OptimizationOptions): string[] {
    const descriptions: string[] = [];

    // Images
    if (config.images.convertToWebP) descriptions.push('Convert images to WebP');
    if (config.images.convertToAvif) descriptions.push('Convert images to AVIF');
    if (config.images.compress) {
      const quality = config.images.quality || 80;
      descriptions.push(`Compress images (${quality}% quality)`);
    }
    if (config.images.generateResponsive) descriptions.push('Generate responsive srcset');
    if (config.images.addDimensions) descriptions.push('Add image dimensions');
    if (config.images.lazyLoad) descriptions.push('Lazy load images');

    // CSS
    if (config.css.extractCritical) descriptions.push('Extract critical CSS');
    if (config.css.removeUnused) descriptions.push('Remove unused CSS');
    if (config.css.minify) descriptions.push('Minify CSS');
    if (config.css.defer) descriptions.push('Defer non-critical CSS');
    if (config.css.combine) descriptions.push('Combine CSS files');

    // JavaScript
    if (config.javascript.defer) descriptions.push('Defer JavaScript');
    if (config.javascript.minify) descriptions.push('Minify JavaScript');
    if (config.javascript.treeshake) descriptions.push('JavaScript tree shaking');
    if (config.javascript.removeUnused) descriptions.push('Remove unused JavaScript');
    if (config.javascript.combine) descriptions.push('Combine JavaScript files');

    // Fonts
    if (config.fonts.fontDisplay) descriptions.push('Add font-display: swap');
    if (config.fonts.selfHost) descriptions.push('Self-host Google Fonts');
    if (config.fonts.subset) descriptions.push('Font subsetting');
    if (config.fonts.preload) descriptions.push('Preload critical fonts');

    // HTML
    if (config.html.minify) descriptions.push('Minify HTML');
    if (config.html.addResourceHints) descriptions.push('Add resource hints');
    if (config.html.lazyLoadIframes) descriptions.push('Lazy load iframes');
    if (config.html.removeComments) descriptions.push('Remove comments');

    return descriptions;
  }

  /**
   * Validate configuration
   */
  static validateConfig(config: OptimizationOptions): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Check for conflicting options
    if (config.images.convertToAvif && !config.images.convertToWebP) {
      errors.push('AVIF conversion requires WebP fallback. Enable WebP conversion.');
    }

    if (config.images.compress && !config.images.quality) {
      errors.push('Image compression enabled but no quality specified.');
    }

    if (config.fonts.subset && !config.fonts.selfHost) {
      errors.push('Font subsetting requires self-hosting. Enable self-host fonts.');
    }

    // Warn about aggressive settings
    if (config.aggressive && config.css.removeUnused) {
      // This is expected for aggressive mode, just log it
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Get preset configurations for quick access
   */
  static getPresets(): Record<string, OptimizationModeConfig> {
    return {
      safe: { mode: 'safe' },
      balanced: { mode: 'balanced' },
      aggressive: { mode: 'aggressive' },
      imagesOnly: {
        mode: 'custom',
        customFixes: [
          'webp-conversion',
          'responsive-srcset',
          'lazy-loading',
          'image-dimensions',
          'compress-images-80'
        ]
      },
      cssOnly: {
        mode: 'custom',
        customFixes: [
          'critical-css',
          'remove-unused-css',
          'minify-css',
          'defer-css'
        ]
      },
      jsOnly: {
        mode: 'custom',
        customFixes: [
          'defer-js',
          'minify-js',
          'tree-shaking'
        ]
      }
    };
  }
}

export default OptimizationModeService;
