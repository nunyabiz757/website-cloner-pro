import * as cheerio from 'cheerio';
import fs from 'fs';
import path from 'path';
import archiver from 'archiver';
import { KadenceBlocksService } from './wordpress/KadenceBlocksService.js';
import { OptimizePressService } from './wordpress/OptimizePressService.js';
import { BrizyService } from './wordpress/BrizyService.js';
import { GenerateBlocksService } from './wordpress/GenerateBlocksService.js';
import { CrocoblockService } from './wordpress/CrocoblockService.js';
import PluginFreeVerificationService, { VerificationReport } from './PluginFreeVerificationService.js';
import DependencyEliminationService, { EliminationResult } from './DependencyEliminationService.js';
import AssetEmbeddingService, { EmbeddingResult } from './AssetEmbeddingService.js';
import PerformanceBudgetService, { BudgetValidationResult, PerformanceBudget } from './PerformanceBudgetService.js';

export interface WordPressExportOptions {
  html: string;
  css: string[];
  js: string[];
  images: string[];
  assets?: Map<string, Buffer>; // Optional asset map for embedding
  title?: string;
  author?: string;
  description?: string;
  targetBuilder?: 'none' | 'elementor' | 'divi' | 'beaver-builder' | 'kadence' | 'optimizepress' | 'brizy' | 'generateblocks' | 'crocoblock';
  pluginFree?: boolean;
  themeIntegration?: boolean;
  verifyPluginFree?: boolean; // Run plugin-free verification
  eliminateDependencies?: boolean; // Automatically eliminate plugin dependencies
  embedAssets?: boolean; // Enable smart asset embedding
  assetEmbeddingOptions?: {
    inlineThreshold?: number;
    imageThreshold?: number;
    fontThreshold?: number;
    enableBase64?: boolean;
    enableInlineSVG?: boolean;
    optimizeForHTTP2?: boolean;
    uploadToWordPress?: boolean;
    wordPressConfig?: {
      siteUrl: string;
      apiKey?: string;
      mediaPath?: string;
    };
  };
  validateBudget?: boolean; // Enable performance budget validation
  projectId?: string; // Project ID for budget lookup
  budgetOverride?: boolean; // Override budget violations
  customBudget?: PerformanceBudget; // Custom budget for this export
}

export interface WordPressExportResult {
  success: boolean;
  zipPath: string;
  files: {
    php: string[];
    css: string[];
    js: string[];
    images: string[];
  };
  instructions: string;
  verificationReport?: VerificationReport; // Plugin-free verification results
  eliminationResults?: {
    html?: EliminationResult;
    php?: EliminationResult;
    css?: EliminationResult;
    js?: EliminationResult;
  };
  embeddingResult?: EmbeddingResult; // Asset embedding results
  budgetValidation?: BudgetValidationResult; // Performance budget validation results
}

export class WordPressExportService {
  private outputDir: string;
  private kadenceService: KadenceBlocksService;
  private optimizePressService: OptimizePressService;
  private brizyService: BrizyService;
  private generateBlocksService: GenerateBlocksService;
  private crocoblockService: CrocoblockService;

  constructor() {
    this.outputDir = path.join(process.cwd(), 'wordpress-exports');
    this.ensureOutputDirectory();

    // Initialize new builder services
    this.kadenceService = new KadenceBlocksService();
    this.optimizePressService = new OptimizePressService();
    this.brizyService = new BrizyService();
    this.generateBlocksService = new GenerateBlocksService();
    this.crocoblockService = new CrocoblockService();
  }

  /**
   * Ensure output directory exists
   */
  private async ensureOutputDirectory() {
    try {
      await fs.promises.mkdir(this.outputDir, { recursive: true });
    } catch (error) {
      console.error('Failed to create output directory:', error);
    }
  }

