import express from 'express';
import { PlatformTransferService } from '../services/PlatformTransferService.js';
import { FrameworkConversionService } from '../services/FrameworkConversionService.js';
import { LegacyCodeModernizationService } from '../services/LegacyCodeModernizationService.js';
import { CSSFrameworkDetectionService } from '../services/CSSFrameworkDetectionService.js';
import type { ApiResponse } from '../../shared/types/index.js';

const router = express.Router();

// Initialize services
const platformTransferService = new PlatformTransferService();
const frameworkConversionService = new FrameworkConversionService();
const legacyCodeModernizationService = new LegacyCodeModernizationService();
const cssFrameworkDetectionService = new CSSFrameworkDetectionService();

/**
 * POST /api/conversion/platform/detect
 * Detect the source platform of HTML content
 */
router.post('/platform/detect', async (req, res) => {
  try {
    const { htmlContent } = req.body;

    if (!htmlContent) {
      return res.status(400).json({
        success: false,
        error: 'HTML content is required',
      } as ApiResponse<never>);
    }

    const result = await platformTransferService.detectPlatform(htmlContent);

    res.json({
      success: true,
      data: result,
      message: `Detected platform: ${result.platform} (${result.confidence}% confidence)`,
    } as ApiResponse<any>);
  } catch (error) {
    console.error('Platform detection error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Platform detection failed',
    } as ApiResponse<never>);
  }
});

/**
 * POST /api/conversion/platform/transfer
 * Transfer HTML content from one platform to another
 */
router.post('/platform/transfer', async (req, res) => {
  try {
    const { htmlContent, sourcePlatform, targetPlatform, options } = req.body;

    if (!htmlContent || !targetPlatform) {
      return res.status(400).json({
        success: false,
        error: 'HTML content and target platform are required',
      } as ApiResponse<never>);
    }

    const transferOptions = {
      sourcePlatform,
      targetPlatform,
      removeComments: options?.removeComments ?? true,
      removeShortcodes: options?.removeShortcodes ?? true,
      preserveCustomCode: options?.preserveCustomCode ?? true,
      generateMigrationGuide: options?.generateMigrationGuide ?? true,
    };

    const result = await platformTransferService.transferPlatform(
      htmlContent,
      transferOptions
    );

    res.json({
      success: true,
      data: result,
      message: `Successfully transferred from ${result.sourcePlatform} to ${result.targetPlatform}`,
    } as ApiResponse<any>);
  } catch (error) {
    console.error('Platform transfer error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Platform transfer failed',
    } as ApiResponse<never>);
  }
});

/**
 * POST /api/conversion/platform/export
 * Export HTML content for a specific platform
 */
router.post('/platform/export', async (req, res) => {
  try {
    const { htmlContent, targetPlatform, options } = req.body;

    if (!htmlContent || !targetPlatform) {
      return res.status(400).json({
        success: false,
        error: 'HTML content and target platform are required',
      } as ApiResponse<never>);
    }

    const result = await platformTransferService.exportForPlatform(
      htmlContent,
      targetPlatform,
      options
    );

    res.json({
      success: true,
      data: result,
      message: `Exported content for ${targetPlatform}`,
    } as ApiResponse<any>);
  } catch (error) {
    console.error('Platform export error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Platform export failed',
    } as ApiResponse<never>);
  }
});

/**
 * POST /api/conversion/framework/detect
 * Detect JavaScript framework used in code
 */
router.post('/framework/detect', async (req, res) => {
  try {
    const { code } = req.body;

    if (!code) {
      return res.status(400).json({
        success: false,
        error: 'Code content is required',
      } as ApiResponse<never>);
    }

    const result = await frameworkConversionService.detectFramework(code);

    res.json({
      success: true,
      data: result,
      message: `Detected framework: ${result.framework} (${result.confidence}% confidence)`,
    } as ApiResponse<any>);
  } catch (error) {
    console.error('Framework detection error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Framework detection failed',
    } as ApiResponse<never>);
  }
});

/**
 * POST /api/conversion/framework/convert
 * Convert code from one framework to another
 */
router.post('/framework/convert', async (req, res) => {
  try {
    const { code, htmlContent, sourceFramework, targetFramework, options } = req.body;

    if (!code || !targetFramework) {
      return res.status(400).json({
        success: false,
        error: 'Code and target framework are required',
      } as ApiResponse<never>);
    }

    const conversionOptions = {
      sourceFramework,
      targetFramework,
      typescript: options?.typescript ?? false,
      preserveComments: options?.preserveComments ?? true,
      generateConfigFiles: options?.generateConfigFiles ?? true,
    };

    const result = await frameworkConversionService.convertFramework(
      code,
      htmlContent || '',
      conversionOptions
    );

    res.json({
      success: true,
      data: result,
      message: `Successfully converted from ${result.sourceFramework} to ${result.targetFramework}`,
    } as ApiResponse<any>);
  } catch (error) {
    console.error('Framework conversion error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Framework conversion failed',
    } as ApiResponse<never>);
  }
});

/**
 * POST /api/conversion/modernize
 * Modernize legacy JavaScript code to ES6+
 */
