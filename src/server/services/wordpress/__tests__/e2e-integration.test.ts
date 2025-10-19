/**
 * End-to-End Integration Tests
 *
 * Tests the complete flow:
 * 1. Recognize components from HTML
 * 2. Export to page builder JSON
 * 3. Create WordPress post
 * 4. Verify template works in target builder
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { recognizeComponents } from '../../page-builder/recognizer/component-recognizer.js';
import { exportToElementor } from '../../page-builder/exporters/elementor-exporter.js';
import { exportToGutenberg } from '../../page-builder/exporters/gutenberg-exporter.js';
import {
  createWordPressPostCreator,
  WordPressPostCreator,
} from '../wordpress-post-creator.js';
import {
  createWordPressClient,
  WordPressAPIClient,
  WordPressCredentials,
} from '../wordpress-api-client.js';
import { createTemplateVerifier, TemplateVerifier } from '../template-verifier.js';
import { mapToElementorWidget } from '../../page-builder/mappers/elementor-mapper.js';

// Mock credentials for testing
const mockCredentials: WordPressCredentials = {
  siteUrl: process.env.TEST_WP_SITE_URL || 'http://localhost:8080',
  authType: 'application-password',
  username: process.env.TEST_WP_USERNAME || 'admin',
  applicationPassword: process.env.TEST_WP_APP_PASSWORD || '',
};

const SKIP_LIVE_TESTS = !process.env.TEST_WP_APP_PASSWORD;

describe('End-to-End Integration Tests', () => {
  let postCreator: WordPressPostCreator;
  let wpClient: WordPressAPIClient;
  let verifier: TemplateVerifier;
  const createdPostIds: number[] = [];

  beforeAll(() => {
    if (!SKIP_LIVE_TESTS) {
      wpClient = createWordPressClient(mockCredentials);
      postCreator = createWordPressPostCreator(mockCredentials);
      verifier = createTemplateVerifier(wpClient);
    }
  });

  afterAll(async () => {
    if (!SKIP_LIVE_TESTS && verifier) {
      await verifier.closeBrowser();

      // Clean up created posts
      for (const postId of createdPostIds) {
        try {
          await wpClient.deletePost(postId, 'page', true);
        } catch (error) {
          console.error(`Failed to delete post ${postId}:`, error);
        }
      }
    }
  });

  describe('Elementor Flow', () => {
    const testHTML = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Test Page</title>
        <style>
          .hero {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            padding: 80px 20px;
            text-align: center;
          }
          .hero h1 {
            color: white;
            font-size: 48px;
            margin-bottom: 20px;
          }
          .hero p {
            color: rgba(255,255,255,0.9);
            font-size: 20px;
            max-width: 600px;
            margin: 0 auto 30px;
          }
          .cta-button {
            background: #ff6b6b;
            color: white;
            padding: 15px 40px;
            border-radius: 30px;
            text-decoration: none;
            font-weight: bold;
            display: inline-block;
          }
          .features {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 40px;
            padding: 80px 20px;
            max-width: 1200px;
            margin: 0 auto;
          }
          .feature-card {
            background: white;
            padding: 40px;
            border-radius: 10px;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
            text-align: center;
          }
          .feature-card h3 {
            color: #333;
            margin-bottom: 15px;
          }
          .feature-card p {
            color: #666;
            line-height: 1.6;
          }
        </style>
      </head>
      <body>
        <section class="hero">
          <h1>Welcome to Our Amazing Product</h1>
          <p>Transform your workflow with our cutting-edge solution designed for modern teams</p>
          <a href="#signup" class="cta-button">Get Started Free</a>
        </section>

        <div class="features">
          <div class="feature-card">
            <h3>Fast & Reliable</h3>
            <p>Lightning-fast performance with 99.9% uptime guarantee for your peace of mind</p>
          </div>
          <div class="feature-card">
            <h3>Easy to Use</h3>
            <p>Intuitive interface that anyone can master in minutes, no training required</p>
          </div>
          <div class="feature-card">
            <h3>24/7 Support</h3>
            <p>Our expert team is always ready to help you succeed, whenever you need us</p>
          </div>
        </div>
      </body>
      </html>
    `;

    it('should recognize components from HTML', async () => {
      const components = await recognizeComponents(testHTML, { minConfidence: 0.6 });

      expect(components).toBeDefined();
      expect(components.length).toBeGreaterThan(0);

      // Check for hero section
      const heroComponents = components.filter((c) => c.componentType === 'hero');
      expect(heroComponents.length).toBeGreaterThan(0);

      // Check for cards
      const cardComponents = components.filter((c) => c.componentType === 'card');
      expect(cardComponents.length).toBeGreaterThan(0);

      // Check for buttons
      const buttonComponents = components.filter((c) => c.componentType === 'button');
      expect(buttonComponents.length).toBeGreaterThan(0);
    });

    it('should export to Elementor JSON format', async () => {
      const components = await recognizeComponents(testHTML, { minConfidence: 0.6 });

      // Map components to Elementor widgets
      const widgets = components.map((component) => mapToElementorWidget(component));

      // Export to Elementor format
      const elementorExport = exportToElementor(widgets, 'Test Page Export');

      expect(elementorExport).toBeDefined();
      expect(elementorExport.version).toBeDefined();
      expect(elementorExport.content).toBeDefined();
      expect(elementorExport.content.length).toBeGreaterThan(0);

      // Validate structure
      const firstSection = elementorExport.content[0];
      expect(firstSection.elType).toBe('section');
      expect(firstSection.elements).toBeDefined();
      expect(firstSection.elements.length).toBeGreaterThan(0);

      const firstColumn = firstSection.elements[0];
      expect(firstColumn.elType).toBe('column');
      expect(firstColumn.elements).toBeDefined();
    });

    it(
      'should create WordPress post with Elementor template',
      async () => {
        if (SKIP_LIVE_TESTS) {
          console.log('Skipping live WordPress test - no credentials provided');
          return;
        }

        // Test connection first
        const connectionTest = await postCreator.testConnection();
        if (!connectionTest.success) {
          console.log('Skipping test - WordPress connection failed:', connectionTest.message);
          return;
        }

        const components = await recognizeComponents(testHTML, { minConfidence: 0.6 });
        const widgets = components.map((component) => mapToElementorWidget(component));
        const elementorExport = exportToElementor(widgets, 'E2E Test Page');

        const result = await postCreator.createFromElementorExport(elementorExport, {
          title: `E2E Test - ${Date.now()}`,
          status: 'draft',
          type: 'page',
          uploadMedia: false,
        });

        expect(result.success).toBe(true);
        expect(result.postId).toBeDefined();
        expect(result.postLink).toBeDefined();

        if (result.postId) {
          createdPostIds.push(result.postId);
        }
      },
      60000
    ); // 60s timeout

    it(
      'should verify template in WordPress',
      async () => {
        if (SKIP_LIVE_TESTS || createdPostIds.length === 0) {
          console.log('Skipping verification test');
          return;
        }

        const postId = createdPostIds[0];

        const verificationResult = await verifier.verifyTemplate({
          postId,
          originalUrl: 'https://example.com', // Mock URL
          takeScreenshots: false, // Skip screenshots in CI
          checkAssets: true,
          checkConsoleErrors: true,
          timeout: 30000,
        });

        expect(verificationResult).toBeDefined();
        expect(verificationResult.postId).toBe(postId);
        expect(verificationResult.postUrl).toBeDefined();
        expect(verificationResult.checks.rendering).toBeDefined();
        expect(verificationResult.checks.assets).toBeDefined();
      },
      60000
    );
  });

  describe('Gutenberg Flow', () => {
    const testHTML = `
      <section class="hero">
        <h1>Welcome to Our Blog</h1>
        <p>Discover amazing content and insights</p>
      </section>

      <article class="blog-post">
        <h2>Latest Article</h2>
        <p>This is a sample blog post with some content.</p>
        <img src="https://via.placeholder.com/800x400" alt="Featured image" />
      </article>
    `;

    it('should export to Gutenberg blocks format', async () => {
      const components = await recognizeComponents(testHTML, { minConfidence: 0.6 });

      const gutenbergBlocks = exportToGutenberg(components, {
        preserveLayout: true,
        useGroupBlocks: true,
      });

      expect(gutenbergBlocks).toBeDefined();
      expect(typeof gutenbergBlocks).toBe('string');

      // Check for Gutenberg block comments
      expect(gutenbergBlocks).toContain('<!-- wp:');
      expect(gutenbergBlocks).toContain('/-->');
    });

    it(
      'should create WordPress post with Gutenberg blocks',
      async () => {
        if (SKIP_LIVE_TESTS) {
          console.log('Skipping live WordPress test');
          return;
        }

        const connectionTest = await postCreator.testConnection();
        if (!connectionTest.success) {
          console.log('Skipping test - WordPress connection failed');
          return;
        }

        const components = await recognizeComponents(testHTML, { minConfidence: 0.6 });
        const gutenbergBlocks = exportToGutenberg(components);

        const result = await postCreator.createFromGutenbergBlocks(gutenbergBlocks, {
          title: `Gutenberg E2E Test - ${Date.now()}`,
          status: 'draft',
          type: 'post',
          uploadMedia: false,
        });

        expect(result.success).toBe(true);
        expect(result.postId).toBeDefined();

        if (result.postId) {
          createdPostIds.push(result.postId);
        }
      },
      60000
    );
  });

  describe('Full Pipeline Integration', () => {
    it('should handle complete conversion pipeline', async () => {
      const testHTML = `
        <div class="landing-page">
          <header>
            <h1>Amazing Product</h1>
            <button>Buy Now</button>
          </header>
          <section class="features">
            <div class="feature">
              <h3>Feature 1</h3>
              <p>Description</p>
            </div>
            <div class="feature">
              <h3>Feature 2</h3>
              <p>Description</p>
            </div>
          </section>
        </div>
      `;

      // Step 1: Recognize components
      const components = await recognizeComponents(testHTML);
      expect(components.length).toBeGreaterThan(0);

      // Step 2: Export to Elementor
      const widgets = components.map((c) => mapToElementorWidget(c));
      const elementorExport = exportToElementor(widgets, 'Pipeline Test');

      expect(elementorExport.content).toBeDefined();
      expect(elementorExport.content.length).toBeGreaterThan(0);

      // Step 3: Validate export structure
      for (const section of elementorExport.content) {
        expect(section.elType).toBe('section');
        expect(section.elements).toBeDefined();

        for (const column of section.elements) {
          expect(column.elType).toBe('column');
        }
      }

      // Step 4: Export to Gutenberg as alternative
      const gutenbergBlocks = exportToGutenberg(components);
      expect(gutenbergBlocks).toContain('<!-- wp:');
    });

    it('should handle media assets in pipeline', async () => {
      const htmlWithImages = `
        <div class="gallery">
          <img src="https://via.placeholder.com/400x300" alt="Image 1" />
          <img src="https://via.placeholder.com/400x300" alt="Image 2" />
        </div>
      `;

      const components = await recognizeComponents(htmlWithImages);
      const imageComponents = components.filter((c) => c.componentType === 'image');

      expect(imageComponents.length).toBeGreaterThan(0);

      // Verify image data extraction
      for (const component of imageComponents) {
        expect(component.props.src).toBeDefined();
        expect(component.props.alt).toBeDefined();
      }
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid WordPress credentials gracefully', async () => {
      const invalidCreator = createWordPressPostCreator({
        siteUrl: 'https://invalid-site-that-doesnt-exist.com',
        authType: 'basic',
        username: 'invalid',
        password: 'invalid',
      });

      const testResult = await invalidCreator.testConnection();
      expect(testResult.success).toBe(false);
      expect(testResult.message).toBeDefined();
    });

    it('should handle invalid HTML gracefully', async () => {
      const invalidHTML = '<div><span>Unclosed tags';

      // Should not throw, just return fewer/no components
      const components = await recognizeComponents(invalidHTML);
      expect(Array.isArray(components)).toBe(true);
    });

    it('should handle empty HTML gracefully', async () => {
      const emptyHTML = '';

      const components = await recognizeComponents(emptyHTML);
      expect(Array.isArray(components)).toBe(true);
      expect(components.length).toBe(0);
    });
  });
});

describe('Component Mapping Accuracy', () => {
  it('should correctly identify and map hero sections', async () => {
    const heroHTML = `
      <section class="hero" style="background: #333; padding: 100px 20px; text-align: center;">
        <h1 style="color: white; font-size: 48px;">Hero Heading</h1>
        <p style="color: white;">Hero description text</p>
        <a href="#" class="button">Call to Action</a>
      </section>
    `;

    const components = await recognizeComponents(heroHTML);
    const heroComponent = components.find((c) => c.componentType === 'hero');

    expect(heroComponent).toBeDefined();
    expect(heroComponent?.confidence).toBeGreaterThan(0.7);
  });

  it('should correctly identify and map card grids', async () => {
    const cardsHTML = `
      <div class="cards" style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px;">
        <div class="card">
          <h3>Card 1</h3>
          <p>Description</p>
        </div>
        <div class="card">
          <h3>Card 2</h3>
          <p>Description</p>
        </div>
        <div class="card">
          <h3>Card 3</h3>
          <p>Description</p>
        </div>
      </div>
    `;

    const components = await recognizeComponents(cardsHTML);
    const cardComponents = components.filter((c) => c.componentType === 'card');

    expect(cardComponents.length).toBeGreaterThan(0);
  });

  it('should correctly identify and map forms', async () => {
    const formHTML = `
      <form class="contact-form">
        <input type="text" name="name" placeholder="Your Name" />
        <input type="email" name="email" placeholder="Your Email" />
        <textarea name="message" placeholder="Your Message"></textarea>
        <button type="submit">Send Message</button>
      </form>
    `;

    const components = await recognizeComponents(formHTML);
    const formComponent = components.find((c) => c.componentType === 'form');

    expect(formComponent).toBeDefined();
  });
});
