import path from 'path';
import fs from 'fs';

/**
 * Platform types supported
 */
export type Platform = 'wordpress' | 'shopify' | 'wix' | 'squarespace' | 'webflow' | 'static';

/**
 * Builder types supported
 */
export type Builder = 'none' | 'elementor' | 'divi' | 'beaver-builder' | 'kadence' | 'optimizepress' | 'brizy' | 'generateblocks' | 'crocoblock';

/**
 * Import Wizard Step
 */
export interface ImportWizardStep {
  stepNumber: number;
  title: string;
  description: string;
  instructions: string[];
  tips?: string[];
  warnings?: string[];
  estimatedTime?: string;
  required: boolean;
  videoTimestamp?: string; // For video walkthrough
}

/**
 * Import Wizard Configuration
 */
export interface ImportWizardConfig {
  platform: Platform;
  builder?: Builder;
  hasDatabase: boolean;
  usesFTP: boolean;
  usesSSH: boolean;
  hasCPanel: boolean;
  steps: ImportWizardStep[];
}

/**
 * Platform-Specific Import Instructions
 */
export interface PlatformInstructions {
  platform: Platform;
  builder?: Builder;
  overview: string;
  prerequisites: string[];
  steps: ImportWizardStep[];
  troubleshooting: {
    issue: string;
    solution: string;
  }[];
  additionalResources: string[];
  estimatedTotalTime: string;
}

/**
 * Video Walkthrough Script
 */
export interface VideoWalkthrough {
  platform: Platform;
  builder?: Builder;
  title: string;
  duration: string;
  sections: {
    timestamp: string;
    title: string;
    description: string;
    actions: string[];
  }[];
  scriptNarration: string[];
  onScreenText: string[];
}

/**
 * PHP Import Helper Configuration
 */
export interface PHPImportHelperConfig {
  wpSiteUrl: string;
  wpUsername?: string;
  wpPassword?: string;
  useRestAPI: boolean;
  mediaPath: string;
  createBackup: boolean;
  verifyUploads: boolean;
}

/**
 * Import Helper Service
 * Provides tools for importing exported websites
 */
export class ImportHelperService {
  /**
   * Generate import wizard for platform
   */
  generateImportWizard(
    platform: Platform,
    builder: Builder = 'none',
    options: {
      hasDatabase?: boolean;
      usesFTP?: boolean;
      usesSSH?: boolean;
      hasCPanel?: boolean;
    } = {}
  ): ImportWizardConfig {
    const steps: ImportWizardStep[] = [];

    // Step 1: Preparation (common to all platforms)
    steps.push({
      stepNumber: 1,
      title: 'Preparation',
      description: 'Prepare your environment for import',
      instructions: [
        'Download the exported ZIP file to your computer',
        'Extract the ZIP file to a temporary folder',
        'Review the README.md file for specific instructions',
        'Ensure you have necessary credentials (FTP/SSH/Admin)',
      ],
      tips: [
        'Create a backup of your existing site before proceeding',
        'Test the import on a staging environment first',
      ],
      estimatedTime: '5 minutes',
      required: true,
      videoTimestamp: '0:00',
    });

    // Platform-specific steps
    if (platform === 'wordpress') {
      steps.push(...this.getWordPressImportSteps(builder, options));
    } else if (platform === 'shopify') {
      steps.push(...this.getShopifyImportSteps(options));
    } else if (platform === 'wix') {
      steps.push(...this.getWixImportSteps(options));
    } else if (platform === 'squarespace') {
      steps.push(...this.getSquarespaceImportSteps(options));
    } else if (platform === 'webflow') {
      steps.push(...this.getWebflowImportSteps(options));
    } else if (platform === 'static') {
      steps.push(...this.getStaticImportSteps(options));
    }

    // Final verification step
    steps.push({
      stepNumber: steps.length + 1,
      title: 'Verification',
      description: 'Verify the import was successful',
      instructions: [
        'Visit your website in a browser',
        'Check all pages load correctly',
        'Verify images and assets are displaying',
        'Test responsive design on mobile devices',
        'Check console for JavaScript errors',
        'Validate forms and interactive elements',
      ],
      tips: [
        'Use browser DevTools to check for missing resources',
        'Test in multiple browsers (Chrome, Firefox, Safari)',
        'Use Google PageSpeed Insights to verify performance',
      ],
      estimatedTime: '10 minutes',
      required: true,
      videoTimestamp: this.calculateTotalTime(steps),
    });

    return {
      platform,
      builder,
      hasDatabase: options.hasDatabase || false,
      usesFTP: options.usesFTP || false,
      usesSSH: options.usesSSH || false,
      hasCPanel: options.hasCPanel || false,
      steps,
    };
  }

