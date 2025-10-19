import fs from 'fs';
import path from 'path';
import archiver from 'archiver';

/**
 * Export Package Structure
 */
export interface ExportPackage {
  exportId: string;
  exportPath: string;
  structure: ExportStructure;
  files: Map<string, string>;  // path -> content
  metadata: ExportMetadata;
}

/**
 * Export Structure Definition
 */
export interface ExportStructure {
  rootDir: string;
  directories: string[];
  files: ExportFile[];
}

/**
 * Export File Definition
 */
export interface ExportFile {
  path: string;
  type: 'readme' | 'report' | 'config' | 'asset' | 'code' | 'data' | 'documentation';
  required: boolean;
  description: string;
  generated?: boolean;
}

/**
 * Export Metadata
 */
export interface ExportMetadata {
  exportId: string;
  exportType: 'wordpress' | 'static' | 'react' | 'vue' | 'shopify' | 'generic';
  version: string;
  timestamp: number;
  projectName?: string;
  sourceUrl?: string;
  targetPlatform?: string;
  builder?: string;
  features: string[];
  statistics: {
    totalFiles: number;
    totalSize: number;
    htmlFiles: number;
    cssFiles: number;
    jsFiles: number;
    imageFiles: number;
    otherFiles: number;
  };
}

/**
 * Standard Export Package Structure
 */
const STANDARD_STRUCTURE: ExportStructure = {
  rootDir: 'website-export',
  directories: [
    'assets',
    'assets/images',
    'assets/css',
    'assets/js',
    'assets/fonts',
    'performance',
    'verification',
    'documentation',
    'builder',
  ],
  files: [
    {
      path: 'README.md',
      type: 'readme',
      required: true,
      description: 'Main documentation with installation instructions',
    },
    {
      path: 'PERFORMANCE-REPORT.md',
      type: 'report',
      required: false,
      description: 'Performance analysis and optimization recommendations',
    },
    {
      path: 'BUDGET-VALIDATION-REPORT.txt',
      type: 'report',
      required: false,
      description: 'Performance budget validation results',
    },
    {
      path: 'IMPORT-INSTRUCTIONS.md',
      type: 'documentation',
      required: false,
      description: 'Step-by-step import guide for target platform',
    },
    {
      path: 'VERIFICATION-REPORT.txt',
      type: 'report',
      required: false,
      description: 'Plugin-free verification results',
    },
    {
      path: 'ASSET-EMBEDDING-REPORT.txt',
      type: 'report',
      required: false,
      description: 'Asset embedding decisions and statistics',
    },
    {
      path: 'builder-export.json',
      type: 'data',
      required: false,
      description: 'Page builder export data (Elementor, Divi, etc.)',
    },
    {
      path: 'metadata.json',
      type: 'config',
      required: true,
      description: 'Export metadata and configuration',
    },
    {
      path: 'package.json',
      type: 'config',
      required: false,
      description: 'NPM package configuration for static sites',
    },
    {
      path: 'import-helper.php',
      type: 'code',
      required: false,
      description: 'PHP script for WordPress media import automation',
    },
  ],
};

/**
 * Export Package Service
 * Manages standardized export package structure
 */
export class ExportPackageService {
  private outputDir: string;

  constructor() {
    this.outputDir = path.join(process.cwd(), 'exports');
    this.ensureOutputDirectory();
  }

  /**
   * Ensure output directory exists
   */
  private async ensureOutputDirectory(): Promise<void> {
    try {
      await fs.promises.mkdir(this.outputDir, { recursive: true });
    } catch (error) {
      console.error('Failed to create output directory:', error);
    }
  }