  /**
   * Generate WordPress export
   */
  async generateWordPressExport(options: WordPressExportOptions): Promise<WordPressExportResult> {
    const exportId = `wp_export_${Date.now()}`;
    const exportPath = path.join(this.outputDir, exportId);

    await fs.promises.mkdir(exportPath, { recursive: true });

    const files = {
      php: [] as string[],
      css: [] as string[],
      js: [] as string[],
      images: [] as string[],
    };

    let verificationReport: VerificationReport | undefined;
    let eliminationResults: Record<string, EliminationResult> | undefined;
    let embeddingResult: EmbeddingResult | undefined;
    let budgetValidation: BudgetValidationResult | undefined;

    // Step -1: Validate performance budget if requested (BEFORE any processing)
    if (options.validateBudget) {
      // Get budget (custom, project-specific, or default)
      const budget = options.customBudget ||
        (options.projectId ? PerformanceBudgetService.getProjectBudget(options.projectId) : undefined) ||
        PerformanceBudgetService.getDefaultBudget();

      // Validate content against budget
      budgetValidation = await PerformanceBudgetService.validateBudget(
        options.html,
        options.css,
        options.js,
        options.images,
        budget,
        options.assets
      );

      // Check if export should be blocked
      if (!budgetValidation.canExport && !options.budgetOverride) {
        // Generate budget report
        const budgetReport = PerformanceBudgetService.generateReport(budgetValidation);
        const reportPath = path.join(exportPath, 'BUDGET_VIOLATION_REPORT.txt');
        await fs.promises.writeFile(reportPath, budgetReport);

        throw new Error(
          `Export blocked: Performance budget exceeded with ${budgetValidation.summary.totalViolations} violation(s). ` +
          `${budgetValidation.requiresOverride && budget.allowOverride ? 'Set budgetOverride: true to proceed.' : 'Fix violations to continue.'}`
        );
      }

      // Generate budget validation report (even if passed or overridden)
      const budgetReport = PerformanceBudgetService.generateReport(budgetValidation);
      const reportPath = path.join(exportPath, 'BUDGET_VALIDATION_REPORT.txt');
      await fs.promises.writeFile(reportPath, budgetReport);

      // Log if override was used
      if (options.budgetOverride && !budgetValidation.canExport) {
        console.warn('⚠️  Budget override used - Export proceeding despite violations');
      }
    }

    // Step 0: Process assets with smart embedding if requested (do this FIRST)
    if (options.embedAssets && options.assets) {
      embeddingResult = await AssetEmbeddingService.processAssets(
        options.html,
        options.assets,
        options.assetEmbeddingOptions || {}
      );

      // Use the optimized HTML
      options.html = embeddingResult.html;

      // Generate embedding report
      const reportLines = [
        '# Asset Embedding Report',
        '',
        `Total Assets: ${embeddingResult.stats.totalAssets}`,
        `Inlined Assets: ${embeddingResult.stats.inlinedAssets}`,
        `Base64 Assets: ${embeddingResult.stats.base64Assets}`,
        `External Assets: ${embeddingResult.stats.externalAssets}`,
        `WordPress Assets: ${embeddingResult.stats.wordPressAssets}`,
        '',
        `Original Size: ${embeddingResult.stats.originalSize} bytes`,
        `Processed Size: ${embeddingResult.stats.processedSize} bytes`,
        `Size Increase: ${embeddingResult.stats.sizeIncrease.toFixed(2)}%`,
        '',
        '## Recommendations',
        ...embeddingResult.recommendations.map(r => `- ${r}`),
        '',
        '## Decisions',
        ...embeddingResult.decisions.map(d =>
          `- ${d.path} (${d.sizeFormatted}): ${d.decision.toUpperCase()} - ${d.reason}`
        ),
      ];

      const reportPath = path.join(exportPath, 'ASSET_EMBEDDING_REPORT.txt');
      await fs.promises.writeFile(reportPath, reportLines.join('\n'));
    }

    // Step 1: Eliminate dependencies if requested (do this BEFORE generating export)
    if (options.eliminateDependencies) {
      eliminationResults = {};

      // Eliminate from HTML
      const htmlResult = await DependencyEliminationService.eliminateFromHTML(options.html, {
        removeShortcodes: true,
        convertToStatic: true,
        removePluginClasses: true,
        removePluginScripts: true,
        removePluginStyles: true,
        preserveLayout: true,
      });
      eliminationResults.html = htmlResult;
      options.html = htmlResult.cleanedContent; // Use cleaned HTML

      // Eliminate from CSS
      for (let i = 0; i < options.css.length; i++) {
        const cssResult = await DependencyEliminationService.eliminateFromCSS(options.css[i]);
        if (!eliminationResults.css) eliminationResults.css = cssResult;
        options.css[i] = cssResult.cleanedContent;
      }

      // Eliminate from JS
      for (let i = 0; i < options.js.length; i++) {
        const jsResult = await DependencyEliminationService.eliminateFromJS(options.js[i]);
        if (!eliminationResults.js) eliminationResults.js = jsResult;
        options.js[i] = jsResult.cleanedContent;
      }
    }

    // Generate based on target builder
    if (options.targetBuilder === 'none' || options.pluginFree) {
      await this.generatePluginFreeExport(exportPath, options, files);
    } else if (options.targetBuilder === 'elementor') {
      await this.generateElementorExport(exportPath, options, files);
    } else if (options.targetBuilder === 'divi') {
      await this.generateDiviExport(exportPath, options, files);
    } else if (options.targetBuilder === 'beaver-builder') {
      await this.generateBeaverBuilderExport(exportPath, options, files);
    } else if (options.targetBuilder === 'kadence') {
      await this.generateKadenceExport(exportPath, options, files);
    } else if (options.targetBuilder === 'optimizepress') {
      await this.generateOptimizePressExport(exportPath, options, files);
    } else if (options.targetBuilder === 'brizy') {
      await this.generateBrizyExport(exportPath, options, files);
    } else if (options.targetBuilder === 'generateblocks') {
      await this.generateGenerateBlocksExport(exportPath, options, files);
    } else if (options.targetBuilder === 'crocoblock') {
      await this.generateCrocoblockExport(exportPath, options, files);
    }

    // Step 2: Verify plugin-free status if requested (do this AFTER generating export)
    if (options.verifyPluginFree || options.pluginFree) {
      // Read generated files for verification
      const htmlFiles = await this.readGeneratedFiles(exportPath, '.html');
      const phpFiles = await this.readGeneratedFiles(exportPath, '.php');
      const cssFiles = await this.readGeneratedFiles(exportPath, '.css');
      const jsFiles = await this.readGeneratedFiles(exportPath, '.js');

      verificationReport = await PluginFreeVerificationService.verifyPluginFree(
        exportPath,
        {
          php: phpFiles,
          html: htmlFiles,
          css: cssFiles,
          js: jsFiles,
        },
        {
          strictMode: false,
          allowWordPressCore: true,
          allowThemeFunctions: true,
        }
      );

      // Generate verification report file
      const reportText = PluginFreeVerificationService.generateTextReport(verificationReport);
      const reportPath = path.join(exportPath, 'VERIFICATION_REPORT.txt');
      await fs.promises.writeFile(reportPath, reportText);

      // If elimination was done, also generate confirmation report
      if (eliminationResults) {
        const confirmationReport = DependencyEliminationService.generateConfirmationReport(eliminationResults);
        const confirmationPath = path.join(exportPath, 'ELIMINATION_REPORT.txt');
        await fs.promises.writeFile(confirmationPath, confirmationReport);
      }
    }

    // Create ZIP file
    const zipPath = await this.createZipArchive(exportPath, exportId);

    // Generate instructions
    const instructions = this.generateInstructions(options.targetBuilder || 'none');

    return {
      success: true,
      zipPath,
      files,
      instructions,
      verificationReport,
      eliminationResults,
      embeddingResult,
      budgetValidation,
    };
  }

  /**
   * Read generated files from export path
   */
  private async readGeneratedFiles(basePath: string, extension: string): Promise<string[]> {
    const files: string[] = [];

    async function scan(currentPath: string) {
      try {
        const entries = await fs.promises.readdir(currentPath, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = path.join(currentPath, entry.name);

          if (entry.isDirectory()) {
            await scan(fullPath);
          } else if (entry.isFile() && path.extname(entry.name) === extension) {
            const content = await fs.promises.readFile(fullPath, 'utf-8');
            files.push(content);
          }
        }
      } catch (error) {
        // Ignore errors from unreadable directories
      }
    }

    await scan(basePath);
    return files;
  }