  /**
   * Get WordPress-specific import steps
   */
  private getWordPressImportSteps(builder: Builder, options: any): ImportWizardStep[] {
    const steps: ImportWizardStep[] = [];

    // Step 2: WordPress Installation
    steps.push({
      stepNumber: 2,
      title: 'WordPress Installation',
      description: 'Install WordPress if not already installed',
      instructions: [
        'Access your hosting control panel (cPanel/Plesk)',
        'Use one-click WordPress installer, or',
        'Download WordPress from wordpress.org',
        'Upload WordPress files via FTP',
        'Create a MySQL database',
        'Run the WordPress installation wizard',
        'Complete the 5-minute installation',
      ],
      tips: [
        'Choose a strong admin password',
        'Note your database credentials for later',
      ],
      warnings: [
        'Skip this step if WordPress is already installed',
      ],
      estimatedTime: '10 minutes',
      required: false,
      videoTimestamp: '5:00',
    });

    // Step 3: Upload Theme/Plugin
    if (builder !== 'none') {
      steps.push({
        stepNumber: 3,
        title: `Install ${builder} Builder`,
        description: `Install and activate the ${builder} page builder`,
        instructions: [
          'Log in to WordPress admin panel',
          `Navigate to Plugins > Add New`,
          `Search for "${builder}"`,
          'Click "Install Now" and then "Activate"',
          'Follow the builder\'s setup wizard if prompted',
        ],
        tips: [
          'Some builders require a license key',
          'Install any required dependencies',
        ],
        estimatedTime: '5 minutes',
        required: true,
        videoTimestamp: '15:00',
      });
    }

    // Step 4: Upload Theme
    steps.push({
      stepNumber: steps.length + 2,
      title: 'Upload Theme',
      description: 'Upload the exported WordPress theme',
      instructions: [
        'In WordPress admin, go to Appearance > Themes',
        'Click "Add New" > "Upload Theme"',
        'Select the theme ZIP file from the export',
        'Click "Install Now"',
        'Once installed, click "Activate"',
      ],
      estimatedTime: '3 minutes',
      required: true,
      videoTimestamp: '20:00',
    });

    // Step 5: Import Content
    steps.push({
      stepNumber: steps.length + 2,
      title: 'Import Content',
      description: 'Import pages and content',
      instructions: [
        'Go to Tools > Import',
        'Select "WordPress" importer',
        'Install and activate the importer if needed',
        'Upload the content XML file from the export',
        'Select "Download and import file attachments"',
        'Click "Submit" to start import',
        'Wait for the import to complete',
      ],
      warnings: [
        'Large imports may take several minutes',
        'Ensure PHP max_execution_time is sufficient',
      ],
      estimatedTime: '10 minutes',
      required: true,
      videoTimestamp: '23:00',
    });

    // Step 6: Upload Media (using PHP helper)
    steps.push({
      stepNumber: steps.length + 2,
      title: 'Upload Media Files',
      description: 'Upload images and media to WordPress',
      instructions: [
        'Extract the "media" folder from the export',
        'Option 1: Use the PHP import helper script (recommended):',
        '  - Upload "import-helper.php" to your WordPress root',
        '  - Access it via browser: yoursite.com/import-helper.php',
        '  - Follow the on-screen instructions',
        'Option 2: Manual FTP upload:',
        '  - Connect via FTP to wp-content/uploads/',
        '  - Upload all files maintaining folder structure',
        'Option 3: Use WordPress Media Library:',
        '  - Go to Media > Add New',
        '  - Drag and drop files (may need to do in batches)',
      ],
      tips: [
        'PHP helper script is fastest and most reliable',
        'For large media libraries, use FTP or SSH',
        'Verify file permissions after upload (usually 644)',
      ],
      estimatedTime: '15 minutes',
      required: true,
      videoTimestamp: '33:00',
    });

    // Step 7: Configure Settings
    steps.push({
      stepNumber: steps.length + 2,
      title: 'Configure WordPress Settings',
      description: 'Configure site settings and permalinks',
      instructions: [
        'Go to Settings > General',
        'Set Site Title and Tagline',
        'Verify Site URL and WordPress URL',
        'Go to Settings > Permalinks',
        'Select "Post name" structure (recommended)',
        'Click "Save Changes"',
        'Go to Settings > Reading',
        'Set your homepage display preferences',
      ],
      estimatedTime: '5 minutes',
      required: true,
      videoTimestamp: '48:00',
    });

    return steps;
  }

