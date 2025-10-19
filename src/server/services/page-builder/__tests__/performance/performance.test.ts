/**
 * Performance Benchmark Tests
 *
 * Tests the performance characteristics of the conversion system:
 * - Component recognition speed
 * - Export generation time
 * - Memory usage
 * - Large file handling
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { performance } from 'perf_hooks';
import { recognizeComponents } from '../../recognizer/component-recognizer.js';
import { exportToElementor } from '../../exporters/elementor-exporter.js';
import type { ElementorWidget } from '../../types/builder.types.js';

describe('Performance Benchmarks', () => {
  let sampleHTML: string;
  let largeHTML: string;

  beforeAll(() => {
    // Load sample fixture
    const fixturePath = join(__dirname, '../fixtures/sample-components.html');
    sampleHTML = readFileSync(fixturePath, 'utf-8');

    // Generate large HTML for stress testing
    largeHTML = generateLargeHTML(1000); // 1000 components
  });

  describe('Component Recognition Performance', () => {
    it('should recognize components in small HTML quickly', () => {
      const smallHTML = '<div><h1>Title</h1><p>Paragraph</p><button>Click</button></div>';

      const startTime = performance.now();
      const components = recognizeComponents(smallHTML);
      const endTime = performance.now();

      const duration = endTime - startTime;

      expect(components.length).toBeGreaterThan(0);
      expect(duration).toBeLessThan(50); // Should complete in under 50ms
    });

    it('should recognize components in medium HTML efficiently', () => {
      const startTime = performance.now();
      const components = recognizeComponents(sampleHTML);
      const endTime = performance.now();

      const duration = endTime - startTime;

      expect(components.length).toBeGreaterThan(10);
      expect(duration).toBeLessThan(500); // Should complete in under 500ms
    });

    it('should handle large HTML files within reasonable time', () => {
      const startTime = performance.now();
      const components = recognizeComponents(largeHTML);
      const endTime = performance.now();

      const duration = endTime - startTime;

      expect(components.length).toBeGreaterThan(100);
      expect(duration).toBeLessThan(5000); // Should complete in under 5 seconds
    }, 10000);

    it('should maintain consistent performance across multiple runs', () => {
      const durations: number[] = [];

      // Run 10 times
      for (let i = 0; i < 10; i++) {
        const startTime = performance.now();
        recognizeComponents(sampleHTML);
        const endTime = performance.now();
        durations.push(endTime - startTime);
      }

      const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
      const maxDuration = Math.max(...durations);
      const minDuration = Math.min(...durations);

      // Variance should be reasonable (max shouldn't be more than 3x min)
      expect(maxDuration / minDuration).toBeLessThan(3);
      expect(avgDuration).toBeLessThan(500);
    });
  });

  describe('Export Generation Performance', () => {
    it('should generate Elementor JSON quickly for small widget set', () => {
      const widgets: ElementorWidget[] = [
        {
          id: '1',
          elType: 'widget',
          widgetType: 'heading',
          settings: { title: 'Test' },
        },
        {
          id: '2',
          elType: 'widget',
          widgetType: 'text-editor',
          settings: { editor: '<p>Test</p>' },
        },
      ];

      const startTime = performance.now();
      const elementorJSON = exportToElementor(widgets);
      const endTime = performance.now();

      const duration = endTime - startTime;

      expect(elementorJSON).toBeDefined();
      expect(duration).toBeLessThan(50); // Should complete in under 50ms
    });

    it('should generate Elementor JSON efficiently for medium widget set', () => {
      const widgets: ElementorWidget[] = [];

      // Create 50 widgets
      for (let i = 0; i < 50; i++) {
        widgets.push({
          id: `widget_${i}`,
          elType: 'widget',
          widgetType: 'text-editor',
          settings: {
            editor: `<p>Widget ${i} content</p>`,
          },
        });
      }

      const startTime = performance.now();
      const elementorJSON = exportToElementor(widgets);
      const endTime = performance.now();

      const duration = endTime - startTime;

      expect(elementorJSON.content.length).toBeGreaterThan(0);
      expect(duration).toBeLessThan(200); // Should complete in under 200ms
    });

    it('should handle large widget sets within reasonable time', () => {
      const widgets: ElementorWidget[] = [];

      // Create 500 widgets
      for (let i = 0; i < 500; i++) {
        widgets.push({
          id: `widget_${i}`,
          elType: 'widget',
          widgetType: 'text-editor',
          settings: {
            editor: `<p>Widget ${i} with more content to simulate real-world usage</p>`,
          },
        });
      }

      const startTime = performance.now();
      const elementorJSON = exportToElementor(widgets);
      const endTime = performance.now();

      const duration = endTime - startTime;

      expect(elementorJSON.content.length).toBeGreaterThan(0);
      expect(duration).toBeLessThan(2000); // Should complete in under 2 seconds
    }, 5000);
  });

  describe('End-to-End Pipeline Performance', () => {
    it('should complete full conversion quickly for small pages', () => {
      const html = `
        <div class="page">
          <h1>Welcome</h1>
          <p>This is a simple page with minimal content.</p>
          <button class="btn">Click Me</button>
        </div>
      `;

      const startTime = performance.now();

      // Step 1: Recognize components
      const components = recognizeComponents(html);

      // Step 2: Convert to widgets (simplified)
      const widgets: ElementorWidget[] = components.slice(0, 3).map((comp, idx) => ({
        id: `widget_${idx}`,
        elType: 'widget',
        widgetType: 'text-editor',
        settings: { editor: comp.innerHTML || '<p>Content</p>' },
      }));

      // Step 3: Export to Elementor
      const elementorJSON = exportToElementor(widgets);

      const endTime = performance.now();
      const duration = endTime - startTime;

      expect(elementorJSON).toBeDefined();
      expect(duration).toBeLessThan(100); // Full pipeline under 100ms
    });

    it('should complete full conversion efficiently for medium pages', () => {
      const startTime = performance.now();

      // Step 1: Recognize components
      const components = recognizeComponents(sampleHTML);

      // Step 2: Convert to widgets
      const widgets: ElementorWidget[] = components.slice(0, 20).map((comp, idx) => ({
        id: `widget_${idx}`,
        elType: 'widget',
        widgetType: 'text-editor',
        settings: { editor: comp.innerHTML || '<p>Content</p>' },
      }));

      // Step 3: Export to Elementor
      const elementorJSON = exportToElementor(widgets);

      const endTime = performance.now();
      const duration = endTime - startTime;

      expect(elementorJSON).toBeDefined();
      expect(duration).toBeLessThan(1000); // Full pipeline under 1 second
    });
  });

  describe('Memory Usage', () => {
    it('should not leak memory during repeated conversions', () => {
      const initialMemory = process.memoryUsage().heapUsed;

      // Perform 100 conversions
      for (let i = 0; i < 100; i++) {
        const components = recognizeComponents(sampleHTML);
        const widgets: ElementorWidget[] = components.slice(0, 5).map((comp, idx) => ({
          id: `widget_${idx}`,
          elType: 'widget',
          widgetType: 'text-editor',
          settings: { editor: comp.innerHTML || '<p>Content</p>' },
        }));
        exportToElementor(widgets);
      }

      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;

      // Memory increase should be reasonable (less than 50MB)
      expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024);
    }, 15000);

    it('should handle large files without excessive memory usage', () => {
      const initialMemory = process.memoryUsage().heapUsed;

      recognizeComponents(largeHTML);

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;

      // Should not use more than 100MB for large file
      expect(memoryIncrease).toBeLessThan(100 * 1024 * 1024);
    }, 10000);
  });

  describe('Scalability Tests', () => {
    it('should scale linearly with input size', () => {
      const sizes = [100, 200, 400, 800];
      const durations: number[] = [];

      for (const size of sizes) {
        const html = generateLargeHTML(size);

        const startTime = performance.now();
        recognizeComponents(html);
        const endTime = performance.now();

        durations.push(endTime - startTime);
      }

      // Each doubling of size should not more than double the time
      for (let i = 1; i < durations.length; i++) {
        const ratio = durations[i] / durations[i - 1];
        expect(ratio).toBeLessThan(2.5); // Allow some overhead
      }
    }, 20000);

    it('should handle deeply nested structures efficiently', () => {
      const deepHTML = generateDeeplyNestedHTML(20); // 20 levels deep

      const startTime = performance.now();
      const components = recognizeComponents(deepHTML);
      const endTime = performance.now();

      const duration = endTime - startTime;

      expect(components.length).toBeGreaterThan(0);
      expect(duration).toBeLessThan(1000);
    });
  });

  describe('Concurrent Processing', () => {
    it('should handle multiple conversions concurrently', async () => {
      const startTime = performance.now();

      // Run 5 conversions in parallel
      const promises = Array.from({ length: 5 }, async (_, i) => {
        return new Promise<void>(resolve => {
          const components = recognizeComponents(sampleHTML);
          const widgets: ElementorWidget[] = components.slice(0, 10).map((comp, idx) => ({
            id: `widget_${i}_${idx}`,
            elType: 'widget',
            widgetType: 'text-editor',
            settings: { editor: comp.innerHTML || '<p>Content</p>' },
          }));
          exportToElementor(widgets);
          resolve();
        });
      });

      await Promise.all(promises);

      const endTime = performance.now();
      const duration = endTime - startTime;

      // Should complete faster than running sequentially
      expect(duration).toBeLessThan(3000); // 5 conversions in under 3 seconds
    }, 5000);
  });

  describe('Optimization Benchmarks', () => {
    it('should efficiently handle repeated identical inputs (caching)', () => {
      const html = '<div class="card"><h3>Title</h3><p>Content</p></div>';

      // First run (cold)
      const startTime1 = performance.now();
      recognizeComponents(html);
      const endTime1 = performance.now();
      const duration1 = endTime1 - startTime1;

      // Second run (potentially cached)
      const startTime2 = performance.now();
      recognizeComponents(html);
      const endTime2 = performance.now();
      const duration2 = endTime2 - startTime2;

      // Second run should be at least as fast (or potentially faster with caching)
      expect(duration2).toBeLessThanOrEqual(duration1 * 1.5); // Allow 50% variance
    });

    it('should efficiently skip empty or whitespace-only elements', () => {
      const htmlWithWhitespace = `
        <div>


          <p>Content</p>


          <span>More content</span>


        </div>
      `;

      const startTime = performance.now();
      const components = recognizeComponents(htmlWithWhitespace);
      const endTime = performance.now();

      const duration = endTime - startTime;

      // Should be fast despite extra whitespace
      expect(duration).toBeLessThan(100);
      expect(components.length).toBeGreaterThan(0);
    });
  });
});

/**
 * Helper function to generate large HTML for stress testing
 */
