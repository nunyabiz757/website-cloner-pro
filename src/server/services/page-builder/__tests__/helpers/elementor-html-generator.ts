/**
 * Elementor HTML Generator for Tests
 *
 * Generates complete Elementor-style HTML from recognized components
 * for visual regression testing
 */

import { JSDOM } from 'jsdom';
import { recognizeComponents } from '../../recognizer/component-recognizer.js';
import { exportToElementor } from '../../exporters/elementor-exporter.js';
import type { ElementorWidget } from '../../types/builder.types.js';

/**
 * Generate complete Elementor HTML from original HTML
 *
 * Process:
 * 1. Recognize components from original HTML
 * 2. Export to Elementor format
 * 3. Generate complete HTML document with Elementor styles
 */
export async function generateElementorHTML(originalHTML: string): Promise<string> {
  try {
    // Parse the original HTML
    const dom = new JSDOM(originalHTML);
    const document = dom.window.document;

    // Recognize components
    const components = await recognizeComponents(originalHTML);

    // Export to Elementor format
    const elementorData = await exportToElementor(components);

    // Generate complete HTML document with Elementor structure
    const elementorHTML = generateCompleteElementorDocument(
      elementorData,
      originalHTML,
      document
    );

    return elementorHTML;
  } catch (error) {
    console.error('Error generating Elementor HTML:', error);
    // Fallback to original HTML if conversion fails
    return originalHTML;
  }
}

/**
 * Generate complete Elementor document structure
 */
