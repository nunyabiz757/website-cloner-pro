import express from 'express';
import ImportHelperService from '../services/ImportHelperService.js';
import fs from 'fs';
import path from 'path';

const router = express.Router();

/**
 * Generate import wizard
 * POST /api/import-helper/wizard
 */
router.post('/wizard', (req, res) => {
  try {
    const {
      platform,
      builder = 'none',
      hasDatabase = false,
      usesFTP = false,
      usesSSH = false,
      hasCPanel = false,
    } = req.body;

    if (!platform) {
      return res.status(400).json({
        success: false,
        error: 'Platform is required',
      });
    }

    const wizard = ImportHelperService.generateImportWizard(
      platform,
      builder,
      {
        hasDatabase,
        usesFTP,
        usesSSH,
        hasCPanel,
      }
    );

    res.json({
      success: true,
      wizard,
    });
  } catch (error) {
    console.error('Failed to generate import wizard:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate wizard',
    });
  }
});

/**
 * Generate platform-specific instructions
 * POST /api/import-helper/instructions
 */
router.post('/instructions', (req, res) => {
  try {
    const {
      platform,
      builder = 'none',
      options = {},
    } = req.body;

    if (!platform) {
      return res.status(400).json({
        success: false,
        error: 'Platform is required',
      });
    }

    const instructions = ImportHelperService.generatePlatformInstructions(
      platform,
      builder,
      options
    );

    res.json({
      success: true,
      instructions,
    });
  } catch (error) {
    console.error('Failed to generate instructions:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate instructions',
    });
  }
});

/**
 * Generate instructions as markdown
 * POST /api/import-helper/instructions/markdown
 */
router.post('/instructions/markdown', (req, res) => {
  try {
    const {
      platform,
      builder = 'none',
      options = {},
    } = req.body;

    if (!platform) {
      return res.status(400).json({
        success: false,
        error: 'Platform is required',
      });
    }

    const instructions = ImportHelperService.generatePlatformInstructions(
      platform,
      builder,
      options
    );

    // Convert to markdown
    const markdown = convertInstructionsToMarkdown(instructions);

    res.json({
      success: true,
      markdown,
    });
  } catch (error) {
    console.error('Failed to generate markdown:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate markdown',
    });
  }
});

/**
 * Generate video walkthrough script
 * POST /api/import-helper/video-walkthrough
 */
router.post('/video-walkthrough', (req, res) => {
  try {
    const { platform, builder = 'none' } = req.body;

    if (!platform) {
      return res.status(400).json({
        success: false,
        error: 'Platform is required',
      });
    }

    const walkthrough = ImportHelperService.generateVideoWalkthrough(platform, builder);

    res.json({
      success: true,
      walkthrough,
    });
  } catch (error) {
    console.error('Failed to generate video walkthrough:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate video walkthrough',
    });
  }
});

/**
 * Generate video script as text
 * POST /api/import-helper/video-walkthrough/script
 */
router.post('/video-walkthrough/script', (req, res) => {
  try {
    const { platform, builder = 'none' } = req.body;

    if (!platform) {
      return res.status(400).json({
        success: false,
        error: 'Platform is required',
      });
    }

    const walkthrough = ImportHelperService.generateVideoWalkthrough(platform, builder);

    // Format script
    const script = formatVideoScript(walkthrough);

    res.json({
      success: true,
      script,
      walkthrough,
    });
  } catch (error) {
    console.error('Failed to generate video script:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate video script',
    });
  }
});

/**
 * Generate PHP import helper script
 * POST /api/import-helper/php-script
 */
router.post('/php-script', (req, res) => {
  try {
    const {
      wpSiteUrl,
      wpUsername,
      wpPassword,
      useRestAPI = true,
      mediaPath = 'wp-content/uploads',
      createBackup = true,
      verifyUploads = true,
    } = req.body;

    if (!wpSiteUrl) {
      return res.status(400).json({
        success: false,
        error: 'WordPress site URL is required',
      });
    }

    const phpScript = ImportHelperService.generatePHPImportHelper({
      wpSiteUrl,
      wpUsername,
      wpPassword,
      useRestAPI,
      mediaPath,
      createBackup,
      verifyUploads,
    });

    res.json({
      success: true,
      script: phpScript,
      filename: 'import-helper.php',
    });
  } catch (error) {
    console.error('Failed to generate PHP script:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate PHP script',
    });
  }
});

/**
 * Download PHP import helper script
 * POST /api/import-helper/php-script/download
 */