router.post('/modernize', async (req, res) => {
  try {
    const { code, options } = req.body;

    if (!code) {
      return res.status(400).json({
        success: false,
        error: 'Code content is required',
      } as ApiResponse<never>);
    }

    const modernizationOptions = {
      varToLet: options?.varToLet ?? true,
      arrowFunctions: options?.arrowFunctions ?? true,
      templateLiterals: options?.templateLiterals ?? true,
      destructuring: options?.destructuring ?? true,
      asyncAwait: options?.asyncAwait ?? true,
      esModules: options?.esModules ?? true,
      optionalChaining: options?.optionalChaining ?? true,
      nullishCoalescing: options?.nullishCoalescing ?? true,
      removeIIFE: options?.removeIIFE ?? true,
      modernizeLoops: options?.modernizeLoops ?? true,
    };

    const result = await legacyCodeModernizationService.modernize(
      code,
      modernizationOptions
    );

    res.json({
      success: true,
      data: result,
      message: `Applied ${result.transformations.length} modernization transformations`,
    } as ApiResponse<any>);
  } catch (error) {
    console.error('Code modernization error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Code modernization failed',
    } as ApiResponse<never>);
  }
});

/**
 * POST /api/conversion/modernize/analyze
 * Analyze code for modernization opportunities
 */
router.post('/modernize/analyze', async (req, res) => {
  try {
    const { code } = req.body;

    if (!code) {
      return res.status(400).json({
        success: false,
        error: 'Code content is required',
      } as ApiResponse<never>);
    }

    const analysis = await legacyCodeModernizationService.analyzeCode(code);

    res.json({
      success: true,
      data: analysis,
      message: `Found ${analysis.suggestions.length} modernization suggestions`,
    } as ApiResponse<any>);
  } catch (error) {
    console.error('Code analysis error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Code analysis failed',
    } as ApiResponse<never>);
  }
});

/**
 * POST /api/conversion/css-framework/detect
 * Detect CSS framework used in HTML/CSS
 */
router.post('/css-framework/detect', async (req, res) => {
  try {
    const { htmlContent, cssContent } = req.body;

    if (!htmlContent) {
      return res.status(400).json({
        success: false,
        error: 'HTML content is required',
      } as ApiResponse<never>);
    }

    const result = await cssFrameworkDetectionService.detectFramework(
      htmlContent,
      cssContent
    );

    res.json({
      success: true,
      data: result,
      message: `Detected framework: ${result.framework} (${result.confidence}% confidence)`,
    } as ApiResponse<any>);
  } catch (error) {
    console.error('CSS framework detection error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'CSS framework detection failed',
    } as ApiResponse<never>);
  }
});

/**
 * POST /api/conversion/css-framework/analyze
 * Analyze CSS framework usage patterns
 */
router.post('/css-framework/analyze', async (req, res) => {
  try {
    const { htmlContent, cssContent, framework } = req.body;

    if (!htmlContent || !framework) {
      return res.status(400).json({
        success: false,
        error: 'HTML content and framework are required',
      } as ApiResponse<never>);
    }

    const usage = await cssFrameworkDetectionService.analyzeFrameworkUsage(
      htmlContent,
      cssContent,
      framework
    );

    res.json({
      success: true,
      data: usage,
      message: `Analyzed ${framework} usage: ${usage.percentageFramework.toFixed(1)}% framework classes`,
    } as ApiResponse<any>);
  } catch (error) {
    console.error('CSS framework analysis error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'CSS framework analysis failed',
    } as ApiResponse<never>);
  }
});

/**
 * POST /api/conversion/css-framework/migrate
 * Create migration plan between CSS frameworks
 */
router.post('/css-framework/migrate', async (req, res) => {
  try {
    const { sourceFramework, targetFramework } = req.body;

    if (!sourceFramework || !targetFramework) {
      return res.status(400).json({
        success: false,
        error: 'Source and target frameworks are required',
      } as ApiResponse<never>);
    }

    const migrationPlan = await cssFrameworkDetectionService.createMigrationPlan(
      sourceFramework,
      targetFramework
    );

    res.json({
      success: true,
      data: migrationPlan,
      message: `Created migration plan from ${sourceFramework} to ${targetFramework}`,
    } as ApiResponse<any>);
  } catch (error) {
    console.error('Migration plan creation error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Migration plan creation failed',
    } as ApiResponse<never>);
  }
});

/**
 * POST /api/conversion/css-framework/convert
 * Convert HTML from one CSS framework to another
 */
router.post('/css-framework/convert', async (req, res) => {
  try {
    const { htmlContent, sourceFramework, targetFramework } = req.body;

    if (!htmlContent || !sourceFramework || !targetFramework) {
      return res.status(400).json({
        success: false,
        error: 'HTML content, source framework, and target framework are required',
      } as ApiResponse<never>);
    }

    const result = await cssFrameworkDetectionService.convertFramework(
      htmlContent,
      sourceFramework,
      targetFramework
    );

    res.json({
      success: true,
      data: result,
      message: `Converted ${result.conversions} classes from ${sourceFramework} to ${targetFramework}`,
    } as ApiResponse<any>);
  } catch (error) {
    console.error('CSS framework conversion error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'CSS framework conversion failed',
    } as ApiResponse<never>);
  }
});

export default router;
