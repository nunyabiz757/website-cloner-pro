/**
 * Edge Case Tests
 *
 * Tests unusual scenarios and edge cases:
 * - Malformed HTML
 * - Special characters and Unicode
 * - Extremely large files
 * - Deeply nested structures
 * - Empty elements
 * - Custom web components
 * - Shadow DOM
 * - Invalid attributes
 * - Missing required data
 */

import { describe, it, expect } from 'vitest';
import { JSDOM } from 'jsdom';
import { recognizeComponents } from '../../recognizer/component-recognizer.js';
import { exportToElementor } from '../../exporters/elementor-exporter.js';
import { extractStyles } from '../../analyzer/style-extractor.js';
import type { ElementorWidget } from '../../types/builder.types.js';

describe('Edge Case Tests', () => {
  describe('Malformed HTML', () => {
    it('should handle unclosed tags gracefully', () => {
      const malformedHTML = `
        <div>
          <p>Unclosed paragraph
          <span>Unclosed span
        </div>
      `;

      expect(() => {
        recognizeComponents(malformedHTML);
      }).not.toThrow();

      const components = recognizeComponents(malformedHTML);
      expect(components).toBeDefined();
    });

    it('should handle mismatched tags', () => {
      const malformedHTML = `
        <div>
          <span>Content</div>
        </span>
      `;

      expect(() => {
        recognizeComponents(malformedHTML);
      }).not.toThrow();
    });

    it('should handle tags without closing angle bracket', () => {
      const malformedHTML = '<div class="test<p>Content</p></div>';

      expect(() => {
        recognizeComponents(malformedHTML);
      }).not.toThrow();
    });

    it('should handle duplicate attributes', () => {
      const html = '<div class="first" class="second" id="test" id="duplicate">Content</div>';

      expect(() => {
        recognizeComponents(html);
      }).not.toThrow();

      const components = recognizeComponents(html);
      expect(components.length).toBeGreaterThan(0);
    });

    it('should handle invalid attribute values', () => {
      const html = '<div style="color: rgb(256, 300, -10);">Content</div>';

      expect(() => {
        recognizeComponents(html);
      }).not.toThrow();
    });
  });

  describe('Special Characters and Unicode', () => {
    it('should handle emoji in content', () => {
      const html = '<div><h1>Welcome 👋</h1><p>Hello 🌍 World 🚀</p></div>';

      const components = recognizeComponents(html);

      const heading = components.find(c => c.tagName === 'h1');
      expect(heading?.textContent).toContain('👋');

      const paragraph = components.find(c => c.tagName === 'p');
      expect(paragraph?.textContent).toContain('🌍');
      expect(paragraph?.textContent).toContain('🚀');
    });

    it('should handle special characters in attributes', () => {
      const html = '<div data-text="Hello & goodbye" data-quote=\'She said "hi"\'>Content</div>';

      expect(() => {
        recognizeComponents(html);
      }).not.toThrow();

      const components = recognizeComponents(html);
      expect(components.length).toBeGreaterThan(0);
    });

    it('should handle Unicode characters', () => {
      const html = `
        <div>
          <p>Chinese: 你好世界</p>
          <p>Arabic: مرحبا بالعالم</p>
          <p>Russian: Привет мир</p>
          <p>Japanese: こんにちは世界</p>
        </div>
      `;

      const components = recognizeComponents(html);
      const paragraphs = components.filter(c => c.tagName === 'p');

      expect(paragraphs.length).toBeGreaterThanOrEqual(4);
      expect(paragraphs.some(p => p.textContent?.includes('你好世界'))).toBe(true);
      expect(paragraphs.some(p => p.textContent?.includes('مرحبا'))).toBe(true);
    });

    it('should handle HTML entities', () => {
      const html = '<div>&lt;div&gt; &amp; &quot;quotes&quot; &copy; 2024</div>';

      const components = recognizeComponents(html);
      expect(components.length).toBeGreaterThan(0);
    });

    it('should handle zero-width characters', () => {
      const html = '<div>Content\u200B\u200C\u200D with zero-width characters</div>';

      expect(() => {
        recognizeComponents(html);
      }).not.toThrow();
    });
  });

  describe('Empty and Minimal Elements', () => {
    it('should handle completely empty elements', () => {
      const html = '<div></div><span></span><p></p>';

      const components = recognizeComponents(html);
      expect(components).toBeDefined();
    });

    it('should handle elements with only whitespace', () => {
      const html = `
        <div>   </div>
        <p>

        </p>
        <span>	</span>
      `;

      const components = recognizeComponents(html);
      expect(components).toBeDefined();
    });

    it('should handle self-closing tags', () => {
      const html = `
        <img src="test.jpg" />
        <br />
        <hr />
        <input type="text" />
      `;

      const components = recognizeComponents(html);
      expect(components.length).toBeGreaterThan(0);
    });

    it('should handle empty document', () => {
      const html = '';

      expect(() => {
        recognizeComponents(html);
      }).not.toThrow();

      const components = recognizeComponents(html);
      expect(components).toBeDefined();
    });

    it('should handle document with only comments', () => {
      const html = '<!-- Comment 1 --><!-- Comment 2 --><!-- Comment 3 -->';

      expect(() => {
        recognizeComponents(html);
      }).not.toThrow();
    });
  });

  describe('Deeply Nested Structures', () => {
    it('should handle very deep nesting (50 levels)', () => {
      let html = '';
      let closing = '';

      for (let i = 0; i < 50; i++) {
        html += `<div class="level-${i}">`;
        closing = '</div>' + closing;
      }

      html += 'Deep content';
      html += closing;

      expect(() => {
        recognizeComponents(html);
      }).not.toThrow();

      const components = recognizeComponents(html);
      expect(components.length).toBeGreaterThan(0);
    });

    it('should handle extremely deep nesting (100 levels)', () => {
      let html = '';
      let closing = '';

      for (let i = 0; i < 100; i++) {
        html += `<div>`;
        closing = '</div>' + closing;
      }

      html += 'Content';
      html += closing;

      expect(() => {
        recognizeComponents(html);
      }).not.toThrow();
    }, 10000);

    it('should maintain correct depth tracking in deep structures', () => {
      const html = `
        <div>
          <div>
            <div>
              <div>
                <div>
                  <p>Deep paragraph</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      `;

      const components = recognizeComponents(html);
      const paragraph = components.find(c => c.tagName === 'p');

      expect(paragraph).toBeDefined();
      expect(paragraph?.context.depth).toBeGreaterThan(0);
    });
  });

  describe('Very Large Content', () => {
    it('should handle elements with very long text content', () => {
      const longText = 'A'.repeat(100000); // 100k characters
      const html = `<div><p>${longText}</p></div>`;

      expect(() => {
        recognizeComponents(html);
      }).not.toThrow();

      const components = recognizeComponents(html);
      expect(components.length).toBeGreaterThan(0);
    }, 10000);

    it('should handle elements with many attributes', () => {
      const attributes = Array.from({ length: 100 }, (_, i) => `data-attr-${i}="value-${i}"`).join(' ');
      const html = `<div ${attributes}>Content</div>`;

      expect(() => {
        recognizeComponents(html);
      }).not.toThrow();
    });

    it('should handle very long attribute values', () => {
      const longValue = 'x'.repeat(10000);
      const html = `<div data-long="${longValue}">Content</div>`;

      expect(() => {
        recognizeComponents(html);
      }).not.toThrow();
    });

    it('should handle many siblings (1000+ elements)', () => {
      const elements = Array.from({ length: 1000 }, (_, i) => `<div>Item ${i}</div>`).join('\n');
      const html = `<div class="container">${elements}</div>`;

      expect(() => {
        recognizeComponents(html);
      }).not.toThrow();

      const components = recognizeComponents(html);
      expect(components.length).toBeGreaterThan(100);
    }, 10000);
  });

  describe('Custom and Non-Standard Elements', () => {
    it('should handle custom web components', () => {
      const html = `
        <custom-element>
          <custom-header>Title</custom-header>
          <custom-body>Content</custom-body>
        </custom-element>
      `;

      expect(() => {
        recognizeComponents(html);
      }).not.toThrow();

      const components = recognizeComponents(html);
      expect(components.length).toBeGreaterThan(0);
    });

    it('should handle elements with namespace prefixes', () => {
      const html = `
        <svg:svg>
          <svg:circle cx="50" cy="50" r="40" />
        </svg:svg>
      `;

      expect(() => {
        recognizeComponents(html);
      }).not.toThrow();
    });

    it('should handle deprecated HTML tags', () => {
      const html = `
        <center>Centered content</center>
        <font color="red">Red text</font>
        <marquee>Scrolling text</marquee>
      `;

      expect(() => {
        recognizeComponents(html);
      }).not.toThrow();

      const components = recognizeComponents(html);
      expect(components.length).toBeGreaterThan(0);
    });

    it('should handle unknown elements', () => {
      const html = `
        <unknown-tag>Content</unknown-tag>
        <another-unknown-element attribute="value">More content</another-unknown-element>
      `;

      expect(() => {
        recognizeComponents(html);
      }).not.toThrow();
    });
  });

  describe('Invalid CSS and Styles', () => {
    it('should handle invalid CSS syntax in style attribute', () => {
      const html = '<div style="color red; background:">Content</div>';

      expect(() => {
        extractStyles(html);
      }).not.toThrow();
    });

    it('should handle CSS with invalid property names', () => {
      const html = '<div style="invalid-property: value; another-invalid: 123;">Content</div>';

      expect(() => {
        extractStyles(html);
      }).not.toThrow();
    });

    it('should handle CSS with invalid values', () => {
      const html = `
        <div style="
          width: abc;
          height: xyz;
          color: notacolor;
          margin: invalid;
        ">Content</div>
      `;

      expect(() => {
        extractStyles(html);
      }).not.toThrow();
    });

    it('should handle unclosed CSS strings', () => {
      const html = '<div style="content: \'unclosed;">Content</div>';

      expect(() => {
        extractStyles(html);
      }).not.toThrow();
    });

    it('should handle CSS with special characters', () => {
      const html = '<div style="content: \'<>&\\\"\'; background: url(\'test\'s.jpg\');">Content</div>';

      expect(() => {
        extractStyles(html);
      }).not.toThrow();
    });
  });

  describe('Missing or Invalid Required Data', () => {
    it('should handle images without src attribute', () => {
      const html = '<img alt="Image without source">';

      expect(() => {
        recognizeComponents(html);
      }).not.toThrow();

      const components = recognizeComponents(html);
      const image = components.find(c => c.tagName === 'img');
      expect(image).toBeDefined();
    });

    it('should handle links without href attribute', () => {
      const html = '<a>Link without href</a>';

      expect(() => {
        recognizeComponents(html);
      }).not.toThrow();
    });

    it('should handle forms without action attribute', () => {
      const html = '<form><input type="text"><button type="submit">Submit</button></form>';

      expect(() => {
        recognizeComponents(html);
      }).not.toThrow();
    });

    it('should handle inputs without type attribute', () => {
      const html = '<input name="field">';

      expect(() => {
        recognizeComponents(html);
      }).not.toThrow();
    });

    it('should handle buttons without text content', () => {
      const html = '<button></button>';

      expect(() => {
        recognizeComponents(html);
      }).not.toThrow();
    });
  });

  describe('Complex Attribute Scenarios', () => {
    it('should handle attributes with quotes in values', () => {
      const html = '<div title="She said \\"hello\\"">Content</div>';

      expect(() => {
        recognizeComponents(html);
      }).not.toThrow();
    });

    it('should handle attributes without values', () => {
      const html = '<input type="checkbox" checked disabled readonly>';

      expect(() => {
        recognizeComponents(html);
      }).not.toThrow();
    });

    it('should handle mixed quote types in attributes', () => {
      const html = `<div class='outer' data-value="inner 'quoted' text">Content</div>`;

      expect(() => {
        recognizeComponents(html);
      }).not.toThrow();
    });

    it('should handle data attributes with complex values', () => {
      const html = '<div data-config=\'{"key": "value", "nested": {"prop": 123}}\'>Content</div>';

      expect(() => {
        recognizeComponents(html);
      }).not.toThrow();
    });
  });

  describe('Elementor Export Edge Cases', () => {
    it('should handle empty widget array', () => {
      const widgets: ElementorWidget[] = [];

      expect(() => {
        exportToElementor(widgets);
      }).not.toThrow();

      const result = exportToElementor(widgets);
      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
    });

    it('should handle widgets with missing settings', () => {
      const widgets: ElementorWidget[] = [
        {
          id: '1',
          elType: 'widget',
          widgetType: 'heading',
          settings: {} as any, // Empty settings
        },
      ];

      expect(() => {
        exportToElementor(widgets);
      }).not.toThrow();
    });

    it('should handle widgets with null/undefined values', () => {
      const widgets: ElementorWidget[] = [
        {
          id: '1',
          elType: 'widget',
          widgetType: 'text-editor',
          settings: {
            editor: undefined as any,
          },
        },
      ];

      expect(() => {
        exportToElementor(widgets);
      }).not.toThrow();
    });

    it('should handle very long widget IDs', () => {
      const longId = 'widget_' + 'x'.repeat(1000);
      const widgets: ElementorWidget[] = [
        {
          id: longId,
          elType: 'widget',
          widgetType: 'heading',
          settings: { title: 'Test' },
        },
      ];

      expect(() => {
        exportToElementor(widgets);
      }).not.toThrow();
    });

    it('should handle special characters in widget settings', () => {
      const widgets: ElementorWidget[] = [
        {
          id: '1',
          elType: 'widget',
          widgetType: 'text-editor',
          settings: {
            editor: '<script>alert("xss")</script><p>Content</p>',
          },
        },
      ];

      expect(() => {
        exportToElementor(widgets);
      }).not.toThrow();

      const result = exportToElementor(widgets);
      expect(result).toBeDefined();
    });
  });

  describe('Browser-Specific Edge Cases', () => {
    it('should handle HTML5 semantic elements', () => {
      const html = `
        <article>
          <header>
            <h1>Article Title</h1>
          </header>
          <section>
            <p>Article content</p>
          </section>
          <footer>
            <p>Article footer</p>
          </footer>
        </article>
      `;

      const components = recognizeComponents(html);
      expect(components.length).toBeGreaterThan(0);
    });

    it('should handle template elements', () => {
      const html = `
        <template id="my-template">
          <div class="card">
            <h3>Template Card</h3>
          </div>
        </template>
      `;

      expect(() => {
        recognizeComponents(html);
      }).not.toThrow();
    });

    it('should handle slot elements', () => {
      const html = `
        <div>
          <slot name="header"></slot>
          <slot></slot>
          <slot name="footer"></slot>
        </div>
      `;

      expect(() => {
        recognizeComponents(html);
      }).not.toThrow();
    });
  });

  describe('Whitespace and Formatting', () => {
    it('should handle inconsistent indentation', () => {
      const html = `
<div>
      <p>Inconsistent</p>
  <span>Indentation</span>
        <button>Here</button>
</div>
      `;

      const components = recognizeComponents(html);
      expect(components.length).toBeGreaterThan(0);
    });

    it('should handle no whitespace between tags', () => {
      const html = '<div><p>No</p><span>Whitespace</span><button>Here</button></div>';

      const components = recognizeComponents(html);
      expect(components.length).toBeGreaterThan(0);
    });

    it('should handle excessive whitespace', () => {
      const html = `
        <div>



          <p>   Lots   of   spaces   </p>



        </div>
      `;

      const components = recognizeComponents(html);
      expect(components.length).toBeGreaterThan(0);
    });

    it('should handle mixed line endings (CRLF and LF)', () => {
      const html = '<div>\r\n<p>Windows</p>\n<span>Unix</span>\r\n</div>';

      const components = recognizeComponents(html);
      expect(components.length).toBeGreaterThan(0);
    });
  });

  describe('SVG and Graphics Edge Cases', () => {
    it('should handle inline SVG', () => {
      const html = `
        <svg width="100" height="100" xmlns="http://www.w3.org/2000/svg">
          <circle cx="50" cy="50" r="40" stroke="black" stroke-width="3" fill="red" />
          <text x="50" y="55" text-anchor="middle">SVG</text>
        </svg>
      `;

      expect(() => {
        recognizeComponents(html);
      }).not.toThrow();
    });

    it('should handle canvas elements', () => {
      const html = '<canvas id="myCanvas" width="200" height="100"></canvas>';

      expect(() => {
        recognizeComponents(html);
      }).not.toThrow();
    });

    it('should handle picture elements with multiple sources', () => {
      const html = `
        <picture>
          <source media="(min-width: 650px)" srcset="large.jpg">
          <source media="(min-width: 465px)" srcset="medium.jpg">
          <img src="small.jpg" alt="Image">
        </picture>
      `;

      const components = recognizeComponents(html);
      expect(components.length).toBeGreaterThan(0);
    });
  });
});
