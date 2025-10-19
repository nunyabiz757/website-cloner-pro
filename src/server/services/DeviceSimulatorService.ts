import puppeteer, { Browser, Page, Viewport } from 'puppeteer';
import path from 'path';
import fs from 'fs/promises';

interface DeviceProfile {
  name: string;
  width: number;
  height: number;
  deviceScaleFactor: number;
  userAgent: string;
  hasTouch: boolean;
  isMobile: boolean;
  category: 'mobile' | 'tablet' | 'desktop' | 'wearable';
}

interface ScreenshotOptions {
  fullPage?: boolean;
  quality?: number;
  type?: 'png' | 'jpeg' | 'webp';
}

interface SimulationResult {
  device: string;
  screenshot: string; // Base64 or file path
  metrics: {
    loadTime: number;
    domContentLoaded: number;
    firstPaint: number;
    layoutShifts: number;
  };
  issues: string[];
  viewport: Viewport;
}

export class DeviceSimulatorService {
  private readonly devices: Map<string, DeviceProfile> = new Map();

  constructor() {
    this.initializeDeviceProfiles();
  }

  /**
   * Initialize common device profiles
   */
  private initializeDeviceProfiles(): void {
    const profiles: DeviceProfile[] = [
      // Mobile Devices
      {
        name: 'iPhone SE',
        width: 375,
        height: 667,
        deviceScaleFactor: 2,
        userAgent:
          'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15',
        hasTouch: true,
        isMobile: true,
        category: 'mobile',
      },
      {
        name: 'iPhone 12 Pro',
        width: 390,
        height: 844,
        deviceScaleFactor: 3,
        userAgent:
          'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15',
        hasTouch: true,
        isMobile: true,
        category: 'mobile',
      },
      {
        name: 'iPhone 14 Pro Max',
        width: 430,
        height: 932,
        deviceScaleFactor: 3,
        userAgent:
          'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15',
        hasTouch: true,
        isMobile: true,
        category: 'mobile',
      },
      {
        name: 'Samsung Galaxy S21',
        width: 360,
        height: 800,
        deviceScaleFactor: 3,
        userAgent:
          'Mozilla/5.0 (Linux; Android 11; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.120 Mobile Safari/537.36',
        hasTouch: true,
        isMobile: true,
        category: 'mobile',
      },
      {
        name: 'Google Pixel 6',
        width: 412,
        height: 915,
        deviceScaleFactor: 2.625,
        userAgent:
          'Mozilla/5.0 (Linux; Android 12; Pixel 6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/94.0.4606.61 Mobile Safari/537.36',
        hasTouch: true,
        isMobile: true,
        category: 'mobile',
      },

      // Tablets
      {
        name: 'iPad',
        width: 768,
        height: 1024,
        deviceScaleFactor: 2,
        userAgent:
          'Mozilla/5.0 (iPad; CPU OS 14_0 like Mac OS X) AppleWebKit/605.1.15',
        hasTouch: true,
        isMobile: false,
        category: 'tablet',
      },
      {
        name: 'iPad Pro 11',
        width: 834,
        height: 1194,
        deviceScaleFactor: 2,
        userAgent:
          'Mozilla/5.0 (iPad; CPU OS 14_0 like Mac OS X) AppleWebKit/605.1.15',
        hasTouch: true,
        isMobile: false,
        category: 'tablet',
      },
      {
        name: 'iPad Pro 12.9',
        width: 1024,
        height: 1366,
        deviceScaleFactor: 2,
        userAgent:
          'Mozilla/5.0 (iPad; CPU OS 14_0 like Mac OS X) AppleWebKit/605.1.15',
        hasTouch: true,
        isMobile: false,
        category: 'tablet',
      },
      {
        name: 'Samsung Galaxy Tab S7',
        width: 753,
        height: 1037,
        deviceScaleFactor: 2,
        userAgent:
          'Mozilla/5.0 (Linux; Android 11; SM-T870) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.120 Safari/537.36',
        hasTouch: true,
        isMobile: false,
        category: 'tablet',
      },

      // Desktop
      {
        name: 'Desktop 1080p',
        width: 1920,
        height: 1080,
        deviceScaleFactor: 1,
        userAgent:
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/94.0.4606.61 Safari/537.36',
        hasTouch: false,
        isMobile: false,
        category: 'desktop',
      },
      {
        name: 'Desktop 1440p',
        width: 2560,
        height: 1440,
        deviceScaleFactor: 1,
        userAgent:
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/94.0.4606.61 Safari/537.36',
        hasTouch: false,
        isMobile: false,
        category: 'desktop',
      },
      {
        name: 'MacBook Pro 13',
        width: 1440,
        height: 900,
        deviceScaleFactor: 2,
        userAgent:
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/94.0.4606.61 Safari/537.36',
        hasTouch: false,
        isMobile: false,
        category: 'desktop',
      },
      {
        name: 'MacBook Pro 16',
        width: 1728,
        height: 1117,
        deviceScaleFactor: 2,
        userAgent:
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/94.0.4606.61 Safari/537.36',
        hasTouch: false,
        isMobile: false,
        category: 'desktop',
      },
    ];

    profiles.forEach((profile) => {
      this.devices.set(profile.name, profile);
    });
  }