  /**
   * Generate plugin-free WordPress export
   */
  private async generatePluginFreeExport(
    exportPath: string,
    options: WordPressExportOptions,
    files: { php: string[]; css: string[]; js: string[]; images: string[] }
  ) {
    // Create theme structure
    const themePath = path.join(exportPath, 'custom-theme');
    await fs.promises.mkdir(themePath, { recursive: true });

    // Generate style.css (theme header)
    const styleCss = this.generateThemeStyleCSS(options);
    const stylePath = path.join(themePath, 'style.css');
    await fs.promises.writeFile(stylePath, styleCss);
    files.css.push('style.css');

    // Generate functions.php
    const functionsPHP = this.generateFunctionsPHP(options);
    const functionsPath = path.join(themePath, 'functions.php');
    await fs.promises.writeFile(functionsPath, functionsPHP);
    files.php.push('functions.php');

    // Generate index.php (main template)
    const indexPHP = this.generateIndexPHP(options);
    const indexPath = path.join(themePath, 'index.php');
    await fs.promises.writeFile(indexPath, indexPHP);
    files.php.push('index.php');

    // Generate header.php
    const headerPHP = this.generateHeaderPHP(options);
    const headerPath = path.join(themePath, 'header.php');
    await fs.promises.writeFile(headerPath, headerPHP);
    files.php.push('header.php');

    // Generate footer.php
    const footerPHP = this.generateFooterPHP(options);
    const footerPath = path.join(themePath, 'footer.php');
    await fs.promises.writeFile(footerPath, footerPHP);
    files.php.push('footer.php');

    // Create assets directory
    const assetsPath = path.join(themePath, 'assets');
    await fs.promises.mkdir(path.join(assetsPath, 'css'), { recursive: true });
    await fs.promises.mkdir(path.join(assetsPath, 'js'), { recursive: true });
    await fs.promises.mkdir(path.join(assetsPath, 'images'), { recursive: true });

    // Copy CSS files
    for (let i = 0; i < options.css.length; i++) {
      const cssFile = `custom-${i}.css`;
      const cssPath = path.join(assetsPath, 'css', cssFile);
      await fs.promises.writeFile(cssPath, options.css[i]);
      files.css.push(`assets/css/${cssFile}`);
    }

    // Copy JS files
    for (let i = 0; i < options.js.length; i++) {
      const jsFile = `custom-${i}.js`;
      const jsPath = path.join(assetsPath, 'js', jsFile);
      await fs.promises.writeFile(jsPath, options.js[i]);
      files.js.push(`assets/js/${jsFile}`);
    }

    // Generate README
    const readmePath = path.join(themePath, 'README.md');
    await fs.promises.writeFile(readmePath, this.generateReadme('plugin-free'));
  }

  /**
   * Generate Elementor-compatible export
   */
  private async generateElementorExport(
    exportPath: string,
    options: WordPressExportOptions,
    files: { php: string[]; css: string[]; js: string[]; images: string[] }
  ) {
    // Create plugin structure
    const pluginPath = path.join(exportPath, 'elementor-custom-template');
    await fs.promises.mkdir(pluginPath, { recursive: true });

    // Generate main plugin file
    const pluginPHP = this.generateElementorPluginPHP(options);
    const pluginFilePath = path.join(pluginPath, 'elementor-custom-template.php');
    await fs.promises.writeFile(pluginFilePath, pluginPHP);
    files.php.push('elementor-custom-template.php');

    // Generate Elementor template JSON
    const templateJSON = this.generateElementorTemplateJSON(options);
    const templatePath = path.join(pluginPath, 'templates', 'template.json');
    await fs.promises.mkdir(path.dirname(templatePath), { recursive: true });
    await fs.promises.writeFile(templatePath, JSON.stringify(templateJSON, null, 2));

    // Generate template loader
    const loaderPHP = this.generateElementorLoaderPHP();
    const loaderPath = path.join(pluginPath, 'includes', 'template-loader.php');
    await fs.promises.mkdir(path.dirname(loaderPath), { recursive: true });
    await fs.promises.writeFile(loaderPath, loaderPHP);
    files.php.push('includes/template-loader.php');

    // Copy assets
    const assetsPath = path.join(pluginPath, 'assets');
    await fs.promises.mkdir(path.join(assetsPath, 'css'), { recursive: true });
    await fs.promises.mkdir(path.join(assetsPath, 'js'), { recursive: true });

    // Copy CSS
    for (let i = 0; i < options.css.length; i++) {
      const cssFile = `style-${i}.css`;
      await fs.promises.writeFile(path.join(assetsPath, 'css', cssFile), options.css[i]);
      files.css.push(`assets/css/${cssFile}`);
    }

    // Copy JS
    for (let i = 0; i < options.js.length; i++) {
      const jsFile = `script-${i}.js`;
      await fs.promises.writeFile(path.join(assetsPath, 'js', jsFile), options.js[i]);
      files.js.push(`assets/js/${jsFile}`);
    }

    // Generate README
    const readmePath = path.join(pluginPath, 'README.md');
    await fs.promises.writeFile(readmePath, this.generateReadme('elementor'));
  }

  /**
   * Generate Divi-compatible export
   */
  private async generateDiviExport(
    exportPath: string,
    options: WordPressExportOptions,
    files: { php: string[]; css: string[]; js: string[]; images: string[] }
  ) {
    // Create plugin structure for Divi
    const pluginPath = path.join(exportPath, 'divi-custom-layout');
    await fs.promises.mkdir(pluginPath, { recursive: true });

    // Generate main plugin file
    const pluginPHP = this.generateDiviPluginPHP(options);
    const pluginFilePath = path.join(pluginPath, 'divi-custom-layout.php');
    await fs.promises.writeFile(pluginFilePath, pluginPHP);
    files.php.push('divi-custom-layout.php');

    // Generate Divi layout JSON
    const layoutJSON = this.generateDiviLayoutJSON(options);
    const layoutPath = path.join(pluginPath, 'layouts', 'layout.json');
    await fs.promises.mkdir(path.dirname(layoutPath), { recursive: true });
    await fs.promises.writeFile(layoutPath, JSON.stringify(layoutJSON, null, 2));

    // Generate shortcode handler
    const shortcodePHP = this.generateDiviShortcodePHP();
    const shortcodePath = path.join(pluginPath, 'includes', 'shortcodes.php');
    await fs.promises.mkdir(path.dirname(shortcodePath), { recursive: true });
    await fs.promises.writeFile(shortcodePath, shortcodePHP);
    files.php.push('includes/shortcodes.php');

    // Copy assets
    const assetsPath = path.join(pluginPath, 'assets');
    await fs.promises.mkdir(path.join(assetsPath, 'css'), { recursive: true });
    await fs.promises.mkdir(path.join(assetsPath, 'js'), { recursive: true });

    for (let i = 0; i < options.css.length; i++) {
      const cssFile = `divi-style-${i}.css`;
      await fs.promises.writeFile(path.join(assetsPath, 'css', cssFile), options.css[i]);
      files.css.push(`assets/css/${cssFile}`);
    }

    for (let i = 0; i < options.js.length; i++) {
      const jsFile = `divi-script-${i}.js`;
      await fs.promises.writeFile(path.join(assetsPath, 'js', jsFile), options.js[i]);
      files.js.push(`assets/js/${jsFile}`);
    }

    // Generate README
    const readmePath = path.join(pluginPath, 'README.md');
    await fs.promises.writeFile(readmePath, this.generateReadme('divi'));
  }