router.post('/php-script/download', (req, res) => {
  try {
    const {
      wpSiteUrl,
      wpUsername,
      wpPassword,
      useRestAPI = true,
      mediaPath = 'wp-content/uploads',
      createBackup = true,
      verifyUploads = true,
    } = req.body;

    if (!wpSiteUrl) {
      return res.status(400).json({
        success: false,
        error: 'WordPress site URL is required',
      });
    }

    const phpScript = ImportHelperService.generatePHPImportHelper({
      wpSiteUrl,
      wpUsername,
      wpPassword,
      useRestAPI,
      mediaPath,
      createBackup,
      verifyUploads,
    });

    // Set headers for download
    res.setHeader('Content-Type', 'application/x-php');
    res.setHeader('Content-Disposition', 'attachment; filename="import-helper.php"');
    res.send(phpScript);
  } catch (error) {
    console.error('Failed to download PHP script:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to download PHP script',
    });
  }
});

/**
 * Get supported platforms
 * GET /api/import-helper/platforms
 */
router.get('/platforms', (req, res) => {
  try {
    const platforms = [
      {
        id: 'wordpress',
        name: 'WordPress',
        description: 'Most popular CMS, supports themes and plugins',
        difficulty: 'Easy',
        estimatedTime: '45-60 minutes',
        requiresDatabase: true,
        supportedBuilders: [
          'none',
          'elementor',
          'divi',
          'beaver-builder',
          'kadence',
          'optimizepress',
          'brizy',
          'generateblocks',
          'crocoblock',
        ],
      },
      {
        id: 'shopify',
        name: 'Shopify',
        description: 'E-commerce platform with theme support',
        difficulty: 'Easy',
        estimatedTime: '20-30 minutes',
        requiresDatabase: false,
        supportedBuilders: ['none'],
      },
      {
        id: 'wix',
        name: 'Wix',
        description: 'Drag-and-drop website builder',
        difficulty: 'Hard',
        estimatedTime: '90-120 minutes',
        requiresDatabase: false,
        supportedBuilders: ['none'],
        limitations: [
          'Does not support direct HTML import',
          'Requires manual recreation of layouts',
        ],
      },
      {
        id: 'squarespace',
        name: 'Squarespace',
        description: 'All-in-one website builder',
        difficulty: 'Medium',
        estimatedTime: '30-45 minutes',
        requiresDatabase: false,
        supportedBuilders: ['none'],
        features: [
          'Supports WordPress XML import',
        ],
      },
      {
        id: 'webflow',
        name: 'Webflow',
        description: 'Visual web development platform',
        difficulty: 'Hard',
        estimatedTime: '120+ minutes',
        requiresDatabase: false,
        supportedBuilders: ['none'],
        limitations: [
          'Does not support direct HTML import',
          'Requires manual recreation in Designer',
        ],
      },
      {
        id: 'static',
        name: 'Static HTML Site',
        description: 'Traditional web hosting with HTML/CSS/JS',
        difficulty: 'Easy',
        estimatedTime: '15-30 minutes',
        requiresDatabase: false,
        supportedBuilders: ['none'],
        uploadMethods: [
          'FTP',
          'SSH/SCP',
          'cPanel File Manager',
        ],
      },
    ];

    res.json({
      success: true,
      platforms,
    });
  } catch (error) {
    console.error('Failed to get platforms:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get platforms',
    });
  }
});

/**
 * Get builders for platform
 * GET /api/import-helper/platforms/:platform/builders
 */
router.get('/platforms/:platform/builders', (req, res) => {
  try {
    const { platform } = req.params;

    const builders: Record<string, any> = {
      wordpress: [
        { id: 'none', name: 'None (Standard WordPress)', description: 'Uses default WordPress editor' },
        { id: 'elementor', name: 'Elementor', description: 'Popular drag-and-drop page builder' },
        { id: 'divi', name: 'Divi', description: 'Visual builder by Elegant Themes' },
        { id: 'beaver-builder', name: 'Beaver Builder', description: 'Frontend drag-and-drop builder' },
        { id: 'kadence', name: 'Kadence Blocks', description: 'Gutenberg-based block system' },
        { id: 'optimizepress', name: 'OptimizePress', description: 'Marketing and landing pages' },
        { id: 'brizy', name: 'Brizy', description: 'Visual page builder' },
        { id: 'generateblocks', name: 'GenerateBlocks', description: 'Lightweight block system' },
        { id: 'crocoblock', name: 'Crocoblock', description: 'JetEngine dynamic content' },
      ],
      shopify: [
        { id: 'none', name: 'None (Liquid Templates)', description: 'Uses Shopify Liquid' },
      ],
      wix: [
        { id: 'none', name: 'None (Wix Editor)', description: 'Uses Wix visual editor' },
      ],
      squarespace: [
        { id: 'none', name: 'None (Squarespace Editor)', description: 'Uses Squarespace editor' },
      ],
      webflow: [
        { id: 'none', name: 'None (Webflow Designer)', description: 'Uses Webflow Designer' },
      ],
      static: [
        { id: 'none', name: 'None (Static HTML)', description: 'Pure HTML/CSS/JS' },
      ],
    };

    if (!builders[platform]) {
      return res.status(404).json({
        success: false,
        error: 'Platform not found',
      });
    }

    res.json({
      success: true,
      builders: builders[platform],
    });
  } catch (error) {
    console.error('Failed to get builders:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get builders',
    });
  }
});

