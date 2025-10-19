/**
 * Page Builder Validation System
 *
 * Main entry point for all validation features:
 * - Visual comparison (screenshots, diffs, similarity)
 * - Asset verification (images, fonts, videos, etc.)
 * - Custom code detection (JS/CSS analysis)
 */

import { compareVisually, compareResponsive, closeBrowser as closeVisualBrowser } from './visual-comparator.js';
import { verifyAssets, compareAssets, closeBrowser as closeAssetBrowser } from './asset-verifier.js';
import { detectCustomCode } from './custom-code-detector.js';
import type { ValidationResult } from '../types/component.types.js';

/**
 * Main validation function - runs all validators
 */
export async function validateConversion(
  originalHTML: string,
  convertedHTML: string,
  options?: {
    runVisualComparison?: boolean;
    runAssetVerification?: boolean;
    runCustomCodeDetection?: boolean;
    baseURL?: string;
    checkExternalAssets?: boolean;
    visualThreshold?: number;
  }
): Promise<ValidationResult> {
  const {
    runVisualComparison = true,
    runAssetVerification = true,
    runCustomCodeDetection = true,
    baseURL,
    checkExternalAssets = true,
    visualThreshold = 0.1,
  } = options || {};

  const errors: string[] = [];
  const warnings: string[] = [];
  const suggestions: string[] = [];

  try {
    // 1. Visual Comparison
    let visualComparison;
    if (runVisualComparison) {
      try {
        visualComparison = await compareVisually(originalHTML, convertedHTML, {
          threshold: visualThreshold,
          fullPage: true,
          includeMetrics: true,
        });

        // Add warnings based on similarity score
        if (visualComparison.similarityScore < 80) {
          errors.push(`Visual similarity is low: ${visualComparison.similarityScore}%`);
          suggestions.push('Review diff image to identify visual discrepancies');
        } else if (visualComparison.similarityScore < 90) {
          warnings.push(`Visual similarity could be improved: ${visualComparison.similarityScore}%`);
        }

        // Check dimensions
        if (!visualComparison.dimensions.dimensionsMatch) {
          warnings.push('Page dimensions do not match between original and converted');
          suggestions.push('Check for missing content or layout issues');
        }

        // Check for missing/extra elements
        if (visualComparison.comparisonMetrics.missingElements.length > 0) {
          errors.push(`${visualComparison.comparisonMetrics.missingElements.length} elements missing in converted page`);
          suggestions.push(`Missing elements: ${visualComparison.comparisonMetrics.missingElements.slice(0, 5).join(', ')}`);
        }

        if (visualComparison.comparisonMetrics.extraElements.length > 0) {
          warnings.push(`${visualComparison.comparisonMetrics.extraElements.length} extra elements in converted page`);
        }

        // Check style discrepancies
        const majorDiscrepancies = visualComparison.comparisonMetrics.styleDiscrepancies.filter(
          d => d.severity === 'major'
        );
        if (majorDiscrepancies.length > 0) {
          errors.push(`${majorDiscrepancies.length} major style discrepancies detected`);
          suggestions.push('Review style differences in critical elements');
        }
      } catch (error) {
        errors.push(`Visual comparison failed: ${(error as Error).message}`);
      }
    }

    // 2. Asset Verification
    let assetVerification;
    if (runAssetVerification) {
      try {
        const assetComparison = await compareAssets(originalHTML, convertedHTML);
        assetVerification = assetComparison.converted;

        // Check compatibility score
        if (assetComparison.compatibilityScore < 80) {
          errors.push(`Asset compatibility is low: ${assetComparison.compatibilityScore}%`);
        } else if (assetComparison.compatibilityScore < 95) {
          warnings.push(`Some assets may be missing: ${assetComparison.compatibilityScore}%`);
        }

        // Check for removed assets
        if (assetComparison.removedAssets.length > 0) {
          errors.push(`${assetComparison.removedAssets.length} assets removed during conversion`);
          suggestions.push(`Check removed assets: ${assetComparison.removedAssets.slice(0, 3).join(', ')}`);
        }

        // Check for broken assets
        if (assetVerification.brokenAssets.length > 0) {
          errors.push(`${assetVerification.brokenAssets.length} broken assets detected`);
          assetVerification.brokenAssets.slice(0, 3).forEach(asset => {
            suggestions.push(`Fix broken ${asset.type}: ${asset.url}`);
          });
        }

        // Check for missing assets
        const criticalMissing = assetVerification.missingAssets.filter(
          a => a.severity === 'critical'
        );
        if (criticalMissing.length > 0) {
          errors.push(`${criticalMissing.length} critical assets missing`);
          criticalMissing.slice(0, 3).forEach(asset => {
            suggestions.push(`Add missing ${asset.type}: ${asset.url}`);
          });
        }

        // Check verification score
        if (assetVerification.verificationScore < 90) {
          warnings.push(`Asset verification score: ${assetVerification.verificationScore}%`);
          suggestions.push('Ensure all assets are properly linked and accessible');
        }
      } catch (error) {
        errors.push(`Asset verification failed: ${(error as Error).message}`);
      }
    }

    // 3. Custom Code Detection
    let customCodeDetection;
    if (runCustomCodeDetection) {
      try {
        customCodeDetection = detectCustomCode(convertedHTML);

        // Check if can be converted
        if (!customCodeDetection.canBeConverted) {
          errors.push('Page contains code that cannot be automatically converted');
          suggestions.push('Consider using custom HTML widgets for complex functionality');
        }

        // Check conversion score
        if (customCodeDetection.conversionScore < 70) {
          warnings.push(`Conversion score is low: ${customCodeDetection.conversionScore}%`);
        }

        // Add warnings for incompatibilities
        const blockingIncompatibilities = customCodeDetection.incompatibilities.filter(
          i => i.impact === 'blocking'
        );
        if (blockingIncompatibilities.length > 0) {
          blockingIncompatibilities.forEach(incomp => {
            errors.push(`Blocking incompatibility: ${incomp.name} - ${incomp.reason}`);
            if (incomp.workaround) {
              suggestions.push(`Workaround: ${incomp.workaround}`);
            }
          });
        }

        // Add warnings from custom code
        const criticalWarnings = customCodeDetection.conversionWarnings.filter(
          w => w.severity === 'critical'
        );
        if (criticalWarnings.length > 0) {
          criticalWarnings.forEach(warning => {
            errors.push(warning.message);
            if (warning.suggestion) {
              suggestions.push(warning.suggestion);
            }
          });
        }

        const normalWarnings = customCodeDetection.conversionWarnings.filter(
          w => w.severity === 'warning'
        );
        normalWarnings.forEach(warning => {
          warnings.push(warning.message);
        });

        // Suggest alternatives for unsupported features
        const unsupportedFeatures = customCodeDetection.detectedFeatures.filter(
          f => !f.isSupported
        );
        if (unsupportedFeatures.length > 0) {
          unsupportedFeatures.forEach(feature => {
            if (feature.alternative) {
              suggestions.push(`${feature.feature}: ${feature.alternative}`);
            }
          });
        }
      } catch (error) {
        errors.push(`Custom code detection failed: ${(error as Error).message}`);
      }
    }

    // Calculate overall score
    let overallScore = 100;

    if (visualComparison) {
      overallScore = Math.min(overallScore, visualComparison.similarityScore);
    }

    if (assetVerification) {
      overallScore = Math.min(overallScore, assetVerification.verificationScore);
    }

    if (customCodeDetection) {
      overallScore = Math.min(overallScore, customCodeDetection.conversionScore);
    }

    overallScore = Math.round(overallScore);

    // Determine if validation passed
    const isValid = errors.length === 0 && overallScore >= 80;

    return {
      isValid,
      errors,
      warnings,
      suggestions,
      visualComparison,
      assetVerification,
      customCodeDetection,
      overallScore,
    };
  } catch (error) {
    return {
      isValid: false,
      errors: [`Validation failed: ${(error as Error).message}`],
      warnings: [],
      suggestions: ['Check input HTML and try again'],
      overallScore: 0,
    };
  }
}