  /**
   * Generate Beaver Builder-compatible export
   */
  private async generateBeaverBuilderExport(
    exportPath: string,
    options: WordPressExportOptions,
    files: { php: string[]; css: string[]; js: string[]; images: string[] }
  ) {
    // Create plugin structure for Beaver Builder
    const pluginPath = path.join(exportPath, 'beaver-builder-custom-module');
    await fs.promises.mkdir(pluginPath, { recursive: true });

    // Generate main plugin file
    const pluginPHP = this.generateBeaverBuilderPluginPHP(options);
    const pluginFilePath = path.join(pluginPath, 'beaver-builder-custom-module.php');
    await fs.promises.writeFile(pluginFilePath, pluginPHP);
    files.php.push('beaver-builder-custom-module.php');

    // Generate custom module
    const modulePHP = this.generateBeaverBuilderModulePHP(options);
    const modulePath = path.join(pluginPath, 'modules', 'custom-module', 'custom-module.php');
    await fs.promises.mkdir(path.dirname(modulePath), { recursive: true });
    await fs.promises.writeFile(modulePath, modulePHP);
    files.php.push('modules/custom-module/custom-module.php');

    // Generate module template
    const templateHTML = this.generateBeaverBuilderTemplate(options);
    const templatePath = path.join(pluginPath, 'modules', 'custom-module', 'includes', 'frontend.php');
    await fs.promises.mkdir(path.dirname(templatePath), { recursive: true });
    await fs.promises.writeFile(templatePath, templateHTML);
    files.php.push('modules/custom-module/includes/frontend.php');

    // Copy assets
    const assetsPath = path.join(pluginPath, 'assets');
    await fs.promises.mkdir(path.join(assetsPath, 'css'), { recursive: true });
    await fs.promises.mkdir(path.join(assetsPath, 'js'), { recursive: true });

    for (let i = 0; i < options.css.length; i++) {
      const cssFile = `bb-style-${i}.css`;
      await fs.promises.writeFile(path.join(assetsPath, 'css', cssFile), options.css[i]);
      files.css.push(`assets/css/${cssFile}`);
    }

    for (let i = 0; i < options.js.length; i++) {
      const jsFile = `bb-script-${i}.js`;
      await fs.promises.writeFile(path.join(assetsPath, 'js', jsFile), options.js[i]);
      files.js.push(`assets/js/${jsFile}`);
    }

    // Generate README
    const readmePath = path.join(pluginPath, 'README.md');
    await fs.promises.writeFile(readmePath, this.generateReadme('beaver-builder'));
  }

  /**
   * Generate Kadence Blocks export
   */
  private async generateKadenceExport(
    exportPath: string,
    options: WordPressExportOptions,
    files: { php: string[]; css: string[]; js: string[]; images: string[] }
  ) {
    const pluginPath = path.join(exportPath, 'kadence-blocks-custom');
    await fs.promises.mkdir(pluginPath, { recursive: true });

    // Convert to Kadence format
    const kadenceResult = await this.kadenceService.convertToKadence(
      options.html,
      options.css.join('\n')
    );

    // Generate main plugin file
    const pluginPHP = `<?php
/**
 * Plugin Name: Kadence Blocks Custom Content
 * Description: Custom Kadence Blocks content from cloned website
 * Version: 1.0.0
 * Author: Website Cloner Pro
 */

if (!defined('ABSPATH')) exit;

class Kadence_Custom_Content {
    public function __construct() {
        add_action('init', array($this, 'register_blocks'));
        add_action('wp_enqueue_scripts', array($this, 'enqueue_assets'));
    }

    public function register_blocks() {
        register_post_type('kadence_custom', array(
            'public' => true,
            'label' => 'Kadence Custom Content',
            'supports' => array('title', 'editor'),
            'show_in_rest' => true,
        ));
    }

    public function enqueue_assets() {
        wp_enqueue_style('kadence-custom-css', plugin_dir_url(__FILE__) . 'assets/css/custom.css');
    }
}

new Kadence_Custom_Content();
?>`;

    await fs.promises.writeFile(path.join(pluginPath, 'kadence-blocks-custom.php'), pluginPHP);
    files.php.push('kadence-blocks-custom.php');

    // Save block content
    const contentPath = path.join(pluginPath, 'content', 'blocks.html');
    await fs.promises.mkdir(path.dirname(contentPath), { recursive: true });
    await fs.promises.writeFile(contentPath, kadenceResult.data.content);

    // Save CSS
    const assetsPath = path.join(pluginPath, 'assets', 'css');
    await fs.promises.mkdir(assetsPath, { recursive: true });
    await fs.promises.writeFile(path.join(assetsPath, 'custom.css'), kadenceResult.data.css);
    files.css.push('assets/css/custom.css');

    // Generate README
    await fs.promises.writeFile(path.join(pluginPath, 'README.md'), this.generateReadme('kadence'));
  }

