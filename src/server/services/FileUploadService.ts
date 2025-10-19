import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import AdmZip from 'adm-zip';

const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);
const mkdir = promisify(fs.mkdir);
const readdir = promisify(fs.readdir);
const stat = promisify(fs.stat);

export interface UploadedFile {
  filename: string;
  path: string;
  size: number;
  mimetype: string;
}

export interface ProcessedFiles {
  html: string[];
  css: string[];
  js: string[];
  images: string[];
  fonts: string[];
  other: string[];
}

export interface FileUploadResult {
  success: boolean;
  uploadId: string;
  files: ProcessedFiles;
  totalFiles: number;
  totalSize: number;
  extractedPath: string;
}

export class FileUploadService {
  private uploadsDir: string;

  constructor() {
    this.uploadsDir = path.join(process.cwd(), 'uploads');
    this.ensureUploadDirectory();
  }

  /**
   * Ensure upload directory exists
   */
  private async ensureUploadDirectory() {
    try {
      await mkdir(this.uploadsDir, { recursive: true });
    } catch (error) {
      console.error('Failed to create uploads directory:', error);
    }
  }

  /**
   * Generate unique upload ID
   */
  private generateUploadId(): string {
    return `upload_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Process uploaded files
   */
  async processUploadedFiles(files: UploadedFile[]): Promise<FileUploadResult> {
    const uploadId = this.generateUploadId();
    const uploadPath = path.join(this.uploadsDir, uploadId);
    await mkdir(uploadPath, { recursive: true });

    const processedFiles: ProcessedFiles = {
      html: [],
      css: [],
      js: [],
      images: [],
      fonts: [],
      other: [],
    };

    let totalSize = 0;

    for (const file of files) {
      totalSize += file.size;

      // Check if it's a zip file
      if (file.mimetype === 'application/zip' || file.filename.endsWith('.zip')) {
        const extractedFiles = await this.extractZipFile(file.path, uploadPath);
        this.categorizeFiles(extractedFiles, processedFiles);
      } else {
        // Single file upload
        const destPath = path.join(uploadPath, file.filename);
        await fs.promises.copyFile(file.path, destPath);
        this.categorizeFile(file.filename, destPath, processedFiles);
      }
    }

    return {
      success: true,
      uploadId,
      files: processedFiles,
      totalFiles: Object.values(processedFiles).reduce((acc, arr) => acc + arr.length, 0),
      totalSize,
      extractedPath: uploadPath,
    };
  }

  /**
   * Extract zip file
   */
  private async extractZipFile(zipPath: string, destPath: string): Promise<string[]> {
    try {
      const zip = new AdmZip(zipPath);
      zip.extractAllTo(destPath, true);

      // Get all extracted files recursively
      const files = await this.getAllFiles(destPath);
      return files;
    } catch (error) {
      throw new Error(`Failed to extract zip file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get all files recursively from directory
   */
  private async getAllFiles(dirPath: string, arrayOfFiles: string[] = []): Promise<string[]> {
    const files = await readdir(dirPath);

    for (const file of files) {
      const filePath = path.join(dirPath, file);
      const fileStat = await stat(filePath);

      if (fileStat.isDirectory()) {
        arrayOfFiles = await this.getAllFiles(filePath, arrayOfFiles);
      } else {
        arrayOfFiles.push(filePath);
      }
    }

    return arrayOfFiles;
  }

  /**
   * Categorize files by type
   */
  private categorizeFiles(files: string[], processedFiles: ProcessedFiles) {
    for (const file of files) {
      this.categorizeFile(path.basename(file), file, processedFiles);
    }
  }

  /**
   * Categorize single file by extension
   */
  private categorizeFile(filename: string, filepath: string, processedFiles: ProcessedFiles) {
    const ext = path.extname(filename).toLowerCase();

    // Skip system files and directories
    if (filename.startsWith('.') || filename === '__MACOSX') {
      return;
    }

    switch (ext) {
      case '.html':
      case '.htm':
        processedFiles.html.push(filepath);
        break;
      case '.css':
        processedFiles.css.push(filepath);
        break;
      case '.js':
      case '.mjs':
        processedFiles.js.push(filepath);
        break;
      case '.jpg':
      case '.jpeg':
      case '.png':
      case '.gif':
      case '.svg':
      case '.webp':
      case '.avif':
      case '.ico':
        processedFiles.images.push(filepath);
        break;
      case '.woff':
      case '.woff2':
      case '.ttf':
      case '.otf':
      case '.eot':
        processedFiles.fonts.push(filepath);
        break;
      default:
        processedFiles.other.push(filepath);
    }
  }

  /**
   * Read file content
   */
  async readFileContent(filepath: string): Promise<string> {
    try {
      const content = await readFile(filepath, 'utf-8');
      return content;
    } catch (error) {
      throw new Error(`Failed to read file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get file structure for uploaded files
   */
  async getFileStructure(uploadId: string): Promise<any> {
    const uploadPath = path.join(this.uploadsDir, uploadId);

    try {
      const structure = await this.buildFileTree(uploadPath, uploadPath);
      return structure;
    } catch (error) {
      throw new Error(`Failed to get file structure: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Build file tree structure
   */
  private async buildFileTree(dirPath: string, basePath: string): Promise<any> {
    const files = await readdir(dirPath);
    const tree: any[] = [];

    for (const file of files) {
      if (file.startsWith('.') || file === '__MACOSX') continue;

      const filePath = path.join(dirPath, file);
      const fileStat = await stat(filePath);
      const relativePath = path.relative(basePath, filePath);

      if (fileStat.isDirectory()) {
        tree.push({
          name: file,
          type: 'directory',
          path: relativePath,
          children: await this.buildFileTree(filePath, basePath),
        });
      } else {
        tree.push({
          name: file,
          type: 'file',
          path: relativePath,
          size: fileStat.size,
          extension: path.extname(file),
        });
      }
    }

    return tree;
  }

  /**
   * Parse uploaded HTML file and extract resources
   */
  async parseHtmlFile(htmlPath: string): Promise<{
    html: string;
    cssLinks: string[];
    jsLinks: string[];
    imageLinks: string[];
    inlineStyles: string[];
    inlineScripts: string[];
  }> {
    const htmlContent = await this.readFileContent(htmlPath);
    const basePath = path.dirname(htmlPath);

    // Basic regex parsing (in production, use a proper HTML parser like cheerio)
    const cssLinks = this.extractLinks(htmlContent, /<link[^>]+href=["']([^"']+\.css)["']/gi);
    const jsLinks = this.extractLinks(htmlContent, /<script[^>]+src=["']([^"']+\.js)["']/gi);
    const imageLinks = this.extractLinks(htmlContent, /<img[^>]+src=["']([^"']+)["']/gi);

    // Extract inline styles and scripts
    const inlineStyles = this.extractInlineContent(htmlContent, /<style[^>]*>([\s\S]*?)<\/style>/gi);
    const inlineScripts = this.extractInlineContent(htmlContent, /<script[^>]*>([\s\S]*?)<\/script>/gi);

    return {
      html: htmlContent,
      cssLinks,
      jsLinks,
      imageLinks,
      inlineStyles,
      inlineScripts,
    };
  }

  /**
   * Extract links from HTML content
   */
  private extractLinks(html: string, regex: RegExp): string[] {
    const links: string[] = [];
    let match;

    while ((match = regex.exec(html)) !== null) {
      links.push(match[1]);
    }

    return links;
  }

  /**
   * Extract inline content from HTML
   */
  private extractInlineContent(html: string, regex: RegExp): string[] {
    const content: string[] = [];
    let match;

    while ((match = regex.exec(html)) !== null) {
      content.push(match[1].trim());
    }

    return content;
  }

  /**
   * Validate uploaded files
   */
  validateFiles(files: UploadedFile[]): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    const maxFileSize = 100 * 1024 * 1024; // 100MB
    const allowedExtensions = [
      '.html', '.htm', '.css', '.js', '.mjs',
      '.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp', '.avif',
      '.woff', '.woff2', '.ttf', '.otf', '.eot',
      '.zip', '.json', '.xml', '.txt'
    ];

    for (const file of files) {
      // Check file size
      if (file.size > maxFileSize) {
        errors.push(`File ${file.filename} exceeds maximum size of 100MB`);
      }

      // Check file extension
      const ext = path.extname(file.filename).toLowerCase();
      if (!allowedExtensions.includes(ext)) {
        errors.push(`File ${file.filename} has unsupported extension: ${ext}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Clean up old uploads (older than 24 hours)
   */
  async cleanupOldUploads() {
    try {
      const uploads = await readdir(this.uploadsDir);
      const now = Date.now();
      const maxAge = 24 * 60 * 60 * 1000; // 24 hours

      for (const upload of uploads) {
        const uploadPath = path.join(this.uploadsDir, upload);
        const uploadStat = await stat(uploadPath);

        if (uploadStat.isDirectory() && (now - uploadStat.mtimeMs) > maxAge) {
          // Delete old upload directory
          await fs.promises.rm(uploadPath, { recursive: true, force: true });
        }
      }
    } catch (error) {
      console.error('Failed to cleanup old uploads:', error);
    }
  }
}

export default new FileUploadService();
