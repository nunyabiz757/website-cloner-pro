/**
 * Visual Regression Tests
 *
 * Tests visual fidelity between original HTML and converted Elementor output
 * using screenshot comparison
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import puppeteer, { Browser, Page } from 'puppeteer';
import { recognizeComponents } from '../../recognizer/component-recognizer.js';
import { exportToElementor } from '../../exporters/elementor-exporter.js';
import { compareScreenshots } from '../../validator/visual-comparator.js';
import { generateElementorHTML } from '../helpers/elementor-html-generator.js';
import type { ElementorWidget } from '../../types/builder.types.js';

describe('Visual Regression Tests', () => {
  let browser: Browser;
  let sampleHTML: string;

  beforeAll(async () => {
    // Launch browser for screenshot testing
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    // Load sample fixture
    const fixturePath = join(__dirname, '../fixtures/sample-components.html');
    sampleHTML = readFileSync(fixturePath, 'utf-8');
  });

  afterAll(async () => {
    if (browser) {
      await browser.close();
    }
  });

  describe('Screenshot Comparison', () => {
    it('should produce visually similar output for hero section', async () => {
      const page = await browser.newPage();

      // Original HTML
      const heroHTML = `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            .hero {
              position: relative;
              min-height: 500px;
              display: flex;
              align-items: center;
              justify-content: center;
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              color: white;
              text-align: center;
              padding: 40px;
            }
            .hero h1 {
              font-size: 48px;
              margin-bottom: 20px;
              font-weight: bold;
            }
            .hero p {
              font-size: 20px;
              margin-bottom: 30px;
            }
            .btn {
              display: inline-block;
              padding: 15px 30px;
              background-color: white;
              color: #667eea;
              border-radius: 5px;
              text-decoration: none;
              font-weight: 600;
            }
          </style>
        </head>
        <body>
          <section class="hero">
            <div class="hero-content">
              <h1>Welcome to Our Website</h1>
              <p>This is a sample hero section</p>
              <a href="#cta" class="btn">Get Started</a>
            </div>
          </section>
        </body>
        </html>
      `;

      await page.setContent(heroHTML);
      const originalScreenshot = await page.screenshot({ fullPage: true });

      // Generate Elementor HTML from conversion
      const convertedHTML = await generateElementorHTML(heroHTML);

      await page.setContent(convertedHTML);
      const convertedScreenshot = await page.screenshot({ fullPage: true });

      // Compare screenshots
      const comparison = await compareScreenshots(
        originalScreenshot,
        convertedScreenshot
      );

      expect(comparison.similarity).toBeGreaterThan(80);
      expect(comparison.differences).toBeLessThan(1000);

      await page.close();
    }, 30000);

    it('should produce visually similar output for card grid', async () => {
      const page = await browser.newPage();

      const cardsHTML = `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            .grid-container {
              display: grid;
              grid-template-columns: repeat(3, 1fr);
              gap: 20px;
              padding: 20px;
            }
            .card {
              border: 1px solid #ddd;
              border-radius: 8px;
              padding: 20px;
              box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            }
            .card h3 {
              font-size: 24px;
              margin-bottom: 10px;
              color: #333;
            }
            .card p {
              color: #666;
              line-height: 1.6;
              margin-bottom: 15px;
            }
            .btn {
              display: inline-block;
              padding: 10px 20px;
              background-color: #007bff;
              color: white;
              border-radius: 4px;
              text-decoration: none;
            }
          </style>
        </head>
        <body>
          <div class="grid-container">
            <div class="card">
              <h3>Card Title 1</h3>
              <p>This is a card description with some text content.</p>
              <a href="#" class="btn">Read More</a>
            </div>
            <div class="card">
              <h3>Card Title 2</h3>
              <p>This is another card with different content.</p>
              <a href="#" class="btn">Read More</a>
            </div>
            <div class="card">
              <h3>Card Title 3</h3>
              <p>Third card with unique information.</p>
              <a href="#" class="btn">Read More</a>
            </div>
          </div>
        </body>
        </html>
      `;

      await page.setContent(cardsHTML);
      await page.setViewport({ width: 1200, height: 800 });
      const originalScreenshot = await page.screenshot({ fullPage: true });

      // Generate Elementor HTML from conversion
      const convertedHTML = await generateElementorHTML(cardsHTML);

      await page.setContent(convertedHTML);
      const convertedScreenshot = await page.screenshot({ fullPage: true });

      const comparison = await compareScreenshots(
        originalScreenshot,
        convertedScreenshot
      );

      expect(comparison.similarity).toBeGreaterThan(85);

      await page.close();
    }, 30000);

    it('should produce visually similar output for form', async () => {
      const page = await browser.newPage();

      const formHTML = `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            .contact-form {
              max-width: 600px;
              margin: 40px auto;
              padding: 30px;
              background: #f9f9f9;
              border-radius: 8px;
            }
            .form-group {
              margin-bottom: 20px;
            }
            .form-group label {
              display: block;
              margin-bottom: 5px;
              font-weight: 600;
              color: #333;
            }
            .form-control {
              width: 100%;
              padding: 10px;
              border: 1px solid #ddd;
              border-radius: 4px;
              font-size: 16px;
            }
            .btn {
              padding: 12px 30px;
              background-color: #28a745;
              color: white;
              border: none;
              border-radius: 4px;
              font-size: 16px;
              cursor: pointer;
            }
          </style>
        </head>
        <body>
          <div class="contact-form">
            <form>
              <div class="form-group">
                <label for="name">Name</label>
                <input type="text" id="name" class="form-control" required>
              </div>
              <div class="form-group">
                <label for="email">Email</label>
                <input type="email" id="email" class="form-control" required>
              </div>
              <div class="form-group">
                <label for="message">Message</label>
                <textarea id="message" class="form-control" rows="5"></textarea>
              </div>
              <button type="submit" class="btn">Submit</button>
            </form>
          </div>
        </body>
        </html>
      `;

      await page.setContent(formHTML);
      const originalScreenshot = await page.screenshot({ fullPage: true });

      const convertedHTML = await generateElementorHTML(formHTML);

      await page.setContent(convertedHTML);
      const convertedScreenshot = await page.screenshot({ fullPage: true });

      const comparison = await compareScreenshots(
        originalScreenshot,
        convertedScreenshot
      );

      expect(comparison.similarity).toBeGreaterThan(80);

      await page.close();
    }, 30000);
  });

  describe('Responsive Visual Testing', () => {
    const viewports = [
      { name: 'mobile', width: 375, height: 667 },
      { name: 'tablet', width: 768, height: 1024 },
      { name: 'desktop', width: 1920, height: 1080 },
    ];

    viewports.forEach(viewport => {
      it(`should maintain visual fidelity on ${viewport.name}`, async () => {
        const page = await browser.newPage();
        await page.setViewport({
          width: viewport.width,
          height: viewport.height,
        });

        const responsiveHTML = `
          <!DOCTYPE html>
          <html>
          <head>
            <style>
              * {
                margin: 0;
                padding: 0;
                box-sizing: border-box;
              }
              .container {
                padding: 20px;
              }
              .grid {
                display: grid;
                grid-template-columns: 1fr;
                gap: 20px;
              }
              @media (min-width: 768px) {
                .grid {
                  grid-template-columns: repeat(2, 1fr);
                }
              }
              @media (min-width: 1024px) {
                .grid {
                  grid-template-columns: repeat(3, 1fr);
                }
              }
              .card {
                padding: 20px;
                background: #fff;
                border: 1px solid #ddd;
                border-radius: 8px;
              }
              .card h3 {
                font-size: 20px;
                margin-bottom: 10px;
              }
              .card p {
                color: #666;
              }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="grid">
                <div class="card">
                  <h3>Card 1</h3>
                  <p>Responsive card content</p>
                </div>
                <div class="card">
                  <h3>Card 2</h3>
                  <p>Responsive card content</p>
                </div>
                <div class="card">
                  <h3>Card 3</h3>
                  <p>Responsive card content</p>
                </div>
              </div>
            </div>
          </body>
          </html>
        `;

        await page.setContent(responsiveHTML);
        const originalScreenshot = await page.screenshot({ fullPage: true });

        const convertedHTML = await generateElementorHTML(responsiveHTML);

        await page.setContent(convertedHTML);
        const convertedScreenshot = await page.screenshot({ fullPage: true });

        const comparison = await compareScreenshots(
          originalScreenshot,
          convertedScreenshot
        );

        expect(comparison.similarity).toBeGreaterThan(75);

        await page.close();
      }, 30000);
    });
  });

  describe('Component-Specific Visual Tests', () => {
    it('should accurately render button styles', async () => {
      const page = await browser.newPage();

      const buttonHTML = `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            .btn-container {
              padding: 40px;
              display: flex;
              gap: 20px;
              flex-wrap: wrap;
            }
            .btn {
              padding: 12px 24px;
              border-radius: 5px;
              text-decoration: none;
              font-weight: 600;
              border: none;
              cursor: pointer;
              font-size: 16px;
            }
            .btn-primary {
              background-color: #007bff;
              color: white;
            }
            .btn-secondary {
              background-color: #6c757d;
              color: white;
            }
            .btn-success {
              background-color: #28a745;
              color: white;
            }
            .btn-outline {
              background-color: transparent;
              color: #007bff;
              border: 2px solid #007bff;
            }
          </style>
        </head>
        <body>
          <div class="btn-container">
            <button class="btn btn-primary">Primary Button</button>
            <button class="btn btn-secondary">Secondary Button</button>
            <button class="btn btn-success">Success Button</button>
            <button class="btn btn-outline">Outline Button</button>
          </div>
        </body>
        </html>
      `;

      await page.setContent(buttonHTML);
      const originalScreenshot = await page.screenshot({ fullPage: true });

      const convertedHTML = await generateElementorHTML(buttonHTML);

      await page.setContent(convertedHTML);
      const convertedScreenshot = await page.screenshot({ fullPage: true });

      const comparison = await compareScreenshots(
        originalScreenshot,
        convertedScreenshot
      );

      expect(comparison.similarity).toBeGreaterThan(90);

      await page.close();
    }, 30000);

    it('should accurately render typography', async () => {
      const page = await browser.newPage();

      const typographyHTML = `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            .content {
              max-width: 800px;
              margin: 40px auto;
              padding: 20px;
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            }
            h1 {
              font-size: 48px;
              font-weight: 700;
              color: #1a1a1a;
              margin-bottom: 20px;
            }
            h2 {
              font-size: 36px;
              font-weight: 600;
              color: #2a2a2a;
              margin-bottom: 15px;
            }
            h3 {
              font-size: 28px;
              font-weight: 600;
              color: #3a3a3a;
              margin-bottom: 10px;
            }
            p {
              font-size: 16px;
              line-height: 1.6;
              color: #4a4a4a;
              margin-bottom: 15px;
            }
            .lead {
              font-size: 20px;
              font-weight: 300;
              color: #5a5a5a;
            }
          </style>
        </head>
        <body>
          <div class="content">
            <h1>Main Heading</h1>
            <p class="lead">This is a lead paragraph with larger text.</p>
            <h2>Subheading Level 2</h2>
            <p>Regular paragraph text with proper line height and spacing.</p>
            <h3>Subheading Level 3</h3>
            <p>Another paragraph demonstrating typography conversion.</p>
          </div>
        </body>
        </html>
      `;

      await page.setContent(typographyHTML);
      const originalScreenshot = await page.screenshot({ fullPage: true });

      const convertedHTML = await generateElementorHTML(typographyHTML);

      await page.setContent(convertedHTML);
      const convertedScreenshot = await page.screenshot({ fullPage: true });

      const comparison = await compareScreenshots(
        originalScreenshot,
        convertedScreenshot
      );

      expect(comparison.similarity).toBeGreaterThan(85);

      await page.close();
    }, 30000);

    it('should accurately render spacing and layout', async () => {
      const page = await browser.newPage();

      const layoutHTML = `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            .section {
              padding: 60px 20px;
              margin-bottom: 40px;
              background-color: #f5f5f5;
            }
            .container {
              max-width: 1200px;
              margin: 0 auto;
            }
            .row {
              display: flex;
              gap: 30px;
              margin-bottom: 30px;
            }
            .col {
              flex: 1;
              padding: 20px;
              background-color: white;
              border-radius: 8px;
            }
          </style>
        </head>
        <body>
          <section class="section">
            <div class="container">
              <div class="row">
                <div class="col">Column 1</div>
                <div class="col">Column 2</div>
                <div class="col">Column 3</div>
              </div>
            </div>
          </section>
        </body>
        </html>
      `;

      await page.setContent(layoutHTML);
      const originalScreenshot = await page.screenshot({ fullPage: true });

      const convertedHTML = await generateElementorHTML(layoutHTML);

      await page.setContent(convertedHTML);
      const convertedScreenshot = await page.screenshot({ fullPage: true });

      const comparison = await compareScreenshots(
        originalScreenshot,
        convertedScreenshot
      );

      expect(comparison.similarity).toBeGreaterThan(85);

      await page.close();
    }, 30000);
  });

  describe('Complex Layout Visual Tests', () => {
    it('should handle nested grid layouts', async () => {
      const page = await browser.newPage();
      await page.setViewport({ width: 1200, height: 800 });

      const nestedGridHTML = `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            .outer-grid {
              display: grid;
              grid-template-columns: 1fr 2fr;
              gap: 20px;
              padding: 20px;
            }
            .inner-grid {
              display: grid;
              grid-template-columns: repeat(2, 1fr);
              gap: 10px;
            }
            .box {
              padding: 20px;
              background-color: #e0e0e0;
              border-radius: 4px;
              text-align: center;
            }
          </style>
        </head>
        <body>
          <div class="outer-grid">
            <div class="box">Sidebar</div>
            <div class="inner-grid">
              <div class="box">Item 1</div>
              <div class="box">Item 2</div>
              <div class="box">Item 3</div>
              <div class="box">Item 4</div>
            </div>
          </div>
        </body>
        </html>
      `;

      await page.setContent(nestedGridHTML);
      const originalScreenshot = await page.screenshot({ fullPage: true });

      const convertedHTML = await generateElementorHTML(nestedGridHTML);

      await page.setContent(convertedHTML);
      const convertedScreenshot = await page.screenshot({ fullPage: true });

      const comparison = await compareScreenshots(
        originalScreenshot,
        convertedScreenshot
      );

      expect(comparison.similarity).toBeGreaterThan(80);

      await page.close();
    }, 30000);

    it('should handle flexbox layouts', async () => {
      const page = await browser.newPage();

      const flexboxHTML = `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            .flex-container {
              display: flex;
              justify-content: space-between;
              align-items: center;
              padding: 20px;
              background-color: #f0f0f0;
            }
            .flex-item {
              flex: 0 0 30%;
              padding: 20px;
              background-color: white;
              border-radius: 8px;
              text-align: center;
            }
          </style>
        </head>
        <body>
          <div class="flex-container">
            <div class="flex-item">Flex Item 1</div>
            <div class="flex-item">Flex Item 2</div>
            <div class="flex-item">Flex Item 3</div>
          </div>
        </body>
        </html>
      `;

      await page.setContent(flexboxHTML);
      const originalScreenshot = await page.screenshot({ fullPage: true });

      const convertedHTML = await generateElementorHTML(flexboxHTML);

      await page.setContent(convertedHTML);
      const convertedScreenshot = await page.screenshot({ fullPage: true });

      const comparison = await compareScreenshots(
        originalScreenshot,
        convertedScreenshot
      );

      expect(comparison.similarity).toBeGreaterThan(85);

      await page.close();
    }, 30000);
  });

  describe('Color and Background Visual Tests', () => {
    it('should preserve background colors', async () => {
      const page = await browser.newPage();

      const colorHTML = `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            .color-boxes {
              display: grid;
              grid-template-columns: repeat(4, 1fr);
              gap: 10px;
              padding: 20px;
            }
            .box {
              height: 100px;
              border-radius: 8px;
            }
            .box-1 { background-color: #ff6b6b; }
            .box-2 { background-color: #4ecdc4; }
            .box-3 { background-color: #45b7d1; }
            .box-4 { background-color: #feca57; }
          </style>
        </head>
        <body>
          <div class="color-boxes">
            <div class="box box-1"></div>
            <div class="box box-2"></div>
            <div class="box box-3"></div>
            <div class="box box-4"></div>
          </div>
        </body>
        </html>
      `;

      await page.setContent(colorHTML);
      const originalScreenshot = await page.screenshot({ fullPage: true });

      const convertedHTML = await generateElementorHTML(colorHTML);

      await page.setContent(convertedHTML);
      const convertedScreenshot = await page.screenshot({ fullPage: true });

      const comparison = await compareScreenshots(
        originalScreenshot,
        convertedScreenshot
      );

      // Colors should match exactly
      expect(comparison.similarity).toBeGreaterThan(95);

      await page.close();
    }, 30000);

    it('should preserve gradients', async () => {
      const page = await browser.newPage();

      const gradientHTML = `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            .gradient-box {
              width: 100%;
              height: 300px;
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              display: flex;
              align-items: center;
              justify-content: center;
              color: white;
              font-size: 32px;
              font-weight: bold;
            }
          </style>
        </head>
        <body>
          <div class="gradient-box">
            Gradient Background
          </div>
        </body>
        </html>
      `;

      await page.setContent(gradientHTML);
      const originalScreenshot = await page.screenshot({ fullPage: true });

      const convertedHTML = await generateElementorHTML(gradientHTML);

      await page.setContent(convertedHTML);
      const convertedScreenshot = await page.screenshot({ fullPage: true });

      const comparison = await compareScreenshots(
        originalScreenshot,
        convertedScreenshot
      );

      expect(comparison.similarity).toBeGreaterThan(90);

      await page.close();
    }, 30000);
  });
});