  /**
   * Generate OptimizePress export
   */
  private async generateOptimizePressExport(
    exportPath: string,
    options: WordPressExportOptions,
    files: { php: string[]; css: string[]; js: string[]; images: string[] }
  ) {
    const pluginPath = path.join(exportPath, 'optimizepress-custom');
    await fs.promises.mkdir(pluginPath, { recursive: true });

    // Convert to OptimizePress format
    const opResult = await this.optimizePressService.convertToOptimizePress(
      options.html,
      options.css.join('\n'),
      options.js.join('\n')
    );

    // Generate main plugin file
    const pluginPHP = `<?php
/**
 * Plugin Name: OptimizePress Custom Page
 * Description: Custom OptimizePress page from cloned website
 * Version: 1.0.0
 * Author: Website Cloner Pro
 */

if (!defined('ABSPATH')) exit;

class OptimizePress_Custom {
    public function __construct() {
        add_shortcode('op_custom_page', array($this, 'render_page'));
        add_action('wp_enqueue_scripts', array($this, 'enqueue_assets'));
    }

    public function render_page() {
        $template_file = plugin_dir_path(__FILE__) . 'templates/page.php';
        if (file_exists($template_file)) {
            ob_start();
            include $template_file;
            return ob_get_clean();
        }
        return '';
    }

    public function enqueue_assets() {
        wp_enqueue_style('op-custom-css', plugin_dir_url(__FILE__) . 'assets/css/custom.css');
    }
}

new OptimizePress_Custom();
?>`;

    await fs.promises.writeFile(path.join(pluginPath, 'optimizepress-custom.php'), pluginPHP);
    files.php.push('optimizepress-custom.php');

    // Save PHP template
    const templatePath = path.join(pluginPath, 'templates', 'page.php');
    await fs.promises.mkdir(path.dirname(templatePath), { recursive: true });
    await fs.promises.writeFile(templatePath, opResult.data.phpTemplate);
    files.php.push('templates/page.php');

    // Save shortcodes
    const shortcodesPath = path.join(pluginPath, 'content', 'shortcodes.txt');
    await fs.promises.mkdir(path.dirname(shortcodesPath), { recursive: true });
    await fs.promises.writeFile(shortcodesPath, opResult.data.shortcodes);

    // Save CSS
    const assetsPath = path.join(pluginPath, 'assets', 'css');
    await fs.promises.mkdir(assetsPath, { recursive: true });
    await fs.promises.writeFile(path.join(assetsPath, 'custom.css'), opResult.data.css);
    files.css.push('assets/css/custom.css');

    // Generate README
    await fs.promises.writeFile(path.join(pluginPath, 'README.md'), this.generateReadme('optimizepress'));
  }

  /**
   * Generate Brizy export
   */
  private async generateBrizyExport(
    exportPath: string,
    options: WordPressExportOptions,
    files: { php: string[]; css: string[]; js: string[]; images: string[] }
  ) {
    const pluginPath = path.join(exportPath, 'brizy-custom');
    await fs.promises.mkdir(pluginPath, { recursive: true });

    // Convert to Brizy format
    const brizyResult = await this.brizyService.convertToBrizy(
      options.html,
      options.css.join('\n'),
      options.js.join('\n')
    );

    // Generate main plugin file
    const pluginPHP = `<?php
/**
 * Plugin Name: Brizy Custom Page
 * Description: Custom Brizy page from cloned website
 * Version: 1.0.0
 * Author: Website Cloner Pro
 */

if (!defined('ABSPATH')) exit;

class Brizy_Custom {
    public function __construct() {
        add_action('init', array($this, 'init'));
        add_action('wp_enqueue_scripts', array($this, 'enqueue_assets'));
    }

    public function init() {
        // Register custom post type for Brizy pages
        register_post_type('brizy_custom', array(
            'public' => true,
            'label' => 'Brizy Custom Pages',
            'supports' => array('title', 'editor'),
            'show_in_rest' => true,
        ));
    }

    public function enqueue_assets() {
        wp_enqueue_style('brizy-custom-css', plugin_dir_url(__FILE__) . 'assets/css/custom.css');
    }
}

new Brizy_Custom();
?>`;

    await fs.promises.writeFile(path.join(pluginPath, 'brizy-custom.php'), pluginPHP);
    files.php.push('brizy-custom.php');

    // Save Brizy JSON data
    const dataPath = path.join(pluginPath, 'data', 'page.json');
    await fs.promises.mkdir(path.dirname(dataPath), { recursive: true });
    await fs.promises.writeFile(dataPath, JSON.stringify(brizyResult.data, null, 2));

    // Save CSS
    const assetsPath = path.join(pluginPath, 'assets', 'css');
    await fs.promises.mkdir(assetsPath, { recursive: true });
    await fs.promises.writeFile(path.join(assetsPath, 'custom.css'), brizyResult.data.css);
    files.css.push('assets/css/custom.css');

    // Generate README
    await fs.promises.writeFile(path.join(pluginPath, 'README.md'), this.generateReadme('brizy'));
  }

  /**
   * Generate GenerateBlocks export
   */
  private async generateGenerateBlocksExport(
    exportPath: string,
    options: WordPressExportOptions,
    files: { php: string[]; css: string[]; js: string[]; images: string[] }
  ) {
    const pluginPath = path.join(exportPath, 'generateblocks-custom');
    await fs.promises.mkdir(pluginPath, { recursive: true });

    // Convert to GenerateBlocks format
    const gbResult = await this.generateBlocksService.convertToGenerateBlocks(
      options.html,
      options.css.join('\n'),
      { generateCustomCSS: true }
    );

    // Generate main plugin file
    const pluginPHP = `<?php
/**
 * Plugin Name: GenerateBlocks Custom Content
 * Description: Custom GenerateBlocks content from cloned website
 * Version: 1.0.0
 * Author: Website Cloner Pro
 */

if (!defined('ABSPATH')) exit;

class GenerateBlocks_Custom {
    public function __construct() {
        add_action('init', array($this, 'register_content'));
        add_action('wp_enqueue_scripts', array($this, 'enqueue_assets'));
    }

    public function register_content() {
        register_post_type('gb_custom', array(
            'public' => true,
            'label' => 'GenerateBlocks Custom',
            'supports' => array('title', 'editor'),
            'show_in_rest' => true,
        ));
    }

    public function enqueue_assets() {
        wp_enqueue_style('gb-custom-css', plugin_dir_url(__FILE__) . 'assets/css/custom.css');
    }
}

new GenerateBlocks_Custom();
?>`;

    await fs.promises.writeFile(path.join(pluginPath, 'generateblocks-custom.php'), pluginPHP);
    files.php.push('generateblocks-custom.php');

    // Save block content
    const contentPath = path.join(pluginPath, 'content', 'blocks.html');
    await fs.promises.mkdir(path.dirname(contentPath), { recursive: true });
    await fs.promises.writeFile(contentPath, gbResult.data.content);

    // Save CSS
    const assetsPath = path.join(pluginPath, 'assets', 'css');
    await fs.promises.mkdir(assetsPath, { recursive: true });
    await fs.promises.writeFile(path.join(assetsPath, 'custom.css'), gbResult.data.css);
    files.css.push('assets/css/custom.css');

    // Generate README
    await fs.promises.writeFile(path.join(pluginPath, 'README.md'), this.generateReadme('generateblocks'));
  }

