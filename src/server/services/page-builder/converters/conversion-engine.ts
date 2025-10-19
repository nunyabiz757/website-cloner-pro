/**
 * Page Builder Conversion Engine
 *
 * Main orchestrator for converting HTML to page builder formats
 */

import { JSDOM } from 'jsdom';
import {
  ConversionOptions,
  ConversionResult,
  RecognizedComponent,
  ComponentType,
  FallbackStrategy,
  ConversionStats,
} from '../types/component.types.js';
import { analyzeElement, recognizeComponent } from '../recognizer/component-recognizer.js';
import { extractStyles } from '../analyzer/style-extractor.js';
import { mapToElementorWidget } from '../mappers/elementor-mapper.js';
import {
  exportToElementor,
  validateElementorExport,
  optimizeElementorExport,
} from '../exporters/elementor-exporter.js';
import { buildHierarchy, extractWidgets, simplifyHierarchy } from './hierarchy-builder.js';

/**
 * Convert HTML to page builder format
 */
export async function convertToPageBuilder(
  html: string,
  options: Partial<ConversionOptions> = {}
): Promise<ConversionResult> {
  const startTime = Date.now();

  // Default options
  const opts: ConversionOptions = {
    targetBuilder: 'elementor',
    preserveCustomCSS: true,
    includeResponsive: false, // MVP: Desktop only
    includeAnimations: false, // MVP: No animations
    optimizeAssets: true,
    minConfidence: 60,
    fallbackToHTML: true,
    ...options,
  };

  try {
    // Step 1: Parse HTML
    const dom = new JSDOM(html);
    const document = dom.window.document;

    // Step 2: Build hierarchy
    console.log('Building component hierarchy...');
    const hierarchy = buildHierarchy(html);
    const simplifiedHierarchy = simplifyHierarchy(hierarchy);

    // Step 3: Recognize all components
    console.log('Recognizing components...');
    const recognizedComponents: RecognizedComponent[] = [];
    const fallbacks: FallbackStrategy[] = [];
    let totalElements = 0;

    function processNode(elements: Element[]): void {
      for (const element of elements) {
        totalElements++;

        const analyzed = analyzeElement(element);
        const styles = extractStyles(element.outerHTML);
        const recognition = recognizeComponent(element, styles, analyzed.context);

        const component: RecognizedComponent = {
          id: `comp_${totalElements}`,
          componentType: recognition.componentType,
          recognition,
          element: analyzed,
          props: extractComponentProps(analyzed),
          children: [],
        };

        recognizedComponents.push(component);

        // Check if needs fallback
        if (recognition.confidence < opts.minConfidence && opts.fallbackToHTML) {
          fallbacks.push({
            strategy: 'html-widget',
            reason: `Low confidence (${recognition.confidence}%)`,
            originalHTML: element.outerHTML,
            suggestions: [
              'Review component manually',
              'Adjust in page builder after import',
            ],
            alternativeComponentType: recognition.fallbackType,
          });
        }

        // Recursively process children
        const children = Array.from(element.children);
        if (children.length > 0) {
          processNode(children as Element[]);
        }
      }
    }

    const bodyChildren = Array.from(document.body.children);
    processNode(bodyChildren as Element[]);

    // Step 4: Map to target builder (Elementor for MVP)
    console.log('Mapping to Elementor widgets...');
    const widgets = recognizedComponents
      .filter((comp) => comp.recognition.confidence >= opts.minConfidence)
      .map((comp, index) => mapToElementorWidget(comp, index));

    // Step 5: Generate export
    console.log('Generating Elementor export...');
    let exportData = exportToElementor(widgets, 'Converted Page');

    // Step 6: Validate
    const validation = validateElementorExport(exportData);

    // Step 7: Optimize
    if (opts.optimizeAssets) {
      exportData = optimizeElementorExport(exportData);
    }

    // Step 8: Calculate stats
    const confidences = recognizedComponents.map((c) => c.recognition.confidence);
    const avgConfidence =
      confidences.length > 0
        ? confidences.reduce((a, b) => a + b, 0) / confidences.length
        : 0;

    const stats: ConversionStats = {
      totalElements,
      recognizedComponents: recognizedComponents.length,
      nativeWidgets: widgets.length,
      htmlFallbacks: fallbacks.length,
      manualReview: recognizedComponents.filter((c) => c.recognition.manualReviewNeeded).length,
      conversionTime: Date.now() - startTime,
      confidenceAverage: Math.round(avgConfidence),
    };

    console.log('✅ Conversion complete!');
    console.log(`   Total elements: ${stats.totalElements}`);
    console.log(`   Recognized: ${stats.recognizedComponents}`);
    console.log(`   Native widgets: ${stats.nativeWidgets}`);
    console.log(`   Fallbacks: ${stats.htmlFallbacks}`);
    console.log(`   Avg confidence: ${stats.confidenceAverage}%`);
    console.log(`   Time: ${stats.conversionTime}ms`);

    return {
      success: true,
      builder: opts.targetBuilder,
      exportData,
      components: recognizedComponents,
      hierarchy: simplifiedHierarchy,
      fallbacks,
      validation,
      stats,
    };
  } catch (error) {
    console.error('Conversion failed:', error);

    return {
      success: false,
      builder: opts.targetBuilder,
      exportData: null,
      components: [],
      hierarchy: [],
      fallbacks: [],
      validation: {
        isValid: false,
        errors: [
          {
            type: 'conversion_error',
            message: error instanceof Error ? error.message : 'Unknown error',
            component: 'root',
            severity: 'critical',
          },
        ],
        warnings: [],
        suggestions: ['Check HTML format', 'Ensure valid markup'],
      },
      stats: {
        totalElements: 0,
        recognizedComponents: 0,
        nativeWidgets: 0,
        htmlFallbacks: 0,
        manualReview: 0,
        conversionTime: Date.now() - startTime,
        confidenceAverage: 0,
      },
    };
  }
}

/**
 * Extract component props from analyzed element
 */
function extractComponentProps(analyzed: any): Record<string, any> {
  return {
    textContent: analyzed.textContent,
    innerHTML: analyzed.innerHTML,
    href: analyzed.attributes.href,
    src: analyzed.attributes.src,
    alt: analyzed.attributes.alt,
    target: analyzed.attributes.target,
    title: analyzed.attributes.title,
  };
}

/**
 * Convert specific page from crawl result
 */
export async function convertCrawledPage(
  pageHTML: string,
  options: Partial<ConversionOptions> = {}
): Promise<ConversionResult> {
  return convertToPageBuilder(pageHTML, options);
}

/**
 * Batch convert multiple pages
 */
export async function convertMultiplePages(
  pages: Array<{ html: string; title: string }>,
  options: Partial<ConversionOptions> = {}
): Promise<ConversionResult[]> {
  const results: ConversionResult[] = [];

  for (const page of pages) {
    console.log(`Converting page: ${page.title}`);
    const result = await convertToPageBuilder(page.html, options);
    results.push(result);
  }

  return results;
}