  /**
   * Get all device profiles
   */
  getDeviceProfiles(): DeviceProfile[] {
    return Array.from(this.devices.values());
  }

  /**
   * Get devices by category
   */
  getDevicesByCategory(category: 'mobile' | 'tablet' | 'desktop'): DeviceProfile[] {
    return Array.from(this.devices.values()).filter((d) => d.category === category);
  }

  /**
   * Get device profile by name
   */
  getDevice(name: string): DeviceProfile | null {
    return this.devices.get(name) || null;
  }

  /**
   * Simulate website on specific device
   */
  async simulateDevice(
    url: string,
    deviceName: string,
    options: ScreenshotOptions = {}
  ): Promise<SimulationResult> {
    const device = this.devices.get(deviceName);
    if (!device) {
      throw new Error(`Device profile '${deviceName}' not found`);
    }

    let browser: Browser | null = null;

    try {
      browser = await puppeteer.launch({ headless: true });
      const page = await browser.newPage();

      // Set viewport and device emulation
      await page.setViewport({
        width: device.width,
        height: device.height,
        deviceScaleFactor: device.deviceScaleFactor,
        hasTouch: device.hasTouch,
        isMobile: device.isMobile,
      });

      await page.setUserAgent(device.userAgent);

      // Track performance metrics
      const metrics = {
        loadTime: 0,
        domContentLoaded: 0,
        firstPaint: 0,
        layoutShifts: 0,
      };

      // Listen for layout shifts
      await page.evaluateOnNewDocument(() => {
        let clsScore = 0;
        const observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if ((entry as any).hadRecentInput) continue;
            clsScore += (entry as any).value;
          }
          (window as any).__clsScore = clsScore;
        });
        observer.observe({ type: 'layout-shift', buffered: true });
      });

      const startTime = Date.now();

      // Navigate to URL
      await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });

      metrics.loadTime = Date.now() - startTime;

      // Get performance timing
      const performanceTiming = await page.evaluate(() => {
        const timing = performance.timing;
        return {
          domContentLoaded: timing.domContentLoadedEventEnd - timing.navigationStart,
          firstPaint: performance
            .getEntriesByType('paint')
            .find((entry) => entry.name === 'first-paint')?.startTime || 0,
        };
      });

      metrics.domContentLoaded = performanceTiming.domContentLoaded;
      metrics.firstPaint = performanceTiming.firstPaint;

      // Get CLS score
      metrics.layoutShifts = await page.evaluate(() => (window as any).__clsScore || 0);

      // Take screenshot
      const screenshot = await page.screenshot({
        fullPage: options.fullPage !== false,
        quality: options.quality || 90,
        type: options.type || 'png',
        encoding: 'base64',
      });

      // Check for responsive issues
      const issues = await this.detectResponsiveIssues(page, device);

      await browser.close();

      return {
        device: deviceName,
        screenshot: `data:image/${options.type || 'png'};base64,${screenshot}`,
        metrics,
        issues,
        viewport: {
          width: device.width,
          height: device.height,
          deviceScaleFactor: device.deviceScaleFactor,
        },
      };
    } catch (error) {
      if (browser) await browser.close();
      throw error;
    }
  }

  /**
   * Simulate on multiple devices
   */
  async simulateMultipleDevices(
    url: string,
    deviceNames: string[],
    options: ScreenshotOptions = {}
  ): Promise<SimulationResult[]> {
    const results: SimulationResult[] = [];

    for (const deviceName of deviceNames) {
      try {
        const result = await this.simulateDevice(url, deviceName, options);
        results.push(result);
      } catch (error) {
        console.error(`Failed to simulate ${deviceName}:`, error);
      }
    }

    return results;
  }

  /**
   * Simulate all devices in category
   */
  async simulateCategory(
    url: string,
    category: 'mobile' | 'tablet' | 'desktop',
    options: ScreenshotOptions = {}
  ): Promise<SimulationResult[]> {
    const devices = this.getDevicesByCategory(category);
    const deviceNames = devices.map((d) => d.name);
    return this.simulateMultipleDevices(url, deviceNames, options);
  }

  /**
   * Detect responsive issues on page
   */
  private async detectResponsiveIssues(page: Page, device: DeviceProfile): Promise<string[]> {
    const issues: string[] = [];

    // Check for horizontal overflow
    const hasOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });

    if (hasOverflow) {
      issues.push('Horizontal scrollbar detected - content wider than viewport');
    }

    // Check for fixed-width elements
    const fixedWidthElements = await page.evaluate((viewportWidth) => {
      const elements = document.querySelectorAll('*');
      const fixed: string[] = [];

      elements.forEach((el) => {
        const styles = window.getComputedStyle(el);
        const width = parseInt(styles.width);

        if (width > viewportWidth && !styles.maxWidth) {
          const selector =
            el.id ? `#${el.id}` : el.className ? `.${el.className.split(' ')[0]}` : el.tagName;
          fixed.push(selector);
        }
      });

      return fixed.slice(0, 5); // Limit to first 5
    }, device.width);

    if (fixedWidthElements.length > 0) {
      issues.push(
        `Fixed-width elements detected: ${fixedWidthElements.join(', ')}`
      );
    }

    // Check for small touch targets (mobile only)
    if (device.isMobile) {
      const smallTouchTargets = await page.evaluate(() => {
        const minSize = 44; // Apple's recommended minimum
        const interactive = document.querySelectorAll('a, button, input, select, textarea');
        const small: string[] = [];

        interactive.forEach((el) => {
          const rect = el.getBoundingClientRect();
          if (rect.width < minSize || rect.height < minSize) {
            const selector =
              el.id ? `#${el.id}` : el.className ? `.${el.className.split(' ')[0]}` : el.tagName;
            small.push(selector);
          }
        });

        return small.slice(0, 5);
      });

      if (smallTouchTargets.length > 0) {
        issues.push(
          `Small touch targets detected (< 44px): ${smallTouchTargets.join(', ')}`
        );
      }
    }

    // Check for tiny text
    const tinyText = await page.evaluate(() => {
      const minSize = 12;
      const elements = document.querySelectorAll('*');
      const tiny: string[] = [];

      elements.forEach((el) => {
        const styles = window.getComputedStyle(el);
        const fontSize = parseInt(styles.fontSize);

        if (fontSize < minSize && el.textContent && el.textContent.trim()) {
          const selector =
            el.id ? `#${el.id}` : el.className ? `.${el.className.split(' ')[0]}` : el.tagName;
          tiny.push(selector);
        }
      });

      return tiny.slice(0, 3);
    });

    if (tinyText.length > 0) {
      issues.push(`Text too small (< 12px): ${tinyText.join(', ')}`);
    }

    return issues;
  }

  /**
   * Create custom device profile
   */
  addCustomDevice(profile: DeviceProfile): void {
    this.devices.set(profile.name, profile);
  }

  /**
   * Test responsive breakpoints
   */
  async testBreakpoints(
    url: string,
    breakpoints: number[]
  ): Promise<
    Array<{
      width: number;
      screenshot: string;
      issues: string[];
    }>
  > {
    const results = [];

    for (const width of breakpoints) {
      const customDevice: DeviceProfile = {
        name: `Custom ${width}px`,
        width,
        height: 1080,
        deviceScaleFactor: 1,
        userAgent:
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        hasTouch: false,
        isMobile: width < 768,
        category: width < 768 ? 'mobile' : width < 1024 ? 'tablet' : 'desktop',
      };

      this.addCustomDevice(customDevice.name);
      this.devices.set(customDevice.name, customDevice);

      const result = await this.simulateDevice(url, customDevice.name);
      results.push({
        width,
        screenshot: result.screenshot,
        issues: result.issues,
      });
    }

    return results;
  }

  /**
   * Rotate device (portrait/landscape)
   */
  async simulateRotation(
    url: string,
    deviceName: string
  ): Promise<{
    portrait: SimulationResult;
    landscape: SimulationResult;
  }> {
    const device = this.devices.get(deviceName);
    if (!device) {
      throw new Error(`Device '${deviceName}' not found`);
    }

    // Portrait (original)
    const portrait = await this.simulateDevice(url, deviceName);

    // Landscape (rotated)
    const landscapeDevice: DeviceProfile = {
      ...device,
      name: `${deviceName} (Landscape)`,
      width: device.height,
      height: device.width,
    };

    this.addCustomDevice(landscapeDevice.name);
    const landscape = await this.simulateDevice(url, landscapeDevice.name);

    return { portrait, landscape };
  }
}