  /**
   * Create new export package
   */
  async createPackage(
    exportType: ExportMetadata['exportType'],
    options: {
      projectName?: string;
      sourceUrl?: string;
      targetPlatform?: string;
      builder?: string;
    } = {}
  ): Promise<ExportPackage> {
    const exportId = `export_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const exportPath = path.join(this.outputDir, exportId);

    // Create directory structure
    await this.createDirectoryStructure(exportPath);

    // Initialize metadata
    const metadata: ExportMetadata = {
      exportId,
      exportType,
      version: '1.0.0',
      timestamp: Date.now(),
      projectName: options.projectName,
      sourceUrl: options.sourceUrl,
      targetPlatform: options.targetPlatform,
      builder: options.builder,
      features: [],
      statistics: {
        totalFiles: 0,
        totalSize: 0,
        htmlFiles: 0,
        cssFiles: 0,
        jsFiles: 0,
        imageFiles: 0,
        otherFiles: 0,
      },
    };

    return {
      exportId,
      exportPath,
      structure: STANDARD_STRUCTURE,
      files: new Map(),
      metadata,
    };
  }

  /**
   * Create directory structure
   */
  private async createDirectoryStructure(basePath: string): Promise<void> {
    // Create root directory
    await fs.promises.mkdir(basePath, { recursive: true });

    // Create subdirectories
    for (const dir of STANDARD_STRUCTURE.directories) {
      const dirPath = path.join(basePath, dir);
      await fs.promises.mkdir(dirPath, { recursive: true });
    }
  }

  /**
   * Add file to package
   */
  async addFile(
    pkg: ExportPackage,
    relativePath: string,
    content: string | Buffer,
    type: ExportFile['type'] = 'code'
  ): Promise<void> {
    const fullPath = path.join(pkg.exportPath, relativePath);
    const dir = path.dirname(fullPath);

    // Ensure directory exists
    await fs.promises.mkdir(dir, { recursive: true });

    // Write file
    await fs.promises.writeFile(fullPath, content);

    // Update package files map
    pkg.files.set(relativePath, fullPath);

    // Update statistics
    this.updateStatistics(pkg, relativePath, content);
  }

  /**
   * Generate README.md
   */
  generateReadme(pkg: ExportPackage): string {
    const lines: string[] = [];

    lines.push(`# ${pkg.metadata.projectName || 'Website Export'}`);
    lines.push('');
    lines.push(`**Export ID:** ${pkg.metadata.exportId}`);
    lines.push(`**Export Type:** ${pkg.metadata.exportType}`);
    lines.push(`**Generated:** ${new Date(pkg.metadata.timestamp).toLocaleString()}`);

    if (pkg.metadata.sourceUrl) {
      lines.push(`**Source URL:** ${pkg.metadata.sourceUrl}`);
    }

    if (pkg.metadata.targetPlatform) {
      lines.push(`**Target Platform:** ${pkg.metadata.targetPlatform}`);
    }

    if (pkg.metadata.builder) {
      lines.push(`**Page Builder:** ${pkg.metadata.builder}`);
    }

    lines.push('');
    lines.push('---');
    lines.push('');

    lines.push('## 📦 Package Contents');
    lines.push('');
    lines.push('This export package contains everything needed to deploy your website:');
    lines.push('');

    // List directories
    lines.push('### Directory Structure');
    lines.push('```');
    lines.push('website-export/');
    STANDARD_STRUCTURE.directories.forEach(dir => {
      lines.push(`├── ${dir}/`);
    });
    lines.push('├── README.md');
    lines.push('├── metadata.json');
    lines.push('└── ... (additional files)');
    lines.push('```');
    lines.push('');

    // List key files
    lines.push('### Key Files');
    lines.push('');
    STANDARD_STRUCTURE.files.filter(f => f.required || pkg.files.has(f.path)).forEach(file => {
      lines.push(`- **${file.path}** - ${file.description}`);
    });
    lines.push('');

    // Statistics
    lines.push('## 📊 Statistics');
    lines.push('');
    lines.push(`- Total Files: ${pkg.metadata.statistics.totalFiles}`);
    lines.push(`- Total Size: ${this.formatBytes(pkg.metadata.statistics.totalSize)}`);
    lines.push(`- HTML Files: ${pkg.metadata.statistics.htmlFiles}`);
    lines.push(`- CSS Files: ${pkg.metadata.statistics.cssFiles}`);
    lines.push(`- JavaScript Files: ${pkg.metadata.statistics.jsFiles}`);
    lines.push(`- Images: ${pkg.metadata.statistics.imageFiles}`);
    lines.push('');

    // Features
    if (pkg.metadata.features.length > 0) {
      lines.push('## ✨ Features Included');
      lines.push('');
      pkg.metadata.features.forEach(feature => {
        lines.push(`- ${feature}`);
      });
      lines.push('');
    }

    // Installation instructions
    lines.push('## 🚀 Installation');
    lines.push('');
    lines.push('### Quick Start');
    lines.push('');
    lines.push('1. Extract this ZIP file to your desired location');
    lines.push('2. Review the `IMPORT-INSTRUCTIONS.md` file for platform-specific instructions');
    lines.push('3. Upload files to your hosting/platform');
    lines.push('4. Verify the installation');
    lines.push('');

    // WordPress specific
    if (pkg.metadata.exportType === 'wordpress') {
      lines.push('### WordPress Installation');
      lines.push('');
      lines.push('1. **Install WordPress** (if not already installed)');
      lines.push('2. **Upload Theme** - Upload the theme from the `theme/` directory');
      lines.push('3. **Import Content** - Use WordPress Importer to import `content.xml`');
      lines.push('4. **Upload Media** - Use `import-helper.php` for automated media upload');
      lines.push('5. **Configure Settings** - Set permalinks and homepage');
      lines.push('');
      lines.push('See `IMPORT-INSTRUCTIONS.md` for detailed steps.');
      lines.push('');
    }

    // Static site specific
    if (pkg.metadata.exportType === 'static') {
      lines.push('### Static Site Deployment');
      lines.push('');
      lines.push('1. Upload all files to your web server via FTP/SSH');
      lines.push('2. Ensure `index.html` is in the root directory');
      lines.push('3. Configure server settings (`.htaccess` for Apache)');
      lines.push('4. Set up SSL certificate (recommended)');
      lines.push('');
    }

    // Reports
    lines.push('## 📋 Reports');
    lines.push('');
    lines.push('This package includes several reports to help you understand and optimize your website:');
    lines.push('');

    if (pkg.files.has('PERFORMANCE-REPORT.md')) {
      lines.push('- **PERFORMANCE-REPORT.md** - Performance analysis and recommendations');
    }

    if (pkg.files.has('BUDGET-VALIDATION-REPORT.txt')) {
      lines.push('- **BUDGET-VALIDATION-REPORT.txt** - Performance budget validation');
    }

    if (pkg.files.has('VERIFICATION-REPORT.txt')) {
      lines.push('- **VERIFICATION-REPORT.txt** - Plugin-free verification results');
    }

    if (pkg.files.has('ASSET-EMBEDDING-REPORT.txt')) {
      lines.push('- **ASSET-EMBEDDING-REPORT.txt** - Asset embedding decisions');
    }

    lines.push('');

    // Support
    lines.push('## 🆘 Support');
    lines.push('');
    lines.push('For issues or questions:');
    lines.push('');
    lines.push('1. Check the `IMPORT-INSTRUCTIONS.md` file');
    lines.push('2. Review the performance and verification reports');
    lines.push('3. Consult platform-specific documentation');
    lines.push('4. Contact support if needed');
    lines.push('');

    // Footer
    lines.push('---');
    lines.push('');
    lines.push('*Generated by Website Cloner Pro*');
    lines.push(`*Export Version: ${pkg.metadata.version}*`);

    return lines.join('\n');
  }

