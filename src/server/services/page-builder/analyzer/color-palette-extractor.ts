/**
 * Global Color Palette Extraction
 *
 * Extracts and organizes a comprehensive color palette from website content:
 * - Primary, secondary, and accent colors
 * - Color usage frequency and context
 * - Color harmonies and relationships
 * - Elementor Global Colors export
 */

import type { ComponentInfo } from '../types/builder.types.js';

export interface ColorPalette {
  primary: ColorDefinition[];
  secondary: ColorDefinition[];
  accent: ColorDefinition[];
  neutral: ColorDefinition[];
  semantic: SemanticColors;
  gradients: GradientDefinition[];
  statistics: ColorStatistics;
  elementorGlobalColors: ElementorGlobalColor[];
}

export interface ColorDefinition {
  hex: string;
  rgb: { r: number; g: number; b: number };
  hsl: { h: number; s: number; l: number };
  name?: string;
  usage: number; // Percentage
  contexts: ColorContext[];
  variations: string[]; // Similar shades
}

export interface ColorContext {
  type: 'text' | 'background' | 'border' | 'button' | 'link' | 'other';
  components: string[]; // Component types using this color
  count: number;
}

export interface SemanticColors {
  success?: ColorDefinition;
  warning?: ColorDefinition;
  error?: ColorDefinition;
  info?: ColorDefinition;
}

export interface GradientDefinition {
  value: string;
  colors: string[];
  usage: number;
  type: 'linear' | 'radial' | 'conic';
}

export interface ColorStatistics {
  totalColors: number;
  totalUniqueColors: number;
  averageColorsPerPage: number;
  mostUsedColor: string;
  dominantHue: string; // 'red', 'blue', 'green', etc.
  colorScheme: 'monochromatic' | 'analogous' | 'complementary' | 'triadic' | 'diverse';
}

export interface ElementorGlobalColor {
  _id: string;
  title: string;
  color: string;
}

export class ColorPaletteExtractor {
  private colorUsage: Map<string, ColorUsageData> = new Map();
  private gradients: Map<string, number> = new Map();

  /**
   * Extract color palette from page components
   */
  extract(pageComponents: Map<string, ComponentInfo[]>): ColorPalette {
    // Collect all colors
    this.collectColors(pageComponents);

    // Categorize colors
    const primary = this.identifyPrimaryColors();
    const secondary = this.identifySecondaryColors();
    const accent = this.identifyAccentColors();
    const neutral = this.identifyNeutralColors();
    const semantic = this.identifySemanticColors();
    const gradients = this.extractGradients();

    // Calculate statistics
    const statistics = this.calculateStatistics(pageComponents.size);

    // Generate Elementor global colors
    const elementorGlobalColors = this.generateElementorGlobalColors(
      primary,
      secondary,
      accent,
      neutral
    );

    return {
      primary,
      secondary,
      accent,
      neutral,
      semantic,
      gradients,
      statistics,
      elementorGlobalColors,
    };
  }

  /**
   * Collect all colors from components
   */
  private collectColors(pageComponents: Map<string, ComponentInfo[]>): void {
    for (const [pageId, components] of pageComponents) {
      for (const component of components) {
        if (!component.styles) continue;

        // Text color
        const color = component.styles.color;
        if (color && typeof color === 'string' && !color.includes('gradient')) {
          this.trackColor(color, 'text', component.componentType);
        }

        // Background color
        const bgColor = component.styles.backgroundColor;
        if (bgColor && typeof bgColor === 'string') {
          if (bgColor.includes('gradient')) {
            this.gradients.set(bgColor, (this.gradients.get(bgColor) || 0) + 1);
          } else {
            this.trackColor(bgColor, 'background', component.componentType);
          }
        }

        // Border color
        const borderColor = component.styles.borderColor;
        if (borderColor && typeof borderColor === 'string' && !borderColor.includes('gradient')) {
          this.trackColor(borderColor, 'border', component.componentType);
        }

        // Special handling for buttons and links
        if (component.componentType === 'button') {
          if (color) this.trackColor(String(color), 'button', 'button');
          if (bgColor) this.trackColor(String(bgColor), 'button', 'button');
        }

        if (component.tagName === 'a') {
          if (color) this.trackColor(String(color), 'link', 'link');
        }
      }
    }
  }

