/**
 * Elementor JSON Exporter
 *
 * Generates valid Elementor JSON export format from recognized components
 *
 * Features:
 * - Advanced widget settings (icon picker, gallery, slider)
 * - Responsive settings per widget
 * - Hover effects export
 * - Motion effects and animations
 * - Custom CSS per element
 * - Global colors and fonts
 * - Dynamic content support
 */

import {
  ElementorExport,
  ElementorSection,
  ElementorColumn,
  ElementorWidget,
  ElementorPageSettings,
} from '../types/builder.types.js';
import { ComponentHierarchy } from '../types/component.types.js';
import {
  createAdvancedWidget,
  createPageSettings,
  createIconWidgetSettings,
  createGalleryWidgetSettings,
  createCarouselWidgetSettings,
  resetGlobalRegistries,
} from './elementor-advanced-exporter.js';

/**
 * Export components to Elementor JSON format with advanced features
 */
export function exportToElementor(
  widgets: ElementorWidget[],
  title: string = 'Imported Page',
  options?: {
    customCSS?: string;
    useGlobals?: boolean;
  }
): ElementorExport {
  // Reset global registries for fresh export
  if (options?.useGlobals !== false) {
    resetGlobalRegistries();
  }

  // Create a simple single-column layout for MVP
  const section: ElementorSection = {
    id: generateId(),
    elType: 'section',
    settings: {
      layout: 'boxed',
      content_width: { size: 1140, unit: 'px' },
      gap: 'default',
      height: 'default',
      structure: '10', // Single column
    },
    elements: [
      {
        id: generateId(),
        elType: 'column',
        settings: {
          _column_size: 100, // Full width
        },
        elements: widgets,
      },
    ],
  };

  // Create page settings with global colors/fonts
  const pageSettings = createPageSettings(options?.customCSS);

  return {
    version: '3.16.0',
    title,
    type: 'page',
    content: [section],
    page_settings: pageSettings,
  };
}

/**
 * Export with hierarchy (advanced)
 */
export function exportToElementorWithHierarchy(
  hierarchy: ComponentHierarchy[],
  title: string = 'Imported Page'
): ElementorExport {
  const sections: ElementorSection[] = hierarchy.map((node) => {
    if (node.type === 'section') {
      return createSection(node);
    } else {
      // Wrap non-section nodes in a default section
      return createDefaultSection([node]);
    }
  });

  return {
    version: '3.16.0',
    title,
    type: 'page',
    content: sections,
    page_settings: {
      post_status: 'draft',
      template: 'default',
    },
  };
}

/**
 * Create Elementor section from hierarchy node
 */
function createSection(node: ComponentHierarchy): ElementorSection {
  const columns: ElementorColumn[] = [];

  // Check if node has column children
  const columnChildren = node.children.filter((c) => c.type === 'column');

  if (columnChildren.length > 0) {
    // Multi-column layout
    const columnSize = Math.floor(100 / columnChildren.length);

    for (const columnNode of columnChildren) {
      columns.push({
        id: generateId(),
        elType: 'column',
        settings: {
          _column_size: columnSize,
          background_color: node.styles.backgroundColor,
        },
        elements: columnNode.children
          .filter((c) => c.type === 'widget')
          .map((c) => createWidgetFromNode(c)),
      });
    }
  } else {
    // Single column - all widgets directly
    columns.push({
      id: generateId(),
      elType: 'column',
      settings: {
        _column_size: 100,
      },
      elements: node.children
        .filter((c) => c.type === 'widget')
        .map((c) => createWidgetFromNode(c)),
    });
  }

  return {
    id: generateId(),
    elType: 'section',
    settings: {
      layout: 'boxed',
      gap: 'default',
      background_background: node.styles.backgroundColor ? 'classic' : undefined,
      background_color: node.styles.backgroundColor,
      background_image: node.styles.backgroundImage
        ? { url: node.styles.backgroundImage, id: '' }
        : undefined,
      padding: node.styles.padding
        ? {
            top: parseInt(node.styles.padding.top) || 0,
            right: parseInt(node.styles.padding.right) || 0,
            bottom: parseInt(node.styles.padding.bottom) || 0,
            left: parseInt(node.styles.padding.left) || 0,
            unit: 'px',
          }
        : undefined,
    },
    elements: columns,
  };
}

/**
 * Create default section wrapper
 */
function createDefaultSection(nodes: ComponentHierarchy[]): ElementorSection {
  const widgets = nodes
    .filter((n) => n.type === 'widget')
    .map((n) => createWidgetFromNode(n));

  return {
    id: generateId(),
    elType: 'section',
    settings: {
      layout: 'boxed',
      gap: 'default',
    },
    elements: [
      {
        id: generateId(),
        elType: 'column',
        settings: {
          _column_size: 100,
        },
        elements: widgets,
      },
    ],
  };
}

/**
 * Create widget from hierarchy node
 */
function createWidgetFromNode(node: ComponentHierarchy): ElementorWidget {
  // This is a simplified version - in reality, we'd use the full mapper
  return {
    id: generateId(),
    elType: 'widget',
    widgetType: mapComponentTypeToWidget(node.componentType),
    settings: {
      ...node.props,
    },
  };
}

/**
 * Map component type to Elementor widget type
 */
function mapComponentTypeToWidget(componentType: string): string {
  const map: Record<string, string> = {
    button: 'button',
    heading: 'heading',
    text: 'text-editor',
    paragraph: 'text-editor',
    image: 'image',
    icon: 'icon',
    spacer: 'spacer',
    divider: 'divider',
    video: 'video',
  };

  return map[componentType] || 'html'; // Fallback to HTML widget
}

/**
 * Generate unique ID
 */
let idCounter = 1000;
function generateId(): string {
  return (idCounter++).toString(16);
}

/**
 * Validate Elementor export
 */
export function validateElementorExport(exportData: ElementorExport): {
  isValid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!exportData.version) {
    errors.push('Missing version');
  }

  if (!exportData.content || exportData.content.length === 0) {
    errors.push('No content sections');
  }

  for (const section of exportData.content || []) {
    if (section.elType !== 'section') {
      errors.push(`Invalid section type: ${section.elType}`);
    }

    if (!section.elements || section.elements.length === 0) {
      errors.push(`Section ${section.id} has no columns`);
    }

    for (const column of section.elements || []) {
      if (column.elType !== 'column') {
        errors.push(`Invalid column type: ${column.elType}`);
      }
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Optimize export (remove empty widgets, merge similar sections, etc.)
 */
export function optimizeElementorExport(exportData: ElementorExport): ElementorExport {
  // Remove empty sections
  const optimized = {
    ...exportData,
    content: exportData.content.filter((section) => {
      return section.elements.some((column) => column.elements.length > 0);
    }),
  };

  // Remove empty columns
  optimized.content = optimized.content.map((section) => ({
    ...section,
    elements: section.elements.filter((column) => column.elements.length > 0),
  }));

  return optimized;
}

/**
 * Export advanced functions for direct use
 */
export {
  createAdvancedWidget,
  createPageSettings,
  createIconWidgetSettings,
  createGalleryWidgetSettings,
  createCarouselWidgetSettings,
  resetGlobalRegistries,
  registerGlobalColor,
  registerGlobalFont,
  getGlobalColorsCount,
  getGlobalFontsCount,
} from './elementor-advanced-exporter.js';
