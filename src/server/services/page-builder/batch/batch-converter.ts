/**
 * Multi-Page Batch Conversion System
 *
 * Handles batch conversion of multiple pages with:
 * - Parallel processing
 * - Progress tracking
 * - Error handling and retry logic
 * - Resource management
 * - Shared style extraction
 */

import { EventEmitter } from 'events';
import pLimit from 'p-limit';
import { recognizeComponents } from '../recognizer/component-recognizer.js';
import { exportToElementor } from '../exporters/elementor-exporter.js';
import { extractStyles } from '../analyzer/style-extractor.js';
import type { ComponentInfo, ElementorExport } from '../types/builder.types.js';

export interface BatchConversionPage {
  id: string;
  url: string;
  html: string;
  title: string;
  metadata?: Record<string, any>;
}

export interface BatchConversionOptions {
  concurrency?: number; // Max parallel conversions (default: 3)
  retryAttempts?: number; // Retry failed conversions (default: 2)
  timeout?: number; // Timeout per page in ms (default: 60000)
  extractSharedStyles?: boolean; // Extract site-wide styles (default: true)
  generateComponentLibrary?: boolean; // Build reusable components (default: true)
  onProgress?: (progress: BatchProgress) => void;
  onPageComplete?: (result: BatchPageResult) => void;
  onError?: (error: BatchError) => void;
}

export interface BatchProgress {
  total: number;
  completed: number;
  failed: number;
  inProgress: number;
  percentage: number;
  currentPage?: string;
}

export interface BatchPageResult {
  pageId: string;
  url: string;
  title: string;
  success: boolean;
  components: ComponentInfo[];
  elementorExport?: ElementorExport;
  error?: string;
  duration: number; // Conversion time in ms
}

export interface BatchConversionResult {
  totalPages: number;
  successCount: number;
  failedCount: number;
  pages: BatchPageResult[];
  sharedStyles?: SharedStyleData;
  componentLibrary?: ComponentLibraryData;
  duration: number; // Total batch duration in ms
  errors: BatchError[];
}

export interface BatchError {
  pageId: string;
  url: string;
  error: string;
  timestamp: Date;
  attempt: number;
}

export interface SharedStyleData {
  colors: string[];
  fonts: string[];
  breakpoints: Record<string, number>;
  commonClasses: string[];
}

export interface ComponentLibraryData {
  components: ComponentInfo[];
  patterns: Record<string, number>; // Component pattern frequency
  reusableTemplates: any[];
}

export class BatchConverter extends EventEmitter {
  private options: Required<BatchConversionOptions>;
  private progress: BatchProgress;
  private errors: BatchError[] = [];
  private results: BatchPageResult[] = [];

  constructor(options: BatchConversionOptions = {}) {
    super();

    this.options = {
      concurrency: options.concurrency || 3,
      retryAttempts: options.retryAttempts || 2,
      timeout: options.timeout || 60000,
      extractSharedStyles: options.extractSharedStyles ?? true,
      generateComponentLibrary: options.generateComponentLibrary ?? true,
      onProgress: options.onProgress || (() => {}),
      onPageComplete: options.onPageComplete || (() => {}),
      onError: options.onError || (() => {}),
    };

    this.progress = {
      total: 0,
      completed: 0,
      failed: 0,
      inProgress: 0,
      percentage: 0,
    };
  }

  /**
   * Convert multiple pages in batch
   */
  async convertPages(pages: BatchConversionPage[]): Promise<BatchConversionResult> {
    const startTime = Date.now();

    this.progress.total = pages.length;
    this.updateProgress();

    // Create concurrency limiter
    const limit = pLimit(this.options.concurrency);

    // Process pages with concurrency control
    const conversionPromises = pages.map(page =>
      limit(() => this.convertPageWithRetry(page))
    );

    // Wait for all conversions to complete
    this.results = await Promise.all(conversionPromises);

    // Extract shared styles if enabled
    let sharedStyles: SharedStyleData | undefined;
    if (this.options.extractSharedStyles) {
      sharedStyles = this.extractSharedStyles(this.results);
    }

    // Generate component library if enabled
    let componentLibrary: ComponentLibraryData | undefined;
    if (this.options.generateComponentLibrary) {
      componentLibrary = this.generateComponentLibrary(this.results);
    }

    const duration = Date.now() - startTime;

    const result: BatchConversionResult = {
      totalPages: pages.length,
      successCount: this.results.filter(r => r.success).length,
      failedCount: this.results.filter(r => !r.success).length,
      pages: this.results,
      sharedStyles,
      componentLibrary,
      duration,
      errors: this.errors,
    };

    this.emit('complete', result);

    return result;
  }

  /**
   * Convert single page with retry logic
   */
  private async convertPageWithRetry(
    page: BatchConversionPage,
    attempt: number = 1
  ): Promise<BatchPageResult> {
    this.progress.inProgress++;
    this.updateProgress(page.title);

    try {
      const result = await this.convertPage(page);

      this.progress.inProgress--;
      this.progress.completed++;
      this.updateProgress();

      this.options.onPageComplete(result);
      this.emit('pageComplete', result);

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      const batchError: BatchError = {
        pageId: page.id,
        url: page.url,
        error: errorMessage,
        timestamp: new Date(),
        attempt,
      };

      this.errors.push(batchError);
      this.options.onError(batchError);
      this.emit('error', batchError);

      // Retry if attempts remaining
      if (attempt < this.options.retryAttempts) {
        console.log(`Retrying page ${page.id} (attempt ${attempt + 1})`);
        this.progress.inProgress--;
        return this.convertPageWithRetry(page, attempt + 1);
      }

      // Mark as failed
      this.progress.inProgress--;
      this.progress.failed++;
      this.updateProgress();

      return {
        pageId: page.id,
        url: page.url,
        title: page.title,
        success: false,
        components: [],
        error: errorMessage,
        duration: 0,
      };
    }
  }