/**
 * Quick validation (visual comparison only, faster)
 */
export async function quickValidate(
  originalHTML: string,
  convertedHTML: string
): Promise<{
  passed: boolean;
  similarityScore: number;
  message: string;
}> {
  try {
    const result = await compareVisually(originalHTML, convertedHTML, {
      threshold: 0.1,
      fullPage: false,
      includeMetrics: false,
    });

    const passed = result.similarityScore >= 80;
    const message = passed
      ? `Visual similarity: ${result.similarityScore}% - Conversion looks good!`
      : `Visual similarity: ${result.similarityScore}% - Review diff image for issues`;

    return {
      passed,
      similarityScore: result.similarityScore,
      message,
    };
  } catch (error) {
    return {
      passed: false,
      similarityScore: 0,
      message: `Validation failed: ${(error as Error).message}`,
    };
  }
}

/**
 * Validate at multiple breakpoints
 */
export async function validateResponsive(
  originalHTML: string,
  convertedHTML: string
): Promise<Record<string, ValidationResult>> {
  const results: Record<string, ValidationResult> = {};

  const breakpoints = ['mobile', 'tablet', 'laptop', 'desktop'];

  for (const breakpoint of breakpoints) {
    try {
      const visualComparison = await compareVisually(originalHTML, convertedHTML, {
        viewport:
          breakpoint === 'mobile'
            ? { width: 375, height: 667 }
            : breakpoint === 'tablet'
            ? { width: 768, height: 1024 }
            : breakpoint === 'laptop'
            ? { width: 1366, height: 768 }
            : { width: 1920, height: 1080 },
        fullPage: true,
        includeMetrics: true,
      });

      const passed = visualComparison.similarityScore >= 80;

      results[breakpoint] = {
        isValid: passed,
        errors: passed ? [] : [`Low similarity at ${breakpoint}: ${visualComparison.similarityScore}%`],
        warnings: [],
        suggestions: [],
        visualComparison,
        overallScore: visualComparison.similarityScore,
      };
    } catch (error) {
      results[breakpoint] = {
        isValid: false,
        errors: [`Validation failed for ${breakpoint}: ${(error as Error).message}`],
        warnings: [],
        suggestions: [],
        overallScore: 0,
      };
    }
  }

  return results;
}

/**
 * Close all browser instances
 */
export async function cleanup(): Promise<void> {
  await Promise.all([closeVisualBrowser(), closeAssetBrowser()]);
}

// Export individual validators
export { compareVisually, compareResponsive } from './visual-comparator.js';
export { verifyAssets, compareAssets } from './asset-verifier.js';
export { detectCustomCode } from './custom-code-detector.js';