  /**
   * Get Shopify-specific import steps
   */
  private getShopifyImportSteps(options: any): ImportWizardStep[] {
    return [
      {
        stepNumber: 2,
        title: 'Access Shopify Admin',
        description: 'Log in to your Shopify admin panel',
        instructions: [
          'Go to your-store.myshopify.com/admin',
          'Log in with your credentials',
          'Ensure you have admin permissions',
        ],
        estimatedTime: '2 minutes',
        required: true,
        videoTimestamp: '5:00',
      },
      {
        stepNumber: 3,
        title: 'Upload Theme',
        description: 'Upload the exported Shopify theme',
        instructions: [
          'Go to Online Store > Themes',
          'Click "Upload theme" in the Theme library section',
          'Select the theme ZIP file',
          'Click "Upload"',
          'Once uploaded, click "Publish" to make it live',
        ],
        tips: [
          'Create a backup of your current theme first',
          'Preview the theme before publishing',
        ],
        estimatedTime: '5 minutes',
        required: true,
        videoTimestamp: '7:00',
      },
      {
        stepNumber: 4,
        title: 'Configure Theme Settings',
        description: 'Customize theme settings',
        instructions: [
          'Click "Customize" on your new theme',
          'Configure theme settings as needed',
          'Add your logo and branding',
          'Set colors and typography',
          'Configure header and footer',
          'Save changes',
        ],
        estimatedTime: '10 minutes',
        required: true,
        videoTimestamp: '12:00',
      },
    ];
  }

  /**
   * Get Wix-specific import steps
   */
  private getWixImportSteps(options: any): ImportWizardStep[] {
    return [
      {
        stepNumber: 2,
        title: 'Create Wix Site',
        description: 'Create a new Wix site or access existing',
        instructions: [
          'Log in to Wix.com',
          'Click "Create New Site" or select existing site',
          'Choose "Start with a Blank Template"',
          'Select "Start Creating"',
        ],
        estimatedTime: '3 minutes',
        required: true,
        videoTimestamp: '5:00',
      },
      {
        stepNumber: 3,
        title: 'Import HTML Content',
        description: 'Add HTML to Wix (limitations apply)',
        instructions: [
          'Wix does not support direct HTML import',
          'You will need to manually recreate pages using Wix Editor',
          'Use the exported HTML as reference',
          'Copy text content and recreate layouts',
          'Upload images through Wix Media Manager',
        ],
        warnings: [
          'Wix is a closed platform - full import not possible',
          'Custom code has limitations',
          'Consider using Wix Corvid for advanced features',
        ],
        estimatedTime: '60+ minutes',
        required: true,
        videoTimestamp: '8:00',
      },
    ];
  }

  /**
   * Get Squarespace-specific import steps
   */
  private getSquarespaceImportSteps(options: any): ImportWizardStep[] {
    return [
      {
        stepNumber: 2,
        title: 'Access Squarespace',
        description: 'Log in to your Squarespace account',
        instructions: [
          'Go to squarespace.com and log in',
          'Select your website or create a new one',
          'Click "Edit" to enter the editor',
        ],
        estimatedTime: '2 minutes',
        required: true,
        videoTimestamp: '5:00',
      },
      {
        stepNumber: 3,
        title: 'Import Content',
        description: 'Import content to Squarespace',
        instructions: [
          'Go to Settings > Advanced > Import / Export',
          'Click "Import"',
          'Select "WordPress" as import source',
          'Upload the WordPress XML file from export',
          'Squarespace will convert content automatically',
          'Review imported content and make adjustments',
        ],
        tips: [
          'Squarespace supports WordPress XML imports',
          'Some formatting may need manual adjustment',
          'Images should import automatically',
        ],
        estimatedTime: '15 minutes',
        required: true,
        videoTimestamp: '7:00',
      },
    ];
  }

  /**
   * Get Webflow-specific import steps
   */
  private getWebflowImportSteps(options: any): ImportWizardStep[] {
    return [
      {
        stepNumber: 2,
        title: 'Create Webflow Project',
        description: 'Create a new Webflow project',
        instructions: [
          'Log in to Webflow',
          'Click "New Project"',
          'Choose "Blank Site"',
          'Name your project',
        ],
        estimatedTime: '3 minutes',
        required: true,
        videoTimestamp: '5:00',
      },
      {
        stepNumber: 3,
        title: 'Import HTML/CSS',
        description: 'Import code to Webflow',
        instructions: [
          'Webflow does not support direct HTML import',
          'Use the exported HTML/CSS as reference',
          'Recreate layouts using Webflow Designer',
          'Copy styles and convert to Webflow classes',
          'Upload assets through Webflow Asset Manager',
        ],
        warnings: [
          'Webflow requires manual recreation',
          'Export can serve as reference/guide',
          'Consider using Webflow CMS for dynamic content',
        ],
        estimatedTime: '120+ minutes',
        required: true,
        videoTimestamp: '8:00',
      },
    ];
  }