  /**
   * Generate Crocoblock export
   */
  private async generateCrocoblockExport(
    exportPath: string,
    options: WordPressExportOptions,
    files: { php: string[]; css: string[]; js: string[]; images: string[] }
  ) {
    const pluginPath = path.join(exportPath, 'crocoblock-custom');
    await fs.promises.mkdir(pluginPath, { recursive: true });

    // Convert to Crocoblock format
    const crocoblockResult = await this.crocoblockService.convertToCrocoblock(
      options.html,
      options.css.join('\n'),
      { enableFilters: true, enableDynamicContent: true }
    );

    // Generate main plugin file
    const pluginPHP = `<?php
/**
 * Plugin Name: Crocoblock/JetEngine Custom Content
 * Description: Custom Crocoblock content from cloned website
 * Version: 1.0.0
 * Author: Website Cloner Pro
 */

if (!defined('ABSPATH')) exit;

class Crocoblock_Custom {
    public function __construct() {
        add_action('init', array($this, 'init'));
        add_action('wp_enqueue_scripts', array($this, 'enqueue_assets'));
    }

    public function init() {
        // Load JetEngine listings
        require_once plugin_dir_path(__FILE__) . 'includes/listings.php';
    }

    public function enqueue_assets() {
        wp_enqueue_style('crocoblock-custom-css', plugin_dir_url(__FILE__) . 'assets/css/custom.css');
    }
}

new Crocoblock_Custom();
?>`;

    await fs.promises.writeFile(path.join(pluginPath, 'crocoblock-custom.php'), pluginPHP);
    files.php.push('crocoblock-custom.php');

    // Save JetEngine data
    const dataPath = path.join(pluginPath, 'data');
    await fs.promises.mkdir(dataPath, { recursive: true });
    await fs.promises.writeFile(
      path.join(dataPath, 'listings.json'),
      JSON.stringify(crocoblockResult.data.listings, null, 2)
    );
    await fs.promises.writeFile(
      path.join(dataPath, 'filters.json'),
      JSON.stringify(crocoblockResult.data.filters, null, 2)
    );
    await fs.promises.writeFile(
      path.join(dataPath, 'forms.json'),
      JSON.stringify(crocoblockResult.data.forms, null, 2)
    );

    // Save shortcodes
    const shortcodesPath = path.join(pluginPath, 'content', 'shortcodes.txt');
    await fs.promises.mkdir(path.dirname(shortcodesPath), { recursive: true });
    await fs.promises.writeFile(shortcodesPath, crocoblockResult.data.shortcodes);

    // Save CSS (create empty file as Crocoblock doesn't generate custom CSS)
    const assetsPath = path.join(pluginPath, 'assets', 'css');
    await fs.promises.mkdir(assetsPath, { recursive: true });
    await fs.promises.writeFile(path.join(assetsPath, 'custom.css'), options.css.join('\n'));
    files.css.push('assets/css/custom.css');

    // Generate README
    await fs.promises.writeFile(path.join(pluginPath, 'README.md'), this.generateReadme('crocoblock'));
  }

  /**
   * Generate theme style.css with WordPress header
   */
  private generateThemeStyleCSS(options: WordPressExportOptions): string {
    return `/*
Theme Name: ${options.title || 'Custom Cloned Theme'}
Theme URI: https://example.com/
Author: ${options.author || 'Website Cloner Pro'}
Author URI: https://example.com/
Description: ${options.description || 'A custom theme generated from cloned website'}
Version: 1.0.0
License: GNU General Public License v2 or later
License URI: http://www.gnu.org/licenses/gpl-2.0.html
Text Domain: custom-cloned-theme
*/

/* Cloned Website Styles */
${options.css.join('\n\n')}
`;
  }

  /**
   * Generate functions.php
   */
  private generateFunctionsPHP(options: WordPressExportOptions): string {
    return `<?php
/**
 * Theme Functions
 * Generated by Website Cloner Pro
 */

// Enqueue styles and scripts
function custom_cloned_theme_enqueue_assets() {
    // Enqueue main stylesheet
    wp_enqueue_style('custom-cloned-theme-style', get_stylesheet_uri());

    // Enqueue custom CSS
    ${options.css.map((_, i) => `wp_enqueue_style('custom-css-${i}', get_template_directory_uri() . '/assets/css/custom-${i}.css');`).join('\n    ')}

    // Enqueue custom JS
    ${options.js.map((_, i) => `wp_enqueue_script('custom-js-${i}', get_template_directory_uri() . '/assets/js/custom-${i}.js', array('jquery'), '1.0.0', true);`).join('\n    ')}
}
add_action('wp_enqueue_scripts', 'custom_cloned_theme_enqueue_assets');

// Theme support
function custom_cloned_theme_setup() {
    add_theme_support('title-tag');
    add_theme_support('post-thumbnails');
    add_theme_support('html5', array('search-form', 'comment-form', 'comment-list', 'gallery', 'caption'));
}
add_action('after_setup_theme', 'custom_cloned_theme_setup');
?>`;
  }

  /**
   * Generate index.php
   */
  private generateIndexPHP(options: WordPressExportOptions): string {
    const $ = cheerio.load(options.html);
    const bodyContent = $('body').html() || options.html;

    return `<?php get_header(); ?>

<main id="main-content" class="site-main">
    ${bodyContent}
</main>

<?php get_footer(); ?>`;
  }

  /**
   * Generate header.php
   */
  private generateHeaderPHP(options: WordPressExportOptions): string {
    const $ = cheerio.load(options.html);
    const headContent = $('head').html() || '';

    return `<!DOCTYPE html>
<html <?php language_attributes(); ?>>
<head>
    <meta charset="<?php bloginfo('charset'); ?>">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    ${headContent}
    <?php wp_head(); ?>
</head>
<body <?php body_class(); ?>>
<?php wp_body_open(); ?>`;
  }

  /**
   * Generate footer.php
   */
  private generateFooterPHP(options: WordPressExportOptions): string {
    return `
    <?php wp_footer(); ?>
</body>
</html>`;
  }

