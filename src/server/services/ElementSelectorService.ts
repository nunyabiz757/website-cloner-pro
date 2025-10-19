import puppeteer, { Browser, Page, ElementHandle } from 'puppeteer';
import * as cheerio from 'cheerio';
import type { CheerioAPI } from 'cheerio';

export interface ElementInfo {
  tagName: string;
  id?: string;
  classes: string[];
  attributes: Record<string, string>;
  text: string;
  innerHTML: string;
  cssSelector: string;
  xpathSelector: string;
  position: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  computedStyles?: Record<string, string>;
  parent?: {
    tagName: string;
    id?: string;
    classes: string[];
  };
  children: Array<{
    tagName: string;
    id?: string;
    classes: string[];
  }>;
}

export interface SelectorSuggestions {
  byId?: string;
  byClass?: string;
  byTagAndClass?: string;
  byAttribute?: string;
  byText?: string;
  byNthChild?: string;
  uniqueSelector: string;
  xpath: string;
  dataTestId?: string;
}

export class ElementSelectorService {
  private browser: Browser | null = null;

  /**
   * Initialize browser instance
   */
  private async getBrowser(): Promise<Browser> {
    if (!this.browser) {
      this.browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });
    }
    return this.browser;
  }

  /**
   * Close browser instance
   */
  async closeBrowser(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  /**
   * Get element information by clicking coordinates
   */
  async getElementAtPosition(
    url: string,
    x: number,
    y: number,
    viewport?: { width: number; height: number }
  ): Promise<ElementInfo | null> {
    const browser = await this.getBrowser();
    const page = await browser.newPage();

    try {
      if (viewport) {
        await page.setViewport(viewport);
      }

      await page.goto(url, { waitUntil: 'networkidle2' });

      // Get element at position
      const elementInfo = await page.evaluate(
        (x: number, y: number) => {
          const element = document.elementFromPoint(x, y);
          if (!element) return null;

          // Generate unique CSS selector
          const generateCssSelector = (el: Element): string => {
            if (el.id) return `#${el.id}`;

            const path: string[] = [];
            let current: Element | null = el;

            while (current && current.nodeType === Node.ELEMENT_NODE) {
              let selector = current.tagName.toLowerCase();

              if (current.id) {
                selector = `#${current.id}`;
                path.unshift(selector);
                break;
              }

              if (current.className) {
                const classes = Array.from(current.classList).join('.');
                if (classes) selector += `.${classes}`;
              }

              // Add nth-child if needed for uniqueness
              const parent = current.parentElement;
              if (parent) {
                const siblings = Array.from(parent.children).filter(
                  (sibling) => sibling.tagName === current!.tagName
                );
                if (siblings.length > 1) {
                  const index = siblings.indexOf(current) + 1;
                  selector += `:nth-child(${index})`;
                }
              }

              path.unshift(selector);
              current = current.parentElement;
            }

            return path.join(' > ');
          };

          // Generate XPath
          const generateXPath = (el: Element): string => {
            if (el.id) return `//*[@id="${el.id}"]`;

            const path: string[] = [];
            let current: Element | null = el;

            while (current && current.nodeType === Node.ELEMENT_NODE) {
              let index = 0;
              let sibling: Element | null = current;

              while (sibling) {
                if (sibling.nodeType === Node.ELEMENT_NODE && sibling.tagName === current.tagName) {
                  index++;
                }
                sibling = sibling.previousElementSibling;
              }

              const tagName = current.tagName.toLowerCase();
              const xpathIndex = index > 1 ? `[${index}]` : '';
              path.unshift(`${tagName}${xpathIndex}`);
              current = current.parentElement;
            }

            return `/${path.join('/')}`;
          };

          // Get computed styles for important properties
          const computedStyle = window.getComputedStyle(element);
          const importantStyles = [
            'display',
            'position',
            'width',
            'height',
            'color',
            'background-color',
            'font-size',
            'font-family',
            'padding',
            'margin',
          ];
          const styles: Record<string, string> = {};
          importantStyles.forEach((prop) => {
            styles[prop] = computedStyle.getPropertyValue(prop);
          });

          const rect = element.getBoundingClientRect();
          const attributes: Record<string, string> = {};
          Array.from(element.attributes).forEach((attr) => {
            attributes[attr.name] = attr.value;
          });

          return {
            tagName: element.tagName.toLowerCase(),
            id: element.id || undefined,
            classes: Array.from(element.classList),
            attributes,
            text: element.textContent?.trim().substring(0, 200) || '',
            innerHTML: element.innerHTML.substring(0, 500),
            cssSelector: generateCssSelector(element),
            xpathSelector: generateXPath(element),
            position: {
              x: rect.x,
              y: rect.y,
              width: rect.width,
              height: rect.height,
            },
            computedStyles: styles,
            parent: element.parentElement
              ? {
                  tagName: element.parentElement.tagName.toLowerCase(),
                  id: element.parentElement.id || undefined,
                  classes: Array.from(element.parentElement.classList),
                }
              : undefined,
            children: Array.from(element.children)
              .slice(0, 10)
              .map((child) => ({
                tagName: child.tagName.toLowerCase(),
                id: child.id || undefined,
                classes: Array.from(child.classList),
              })),
          };
        },
        x,
        y
      );

      await page.close();
      return elementInfo;
    } catch (error) {
      await page.close();
      throw error;
    }
  }

  /**
   * Generate selector suggestions for an element
   */
  async generateSelectorSuggestions(
    url: string,
    targetSelector: string
  ): Promise<SelectorSuggestions> {
    const browser = await this.getBrowser();
    const page = await browser.newPage();

    try {
      await page.goto(url, { waitUntil: 'networkidle2' });

      const suggestions = await page.evaluate((selector: string) => {
        const element = document.querySelector(selector);
        if (!element) return null;

        const suggestions: any = {};

        // By ID
        if (element.id) {
          suggestions.byId = `#${element.id}`;
        }

        // By class
        if (element.classList.length > 0) {
          suggestions.byClass = `.${Array.from(element.classList).join('.')}`;
        }

        // By tag and class
        if (element.classList.length > 0) {
          suggestions.byTagAndClass = `${element.tagName.toLowerCase()}.${Array.from(
            element.classList
          ).join('.')}`;
        }

        // By attribute
        const dataAttrs = Array.from(element.attributes).filter((attr) =>
          attr.name.startsWith('data-')
        );
        if (dataAttrs.length > 0) {
          const attr = dataAttrs[0];
          suggestions.byAttribute = `[${attr.name}="${attr.value}"]`;
        }

        // By text content (for links, buttons)
        if (['a', 'button'].includes(element.tagName.toLowerCase())) {
          const text = element.textContent?.trim();
          if (text && text.length < 50) {
            suggestions.byText = `${element.tagName.toLowerCase()}:contains("${text}")`;
          }
        }

        // By nth-child
        const parent = element.parentElement;
        if (parent) {
          const siblings = Array.from(parent.children);
          const index = siblings.indexOf(element) + 1;
          suggestions.byNthChild = `${element.tagName.toLowerCase()}:nth-child(${index})`;
        }

        // Data-testid
        if (element.hasAttribute('data-testid')) {
          suggestions.dataTestId = `[data-testid="${element.getAttribute('data-testid')}"]`;
        }

        // Generate unique selector
        const generateUnique = (el: Element): string => {
          if (el.id) return `#${el.id}`;

          let path = el.tagName.toLowerCase();
          if (el.className) {
            path += `.${Array.from(el.classList).join('.')}`;
          }

          // Check if unique
          if (document.querySelectorAll(path).length === 1) {
            return path;
          }

          // Add parent context
          let current: Element | null = el;
          const pathParts: string[] = [];

          while (current && current.nodeType === Node.ELEMENT_NODE) {
            let part = current.tagName.toLowerCase();
            if (current.id) {
              pathParts.unshift(`#${current.id}`);
              break;
            }
            if (current.className) {
              part += `.${Array.from(current.classList).join('.')}`;
            }
            pathParts.unshift(part);
            current = current.parentElement;

            // Test if current path is unique
            if (document.querySelectorAll(pathParts.join(' > ')).length === 1) {
              break;
            }
          }

          return pathParts.join(' > ');
        };

        suggestions.uniqueSelector = generateUnique(element);

        // XPath
        const generateXPath = (el: Element): string => {
          if (el.id) return `//*[@id="${el.id}"]`;

          const parts: string[] = [];
          let current: Element | null = el;

          while (current && current.nodeType === Node.ELEMENT_NODE) {
            let index = 1;
            let sibling: Element | null = current.previousElementSibling;

            while (sibling) {
              if (sibling.tagName === current.tagName) {
                index++;
              }
              sibling = sibling.previousElementSibling;
            }

            const tagName = current.tagName.toLowerCase();
            parts.unshift(`${tagName}[${index}]`);
            current = current.parentElement;
          }

          return `/${parts.join('/')}`;
        };

        suggestions.xpath = generateXPath(element);

        return suggestions;
      }, targetSelector);

      await page.close();
      return suggestions || this.getDefaultSuggestions(targetSelector);
    } catch (error) {
      await page.close();
      return this.getDefaultSuggestions(targetSelector);
    }
  }

  /**
   * Find all elements matching a selector
   */
  async findElements(url: string, selector: string): Promise<ElementInfo[]> {
    const browser = await this.getBrowser();
    const page = await browser.newPage();

    try {
      await page.goto(url, { waitUntil: 'networkidle2' });

      const elements = await page.evaluate((sel: string) => {
        const matches = document.querySelectorAll(sel);
        return Array.from(matches).map((element) => {
          const rect = element.getBoundingClientRect();
          const attributes: Record<string, string> = {};
          Array.from(element.attributes).forEach((attr) => {
            attributes[attr.name] = attr.value;
          });

          return {
            tagName: element.tagName.toLowerCase(),
            id: element.id || undefined,
            classes: Array.from(element.classList),
            attributes,
            text: element.textContent?.trim().substring(0, 200) || '',
            innerHTML: element.innerHTML.substring(0, 500),
            position: {
              x: rect.x,
              y: rect.y,
              width: rect.width,
              height: rect.height,
            },
          };
        });
      }, selector);

      await page.close();
      return elements as ElementInfo[];
    } catch (error) {
      await page.close();
      throw error;
    }
  }

  /**
   * Validate selector on page
   */
  async validateSelector(
    url: string,
    selector: string
  ): Promise<{ valid: boolean; count: number; error?: string }> {
    const browser = await this.getBrowser();
    const page = await browser.newPage();

    try {
      await page.goto(url, { waitUntil: 'networkidle2' });

      const result = await page.evaluate((sel: string) => {
        try {
          const elements = document.querySelectorAll(sel);
          return { valid: true, count: elements.length };
        } catch (error) {
          return {
            valid: false,
            count: 0,
            error: error instanceof Error ? error.message : 'Invalid selector',
          };
        }
      }, selector);

      await page.close();
      return result;
    } catch (error) {
      await page.close();
      return {
        valid: false,
        count: 0,
        error: error instanceof Error ? error.message : 'Failed to validate selector',
      };
    }
  }

  /**
   * Get default suggestions when evaluation fails
   */
  private getDefaultSuggestions(selector: string): SelectorSuggestions {
    return {
      uniqueSelector: selector,
      xpath: `//*[contains(@class, "${selector}")]`,
    };
  }

  /**
   * Extract all interactive elements from page
   */
  async extractInteractiveElements(url: string): Promise<ElementInfo[]> {
    const browser = await this.getBrowser();
    const page = await browser.newPage();

    try {
      await page.goto(url, { waitUntil: 'networkidle2' });

      const elements = await page.evaluate(() => {
        const interactiveSelectors = [
          'a[href]',
          'button',
          'input',
          'select',
          'textarea',
          '[onclick]',
          '[role="button"]',
          '[tabindex]',
        ];

        const allInteractive: any[] = [];

        interactiveSelectors.forEach((selector) => {
          const matches = document.querySelectorAll(selector);
          Array.from(matches).forEach((element) => {
            const rect = element.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
              // Only visible elements
              const attributes: Record<string, string> = {};
              Array.from(element.attributes).forEach((attr) => {
                attributes[attr.name] = attr.value;
              });

              allInteractive.push({
                tagName: element.tagName.toLowerCase(),
                id: element.id || undefined,
                classes: Array.from(element.classList),
                attributes,
                text: element.textContent?.trim().substring(0, 100) || '',
                position: {
                  x: rect.x,
                  y: rect.y,
                  width: rect.width,
                  height: rect.height,
                },
              });
            }
          });
        });

        return allInteractive;
      });

      await page.close();
      return elements;
    } catch (error) {
      await page.close();
      throw error;
    }
  }
}
