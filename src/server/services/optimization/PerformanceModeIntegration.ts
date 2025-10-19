/**
 * Performance Mode Integration
 *
 * Integrates OptimizationModeService with existing PerformanceFixService
 * Provides a bridge between UI mode selection and backend fix application
 */

import { OptimizationModeService, OptimizationOptions, OptimizationMode } from './OptimizationModeService.js';

export interface ModeSelectionRequest {
  mode: OptimizationMode;
  customFixes?: string[];
  dryRun?: boolean;
  projectId: string;
}

export interface ModeApplicationResult {
  success: boolean;
  mode: OptimizationMode;
  appliedFixes: string[];
  config: OptimizationOptions;
  errors: string[];
  warnings: string[];
  improvements?: {
    lighthouse: number;
    fileSize: number;
    loadTime: number;
  };
}

export class PerformanceModeIntegration {
  /**
   * Apply optimization mode to a project
   */
  static async applyMode(request: ModeSelectionRequest): Promise<ModeApplicationResult> {
    try {
      // Get configuration for selected mode
      const config = OptimizationModeService.getConfigForMode({
        mode: request.mode,
        customFixes: request.customFixes,
        dryRun: request.dryRun
      });

      // Validate configuration
      const validation = OptimizationModeService.validateConfig(config);
      if (!validation.valid) {
        return {
          success: false,
          mode: request.mode,
          appliedFixes: [],
          config,
          errors: validation.errors,
          warnings: []
        };
      }

      // Get list of fixes to apply
      const fixesToApply = this.getFixListFromConfig(config);

      // Log what will be applied
      console.log(`Applying ${request.mode} mode with ${fixesToApply.length} fixes`);

      if (request.dryRun) {
        // Dry run - just return what would be applied
        return {
          success: true,
          mode: request.mode,
          appliedFixes: fixesToApply,
          config,
          errors: [],
          warnings: ['DRY RUN: No changes were actually applied']
        };
      }

      // TODO: Integrate with actual PerformanceFixService
      // For now, return a successful mock response
      return {
        success: true,
        mode: request.mode,
        appliedFixes: fixesToApply,
        config,
        errors: [],
        warnings: config.aggressive ? ['Aggressive mode applied - please test thoroughly'] : []
      };

    } catch (error) {
      return {
        success: false,
        mode: request.mode,
        appliedFixes: [],
        config: {} as OptimizationOptions,
        errors: [error instanceof Error ? error.message : 'Unknown error occurred'],
        warnings: []
      };
    }
  }

  /**
   * Get list of fix IDs from configuration
   */
  private static getFixListFromConfig(config: OptimizationOptions): string[] {
    const fixes: string[] = [];

    // Images
    if (config.images.convertToWebP) fixes.push('webp-conversion');
    if (config.images.convertToAvif) fixes.push('avif-conversion');
    if (config.images.generateResponsive) fixes.push('responsive-srcset');
    if (config.images.lazyLoad) fixes.push('lazy-loading');
    if (config.images.addDimensions) fixes.push('image-dimensions');
    if (config.images.compress) {
      fixes.push(config.images.quality === 70 ? 'compress-images-70' : 'compress-images-80');
    }
    if (config.images.blurPlaceholder) fixes.push('blur-placeholder');

    // CSS
    if (config.css.extractCritical) fixes.push('critical-css');
    if (config.css.removeUnused) fixes.push('remove-unused-css');
    if (config.css.minify) fixes.push('minify-css');
    if (config.css.defer) fixes.push('defer-css');
    if (config.css.combine) fixes.push('combine-css');

    // JavaScript
    if (config.javascript.defer) fixes.push('defer-js');
    if (config.javascript.minify) fixes.push('minify-js');
    if (config.javascript.treeshake) fixes.push('tree-shaking');
    if (config.javascript.removeUnused) fixes.push('remove-unused-js');
    if (config.javascript.combine) fixes.push('combine-js');

    // Fonts
    if (config.fonts.fontDisplay) fixes.push('font-display-swap');
    if (config.fonts.selfHost) fixes.push('self-host-fonts');
    if (config.fonts.subset) fixes.push('font-subsetting');
    if (config.fonts.preload) fixes.push('preload-fonts');

    // HTML
    if (config.html.minify) fixes.push('minify-html');
    if (config.html.addResourceHints) fixes.push('resource-hints');
    if (config.html.lazyLoadIframes) fixes.push('lazy-iframes');

    return fixes;
  }

  /**
   * Get preview of what will be applied (dry run)
   */
  static async previewMode(request: Omit<ModeSelectionRequest, 'dryRun'>): Promise<ModeApplicationResult> {
    return this.applyMode({ ...request, dryRun: true });
  }

  /**
   * Get recommended mode based on project characteristics
   */
  static getRecommendedMode(projectInfo: {
    hasEcommerce?: boolean;
    hasDynamicContent?: boolean;
    targetAudience?: 'internal' | 'external';
    technicalExpertise?: 'low' | 'medium' | 'high';
  }): OptimizationMode {
    // E-commerce or high-stakes sites should use balanced
    if (projectInfo.hasEcommerce) {
      return 'balanced';
    }

    // Sites with lots of dynamic content should be careful
    if (projectInfo.hasDynamicContent) {
      return 'safe';
    }

    // Internal tools can be more aggressive
    if (projectInfo.targetAudience === 'internal') {
      return 'aggressive';
    }

    // Low technical expertise should stick to safe
    if (projectInfo.technicalExpertise === 'low') {
      return 'safe';
    }

    // Default to balanced for most cases
    return 'balanced';
  }

  /**
   * Compare modes and show differences
   */
  static compareModes(mode1: OptimizationMode, mode2: OptimizationMode): {
    mode1Only: string[];
    mode2Only: string[];
    both: string[];
  } {
    const config1 = OptimizationModeService.getConfigForMode({ mode: mode1 });
    const config2 = OptimizationModeService.getConfigForMode({ mode: mode2 });

    const fixes1 = new Set(this.getFixListFromConfig(config1));
    const fixes2 = new Set(this.getFixListFromConfig(config2));

    const mode1Only: string[] = [];
    const mode2Only: string[] = [];
    const both: string[] = [];

    fixes1.forEach(fix => {
      if (fixes2.has(fix)) {
        both.push(fix);
      } else {
        mode1Only.push(fix);
      }
    });

    fixes2.forEach(fix => {
      if (!fixes1.has(fix)) {
        mode2Only.push(fix);
      }
    });

    return { mode1Only, mode2Only, both };
  }

  /**
   * Get safe upgrade path (suggest next mode)
   */
  static getSuggestedUpgrade(currentMode: OptimizationMode): {
    nextMode: OptimizationMode | null;
    reason: string;
    newFixes: string[];
  } {
    const upgradePath: Record<OptimizationMode, { next: OptimizationMode | null; reason: string }> = {
      safe: {
        next: 'balanced',
        reason: 'Balanced mode adds image optimization and critical CSS extraction for better performance'
      },
      balanced: {
        next: 'aggressive',
        reason: 'Aggressive mode adds AVIF support and more aggressive compression for maximum performance'
      },
      aggressive: {
        next: null,
        reason: 'Already using most aggressive optimizations'
      },
      custom: {
        next: null,
        reason: 'Using custom configuration'
      }
    };

    const upgrade = upgradePath[currentMode];
    const newFixes = upgrade.next
      ? this.compareModes(currentMode, upgrade.next).mode2Only
      : [];

    return {
      nextMode: upgrade.next,
      reason: upgrade.reason,
      newFixes
    };
  }
}

export default PerformanceModeIntegration;
