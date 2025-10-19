/**
 * Unit Tests: Component Recognizer
 *
 * Tests the component recognition pattern matching system
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { JSDOM } from 'jsdom';
import { recognizeComponent } from '../../recognizer/component-recognizer.js';
import { extractStyles } from '../../analyzer/style-extractor.js';
import type { ElementContext } from '../../types/component.types.js';

describe('Component Recognizer', () => {
  let dom: JSDOM;
  let document: Document;

  beforeEach(() => {
    dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
    document = dom.window.document;
  });

  describe('Button Recognition', () => {
    it('should recognize button by tag name', () => {
      const html = '<button>Click Me</button>';
      const fragment = JSDOM.fragment(html);
      const button = fragment.querySelector('button')!;

      const styles = extractStyles(html);
      const context: ElementContext = {
        insideHero: false,
        insideForm: false,
        insideCard: false,
        insideNav: false,
        insideHeader: false,
        insideFooter: false,
        insideSection: false,
        depth: 0,
        siblingTypes: [],
      };

      const result = recognizeComponent(button, styles, context);

      expect(result.componentType).toBe('button');
      expect(result.confidence).toBeGreaterThanOrEqual(90);
    });

    it('should recognize button by class keywords', () => {
      const html = '<a href="#" class="btn btn-primary">Click Me</a>';
      const fragment = JSDOM.fragment(html);
      const button = fragment.querySelector('a')!;

      const styles = extractStyles(html);
      const context: ElementContext = {
        insideHero: false,
        insideForm: false,
        insideCard: false,
        insideNav: false,
        insideHeader: false,
        insideFooter: false,
        insideSection: false,
        depth: 0,
        siblingTypes: [],
      };

      const result = recognizeComponent(button, styles, context);

      expect(result.componentType).toBe('button');
      expect(result.confidence).toBeGreaterThan(70);
    });

    it('should recognize submit button with role', () => {
      const html = '<div role="button">Submit</div>';
      const fragment = JSDOM.fragment(html);
      const button = fragment.querySelector('div')!;

      const styles = extractStyles(html);
      const context: ElementContext = {
        insideHero: false,
        insideForm: true,
        insideCard: false,
        insideNav: false,
        insideHeader: false,
        insideFooter: false,
        insideSection: false,
        depth: 1,
        siblingTypes: [],
      };

      const result = recognizeComponent(button, styles, context);

      expect(result.componentType).toBe('button');
      expect(result.confidence).toBeGreaterThan(80);
    });
  });

  describe('Heading Recognition', () => {
    it('should recognize h1 heading', () => {
      const html = '<h1>Main Title</h1>';
      const fragment = JSDOM.fragment(html);
      const heading = fragment.querySelector('h1')!;

      const styles = extractStyles(html);
      const context: ElementContext = {
        insideHero: false,
        insideForm: false,
        insideCard: false,
        insideNav: false,
        insideHeader: false,
        insideFooter: false,
        insideSection: false,
        depth: 0,
        siblingTypes: [],
      };

      const result = recognizeComponent(heading, styles, context);

      expect(result.componentType).toBe('heading');
      expect(result.confidence).toBeGreaterThanOrEqual(95);
    });

    it('should recognize all heading levels', () => {
      const headingTags = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'];

      for (const tag of headingTags) {
        const html = `<${tag}>Heading</${tag}>`;
        const fragment = JSDOM.fragment(html);
        const heading = fragment.querySelector(tag)!;

        const styles = extractStyles(html);
        const context: ElementContext = {
          insideHero: false,
          insideForm: false,
          insideCard: false,
          insideNav: false,
          insideHeader: false,
          insideFooter: false,
          insideSection: false,
          depth: 0,
          siblingTypes: [],
        };

        const result = recognizeComponent(heading, styles, context);

        expect(result.componentType).toBe('heading');
      }
    });
  });

  describe('Image Recognition', () => {
    it('should recognize img tag', () => {
      const html = '<img src="test.jpg" alt="Test Image">';
      const fragment = JSDOM.fragment(html);
      const image = fragment.querySelector('img')!;

      const styles = extractStyles(html);
      const context: ElementContext = {
        insideHero: false,
        insideForm: false,
        insideCard: false,
        insideNav: false,
        insideHeader: false,
        insideFooter: false,
        insideSection: false,
        depth: 0,
        siblingTypes: [],
      };

      const result = recognizeComponent(image, styles, context);

      expect(result.componentType).toBe('image');
      expect(result.confidence).toBeGreaterThanOrEqual(95);
    });

    it('should recognize picture element', () => {
      const html = `
        <picture>
          <source srcset="image.webp" type="image/webp">
          <img src="image.jpg" alt="Test">
        </picture>
      `;
      const fragment = JSDOM.fragment(html);
      const picture = fragment.querySelector('picture')!;

      const styles = extractStyles(html);
      const context: ElementContext = {
        insideHero: false,
        insideForm: false,
        insideCard: false,
        insideNav: false,
        insideHeader: false,
        insideFooter: false,
        insideSection: false,
        depth: 0,
        siblingTypes: [],
      };

      const result = recognizeComponent(picture, styles, context);

      expect(result.componentType).toBe('image');
    });
  });

  describe('Grid Layout Recognition', () => {
    it('should recognize CSS grid layout', () => {
      const html = '<div class="grid-container" style="display: grid; grid-template-columns: 1fr 1fr 1fr;"></div>';
      const fragment = JSDOM.fragment(html);
      const grid = fragment.querySelector('div')!;

      const styles = {
        display: 'grid',
        gridTemplateColumns: '1fr 1fr 1fr',
      };

      const context: ElementContext = {
        insideHero: false,
        insideForm: false,
        insideCard: false,
        insideNav: false,
        insideHeader: false,
        insideFooter: false,
        insideSection: false,
        depth: 0,
        siblingTypes: [],
      };

      const result = recognizeComponent(grid, styles, context);

      expect(result.componentType).toBe('grid');
      expect(result.confidence).toBeGreaterThanOrEqual(90);
    });
  });

  describe('Card Recognition', () => {
    it('should recognize card with proper structure', () => {
      const html = `
        <div class="card">
          <img src="image.jpg" alt="Card Image">
          <h3>Card Title</h3>
          <p>Card description text</p>
          <a href="#" class="btn">Read More</a>
        </div>
      `;
      const fragment = JSDOM.fragment(html);
      const card = fragment.querySelector('.card')!;

      const styles = extractStyles(html);
      const context: ElementContext = {
        insideHero: false,
        insideForm: false,
        insideCard: false,
        insideNav: false,
        insideHeader: false,
        insideFooter: false,
        insideSection: false,
        depth: 0,
        siblingTypes: [],
      };

      const result = recognizeComponent(card, styles, context);

      expect(result.componentType).toBe('card');
      expect(result.confidence).toBeGreaterThan(70);
    });
  });

  describe('Form Component Recognition', () => {
    it('should recognize form container', () => {
      const html = '<form action="/submit" method="POST"></form>';
      const fragment = JSDOM.fragment(html);
      const form = fragment.querySelector('form')!;

      const styles = extractStyles(html);
      const context: ElementContext = {
        insideHero: false,
        insideForm: false,
        insideCard: false,
        insideNav: false,
        insideHeader: false,
        insideFooter: false,
        insideSection: false,
        depth: 0,
        siblingTypes: [],
      };

      const result = recognizeComponent(form, styles, context);

      expect(result.componentType).toBe('form');
      expect(result.confidence).toBeGreaterThanOrEqual(95);
    });

    it('should recognize input field', () => {
      const html = '<input type="text" name="username" placeholder="Username">';
      const fragment = JSDOM.fragment(html);
      const input = fragment.querySelector('input')!;

      const styles = extractStyles(html);
      const context: ElementContext = {
        insideHero: false,
        insideForm: true,
        insideCard: false,
        insideNav: false,
        insideHeader: false,
        insideFooter: false,
        insideSection: false,
        depth: 1,
        siblingTypes: [],
      };

      const result = recognizeComponent(input, styles, context);

      expect(result.componentType).toBe('input');
      expect(result.confidence).toBeGreaterThan(80);
    });

    it('should recognize textarea', () => {
      const html = '<textarea name="message" rows="5"></textarea>';
      const fragment = JSDOM.fragment(html);
      const textarea = fragment.querySelector('textarea')!;

      const styles = extractStyles(html);
      const context: ElementContext = {
        insideHero: false,
        insideForm: true,
        insideCard: false,
        insideNav: false,
        insideHeader: false,
        insideFooter: false,
        insideSection: false,
        depth: 1,
        siblingTypes: [],
      };

      const result = recognizeComponent(textarea, styles, context);

      expect(result.componentType).toBe('textarea');
      expect(result.confidence).toBeGreaterThanOrEqual(90);
    });

    it('should recognize select dropdown', () => {
      const html = '<select name="country"><option>USA</option><option>UK</option></select>';
      const fragment = JSDOM.fragment(html);
      const select = fragment.querySelector('select')!;

      const styles = extractStyles(html);
      const context: ElementContext = {
        insideHero: false,
        insideForm: true,
        insideCard: false,
        insideNav: false,
        insideHeader: false,
        insideFooter: false,
        insideSection: false,
        depth: 1,
        siblingTypes: [],
      };

      const result = recognizeComponent(select, styles, context);

      expect(result.componentType).toBe('select');
      expect(result.confidence).toBeGreaterThanOrEqual(90);
    });
  });

  describe('Advanced Component Recognition', () => {
    it('should recognize accordion', () => {
      const html = '<div class="accordion"><div class="accordion-item"></div></div>';
      const fragment = JSDOM.fragment(html);
      const accordion = fragment.querySelector('.accordion')!;

      const styles = extractStyles(html);
      const context: ElementContext = {
        insideHero: false,
        insideForm: false,
        insideCard: false,
        insideNav: false,
        insideHeader: false,
        insideFooter: false,
        insideSection: false,
        depth: 0,
        siblingTypes: [],
      };

      const result = recognizeComponent(accordion, styles, context);

      expect(result.componentType).toBe('accordion');
      expect(result.confidence).toBeGreaterThan(70);
    });

    it('should recognize tabs', () => {
      const html = '<div role="tablist"><button role="tab">Tab 1</button><button role="tab">Tab 2</button></div>';
      const fragment = JSDOM.fragment(html);
      const tabs = fragment.querySelector('[role="tablist"]')!;

      const styles = extractStyles(html);
      const context: ElementContext = {
        insideHero: false,
        insideForm: false,
        insideCard: false,
        insideNav: false,
        insideHeader: false,
        insideFooter: false,
        insideSection: false,
        depth: 0,
        siblingTypes: [],
      };

      const result = recognizeComponent(tabs, styles, context);

      expect(result.componentType).toBe('tabs');
      expect(result.confidence).toBeGreaterThanOrEqual(85);
    });

    it('should recognize modal/dialog', () => {
      const html = '<div role="dialog" class="modal"><div class="modal-content"></div></div>';
      const fragment = JSDOM.fragment(html);
      const modal = fragment.querySelector('[role="dialog"]')!;

      const styles = extractStyles(html);
      const context: ElementContext = {
        insideHero: false,
        insideForm: false,
        insideCard: false,
        insideNav: false,
        insideHeader: false,
        insideFooter: false,
        insideSection: false,
        depth: 0,
        siblingTypes: [],
      };

      const result = recognizeComponent(modal, styles, context);

      expect(result.componentType).toBe('modal');
      expect(result.confidence).toBeGreaterThanOrEqual(90);
    });
  });

  describe('Confidence Scoring', () => {
    it('should return high confidence for exact matches', () => {
      const html = '<button>Click</button>';
      const fragment = JSDOM.fragment(html);
      const button = fragment.querySelector('button')!;

      const styles = extractStyles(html);
      const context: ElementContext = {
        insideHero: false,
        insideForm: false,
        insideCard: false,
        insideNav: false,
        insideHeader: false,
        insideFooter: false,
        insideSection: false,
        depth: 0,
        siblingTypes: [],
      };

      const result = recognizeComponent(button, styles, context);

      expect(result.confidence).toBeGreaterThanOrEqual(90);
      expect(result.manualReviewNeeded).toBe(false);
    });

    it('should return lower confidence for ambiguous elements', () => {
      const html = '<div>Some content</div>';
      const fragment = JSDOM.fragment(html);
      const div = fragment.querySelector('div')!;

      const styles = extractStyles(html);
      const context: ElementContext = {
        insideHero: false,
        insideForm: false,
        insideCard: false,
        insideNav: false,
        insideHeader: false,
        insideFooter: false,
        insideSection: false,
        depth: 0,
        siblingTypes: [],
      };

      const result = recognizeComponent(div, styles, context);

      // Generic div should have lower confidence or be unknown
      if (result.componentType !== 'unknown') {
        expect(result.confidence).toBeLessThan(95);
      }
    });

    it('should flag manual review for low confidence', () => {
      const html = '<div class="custom-element"></div>';
      const fragment = JSDOM.fragment(html);
      const element = fragment.querySelector('div')!;

      const styles = extractStyles(html);
      const context: ElementContext = {
        insideHero: false,
        insideForm: false,
        insideCard: false,
        insideNav: false,
        insideHeader: false,
        insideFooter: false,
        insideSection: false,
        depth: 0,
        siblingTypes: [],
      };

      const result = recognizeComponent(element, styles, context);

      if (result.confidence < 70) {
        expect(result.manualReviewNeeded).toBe(true);
      }
    });
  });
});
