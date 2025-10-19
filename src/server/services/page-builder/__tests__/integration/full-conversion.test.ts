/**
 * Integration Tests: Full Conversion Pipeline
 *
 * Tests the end-to-end conversion from HTML to Elementor JSON
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { recognizeComponents } from '../../recognizer/component-recognizer.js';
import { exportToElementor } from '../../exporters/elementor-exporter.js';
import { validateConversion } from '../../validator/index.js';
import type { ElementorWidget } from '../../types/builder.types.js';

describe('Full Conversion Pipeline', () => {
  let sampleHTML: string;

  beforeAll(() => {
    const fixturePath = join(__dirname, '../fixtures/sample-components.html');
    sampleHTML = readFileSync(fixturePath, 'utf-8');
  });

  describe('HTML to Components', () => {
    it('should recognize all major components in sample HTML', () => {
      const components = recognizeComponents(sampleHTML);

      expect(components).toBeDefined();
      expect(components.length).toBeGreaterThan(0);

      // Should recognize various component types
      const componentTypes = components.map(c => c.context);
      expect(components.length).toBeGreaterThan(10); // At least 10 components
    });

    it('should extract styles for all components', () => {
      const components = recognizeComponents(sampleHTML);

      components.forEach(component => {
        expect(component.styles).toBeDefined();
        // At least some style properties should be extracted
      });
    });

    it('should maintain parent-child relationships', () => {
      const components = recognizeComponents(sampleHTML);

      // Find components with children
      const componentsWithChildren = components.filter(c => c.children && c.children.length > 0);

      expect(componentsWithChildren.length).toBeGreaterThan(0);

      // Verify children have proper depth
      componentsWithChildren.forEach(parent => {
        parent.children.forEach(child => {
          expect(child.context.depth).toBe(parent.context.depth + 1);
        });
      });
    });
  });

  describe('Components to Elementor', () => {
    it('should export to valid Elementor JSON structure', () => {
      // Create mock widgets
      const widgets: ElementorWidget[] = [
        {
          id: '1',
          elType: 'widget',
          widgetType: 'heading',
          settings: {
            title: 'Test Heading',
            tag: 'h1',
          },
        },
        {
          id: '2',
          elType: 'widget',
          widgetType: 'text-editor',
          settings: {
            editor: '<p>Test paragraph</p>',
          },
        },
      ];

      const elementorJSON = exportToElementor(widgets, 'Test Page');

      // Verify structure
      expect(elementorJSON).toBeDefined();
      expect(elementorJSON.version).toBeDefined();
      expect(elementorJSON.title).toBe('Test Page');
      expect(elementorJSON.type).toBe('page');
      expect(elementorJSON.content).toBeInstanceOf(Array);
      expect(elementorJSON.content.length).toBeGreaterThan(0);

      // Verify section structure
      const section = elementorJSON.content[0];
      expect(section.elType).toBe('section');
      expect(section.elements).toBeInstanceOf(Array);

      // Verify column structure
      const column = section.elements[0];
      expect(column.elType).toBe('column');
      expect(column.elements).toBeInstanceOf(Array);
      expect(column.elements.length).toBe(2);

      // Verify widgets
      column.elements.forEach(widget => {
        expect(widget.elType).toBe('widget');
        expect(widget.widgetType).toBeDefined();
        expect(widget.settings).toBeDefined();
      });
    });

    it('should include page settings', () => {
      const widgets: ElementorWidget[] = [];
      const elementorJSON = exportToElementor(widgets, 'Test Page', {
        customCSS: 'body { margin: 0; }',
      });

      expect(elementorJSON.page_settings).toBeDefined();
      expect(elementorJSON.page_settings!.post_status).toBe('draft');
      expect(elementorJSON.page_settings!.template).toBeDefined();
    });

    it('should generate unique IDs for all elements', () => {
      const widgets: ElementorWidget[] = [
        {
          id: '1',
          elType: 'widget',
          widgetType: 'heading',
          settings: { title: 'Test 1' },
        },
        {
          id: '2',
          elType: 'widget',
          widgetType: 'heading',
          settings: { title: 'Test 2' },
        },
        {
          id: '3',
          elType: 'widget',
          widgetType: 'heading',
          settings: { title: 'Test 3' },
        },
      ];

      const elementorJSON = exportToElementor(widgets);

      const ids = new Set<string>();

      // Collect all IDs
      elementorJSON.content.forEach(section => {
        ids.add(section.id);
        section.elements.forEach(column => {
          ids.add(column.id);
          column.elements.forEach(widget => {
            ids.add(widget.id);
          });
        });
      });

      // All IDs should be unique
      expect(ids.size).toBe(
        elementorJSON.content.length +
        elementorJSON.content.reduce((acc, s) => acc + s.elements.length, 0) +
        widgets.length
      );
    });
  });

  describe('End-to-End Conversion', () => {
    it('should convert complete HTML page to Elementor', () => {
      // Step 1: Recognize components
      const components = recognizeComponents(sampleHTML);
      expect(components.length).toBeGreaterThan(0);

      // Step 2: Convert to Elementor widgets (simplified for test)
      const widgets: ElementorWidget[] = components.slice(0, 5).map((comp, index) => ({
        id: `widget_${index}`,
        elType: 'widget',
        widgetType: 'text-editor',
        settings: {
          editor: comp.innerHTML || '<p>Content</p>',
        },
      }));

      // Step 3: Export to Elementor JSON
      const elementorJSON = exportToElementor(widgets, 'Converted Page');

      // Verify output
      expect(elementorJSON).toBeDefined();
      expect(elementorJSON.content.length).toBeGreaterThan(0);
      expect(elementorJSON.content[0].elements[0].elements.length).toBeGreaterThan(0);
    });

    it('should preserve component hierarchy in export', () => {
      // Create nested structure
      const nestedWidgets: ElementorWidget[] = [
        {
          id: 'parent',
          elType: 'widget',
          widgetType: 'heading',
          settings: { title: 'Parent' },
        },
      ];

      const elementorJSON = exportToElementor(nestedWidgets);

      // Verify hierarchy is maintained
      expect(elementorJSON.content[0].elType).toBe('section');
      expect(elementorJSON.content[0].elements[0].elType).toBe('column');
      expect(elementorJSON.content[0].elements[0].elements[0].elType).toBe('widget');
    });
  });

  describe('Conversion Quality', () => {
    it('should maintain text content during conversion', () => {
      const html = '<div class="content"><h1>Hello World</h1><p>This is a test paragraph.</p></div>';

      const components = recognizeComponents(html);

      // Find heading and paragraph
      const heading = components.find(c => c.tagName === 'h1');
      const paragraph = components.find(c => c.tagName === 'p');

      expect(heading?.textContent).toContain('Hello World');
      expect(paragraph?.textContent).toContain('This is a test paragraph');
    });

    it('should preserve attributes during conversion', () => {
      const html = '<button id="submit-btn" class="btn btn-primary" data-action="submit">Submit</button>';

      const components = recognizeComponents(html);
      const button = components.find(c => c.tagName === 'button');

      expect(button?.id).toBe('submit-btn');
      expect(button?.classes).toContain('btn');
      expect(button?.classes).toContain('btn-primary');
      expect(button?.attributes['data-action']).toBe('submit');
    });

    it('should handle empty elements gracefully', () => {
      const html = '<div></div>';

      const components = recognizeComponents(html);

      expect(components).toBeDefined();
      expect(components.length).toBeGreaterThanOrEqual(0);
    });

    it('should handle malformed HTML gracefully', () => {
      const malformedHTML = '<div><p>Unclosed paragraph</div>';

      expect(() => {
        recognizeComponents(malformedHTML);
      }).not.toThrow();
    });
  });

  describe('Validation', () => {
    it('should validate converted output structure', async () => {
      const widgets: ElementorWidget[] = [
        {
          id: '1',
          elType: 'widget',
          widgetType: 'heading',
          settings: { title: 'Test' },
        },
      ];

      const elementorJSON = exportToElementor(widgets);

      // Basic structure validation
      expect(elementorJSON.version).toMatch(/^\d+\.\d+\.\d+$/);
      expect(elementorJSON.type).toMatch(/^(page|post|section|widget)$/);
      expect(Array.isArray(elementorJSON.content)).toBe(true);
    });

    it('should export valid JSON', () => {
      const widgets: ElementorWidget[] = [
        {
          id: '1',
          elType: 'widget',
          widgetType: 'text-editor',
          settings: { editor: '<p>Test</p>' },
        },
      ];

      const elementorJSON = exportToElementor(widgets);

      // Should be serializable to JSON
      expect(() => JSON.stringify(elementorJSON)).not.toThrow();

      // Should be parseable
      const jsonString = JSON.stringify(elementorJSON);
      const parsed = JSON.parse(jsonString);

      expect(parsed.version).toBe(elementorJSON.version);
      expect(parsed.title).toBe(elementorJSON.title);
    });
  });

  describe('Error Handling', () => {
    it('should handle missing required fields', () => {
      const widgets: ElementorWidget[] = [];

      const elementorJSON = exportToElementor(widgets);

      // Should still produce valid structure even with no widgets
      expect(elementorJSON).toBeDefined();
      expect(elementorJSON.content).toBeDefined();
      expect(elementorJSON.content.length).toBeGreaterThan(0);
    });

    it('should handle invalid widget types gracefully', () => {
      const widgets: ElementorWidget[] = [
        {
          id: '1',
          elType: 'widget',
          widgetType: 'non-existent-widget',
          settings: {},
        },
      ];

      // Should not throw error
      expect(() => exportToElementor(widgets)).not.toThrow();

      const elementorJSON = exportToElementor(widgets);
      expect(elementorJSON.content[0].elements[0].elements[0].widgetType).toBe('non-existent-widget');
    });
  });
});