  /**
   * Track color usage
   */
  private trackColor(color: string, context: ColorContext['type'], componentType: string): void {
    const normalized = this.normalizeColor(color);
    if (!normalized) return;

    if (!this.colorUsage.has(normalized)) {
      this.colorUsage.set(normalized, {
        count: 0,
        contexts: new Map(),
      });
    }

    const usage = this.colorUsage.get(normalized)!;
    usage.count++;

    if (!usage.contexts.has(context)) {
      usage.contexts.set(context, {
        components: new Set(),
        count: 0,
      });
    }

    const ctx = usage.contexts.get(context)!;
    ctx.count++;
    ctx.components.add(componentType);
  }

  /**
   * Normalize color to hex format
   */
  private normalizeColor(color: string): string | null {
    color = color.trim().toLowerCase();

    // Already hex
    if (color.startsWith('#')) {
      return color.length === 4
        ? '#' + color[1] + color[1] + color[2] + color[2] + color[3] + color[3]
        : color;
    }

    // RGB/RGBA
    const rgbMatch = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (rgbMatch) {
      const r = parseInt(rgbMatch[1]);
      const g = parseInt(rgbMatch[2]);
      const b = parseInt(rgbMatch[3]);
      return this.rgbToHex(r, g, b);
    }

    // Named colors (basic support)
    const namedColors: Record<string, string> = {
      black: '#000000',
      white: '#ffffff',
      red: '#ff0000',
      green: '#008000',
      blue: '#0000ff',
      yellow: '#ffff00',
      cyan: '#00ffff',
      magenta: '#ff00ff',
      gray: '#808080',
      grey: '#808080',
    };

    return namedColors[color] || null;
  }

  /**
   * Convert RGB to hex
   */
  private rgbToHex(r: number, g: number, b: number): string {
    return '#' + [r, g, b].map(x => {
      const hex = x.toString(16);
      return hex.length === 1 ? '0' + hex : hex;
    }).join('');
  }