  /**
   * Generate Elementor plugin PHP
   */
  private generateElementorPluginPHP(options: WordPressExportOptions): string {
    return `<?php
/**
 * Plugin Name: Elementor Custom Template
 * Description: Custom template generated from cloned website
 * Version: 1.0.0
 * Author: Website Cloner Pro
 */

if (!defined('ABSPATH')) exit;

class Elementor_Custom_Template {
    public function __construct() {
        add_action('elementor/init', array($this, 'init'));
        add_action('wp_enqueue_scripts', array($this, 'enqueue_assets'));
    }

    public function init() {
        // Register custom template
        require_once plugin_dir_path(__FILE__) . 'includes/template-loader.php';
    }

    public function enqueue_assets() {
        ${options.css.map((_, i) => `wp_enqueue_style('elementor-custom-css-${i}', plugin_dir_url(__FILE__) . 'assets/css/style-${i}.css');`).join('\n        ')}
        ${options.js.map((_, i) => `wp_enqueue_script('elementor-custom-js-${i}', plugin_dir_url(__FILE__) . 'assets/js/script-${i}.js', array('jquery'), '1.0.0', true);`).join('\n        ')}
    }
}

new Elementor_Custom_Template();
?>`;
  }

  /**
   * Generate Elementor template JSON
   */
  private generateElementorTemplateJSON(options: WordPressExportOptions): any {
    const $ = cheerio.load(options.html);

    return {
      version: '1.0.0',
      title: options.title || 'Custom Template',
      type: 'page',
      content: [
        {
          id: 'main-section',
          elType: 'section',
          settings: {},
          elements: [
            {
              id: 'main-column',
              elType: 'column',
              settings: {
                _column_size: 100,
              },
              elements: [
                {
                  id: 'html-widget',
                  elType: 'widget',
                  widgetType: 'html',
                  settings: {
                    html: options.html,
                  },
                },
              ],
            },
          ],
        },
      ],
    };
  }

  /**
   * Generate Elementor template loader
   */
  private generateElementorLoaderPHP(): string {
    return `<?php
if (!defined('ABSPATH')) exit;

// Load Elementor template
function load_elementor_custom_template() {
    $template_file = plugin_dir_path(dirname(__FILE__)) . 'templates/template.json';
    if (file_exists($template_file)) {
        $template_data = json_decode(file_get_contents($template_file), true);
        return $template_data;
    }
    return null;
}
?>`;
  }

  /**
   * Generate Divi plugin PHP
   */
  private generateDiviPluginPHP(options: WordPressExportOptions): string {
    return `<?php
/**
 * Plugin Name: Divi Custom Layout
 * Description: Custom Divi layout generated from cloned website
 * Version: 1.0.0
 * Author: Website Cloner Pro
 */

if (!defined('ABSPATH')) exit;

class Divi_Custom_Layout {
    public function __construct() {
        add_action('init', array($this, 'init'));
        add_action('wp_enqueue_scripts', array($this, 'enqueue_assets'));
    }

    public function init() {
        require_once plugin_dir_path(__FILE__) . 'includes/shortcodes.php';
    }

    public function enqueue_assets() {
        ${options.css.map((_, i) => `wp_enqueue_style('divi-custom-css-${i}', plugin_dir_url(__FILE__) . 'assets/css/divi-style-${i}.css');`).join('\n        ')}
        ${options.js.map((_, i) => `wp_enqueue_script('divi-custom-js-${i}', plugin_dir_url(__FILE__) . 'assets/js/divi-script-${i}.js', array('jquery'), '1.0.0', true);`).join('\n        ')}
    }
}

new Divi_Custom_Layout();
?>`;
  }

  /**
   * Generate Divi layout JSON
   */
  private generateDiviLayoutJSON(options: WordPressExportOptions): any {
    return {
      version: '1.0.0',
      title: options.title || 'Custom Layout',
      content: options.html,
    };
  }

  /**
   * Generate Divi shortcode PHP
   */
  private generateDiviShortcodePHP(): string {
    return `<?php
if (!defined('ABSPATH')) exit;

function divi_custom_layout_shortcode($atts) {
    $layout_file = plugin_dir_path(dirname(__FILE__)) . 'layouts/layout.json';
    if (file_exists($layout_file)) {
        $layout_data = json_decode(file_get_contents($layout_file), true);
        return $layout_data['content'];
    }
    return '';
}
add_shortcode('divi_custom_layout', 'divi_custom_layout_shortcode');
?>`;
  }

  /**
   * Generate Beaver Builder plugin PHP
   */
  private generateBeaverBuilderPluginPHP(options: WordPressExportOptions): string {
    return `<?php
/**
 * Plugin Name: Beaver Builder Custom Module
 * Description: Custom Beaver Builder module from cloned website
 * Version: 1.0.0
 * Author: Website Cloner Pro
 */

if (!defined('ABSPATH')) exit;

class Beaver_Builder_Custom_Module {
    public function __construct() {
        add_action('init', array($this, 'init'));
        add_action('wp_enqueue_scripts', array($this, 'enqueue_assets'));
    }

    public function init() {
        if (class_exists('FLBuilder')) {
            require_once plugin_dir_path(__FILE__) . 'modules/custom-module/custom-module.php';
        }
    }

    public function enqueue_assets() {
        ${options.css.map((_, i) => `wp_enqueue_style('bb-custom-css-${i}', plugin_dir_url(__FILE__) . 'assets/css/bb-style-${i}.css');`).join('\n        ')}
        ${options.js.map((_, i) => `wp_enqueue_script('bb-custom-js-${i}', plugin_dir_url(__FILE__) . 'assets/js/bb-script-${i}.js', array('jquery'), '1.0.0', true);`).join('\n        ')}
    }
}

new Beaver_Builder_Custom_Module();
?>`;
  }

  /**
   * Generate Beaver Builder module PHP
   */
  private generateBeaverBuilderModulePHP(options: WordPressExportOptions): string {
    return `<?php
if (!defined('ABSPATH')) exit;

class Custom_BB_Module extends FLBuilderModule {
    public function __construct() {
        parent::__construct(array(
            'name' => '${options.title || 'Custom Module'}',
            'description' => 'Custom module from cloned website',
            'category' => 'Custom Modules',
            'dir' => plugin_dir_path(__FILE__),
            'url' => plugins_url('/', __FILE__),
        ));
    }
}

FLBuilder::register_module('Custom_BB_Module', array());
?>`;
  }

  /**
   * Generate Beaver Builder template
   */
  private generateBeaverBuilderTemplate(options: WordPressExportOptions): string {
    return `<?php
if (!defined('ABSPATH')) exit;
?>
${options.html}`;
  }