function generateLargeHTML(componentCount: number): string {
  const components: string[] = [];

  for (let i = 0; i < componentCount; i++) {
    const componentType = i % 5;

    switch (componentType) {
      case 0:
        components.push(`<h2>Heading ${i}</h2>`);
        break;
      case 1:
        components.push(`<p>This is paragraph ${i} with some sample text content.</p>`);
        break;
      case 2:
        components.push(`<button class="btn btn-primary">Button ${i}</button>`);
        break;
      case 3:
        components.push(`
          <div class="card">
            <h3>Card ${i}</h3>
            <p>Card description ${i}</p>
            <a href="#" class="btn">Read More</a>
          </div>
        `);
        break;
      case 4:
        components.push(`
          <form>
            <input type="text" name="field_${i}" placeholder="Input ${i}">
            <button type="submit">Submit ${i}</button>
          </form>
        `);
        break;
    }
  }

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Large Test Page</title>
      <style>
        .card { border: 1px solid #ddd; padding: 20px; margin: 10px; }
        .btn { padding: 10px 20px; background: #007bff; color: white; border: none; }
      </style>
    </head>
    <body>
      <div class="container">
        ${components.join('\n')}
      </div>
    </body>
    </html>
  `;
}

/**
 * Helper function to generate deeply nested HTML
 */
function generateDeeplyNestedHTML(depth: number): string {
  let html = '';
  let closing = '';

  for (let i = 0; i < depth; i++) {
    html += `<div class="level-${i}">`;
    closing = `</div>` + closing;
  }

  html += `<p>Deeply nested content</p>`;
  html += closing;

  return `
    <!DOCTYPE html>
    <html>
    <body>
      ${html}
    </body>
    </html>
  `;
}