  /**
   * Generate metadata.json
   */
  generateMetadata(pkg: ExportPackage): string {
    return JSON.stringify(pkg.metadata, null, 2);
  }

  /**
   * Generate package.json for static sites
   */
  generatePackageJson(pkg: ExportPackage): string {
    const packageJson = {
      name: (pkg.metadata.projectName || 'website-export').toLowerCase().replace(/\s+/g, '-'),
      version: pkg.metadata.version,
      description: `Exported website from ${pkg.metadata.sourceUrl || 'Website Cloner Pro'}`,
      type: 'module',
      scripts: {
        serve: 'npx http-server . -p 8080',
        deploy: 'echo "Configure your deployment script here"',
      },
      devDependencies: {
        'http-server': '^14.1.1',
      },
      keywords: ['website', 'export', 'static'],
      author: '',
      license: 'ISC',
      exportMetadata: {
        exportId: pkg.metadata.exportId,
        exportType: pkg.metadata.exportType,
        timestamp: pkg.metadata.timestamp,
        sourceUrl: pkg.metadata.sourceUrl,
      },
    };

    return JSON.stringify(packageJson, null, 2);
  }

  /**
   * Generate file tree documentation
   */
  generateFileTree(pkg: ExportPackage): string {
    const lines: string[] = [];

    lines.push('# Export Package File Structure');
    lines.push('');
    lines.push('```');
    lines.push('website-export/');
    lines.push('│');

    // Root files
    lines.push('├── README.md                          (Main documentation)');
    lines.push('├── metadata.json                      (Export metadata)');

    if (pkg.files.has('IMPORT-INSTRUCTIONS.md')) {
      lines.push('├── IMPORT-INSTRUCTIONS.md             (Import guide)');
    }

    if (pkg.files.has('PERFORMANCE-REPORT.md')) {
      lines.push('├── PERFORMANCE-REPORT.md              (Performance analysis)');
    }

    if (pkg.files.has('package.json')) {
      lines.push('├── package.json                       (NPM configuration)');
    }

    if (pkg.files.has('import-helper.php')) {
      lines.push('├── import-helper.php                  (Media import automation)');
    }

    lines.push('│');

    // Assets directory
    lines.push('├── assets/                            (Website assets)');
    lines.push('│   ├── images/                        (Image files)');
    lines.push('│   ├── css/                           (Stylesheets)');
    lines.push('│   ├── js/                            (JavaScript files)');
    lines.push('│   └── fonts/                         (Font files)');
    lines.push('│');

    // Performance directory
    lines.push('├── performance/                       (Performance data)');
    if (pkg.files.has('performance/metrics.json')) {
      lines.push('│   ├── metrics.json                   (Performance metrics)');
    }
    if (pkg.files.has('performance/lighthouse-report.json')) {
      lines.push('│   └── lighthouse-report.json         (Lighthouse audit)');
    }
    lines.push('│');

    // Verification directory
    lines.push('├── verification/                      (Verification reports)');
    if (pkg.files.has('VERIFICATION-REPORT.txt')) {
      lines.push('│   └── plugin-free-report.txt         (Plugin verification)');
    }
    lines.push('│');

    // Documentation directory
    lines.push('├── documentation/                     (Additional docs)');
    if (pkg.files.has('documentation/VIDEO-SCRIPT.txt')) {
      lines.push('│   ├── VIDEO-SCRIPT.txt               (Video walkthrough)');
    }
    lines.push('│');

    // Builder directory (WordPress)
    if (pkg.metadata.exportType === 'wordpress') {
      lines.push('└── builder/                           (Page builder data)');
      if (pkg.files.has('builder-export.json')) {
        lines.push('    └── builder-export.json            (Builder templates)');
      }
    } else {
      lines.push('└── builder/                           (Page builder data)');
    }

    lines.push('```');
    lines.push('');

    // File descriptions
    lines.push('## File Descriptions');
    lines.push('');

    STANDARD_STRUCTURE.files.forEach(file => {
      if (file.required || pkg.files.has(file.path)) {
        lines.push(`### ${file.path}`);
        lines.push('');
        lines.push(`**Type:** ${file.type}`);
        lines.push(`**Required:** ${file.required ? 'Yes' : 'No'}`);
        lines.push('');
        lines.push(file.description);
        lines.push('');
      }
    });

    return lines.join('\n');
  }