  /**
   * Generate README file
   */
  private generateReadme(type: string): string {
    const readmeMap: Record<string, string> = {
      'plugin-free': `# Custom WordPress Theme

This is a custom WordPress theme generated from a cloned website.

## Installation

1. Upload the \`custom-theme\` folder to \`/wp-content/themes/\`
2. Activate the theme in WordPress admin under Appearance > Themes
3. The theme will automatically load all styles and scripts

## Features

- Plugin-free implementation
- All styles and scripts embedded
- No external dependencies
- Mobile responsive
`,
      'elementor': `# Elementor Custom Template Plugin

This plugin provides a custom Elementor template from a cloned website.

## Installation

1. Upload the plugin folder to \`/wp-content/plugins/\`
2. Activate the plugin in WordPress admin
3. The template will be available in Elementor's template library

## Usage

- Create a new page
- Edit with Elementor
- Insert the custom template from the library
`,
      'divi': `# Divi Custom Layout Plugin

This plugin provides a custom Divi layout from a cloned website.

## Installation

1. Upload the plugin folder to \`/wp-content/plugins/\`
2. Activate the plugin in WordPress admin
3. Use the shortcode [divi_custom_layout] in any page

## Usage

- Add the shortcode to any page or post
- The layout will render with all styles
`,
      'beaver-builder': `# Beaver Builder Custom Module Plugin

This plugin provides a custom Beaver Builder module from a cloned website.

## Installation

1. Upload the plugin folder to \`/wp-content/plugins/\`
2. Activate the plugin in WordPress admin
3. The module will appear in Beaver Builder's module list

## Usage

- Edit any page with Beaver Builder
- Find the custom module in the modules panel
- Drag it onto your page
`,
      'kadence': `# Kadence Blocks Custom Content Plugin

This plugin provides custom Kadence Blocks content from a cloned website.

## Installation

1. Install and activate Kadence Blocks plugin
2. Upload this plugin folder to \`/wp-content/plugins/\`
3. Activate the plugin in WordPress admin

## Usage

- Create a new page
- Copy the block content from \`content/blocks.html\`
- Paste into the Gutenberg editor
- All Kadence Blocks will render with proper styling
`,
      'optimizepress': `# OptimizePress Custom Page Plugin

This plugin provides a custom OptimizePress page from a cloned website.

## Installation

1. Install and activate OptimizePress
2. Upload this plugin folder to \`/wp-content/plugins/\`
3. Activate the plugin in WordPress admin

## Usage

- Use the shortcode \`[op_custom_page]\` in any page
- The page will render with all marketing elements
- Supports landing pages, sales pages, and webinar pages
`,
      'brizy': `# Brizy Custom Page Plugin

This plugin provides a custom Brizy page from a cloned website.

## Installation

1. Install and activate Brizy (Free or Pro)
2. Upload this plugin folder to \`/wp-content/plugins/\`
3. Activate the plugin in WordPress admin

## Usage

- Import the JSON data from \`data/page.json\` into Brizy
- Use Brizy's import feature to load the page
- Edit with Brizy's visual editor
`,
      'generateblocks': `# GenerateBlocks Custom Content Plugin

This plugin provides custom GenerateBlocks content from a cloned website.

## Installation

1. Install and activate GenerateBlocks
2. Upload this plugin folder to \`/wp-content/plugins/\`
3. Activate the plugin in WordPress admin

## Usage

- Create a new page
- Copy block content from \`content/blocks.html\`
- Paste into Gutenberg editor
- Lightweight, performance-optimized blocks
`,
      'crocoblock': `# Crocoblock/JetEngine Custom Content Plugin

This plugin provides custom Crocoblock/JetEngine content from a cloned website.

## Installation

1. Install and activate JetEngine and other Crocoblock plugins
2. Upload this plugin folder to \`/wp-content/plugins/\`
3. Activate the plugin in WordPress admin

## Usage

- Import listings from \`data/listings.json\`
- Import filters from \`data/filters.json\`
- Import forms from \`data/forms.json\`
- Use shortcodes from \`content/shortcodes.txt\`
`,
    };

    return readmeMap[type] || readmeMap['plugin-free'];
  }

  /**
   * Create ZIP archive
   */
  private async createZipArchive(sourcePath: string, exportId: string): Promise<string> {
    const zipPath = path.join(this.outputDir, `${exportId}.zip`);
    const output = fs.createWriteStream(zipPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    return new Promise((resolve, reject) => {
      output.on('close', () => resolve(zipPath));
      archive.on('error', reject);

      archive.pipe(output);
      archive.directory(sourcePath, false);
      archive.finalize();
    });
  }

  /**
   * Generate installation instructions
   */
  private generateInstructions(builderType: string): string {
    const instructionsMap: Record<string, string> = {
      none: '1. Extract the ZIP file\n2. Upload the theme folder to /wp-content/themes/\n3. Activate in WordPress admin > Appearance > Themes',
      elementor: '1. Extract the ZIP file\n2. Upload the plugin to /wp-content/plugins/\n3. Activate in WordPress admin > Plugins\n4. Use in Elementor editor',
      divi: '1. Extract the ZIP file\n2. Upload the plugin to /wp-content/plugins/\n3. Activate in WordPress admin\n4. Use shortcode [divi_custom_layout]',
      'beaver-builder': '1. Extract the ZIP file\n2. Upload the plugin to /wp-content/plugins/\n3. Activate in WordPress admin\n4. Find module in Beaver Builder editor',
      kadence: '1. Install Kadence Blocks\n2. Extract the ZIP file\n3. Upload the plugin to /wp-content/plugins/\n4. Activate in WordPress admin\n5. Copy block content into Gutenberg',
      optimizepress: '1. Install OptimizePress\n2. Extract the ZIP file\n3. Upload the plugin to /wp-content/plugins/\n4. Activate in WordPress admin\n5. Use shortcode [op_custom_page]',
      brizy: '1. Install Brizy\n2. Extract the ZIP file\n3. Upload the plugin to /wp-content/plugins/\n4. Activate in WordPress admin\n5. Import JSON data in Brizy',
      generateblocks: '1. Install GenerateBlocks\n2. Extract the ZIP file\n3. Upload the plugin to /wp-content/plugins/\n4. Activate in WordPress admin\n5. Copy block content into Gutenberg',
      crocoblock: '1. Install JetEngine and Crocoblock plugins\n2. Extract the ZIP file\n3. Upload the plugin to /wp-content/plugins/\n4. Activate in WordPress admin\n5. Import listings, filters, and forms',
    };

    return instructionsMap[builderType] || instructionsMap.none;
  }
}

export default new WordPressExportService();