  /**
   * Convert single page
   */
  private async convertPage(page: BatchConversionPage): Promise<BatchPageResult> {
    const startTime = Date.now();

    // Create timeout promise
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Conversion timeout')), this.options.timeout);
    });

    // Race between conversion and timeout
    const conversionPromise = this.performConversion(page);

    const components = await Promise.race([conversionPromise, timeoutPromise]);

    // Export to Elementor
    const elementorExport = exportToElementor(
      components.map(c => this.componentToWidget(c)),
      page.title
    );

    const duration = Date.now() - startTime;

    return {
      pageId: page.id,
      url: page.url,
      title: page.title,
      success: true,
      components,
      elementorExport,
      duration,
    };
  }

  /**
   * Perform the actual conversion
   */
  private async performConversion(page: BatchConversionPage): Promise<ComponentInfo[]> {
    // Recognize components from HTML
    const components = recognizeComponents(page.html);

    return components;
  }

  /**
   * Convert component to Elementor widget (simplified)
   */
  private componentToWidget(component: ComponentInfo): any {
    return {
      id: component.id || `widget_${Math.random().toString(36).substr(2, 9)}`,
      elType: 'widget',
      widgetType: this.mapComponentToWidgetType(component.componentType),
      settings: {
        title: component.textContent?.substring(0, 100) || '',
        editor: component.innerHTML || '',
      },
    };
  }

  /**
   * Map component type to Elementor widget type
   */
  private mapComponentToWidgetType(componentType: string): string {
    const mapping: Record<string, string> = {
      heading: 'heading',
      paragraph: 'text-editor',
      button: 'button',
      image: 'image',
      form: 'form',
      // Add more mappings as needed
    };

    return mapping[componentType] || 'text-editor';
  }

  /**
   * Extract shared styles across all pages
   */
  private extractSharedStyles(results: BatchPageResult[]): SharedStyleData {
    const allColors = new Set<string>();
    const allFonts = new Set<string>();
    const classFrequency = new Map<string, number>();

    for (const result of results) {
      if (!result.success) continue;

      for (const component of result.components) {
        // Extract colors
        if (component.styles) {
          const colorProperties = ['color', 'backgroundColor', 'borderColor'];
          for (const prop of colorProperties) {
            const value = component.styles[prop];
            if (value && typeof value === 'string') {
              allColors.add(value);
            }
          }

          // Extract fonts
          const fontFamily = component.styles.fontFamily;
          if (fontFamily && typeof fontFamily === 'string') {
            allFonts.add(fontFamily);
          }
        }

        // Track class usage
        if (component.className) {
          const classes = component.className.split(' ');
          for (const cls of classes) {
            classFrequency.set(cls, (classFrequency.get(cls) || 0) + 1);
          }
        }
      }
    }

    // Get most common classes (used in 50%+ of pages)
    const threshold = results.length * 0.5;
    const commonClasses = Array.from(classFrequency.entries())
      .filter(([_, count]) => count >= threshold)
      .map(([cls, _]) => cls);

    return {
      colors: Array.from(allColors),
      fonts: Array.from(allFonts),
      breakpoints: {
        mobile: 768,
        tablet: 1024,
        desktop: 1440,
      },
      commonClasses,
    };
  }

  /**
   * Generate component library from all pages
   */
  private generateComponentLibrary(results: BatchPageResult[]): ComponentLibraryData {
    const componentPatterns = new Map<string, number>();
    const allComponents: ComponentInfo[] = [];

    for (const result of results) {
      if (!result.success) continue;

      for (const component of result.components) {
        allComponents.push(component);

        // Track pattern frequency
        const pattern = `${component.componentType}:${component.className || 'default'}`;
        componentPatterns.set(pattern, (componentPatterns.get(pattern) || 0) + 1);
      }
    }

    // Identify reusable components (appear in 30%+ of pages)
    const threshold = results.length * 0.3;
    const reusablePatterns = Array.from(componentPatterns.entries())
      .filter(([_, count]) => count >= threshold)
      .map(([pattern, count]) => ({ pattern, count }));

    return {
      components: allComponents,
      patterns: Object.fromEntries(componentPatterns),
      reusableTemplates: reusablePatterns,
    };
  }

  /**
   * Update progress and emit event
   */
  private updateProgress(currentPage?: string): void {
    this.progress.percentage = this.progress.total > 0
      ? Math.round((this.progress.completed / this.progress.total) * 100)
      : 0;

    if (currentPage) {
      this.progress.currentPage = currentPage;
    }

    this.options.onProgress(this.progress);
    this.emit('progress', this.progress);
  }

  /**
   * Get current progress
   */
  getProgress(): BatchProgress {
    return { ...this.progress };
  }

  /**
   * Get all errors
   */
  getErrors(): BatchError[] {
    return [...this.errors];
  }

  /**
   * Cancel batch conversion
   */
  cancel(): void {
    this.emit('cancelled');
    // Note: Actual cancellation would require implementing abort controllers
  }
}

/**
 * Helper function for simple batch conversion
 */
export async function convertPagesBatch(
  pages: BatchConversionPage[],
  options?: BatchConversionOptions
): Promise<BatchConversionResult> {
  const converter = new BatchConverter(options);
  return converter.convertPages(pages);
}