  /**
   * Add feature to metadata
   */
  addFeature(pkg: ExportPackage, feature: string): void {
    if (!pkg.metadata.features.includes(feature)) {
      pkg.metadata.features.push(feature);
    }
  }

  /**
   * Update statistics
   */
  private updateStatistics(pkg: ExportPackage, filePath: string, content: string | Buffer): void {
    const stats = pkg.metadata.statistics;
    const size = Buffer.isBuffer(content) ? content.length : Buffer.byteLength(content);

    stats.totalFiles++;
    stats.totalSize += size;

    const ext = path.extname(filePath).toLowerCase();

    if (ext === '.html' || ext === '.htm') {
      stats.htmlFiles++;
    } else if (ext === '.css') {
      stats.cssFiles++;
    } else if (ext === '.js') {
      stats.jsFiles++;
    } else if (['.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp', '.ico'].includes(ext)) {
      stats.imageFiles++;
    } else {
      stats.otherFiles++;
    }
  }

  /**
   * Finalize package and create ZIP
   */
  async finalizePackage(pkg: ExportPackage): Promise<string> {
    // Generate required files
    const readme = this.generateReadme(pkg);
    await this.addFile(pkg, 'README.md', readme, 'readme');

    const metadata = this.generateMetadata(pkg);
    await this.addFile(pkg, 'metadata.json', metadata, 'config');

    // Generate package.json for static sites
    if (pkg.metadata.exportType === 'static') {
      const packageJson = this.generatePackageJson(pkg);
      await this.addFile(pkg, 'package.json', packageJson, 'config');
    }

    // Generate file tree documentation
    const fileTree = this.generateFileTree(pkg);
    await this.addFile(pkg, 'documentation/FILE-STRUCTURE.md', fileTree, 'documentation');

    // Create ZIP archive
    const zipPath = `${pkg.exportPath}.zip`;
    await this.createZipArchive(pkg.exportPath, zipPath);

    return zipPath;
  }