function generateCompleteElementorDocument(
  elementorData: ElementorWidget[],
  originalHTML: string,
  originalDocument: Document
): string {
  // Extract original styles
  const styles = extractStyles(originalDocument);

  // Generate Elementor widgets HTML
  const widgetsHTML = elementorData
    .map((widget) => generateWidgetHTML(widget))
    .join('\n');

  // Build complete document
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Elementor Page</title>
  <style>
    /* Reset */
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    /* Elementor base styles */
    .elementor {
      width: 100%;
    }

    .elementor-section {
      position: relative;
      width: 100%;
    }

    .elementor-container {
      max-width: 1140px;
      margin: 0 auto;
      padding: 0 15px;
      display: flex;
      flex-wrap: wrap;
    }

    .elementor-column {
      position: relative;
      min-height: 1px;
      display: flex;
      flex-direction: column;
    }

    .elementor-widget {
      position: relative;
      width: 100%;
    }

    /* Original extracted styles */
    ${styles}

    /* Additional Elementor widget styles */
    .elementor-heading-title {
      margin: 0;
      line-height: 1.2;
    }

    .elementor-text-editor {
      line-height: 1.6;
    }

    .elementor-button-wrapper {
      text-align: inherit;
    }

    .elementor-button {
      display: inline-block;
      text-decoration: none;
      transition: all 0.3s;
    }

    .elementor-image {
      max-width: 100%;
      height: auto;
    }

    .elementor-widget-container {
      transition: all 0.3s;
    }
  </style>
</head>
<body>
  <div class="elementor elementor-kit-1">
    ${widgetsHTML}
  </div>
</body>
</html>
  `.trim();
}

/**
 * Extract styles from original document
 */
function extractStyles(document: Document): string {
  const styleElements = document.querySelectorAll('style');
  let combinedStyles = '';

  styleElements.forEach((styleEl) => {
    combinedStyles += styleEl.textContent || '';
    combinedStyles += '\n';
  });

  // Also extract inline styles from elements and convert to CSS
  const elementsWithStyle = document.querySelectorAll('[style]');
  const classStyles: Record<string, string[]> = {};

  elementsWithStyle.forEach((el, index) => {
    const style = el.getAttribute('style');
    const className = el.className || `element-${index}`;

    if (style) {
      if (!classStyles[className]) {
        classStyles[className] = [];
      }
      classStyles[className].push(style);
    }
  });

  // Convert to CSS rules
  Object.entries(classStyles).forEach(([className, styles]) => {
    combinedStyles += `.${className.split(' ')[0]} {\n`;
    styles.forEach((style) => {
      combinedStyles += `  ${style}\n`;
    });
    combinedStyles += '}\n';
  });

  return combinedStyles;
}

/**
 * Generate HTML for an Elementor widget
 */
function generateWidgetHTML(widget: ElementorWidget): string {
  const { widgetType, settings, elements } = widget;

  // Generate widget wrapper
  const widgetClass = `elementor-element elementor-widget elementor-widget-${widgetType}`;
  const widgetId = widget.id || `elementor-${Math.random().toString(36).substr(2, 9)}`;

  let content = '';

  // Generate content based on widget type
  switch (widgetType) {
    case 'heading':
      content = generateHeadingHTML(settings);
      break;

    case 'text-editor':
      content = generateTextEditorHTML(settings);
      break;

    case 'button':
      content = generateButtonHTML(settings);
      break;

    case 'image':
      content = generateImageHTML(settings);
      break;

    case 'section':
      content = generateSectionHTML(settings, elements || []);
      break;

    case 'column':
      content = generateColumnHTML(settings, elements || []);
      break;

    case 'container':
      content = generateContainerHTML(settings, elements || []);
      break;

    case 'spacer':
      content = generateSpacerHTML(settings);
      break;

    case 'divider':
      content = generateDividerHTML(settings);
      break;

    case 'icon':
      content = generateIconHTML(settings);
      break;

    case 'form':
      content = generateFormHTML(settings, elements || []);
      break;

    default:
      content = generateGenericWidgetHTML(widget);
  }

  return `
    <div id="${widgetId}" class="${widgetClass}" data-id="${widgetId}" data-element_type="widget" data-widget_type="${widgetType}">
      <div class="elementor-widget-container">
        ${content}
      </div>
    </div>
  `;
}

/**
 * Generate heading HTML
 */
function generateHeadingHTML(settings: Record<string, any>): string {
  const tag = settings.header_size || settings.tag || 'h2';
  const title = settings.title || settings.text || '';
  const align = settings.align || 'left';

  const style = `
    text-align: ${align};
    ${settings.color ? `color: ${settings.color};` : ''}
    ${settings.typography_font_size ? `font-size: ${settings.typography_font_size};` : ''}
    ${settings.typography_font_weight ? `font-weight: ${settings.typography_font_weight};` : ''}
    ${settings.typography_line_height ? `line-height: ${settings.typography_line_height};` : ''}
  `.trim();

  return `<${tag} class="elementor-heading-title elementor-size-default" style="${style}">${title}</${tag}>`;
}

/**
 * Generate text editor HTML
 */
function generateTextEditorHTML(settings: Record<string, any>): string {
  const content = settings.editor || settings.text || settings.content || '';
  const align = settings.text_align || 'left';

  const style = `
    text-align: ${align};
    ${settings.color ? `color: ${settings.color};` : ''}
    ${settings.typography_font_size ? `font-size: ${settings.typography_font_size};` : ''}
  `.trim();

  return `<div class="elementor-text-editor elementor-clearfix" style="${style}">${content}</div>`;
}

/**
 * Generate button HTML
 */
function generateButtonHTML(settings: Record<string, any>): string {
  const text = settings.text || 'Click here';
  const link = settings.link?.url || settings.url || '#';
  const align = settings.align || 'left';
  const size = settings.size || 'md';

  const style = `
    ${settings.button_background_color || settings.background_color ? `background-color: ${settings.button_background_color || settings.background_color};` : ''}
    ${settings.button_text_color || settings.color ? `color: ${settings.button_text_color || settings.color};` : ''}
    ${settings.border_radius ? `border-radius: ${settings.border_radius};` : ''}
    ${settings.typography_font_size ? `font-size: ${settings.typography_font_size};` : ''}
    padding: ${settings.button_padding || '12px 24px'};
  `.trim();

  return `
    <div class="elementor-button-wrapper" style="text-align: ${align};">
      <a href="${link}" class="elementor-button elementor-size-${size}" role="button" style="${style}">
        <span class="elementor-button-text">${text}</span>
      </a>
    </div>
  `;
}

/**
 * Generate image HTML
 */
function generateImageHTML(settings: Record<string, any>): string {
  const url = settings.image?.url || settings.src || settings.url || '';
  const alt = settings.image?.alt || settings.alt || '';
  const align = settings.align || 'center';

  const style = `
    text-align: ${align};
    ${settings.width ? `width: ${settings.width};` : ''}
    ${settings.height ? `height: ${settings.height};` : ''}
  `.trim();

  return `
    <div style="${style}">
      <img src="${url}" alt="${alt}" class="elementor-image" />
    </div>
  `;
}

/**
 * Generate section HTML
 */
function generateSectionHTML(settings: Record<string, any>, elements: ElementorWidget[]): string {
  const layout = settings.layout || 'boxed';
  const gap = settings.gap || 'default';

  const sectionStyle = `
    ${settings.background_color ? `background-color: ${settings.background_color};` : ''}
    ${settings.background_image ? `background-image: url(${settings.background_image});` : ''}
    ${settings.padding ? `padding: ${settings.padding};` : ''}
    ${settings.margin ? `margin: ${settings.margin};` : ''}
  `.trim();

  const childrenHTML = elements.map((el) => generateWidgetHTML(el)).join('\n');

  return `
    <section class="elementor-section elementor-top-section elementor-element elementor-section-${layout}" style="${sectionStyle}">
      <div class="elementor-container elementor-column-gap-${gap}">
        ${childrenHTML}
      </div>
    </section>
  `;
}

/**
 * Generate column HTML
 */
function generateColumnHTML(settings: Record<string, any>, elements: ElementorWidget[]): string {
  const width = settings._column_size || settings.width || 100;

  const columnStyle = `
    width: ${width}%;
    ${settings.background_color ? `background-color: ${settings.background_color};` : ''}
    ${settings.padding ? `padding: ${settings.padding};` : ''}
  `.trim();

  const childrenHTML = elements.map((el) => generateWidgetHTML(el)).join('\n');

  return `
    <div class="elementor-column elementor-col-${width}" style="${columnStyle}">
      <div class="elementor-widget-wrap elementor-element-populated">
        ${childrenHTML}
      </div>
    </div>
  `;
}

/**
 * Generate container HTML
 */
function generateContainerHTML(settings: Record<string, any>, elements: ElementorWidget[]): string {
  const flexDirection = settings.flex_direction || 'row';
  const gap = settings.flex_gap?.size || settings.gap || '20px';

  const containerStyle = `
    display: flex;
    flex-direction: ${flexDirection};
    gap: ${gap};
    ${settings.background_color ? `background-color: ${settings.background_color};` : ''}
    ${settings.padding ? `padding: ${settings.padding};` : ''}
  `.trim();

  const childrenHTML = elements.map((el) => generateWidgetHTML(el)).join('\n');

  return `
    <div class="elementor-container" style="${containerStyle}">
      ${childrenHTML}
    </div>
  `;
}

/**
 * Generate spacer HTML
 */
function generateSpacerHTML(settings: Record<string, any>): string {
  const size = settings.space?.size || settings.height || '50px';

  return `<div class="elementor-spacer" style="height: ${size};"></div>`;
}

/**
 * Generate divider HTML
 */
function generateDividerHTML(settings: Record<string, any>): string {
  const style = `
    ${settings.color ? `border-color: ${settings.color};` : ''}
    ${settings.weight ? `border-width: ${settings.weight};` : ''}
    ${settings.gap ? `margin: ${settings.gap} 0;` : ''}
    ${settings.width ? `width: ${settings.width};` : ''}
  `.trim();

  return `<hr class="elementor-divider" style="${style}" />`;
}

/**
 * Generate icon HTML
 */
function generateIconHTML(settings: Record<string, any>): string {
  const icon = settings.icon || settings.selected_icon || '★';
  const size = settings.size?.size || settings.icon_size || '50px';
  const color = settings.primary_color || settings.color || '#000';

  const style = `
    font-size: ${size};
    color: ${color};
    ${settings.align ? `text-align: ${settings.align};` : ''}
  `.trim();

  return `<div class="elementor-icon" style="${style}">${icon}</div>`;
}

/**
 * Generate form HTML
 */
function generateFormHTML(settings: Record<string, any>, elements: ElementorWidget[]): string {
  const formStyle = `
    ${settings.row_gap ? `row-gap: ${settings.row_gap};` : ''}
    ${settings.column_gap ? `column-gap: ${settings.column_gap};` : ''}
    ${settings.background_color ? `background-color: ${settings.background_color};` : ''}
    ${settings.padding ? `padding: ${settings.padding};` : ''}
  `.trim();

  const childrenHTML = elements.map((el) => generateWidgetHTML(el)).join('\n');

  return `
    <form class="elementor-form" style="${style}">
      ${childrenHTML}
      <button type="submit" class="elementor-button">Submit</button>
    </form>
  `;
}

/**
 * Generate generic widget HTML (fallback)
 */
function generateGenericWidgetHTML(widget: ElementorWidget): string {
  const { widgetType, settings, elements } = widget;

  const content = settings.content || settings.text || settings.html || '';
  const childrenHTML = elements ? elements.map((el) => generateWidgetHTML(el)).join('\n') : '';

  return `
    <div class="elementor-${widgetType}">
      ${content}
      ${childrenHTML}
    </div>
  `;
}