  /**
   * Get static site import steps
   */
  private getStaticImportSteps(options: any): ImportWizardStep[] {
    const steps: ImportWizardStep[] = [];

    if (options.usesFTP) {
      steps.push({
        stepNumber: 2,
        title: 'FTP Upload',
        description: 'Upload files via FTP',
        instructions: [
          'Open your FTP client (FileZilla, Cyberduck, etc.)',
          'Connect to your hosting server',
          'Navigate to your public_html or www directory',
          'Upload all extracted files',
          'Maintain folder structure',
          'Set file permissions if needed (usually 644 for files, 755 for folders)',
        ],
        tips: [
          'Use binary transfer mode for images',
          'Resume transfers if connection drops',
        ],
        estimatedTime: '10 minutes',
        required: true,
        videoTimestamp: '5:00',
      });
    } else if (options.usesSSH) {
      steps.push({
        stepNumber: 2,
        title: 'SSH Upload',
        description: 'Upload files via SSH/SCP',
        instructions: [
          'Open terminal/command prompt',
          'Connect via SSH: ssh user@yourserver.com',
          'Navigate to web directory: cd /var/www/html',
          'Use SCP to upload: scp -r /path/to/files/* user@server:/var/www/html/',
          'Or use rsync: rsync -avz /path/to/files/ user@server:/var/www/html/',
          'Set correct permissions: chmod 644 *.html *.css *.js',
        ],
        estimatedTime: '5 minutes',
        required: true,
        videoTimestamp: '5:00',
      });
    } else if (options.hasCPanel) {
      steps.push({
        stepNumber: 2,
        title: 'cPanel File Manager',
        description: 'Upload files via cPanel',
        instructions: [
          'Log in to cPanel',
          'Open File Manager',
          'Navigate to public_html directory',
          'Click "Upload" button',
          'Select and upload the ZIP file',
          'Right-click the ZIP and select "Extract"',
          'Delete the ZIP file after extraction',
        ],
        tips: [
          'Upload as ZIP for faster transfer',
          'Check extracted files are in correct location',
        ],
        estimatedTime: '8 minutes',
        required: true,
        videoTimestamp: '5:00',
      });
    }

    steps.push({
      stepNumber: steps.length + 2,
      title: 'Configure Server',
      description: 'Set up server configuration',
      instructions: [
        'Create or update .htaccess file (Apache)',
        'Configure URL rewrites if needed',
        'Set up SSL certificate (recommended)',
        'Configure caching headers',
        'Enable Gzip compression',
        'Set security headers',
      ],
      tips: [
        'Use Let\'s Encrypt for free SSL',
        'Test with SSL Labs after SSL setup',
      ],
      estimatedTime: '10 minutes',
      required: false,
      videoTimestamp: this.calculateTimeFromPrevious(steps, 10),
    });

    return steps;
  }

  /**
   * Generate platform-specific import instructions
   */
  generatePlatformInstructions(
    platform: Platform,
    builder: Builder = 'none',
    options: any = {}
  ): PlatformInstructions {
    const wizard = this.generateImportWizard(platform, builder, options);

    const platformNames: Record<Platform, string> = {
      wordpress: 'WordPress',
      shopify: 'Shopify',
      wix: 'Wix',
      squarespace: 'Squarespace',
      webflow: 'Webflow',
      static: 'Static HTML Site',
    };

    const overview = this.generateOverview(platform, builder);
    const prerequisites = this.generatePrerequisites(platform, builder, options);
    const troubleshooting = this.generateTroubleshooting(platform);
    const resources = this.generateAdditionalResources(platform);

    return {
      platform,
      builder,
      overview,
      prerequisites,
      steps: wizard.steps,
      troubleshooting,
      additionalResources: resources,
      estimatedTotalTime: this.calculateTotalTime(wizard.steps),
    };
  }

  /**
   * Generate overview text
   */
  private generateOverview(platform: Platform, builder: Builder): string {
    const platformNames: Record<Platform, string> = {
      wordpress: 'WordPress',
      shopify: 'Shopify',
      wix: 'Wix',
      squarespace: 'Squarespace',
      webflow: 'Webflow',
      static: 'a static HTML site',
    };

    let overview = `This guide will walk you through importing your exported website to ${platformNames[platform]}. `;

    if (platform === 'wordpress' && builder !== 'none') {
      overview += `This export includes ${builder} page builder templates. `;
    }

    overview += `Follow each step carefully to ensure a successful import. `;
    overview += `The process typically takes ${this.getEstimatedTime(platform)} to complete.`;

    return overview;
  }