  /**
   * Create ZIP archive
   */
  private async createZipArchive(sourcePath: string, outputPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const output = fs.createWriteStream(outputPath);
      const archive = archiver('zip', { zlib: { level: 9 } });

      output.on('close', () => resolve());
      archive.on('error', (err) => reject(err));

      archive.pipe(output);
      archive.directory(sourcePath, false);
      archive.finalize();
    });
  }

  /**
   * Format bytes to human-readable string
   */
  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  }

  /**
   * Validate package structure
   */
  validatePackage(pkg: ExportPackage): { valid: boolean; errors: string[]; warnings: string[] } {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check required files
    STANDARD_STRUCTURE.files.filter(f => f.required).forEach(file => {
      if (!pkg.files.has(file.path)) {
        errors.push(`Required file missing: ${file.path}`);
      }
    });

    // Check for empty directories
    STANDARD_STRUCTURE.directories.forEach(dir => {
      const dirPath = path.join(pkg.exportPath, dir);
      try {
        const files = fs.readdirSync(dirPath);
        if (files.length === 0) {
          warnings.push(`Empty directory: ${dir}`);
        }
      } catch (error) {
        errors.push(`Directory not found: ${dir}`);
      }
    });

    // Check metadata completeness
    if (!pkg.metadata.projectName) {
      warnings.push('Project name not set in metadata');
    }

    if (!pkg.metadata.sourceUrl) {
      warnings.push('Source URL not set in metadata');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Get package info
   */
  async getPackageInfo(exportPath: string): Promise<ExportMetadata | null> {
    try {
      const metadataPath = path.join(exportPath, 'metadata.json');
      const content = await fs.promises.readFile(metadataPath, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      return null;
    }
  }

  /**
   * List all exports
   */
  async listExports(): Promise<ExportMetadata[]> {
    try {
      const entries = await fs.promises.readdir(this.outputDir);
      const exports: ExportMetadata[] = [];

      for (const entry of entries) {
        const exportPath = path.join(this.outputDir, entry);
        const stat = await fs.promises.stat(exportPath);

        if (stat.isDirectory()) {
          const metadata = await this.getPackageInfo(exportPath);
          if (metadata) {
            exports.push(metadata);
          }
        }
      }

      return exports.sort((a, b) => b.timestamp - a.timestamp);
    } catch (error) {
      return [];
    }
  }
}

// Export singleton instance
export default new ExportPackageService();