/**
 * Generate complete import package
 * POST /api/import-helper/package
 */
router.post('/package', async (req, res) => {
  try {
    const {
      platform,
      builder = 'none',
      options = {},
      includeVideoScript = true,
      includePHPHelper = false,
      wpSiteUrl,
    } = req.body;

    if (!platform) {
      return res.status(400).json({
        success: false,
        error: 'Platform is required',
      });
    }

    // Generate all components
    const wizard = ImportHelperService.generateImportWizard(platform, builder, options);
    const instructions = ImportHelperService.generatePlatformInstructions(platform, builder, options);
    const markdown = convertInstructionsToMarkdown(instructions);

    const packageData: any = {
      wizard,
      instructions,
      markdown,
    };

    // Add video walkthrough if requested
    if (includeVideoScript) {
      const walkthrough = ImportHelperService.generateVideoWalkthrough(platform, builder);
      packageData.videoWalkthrough = walkthrough;
      packageData.videoScript = formatVideoScript(walkthrough);
    }

    // Add PHP helper if WordPress and requested
    if (includePHPHelper && platform === 'wordpress' && wpSiteUrl) {
      const phpScript = ImportHelperService.generatePHPImportHelper({
        wpSiteUrl,
        useRestAPI: true,
        mediaPath: 'wp-content/uploads',
        createBackup: true,
        verifyUploads: true,
      });
      packageData.phpHelper = phpScript;
    }

    res.json({
      success: true,
      package: packageData,
    });
  } catch (error) {
    console.error('Failed to generate import package:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate package',
    });
  }
});

// Helper function to convert instructions to markdown
function convertInstructionsToMarkdown(instructions: any): string {
  const lines: string[] = [];

  lines.push(`# Import Guide: ${instructions.platform.toUpperCase()}`);
  if (instructions.builder && instructions.builder !== 'none') {
    lines.push(`**Builder:** ${instructions.builder}`);
  }
  lines.push('');
  lines.push(`**Estimated Time:** ${instructions.estimatedTotalTime}`);
  lines.push('');

  lines.push('## Overview');
  lines.push(instructions.overview);
  lines.push('');

  lines.push('## Prerequisites');
  instructions.prerequisites.forEach((prereq: string) => {
    lines.push(`- ${prereq}`);
  });
  lines.push('');

  lines.push('## Import Steps');
  instructions.steps.forEach((step: any) => {
    lines.push(`### Step ${step.stepNumber}: ${step.title}`);
    lines.push(step.description);
    lines.push('');

    lines.push('**Instructions:**');
    step.instructions.forEach((instruction: string) => {
      lines.push(`1. ${instruction}`);
    });
    lines.push('');

    if (step.tips && step.tips.length > 0) {
      lines.push('**💡 Tips:**');
      step.tips.forEach((tip: string) => {
        lines.push(`- ${tip}`);
      });
      lines.push('');
    }

    if (step.warnings && step.warnings.length > 0) {
      lines.push('**⚠️ Warnings:**');
      step.warnings.forEach((warning: string) => {
        lines.push(`- ${warning}`);
      });
      lines.push('');
    }

    if (step.estimatedTime) {
      lines.push(`**Estimated Time:** ${step.estimatedTime}`);
      lines.push('');
    }

    lines.push('---');
    lines.push('');
  });

  lines.push('## Troubleshooting');
  instructions.troubleshooting.forEach((item: any) => {
    lines.push(`### ${item.issue}`);
    lines.push(`**Solution:** ${item.solution}`);
    lines.push('');
  });

  lines.push('## Additional Resources');
  instructions.additionalResources.forEach((resource: string) => {
    lines.push(`- ${resource}`);
  });
  lines.push('');

  lines.push('---');
  lines.push('*Generated by Website Cloner Pro - Import Helper Tools*');

  return lines.join('\n');
}

// Helper function to format video script
function formatVideoScript(walkthrough: any): string {
  const lines: string[] = [];

  lines.push(`# Video Script: ${walkthrough.title}`);
  lines.push(`**Duration:** ${walkthrough.duration}`);
  lines.push('');

  lines.push('## Narration Script');
  lines.push('');
  walkthrough.scriptNarration.forEach((narration: string, index: number) => {
    lines.push(`[${index + 1}] ${narration}`);
    lines.push('');
  });

  lines.push('## Video Sections');
  lines.push('');
  walkthrough.sections.forEach((section: any) => {
    lines.push(`### [${section.timestamp}] ${section.title}`);
    lines.push(section.description);
    lines.push('');
    lines.push('**Actions:**');
    section.actions.forEach((action: string) => {
      lines.push(`- ${action}`);
    });
    lines.push('');
  });

  lines.push('## On-Screen Text');
  lines.push('');
  walkthrough.onScreenText.forEach((text: string) => {
    lines.push(text);
  });
  lines.push('');

  return lines.join('\n');
}

export default router;