  /**
   * Generate prerequisites
   */
  private generatePrerequisites(platform: Platform, builder: Builder, options: any): string[] {
    const prerequisites: string[] = [
      'Downloaded export ZIP file',
      'Admin access to your destination platform',
      'Stable internet connection',
    ];

    if (platform === 'wordpress') {
      prerequisites.push('WordPress 5.0 or higher installed');
      prerequisites.push('PHP 7.4 or higher');
      prerequisites.push('MySQL 5.6 or higher');
      if (builder !== 'none') {
        prerequisites.push(`${builder} plugin installed and activated`);
      }
      prerequisites.push('FTP or File Manager access (for media uploads)');
    }

    if (platform === 'shopify') {
      prerequisites.push('Shopify store created');
      prerequisites.push('Admin permissions');
    }

    if (platform === 'static') {
      prerequisites.push('Web hosting account');
      if (options.usesFTP) prerequisites.push('FTP credentials');
      if (options.usesSSH) prerequisites.push('SSH access');
      if (options.hasCPanel) prerequisites.push('cPanel access');
    }

    return prerequisites;
  }

  /**
   * Generate troubleshooting guide
   */
  private generateTroubleshooting(platform: Platform): Array<{ issue: string; solution: string }> {
    const common = [
      {
        issue: 'Upload fails with "Maximum file size exceeded" error',
        solution: 'Increase PHP upload_max_filesize and post_max_size in php.ini, or upload files individually via FTP.',
      },
      {
        issue: 'Images not displaying after import',
        solution: 'Check file paths are correct, verify files uploaded successfully, clear browser cache, regenerate thumbnails.',
      },
      {
        issue: 'Site looks broken or unstyled',
        solution: 'Clear all caches (browser, CDN, server), verify CSS files uploaded correctly, check for JavaScript errors in console.',
      },
    ];

    if (platform === 'wordpress') {
      return [
        ...common,
        {
          issue: 'White screen of death after theme activation',
          solution: 'Access site via FTP, rename themes folder to themes_old, WordPress will revert to default theme. Check error logs for details.',
        },
        {
          issue: 'Plugin compatibility issues',
          solution: 'Deactivate all plugins, then reactivate one by one to identify the problematic plugin. Update all plugins to latest versions.',
        },
        {
          issue: 'Permalink structure not working',
          solution: 'Go to Settings > Permalinks and click "Save Changes" to flush rewrite rules. If using Apache, ensure .htaccess is writable.',
        },
      ];
    }

    return common;
  }

  /**
   * Generate additional resources
   */
  private generateAdditionalResources(platform: Platform): string[] {
    const common = [
      'Official documentation for your platform',
      'Community forums and support',
      'Video tutorials on YouTube',
    ];

    if (platform === 'wordpress') {
      return [
        ...common,
        'WordPress Codex: https://codex.wordpress.org/',
        'WordPress Support Forums: https://wordpress.org/support/',
        'WPBeginner Tutorials: https://www.wpbeginner.com/',
      ];
    }

    if (platform === 'shopify') {
      return [
        ...common,
        'Shopify Help Center: https://help.shopify.com/',
        'Shopify Community: https://community.shopify.com/',
      ];
    }

    return common;
  }

  /**
   * Get estimated time for platform
   */
  private getEstimatedTime(platform: Platform): string {
    const times: Record<Platform, string> = {
      wordpress: '45-60 minutes',
      shopify: '20-30 minutes',
      wix: '90-120 minutes',
      squarespace: '30-45 minutes',
      webflow: '120+ minutes',
      static: '15-30 minutes',
    };

    return times[platform];
  }

  /**
   * Calculate total time from steps
   */
  private calculateTotalTime(steps: ImportWizardStep[]): string {
    let totalMinutes = 0;

    steps.forEach(step => {
      if (step.estimatedTime) {
        const minutes = parseInt(step.estimatedTime);
        if (!isNaN(minutes)) {
          totalMinutes += minutes;
        }
      }
    });

    if (totalMinutes < 60) {
      return `${totalMinutes} minutes`;
    } else {
      const hours = Math.floor(totalMinutes / 60);
      const minutes = totalMinutes % 60;
      return minutes > 0 ? `${hours} hour${hours > 1 ? 's' : ''} ${minutes} minutes` : `${hours} hour${hours > 1 ? 's' : ''}`;
    }
  }