  /**
   * Convert hex to RGB
   */
  private hexToRgb(hex: string): { r: number; g: number; b: number } {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16),
    } : { r: 0, g: 0, b: 0 };
  }

  /**
   * Convert RGB to HSL
   */
  private rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
    r /= 255;
    g /= 255;
    b /= 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h = 0, s = 0, l = (max + min) / 2;

    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

      switch (max) {
        case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
        case g: h = ((b - r) / d + 2) / 6; break;
        case b: h = ((r - g) / d + 4) / 6; break;
      }
    }

    return {
      h: Math.round(h * 360),
      s: Math.round(s * 100),
      l: Math.round(l * 100),
    };
  }

  /**
   * Identify primary colors (most frequently used)
   */
  private identifyPrimaryColors(): ColorDefinition[] {
    const totalUsage = Array.from(this.colorUsage.values())
      .reduce((sum, data) => sum + data.count, 0);

    return Array.from(this.colorUsage.entries())
      .filter(([_, data]) => (data.count / totalUsage) * 100 >= 10) // Used in 10%+ of cases
      .map(([hex, data]) => this.createColorDefinition(hex, data, totalUsage))
      .sort((a, b) => b.usage - a.usage)
      .slice(0, 3);
  }

  /**
   * Identify secondary colors
   */
  private identifySecondaryColors(): ColorDefinition[] {
    const totalUsage = Array.from(this.colorUsage.values())
      .reduce((sum, data) => sum + data.count, 0);

    return Array.from(this.colorUsage.entries())
      .filter(([_, data]) => {
        const percentage = (data.count / totalUsage) * 100;
        return percentage >= 2 && percentage < 10;
      })
      .map(([hex, data]) => this.createColorDefinition(hex, data, totalUsage))
      .sort((a, b) => b.usage - a.usage)
      .slice(0, 5);
  }

  /**
   * Identify accent colors
   */
  private identifyAccentColors(): ColorDefinition[] {
    const totalUsage = Array.from(this.colorUsage.values())
      .reduce((sum, data) => sum + data.count, 0);

    const allColors = Array.from(this.colorUsage.entries())
      .map(([hex, data]) => this.createColorDefinition(hex, data, totalUsage));

    // Accent colors are vibrant colors used sparingly
    return allColors
      .filter(color => {
        const hsl = color.hsl;
        return hsl.s > 40 && hsl.l > 30 && hsl.l < 70 && color.usage < 10;
      })
      .sort((a, b) => b.usage - a.usage)
      .slice(0, 3);
  }

  /**
   * Identify neutral colors (grays, whites, blacks)
   */
  private identifyNeutralColors(): ColorDefinition[] {
    const totalUsage = Array.from(this.colorUsage.values())
      .reduce((sum, data) => sum + data.count, 0);

    const allColors = Array.from(this.colorUsage.entries())
      .map(([hex, data]) => this.createColorDefinition(hex, data, totalUsage));

    // Neutral colors have low saturation
    return allColors
      .filter(color => color.hsl.s < 20)
      .sort((a, b) => b.usage - a.usage)
      .slice(0, 5);
  }

  /**
   * Identify semantic colors (success, warning, error, info)
   */
  private identifySemanticColors(): SemanticColors {
    const allColors = Array.from(this.colorUsage.entries());

    const semantic: SemanticColors = {};

    for (const [hex, data] of allColors) {
      const hsl = this.rgbToHsl(...Object.values(this.hexToRgb(hex)));

      // Success (green hues: 90-150)
      if (!semantic.success && hsl.h >= 90 && hsl.h <= 150 && hsl.s > 30) {
        semantic.success = this.createColorDefinition(hex, data, 1);
      }

      // Warning (yellow/orange hues: 30-60)
      if (!semantic.warning && hsl.h >= 30 && hsl.h <= 60 && hsl.s > 40) {
        semantic.warning = this.createColorDefinition(hex, data, 1);
      }

      // Error (red hues: 0-30 or 330-360)
      if (!semantic.error && ((hsl.h >= 0 && hsl.h <= 30) || hsl.h >= 330) && hsl.s > 40) {
        semantic.error = this.createColorDefinition(hex, data, 1);
      }

      // Info (blue hues: 180-240)
      if (!semantic.info && hsl.h >= 180 && hsl.h <= 240 && hsl.s > 30) {
        semantic.info = this.createColorDefinition(hex, data, 1);
      }
    }

    return semantic;
  }

  /**
   * Extract gradients
   */
  private extractGradients(): GradientDefinition[] {
    const totalGradients = Array.from(this.gradients.values())
      .reduce((sum, count) => sum + count, 0);

    return Array.from(this.gradients.entries())
      .map(([value, count]) => {
        const colors = this.extractGradientColors(value);
        const type = value.includes('radial') ? 'radial'
          : value.includes('conic') ? 'conic'
          : 'linear';

        return {
          value,
          colors,
          usage: (count / totalGradients) * 100,
          type,
        };
      })
      .sort((a, b) => b.usage - a.usage)
      .slice(0, 5);
  }

  /**
   * Extract colors from gradient string
   */
  private extractGradientColors(gradient: string): string[] {
    const colorRegex = /#[0-9a-f]{6}|#[0-9a-f]{3}|rgba?\([^)]+\)/gi;
    const matches = gradient.match(colorRegex) || [];
    return matches.map(c => this.normalizeColor(c)).filter((c): c is string => c !== null);
  }

  /**
   * Create color definition
   */
  private createColorDefinition(
    hex: string,
    data: ColorUsageData,
    totalUsage: number
  ): ColorDefinition {
    const rgb = this.hexToRgb(hex);
    const hsl = this.rgbToHsl(rgb.r, rgb.g, rgb.b);

    const contexts: ColorContext[] = Array.from(data.contexts.entries()).map(([type, ctx]) => ({
      type,
      components: Array.from(ctx.components),
      count: ctx.count,
    }));

    return {
      hex,
      rgb,
      hsl,
      usage: (data.count / totalUsage) * 100,
      contexts,
      variations: [], // Could implement shade detection
    };
  }

  /**
   * Calculate color statistics
   */
  private calculateStatistics(pageCount: number): ColorStatistics {
    const totalUniqueColors = this.colorUsage.size;
    const totalColors = Array.from(this.colorUsage.values())
      .reduce((sum, data) => sum + data.count, 0);

    const mostUsedEntry = Array.from(this.colorUsage.entries())
      .sort((a, b) => b[1].count - a[1].count)[0];

    const mostUsedColor = mostUsedEntry ? mostUsedEntry[0] : '#000000';

    // Determine dominant hue
    const hues: number[] = [];
    for (const hex of this.colorUsage.keys()) {
      const hsl = this.rgbToHsl(...Object.values(this.hexToRgb(hex)));
      hues.push(hsl.h);
    }

    const avgHue = hues.reduce((a, b) => a + b, 0) / hues.length;
    const dominantHue = this.getHueName(avgHue);

    // Determine color scheme
    const colorScheme = this.determineColorScheme(hues);

    return {
      totalColors,
      totalUniqueColors,
      averageColorsPerPage: totalColors / pageCount,
      mostUsedColor,
      dominantHue,
      colorScheme,
    };
  }

  /**
   * Get hue name from angle
   */
  private getHueName(hue: number): string {
    if (hue >= 0 && hue < 30) return 'red';
    if (hue >= 30 && hue < 60) return 'orange';
    if (hue >= 60 && hue < 90) return 'yellow';
    if (hue >= 90 && hue < 150) return 'green';
    if (hue >= 150 && hue < 210) return 'cyan';
    if (hue >= 210 && hue < 270) return 'blue';
    if (hue >= 270 && hue < 330) return 'purple';
    return 'red';
  }

  /**
   * Determine color scheme type
   */
  private determineColorScheme(hues: number[]): ColorStatistics['colorScheme'] {
    if (hues.length < 2) return 'monochromatic';

    const spread = Math.max(...hues) - Math.min(...hues);

    if (spread < 30) return 'monochromatic';
    if (spread < 60) return 'analogous';
    if (spread > 300) return 'diverse';

    // Check for complementary (opposite hues)
    const hasComplementary = hues.some((h1, i) =>
      hues.slice(i + 1).some(h2 => Math.abs(h1 - h2 - 180) < 30)
    );

    if (hasComplementary) return 'complementary';

    return 'diverse';
  }

  /**
   * Generate Elementor global colors
   */
  private generateElementorGlobalColors(
    primary: ColorDefinition[],
    secondary: ColorDefinition[],
    accent: ColorDefinition[],
    neutral: ColorDefinition[]
  ): ElementorGlobalColor[] {
    const globalColors: ElementorGlobalColor[] = [];

    // Add primary colors
    primary.forEach((color, i) => {
      globalColors.push({
        _id: `primary_${i + 1}`,
        title: `Primary ${i + 1}`,
        color: color.hex,
      });
    });

    // Add secondary colors
    secondary.slice(0, 2).forEach((color, i) => {
      globalColors.push({
        _id: `secondary_${i + 1}`,
        title: `Secondary ${i + 1}`,
        color: color.hex,
      });
    });

    // Add accent colors
    accent.slice(0, 2).forEach((color, i) => {
      globalColors.push({
        _id: `accent_${i + 1}`,
        title: `Accent ${i + 1}`,
        color: color.hex,
      });
    });

    // Add neutral colors (text, background)
    if (neutral.length > 0) {
      const darkest = neutral.sort((a, b) => a.hsl.l - b.hsl.l)[0];
      const lightest = neutral.sort((a, b) => b.hsl.l - a.hsl.l)[0];

      globalColors.push({
        _id: 'text',
        title: 'Text',
        color: darkest.hex,
      });

      globalColors.push({
        _id: 'background',
        title: 'Background',
        color: lightest.hex,
      });
    }

    return globalColors;
  }
}

interface ColorUsageData {
  count: number;
  contexts: Map<ColorContext['type'], {
    components: Set<string>;
    count: number;
  }>;
}

/**
 * Helper function for quick extraction
 */
export function extractColorPalette(
  pageComponents: Map<string, ComponentInfo[]>
): ColorPalette {
  const extractor = new ColorPaletteExtractor();
  return extractor.extract(pageComponents);
}