  /**
   * Calculate time from previous steps
   */
  private calculateTimeFromPrevious(steps: ImportWizardStep[], additionalMinutes: number): string {
    let totalMinutes = 0;

    steps.forEach(step => {
      if (step.estimatedTime) {
        const minutes = parseInt(step.estimatedTime);
        if (!isNaN(minutes)) {
          totalMinutes += minutes;
        }
      }
    });

    totalMinutes += additionalMinutes;

    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    return `${hours}:${minutes.toString().padStart(2, '0')}`;
  }

  /**
   * Generate video walkthrough script
   */
  generateVideoWalkthrough(
    platform: Platform,
    builder: Builder = 'none'
  ): VideoWalkthrough {
    const instructions = this.generatePlatformInstructions(platform, builder);
    const sections: VideoWalkthrough['sections'] = [];

    instructions.steps.forEach(step => {
      sections.push({
        timestamp: step.videoTimestamp || '0:00',
        title: step.title,
        description: step.description,
        actions: step.instructions,
      });
    });

    const narration = this.generateNarration(platform, builder, instructions);
    const onScreenText = this.generateOnScreenText(platform, instructions);

    return {
      platform,
      builder,
      title: `How to Import Your Website to ${platform}${builder !== 'none' ? ` (${builder})` : ''}`,
      duration: instructions.estimatedTotalTime,
      sections,
      scriptNarration: narration,
      onScreenText,
    };
  }

  /**
   * Generate narration script
   */
  private generateNarration(platform: Platform, builder: Builder, instructions: PlatformInstructions): string[] {
    const narration: string[] = [];

    narration.push(`Welcome to this step-by-step video guide on importing your website to ${platform}.`);
    narration.push(`In this video, we'll walk through the entire import process, from start to finish.`);
    narration.push(`The whole process should take about ${instructions.estimatedTotalTime}.`);
    narration.push(`Before we begin, make sure you have all the prerequisites ready.`);

    instructions.steps.forEach((step, index) => {
      narration.push(`Step ${step.stepNumber}: ${step.title}`);
      narration.push(step.description);
      step.instructions.forEach(instruction => {
        narration.push(instruction);
      });
      if (step.tips && step.tips.length > 0) {
        narration.push('Here are some helpful tips for this step:');
        step.tips.forEach(tip => narration.push(tip));
      }
    });

    narration.push(`That's it! Your website should now be successfully imported to ${platform}.`);
    narration.push(`Don't forget to test everything thoroughly before going live.`);
    narration.push(`Thanks for watching, and good luck with your new website!`);

    return narration;
  }

  /**
   * Generate on-screen text
   */
  private generateOnScreenText(platform: Platform, instructions: PlatformInstructions): string[] {
    const text: string[] = [];

    text.push(`Import Guide: ${platform}`);
    text.push(`Total Time: ${instructions.estimatedTotalTime}`);

    instructions.steps.forEach(step => {
      text.push(`STEP ${step.stepNumber}: ${step.title.toUpperCase()}`);
      step.instructions.forEach(instruction => {
        text.push(`• ${instruction}`);
      });
      if (step.warnings && step.warnings.length > 0) {
        step.warnings.forEach(warning => {
          text.push(`⚠️ ${warning}`);
        });
      }
    });

    text.push('VERIFICATION CHECKLIST:');
    text.push('✓ All pages load correctly');
    text.push('✓ Images display properly');
    text.push('✓ Responsive design works');
    text.push('✓ No console errors');

    return text;
  }

  /**
   * Generate PHP import helper script
   */
  generatePHPImportHelper(config: PHPImportHelperConfig): string {
    return `<?php
/**
 * WordPress Media Import Helper
 * Auto-generated by Website Cloner Pro
 *
 * This script helps import media files to WordPress
 * Upload this file to your WordPress root directory
 * Access via: ${config.wpSiteUrl}/import-helper.php
 */

// Security check
define('IMPORT_HELPER_KEY', '${this.generateSecurityKey()}');

// Configuration
define('WP_SITE_URL', '${config.wpSiteUrl}');
define('MEDIA_PATH', '${config.mediaPath}');
define('USE_REST_API', ${config.useRestAPI ? 'true' : 'false'});
define('CREATE_BACKUP', ${config.createBackup ? 'true' : 'false'});
define('VERIFY_UPLOADS', ${config.verifyUploads ? 'true' : 'false'});

// Load WordPress
require_once(dirname(__FILE__) . '/wp-load.php');

// Check user permissions
if (!current_user_can('upload_files')) {
    die('Error: You do not have permission to upload files.');
}

// Get action
$action = isset($_GET['action']) ? $_GET['action'] : 'show_form';

?>
<!DOCTYPE html>
<html>
<head>
    <title>WordPress Media Import Helper</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            max-width: 800px;
            margin: 50px auto;
            padding: 20px;
            background: #f0f0f1;
        }
        .container {
            background: white;
            padding: 30px;
            border-radius: 8px;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }
        h1 {
            color: #1d2327;
            margin-top: 0;
        }
        .step {
            background: #f6f7f7;
            padding: 15px;
            margin: 15px 0;
            border-left: 4px solid #2271b1;
            border-radius: 4px;
        }
        .success {
            background: #d4edda;
            border-color: #28a745;
            color: #155724;
            padding: 15px;
            border-radius: 4px;
            margin: 15px 0;
        }
        .error {
            background: #f8d7da;
            border-color: #dc3545;
            color: #721c24;
            padding: 15px;
            border-radius: 4px;
            margin: 15px 0;
        }
        .progress {
            background: #e9ecef;
            height: 30px;
            border-radius: 15px;
            overflow: hidden;
            margin: 20px 0;
        }
        .progress-bar {
            background: #2271b1;
            height: 100%;
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-weight: 500;
            transition: width 0.3s;
        }
        button {
            background: #2271b1;
            color: white;
            border: none;
            padding: 12px 24px;
            font-size: 14px;
            border-radius: 4px;
            cursor: pointer;
            font-weight: 500;
        }
        button:hover {
            background: #135e96;
        }
        .file-list {
            max-height: 300px;
            overflow-y: auto;
            border: 1px solid #ddd;
            padding: 10px;
            border-radius: 4px;
            margin: 15px 0;
        }
        .file-item {
            padding: 8px;
            border-bottom: 1px solid #eee;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        .file-item:last-child {
            border-bottom: none;
        }
        .status-icon {
            font-size: 20px;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>📦 WordPress Media Import Helper</h1>

        <?php if ($action === 'show_form'): ?>

            <div class="step">
                <h3>Step 1: Prepare Your Media Files</h3>
                <p>Extract the "media" folder from your export ZIP file.</p>
            </div>

            <div class="step">
                <h3>Step 2: Upload Media Folder</h3>
                <p>Upload the entire "media" folder to your WordPress root directory via FTP.</p>
                <p>The folder should be at: <code><?php echo ABSPATH; ?>media/</code></p>
            </div>

            <div class="step">
                <h3>Step 3: Start Import</h3>
                <form method="post" action="?action=import">
                    <p>
                        <label>
                            <input type="checkbox" name="create_backup" <?php echo CREATE_BACKUP ? 'checked' : ''; ?>>
                            Create backup before import
                        </label>
                    </p>
                    <p>
                        <label>
                            <input type="checkbox" name="verify_uploads" <?php echo VERIFY_UPLOADS ? 'checked' : ''; ?>>
                            Verify uploads after import
                        </label>
                    </p>
                    <button type="submit">Start Import</button>
                </form>
            </div>

        <?php elseif ($action === 'import'): ?>

            <h2>Import in Progress...</h2>

            <?php
            $media_path = ABSPATH . 'media/';

            if (!file_exists($media_path)) {
                echo '<div class="error">Error: Media folder not found at ' . $media_path . '</div>';
                echo '<p><a href="?action=show_form">Go Back</a></p>';
                exit;
            }

            // Create backup if requested
            if (isset($_POST['create_backup']) && $_POST['create_backup']) {
                echo '<div class="step">Creating backup...</div>';
                $backup_path = WP_CONTENT_DIR . '/uploads-backup-' . date('Y-m-d-His');
                if (!file_exists($backup_path)) {
                    mkdir($backup_path, 0755, true);
                }
                // Copy existing uploads
                $this->copyDirectory(WP_CONTENT_DIR . '/uploads', $backup_path);
                echo '<div class="success">✓ Backup created at: ' . $backup_path . '</div>';
            }

            // Import media files
            echo '<div class="step">Importing media files...</div>';
            $files = $this->scanMediaDirectory($media_path);
            $total = count($files);
            $imported = 0;
            $failed = 0;

            echo '<div class="file-list">';

            foreach ($files as $file) {
                $result = $this->importMediaFile($file, $media_path);

                if ($result['success']) {
                    $imported++;
                    echo '<div class="file-item">';
                    echo '<span>' . basename($file) . '</span>';
                    echo '<span class="status-icon">✓</span>';
                    echo '</div>';
                } else {
                    $failed++;
                    echo '<div class="file-item" style="color: #dc3545;">';
                    echo '<span>' . basename($file) . '</span>';
                    echo '<span class="status-icon">✗</span>';
                    echo '</div>';
                }

                // Update progress
                $progress = ($imported + $failed) / $total * 100;
                echo '<script>
                    if (document.querySelector(".progress-bar")) {
                        document.querySelector(".progress-bar").style.width = "' . $progress . '%";
                        document.querySelector(".progress-bar").textContent = Math.round(' . $progress . ') + "%";
                    }
                </script>';

                flush();
                ob_flush();
            }

            echo '</div>';

            echo '<div class="progress">';
            echo '<div class="progress-bar" style="width: 100%">100%</div>';
            echo '</div>';

            echo '<div class="success">';
            echo '<h3>Import Complete!</h3>';
            echo '<p>✓ Successfully imported: ' . $imported . ' files</p>';
            if ($failed > 0) {
                echo '<p>✗ Failed to import: ' . $failed . ' files</p>';
            }
            echo '</div>';

            // Verify if requested
            if (isset($_POST['verify_uploads']) && $_POST['verify_uploads']) {
                echo '<div class="step">Verifying uploads...</div>';
                $this->verifyUploads();
                echo '<div class="success">✓ Verification complete</div>';
            }

            echo '<p><a href="' . admin_url() . '"><button>Go to WordPress Admin</button></a></p>';
            ?>

        <?php endif; ?>

    </div>

    <script>
        // Auto-scroll to bottom during import
        if (window.location.href.includes('action=import')) {
            setInterval(function() {
                window.scrollTo(0, document.body.scrollHeight);
            }, 1000);
        }
    </script>
</body>
</html>

<?php

// Helper functions
function scanMediaDirectory($path) {
    $files = [];
    $items = new RecursiveIteratorIterator(
        new RecursiveDirectoryIterator($path),
        RecursiveIteratorIterator::SELF_FIRST
    );

    foreach ($items as $item) {
        if ($item->isFile()) {
            $files[] = $item->getPathname();
        }
    }

    return $files;
}

function importMediaFile($file, $base_path) {
    require_once(ABSPATH . 'wp-admin/includes/image.php');
    require_once(ABSPATH . 'wp-admin/includes/file.php');
    require_once(ABSPATH . 'wp-admin/includes/media.php');

    // Get relative path
    $relative_path = str_replace($base_path, '', $file);

    // Destination path
    $upload_dir = wp_upload_dir();
    $dest_path = $upload_dir['basedir'] . '/' . $relative_path;

    // Create directory if needed
    $dest_dir = dirname($dest_path);
    if (!file_exists($dest_dir)) {
        wp_mkdir_p($dest_dir);
    }

    // Copy file
    if (copy($file, $dest_path)) {
        // Add to media library
        $filetype = wp_check_filetype(basename($dest_path));
        $attachment = array(
            'guid' => $upload_dir['url'] . '/' . basename($dest_path),
            'post_mime_type' => $filetype['type'],
            'post_title' => preg_replace('/\\.[^.\\s]{3,4}$/', '', basename($dest_path)),
            'post_content' => '',
            'post_status' => 'inherit'
        );

        $attach_id = wp_insert_attachment($attachment, $dest_path);
        $attach_data = wp_generate_attachment_metadata($attach_id, $dest_path);
        wp_update_attachment_metadata($attach_id, $attach_data);

        return ['success' => true, 'id' => $attach_id];
    }

    return ['success' => false, 'error' => 'Copy failed'];
}

function copyDirectory($src, $dst) {
    $dir = opendir($src);
    @mkdir($dst);

    while (($file = readdir($dir)) !== false) {
        if ($file != '.' && $file != '..') {
            if (is_dir($src . '/' . $file)) {
                copyDirectory($src . '/' . $file, $dst . '/' . $file);
            } else {
                copy($src . '/' . $file, $dst . '/' . $file);
            }
        }
    }

    closedir($dir);
}

function verifyUploads() {
    // Check upload directory is writable
    $upload_dir = wp_upload_dir();

    if (!is_writable($upload_dir['basedir'])) {
        echo '<div class="error">Warning: Upload directory is not writable</div>';
        return false;
    }

    // Count files
    $files = glob($upload_dir['basedir'] . '/*.*');
    echo '<p>Total files in uploads directory: ' . count($files) . '</p>';

    // Check media library
    $attachments = get_posts(array(
        'post_type' => 'attachment',
        'posts_per_page' => -1,
        'post_status' => 'any'
    ));

    echo '<p>Total attachments in media library: ' . count($attachments) . '</p>';

    return true;
}

?>`;
  }

  /**
   * Generate security key for PHP script
   */
  private generateSecurityKey(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let key = '';
    for (let i = 0; i < 32; i++) {
      key += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return key;
  }
}

// Export singleton instance
export default new ImportHelperService();
