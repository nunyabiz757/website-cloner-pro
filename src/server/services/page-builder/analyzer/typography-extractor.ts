/**
 * Typography System Extraction
 *
 * Extracts a comprehensive typography system from website content:
 * - Font families and weights
 * - Type scale (font sizes)
 * - Line heights and letter spacing
 * - Text styles for headings, body, etc.
 * - Elementor Global Fonts export
 */

import type { ComponentInfo } from '../types/builder.types.js';

export interface TypographySystem {
  fontFamilies: FontFamily[];
  typeScale: TypeScale;
  textStyles: TextStyles;
  globalSettings: GlobalTypographySettings;
  statistics: TypographyStatistics;
  elementorGlobalFonts: ElementorGlobalFont[];
}

export interface FontFamily {
  name: string;
  weights: FontWeight[];
  usage: number; // Percentage
  contexts: FontContext[];
  fallbacks?: string[];
  googleFont?: boolean;
}

export interface FontWeight {
  weight: number | string;
  style: 'normal' | 'italic';
  usage: number;
}

export interface FontContext {
  type: 'heading' | 'body' | 'button' | 'caption' | 'other';
  components: string[];
  count: number;
}

export interface TypeScale {
  base: number; // Base font size in px
  ratio: number; // Scale ratio (e.g., 1.25 for major third)
  sizes: TypeSize[];
  headingSizes: Record<string, number>; // h1-h6 sizes
}

export interface TypeSize {
  name: string; // 'xs', 'sm', 'base', 'lg', 'xl', etc.
  px: number;
  rem: number;
  usage: number;
  contexts: string[];
}

export interface TextStyles {
  h1: TextStyle;
  h2: TextStyle;
  h3: TextStyle;
  h4: TextStyle;
  h5: TextStyle;
  h6: TextStyle;
  body: TextStyle;
  bodyLarge: TextStyle;
  bodySmall: TextStyle;
  button: TextStyle;
  caption: TextStyle;
  link: TextStyle;
}

export interface TextStyle {
  fontFamily: string;
  fontSize: string;
  fontWeight: string | number;
  lineHeight: string | number;
  letterSpacing?: string;
  textTransform?: string;
  color?: string;
  usage: number;
}

export interface GlobalTypographySettings {
  baseFontSize: number; // px
  baseFontFamily: string;
  baseLineHeight: number;
  baseColor: string;
  headingFontFamily?: string;
  headingFontWeight?: number;
  headingColor?: string;
  headingLineHeight?: number;
}

export interface TypographyStatistics {
  totalFontFamilies: number;
  totalFontSizes: number;
  averageFontSize: number;
  mostUsedFont: string;
  mostUsedSize: string;
  hasConsistentTypeScale: boolean;
  typeScaleQuality: 'excellent' | 'good' | 'fair' | 'poor';
}

export interface ElementorGlobalFont {
  _id: string;
  title: string;
  typography_font_family: string;
  typography_font_weight: string;
  typography_font_size: { unit: string; size: number };
  typography_line_height: { unit: string; size: number };
}

export class TypographyExtractor {
  private fontUsage: Map<string, FontUsageData> = new Map();
  private sizeUsage: Map<number, SizeUsageData> = new Map();
  private headingStyles: Map<string, TextStyle[]> = new Map();

  /**
   * Extract typography system from page components
   */
  extract(pageComponents: Map<string, ComponentInfo[]>): TypographySystem {
    // Collect typography data
    this.collectTypography(pageComponents);

    // Extract font families
    const fontFamilies = this.extractFontFamilies();

    // Extract type scale
    const typeScale = this.extractTypeScale();

    // Extract text styles
    const textStyles = this.extractTextStyles();

    // Determine global settings
    const globalSettings = this.determineGlobalSettings(fontFamilies, typeScale);

    // Calculate statistics
    const statistics = this.calculateStatistics();

    // Generate Elementor global fonts
    const elementorGlobalFonts = this.generateElementorGlobalFonts(textStyles, globalSettings);

    return {
      fontFamilies,
      typeScale,
      textStyles,
      globalSettings,
      statistics,
      elementorGlobalFonts,
    };
  }

  /**
   * Collect typography data from components
   */
  private collectTypography(pageComponents: Map<string, ComponentInfo[]>): void {
    for (const [pageId, components] of pageComponents) {
      for (const component of components) {
        if (!component.styles) continue;

        const fontFamily = this.normalizeFontFamily(component.styles.fontFamily as string);
        const fontSize = this.parseFontSize(component.styles.fontSize as string);
        const fontWeight = component.styles.fontWeight || 400;
        const lineHeight = component.styles.lineHeight;
        const letterSpacing = component.styles.letterSpacing;
        const color = component.styles.color;

        // Track font family
        if (fontFamily) {
          this.trackFont(fontFamily, component.componentType, fontWeight);
        }

        // Track font size
        if (fontSize) {
          this.trackSize(fontSize, component.componentType);
        }

        // Track heading styles
        if (component.tagName?.match(/^h[1-6]$/)) {
          this.trackHeadingStyle(component.tagName, {
            fontFamily: fontFamily || 'inherit',
            fontSize: fontSize ? `${fontSize}px` : 'inherit',
            fontWeight: String(fontWeight),
            lineHeight: String(lineHeight || 1.2),
            letterSpacing: String(letterSpacing || 'normal'),
            color: String(color || 'inherit'),
            usage: 1,
          });
        }
      }
    }
  }

  /**
   * Normalize font family name
   */
  private normalizeFontFamily(fontFamily: string | undefined): string | null {
    if (!fontFamily) return null;

    // Remove quotes and extra whitespace
    let normalized = fontFamily
      .replace(/['"]/g, '')
      .split(',')[0]
      .trim();

    return normalized || null;
  }

  /**
   * Parse font size to pixels
   */
  private parseFontSize(fontSize: string | undefined): number | null {
    if (!fontSize) return null;

    // Already in px
    const pxMatch = fontSize.match(/^(\d+(?:\.\d+)?)px$/);
    if (pxMatch) {
      return parseFloat(pxMatch[1]);
    }

    // In rem (assume 16px base)
    const remMatch = fontSize.match(/^(\d+(?:\.\d+)?)rem$/);
    if (remMatch) {
      return parseFloat(remMatch[1]) * 16;
    }

    // In em (assume 16px base)
    const emMatch = fontSize.match(/^(\d+(?:\.\d+)?)em$/);
    if (emMatch) {
      return parseFloat(emMatch[1]) * 16;
    }

    return null;
  }

  /**
   * Track font usage
   */
  private trackFont(fontFamily: string, context: string, weight: string | number): void {
    if (!this.fontUsage.has(fontFamily)) {
      this.fontUsage.set(fontFamily, {
        count: 0,
        weights: new Map(),
        contexts: new Map(),
      });
    }

    const usage = this.fontUsage.get(fontFamily)!;
    usage.count++;

    // Track weight
    const weightStr = String(weight);
    usage.weights.set(weightStr, (usage.weights.get(weightStr) || 0) + 1);

    // Track context
    const contextType = this.getContextType(context);
    if (!usage.contexts.has(contextType)) {
      usage.contexts.set(contextType, { components: new Set(), count: 0 });
    }
    usage.contexts.get(contextType)!.count++;
    usage.contexts.get(contextType)!.components.add(context);
  }

  /**
   * Track font size usage
   */
  private trackSize(size: number, context: string): void {
    const rounded = Math.round(size);

    if (!this.sizeUsage.has(rounded)) {
      this.sizeUsage.set(rounded, {
        count: 0,
        contexts: new Set(),
      });
    }

    const usage = this.sizeUsage.get(rounded)!;
    usage.count++;
    usage.contexts.add(context);
  }

  /**
   * Track heading style
   */
  private trackHeadingStyle(tag: string, style: TextStyle): void {
    if (!this.headingStyles.has(tag)) {
      this.headingStyles.set(tag, []);
    }
    this.headingStyles.get(tag)!.push(style);
  }

  /**
   * Get context type from component type
   */
  private getContextType(componentType: string): FontContext['type'] {
    if (componentType.match(/^h[1-6]$/) || componentType === 'heading') return 'heading';
    if (componentType === 'button') return 'button';
    if (componentType === 'caption' || componentType === 'small') return 'caption';
    if (componentType === 'paragraph' || componentType === 'div' || componentType === 'span') return 'body';
    return 'other';
  }

  /**
   * Extract font families
   */
  private extractFontFamilies(): FontFamily[] {
    const totalUsage = Array.from(this.fontUsage.values())
      .reduce((sum, data) => sum + data.count, 0);

    return Array.from(this.fontUsage.entries())
      .map(([name, data]) => {
        const weights: FontWeight[] = Array.from(data.weights.entries()).map(([weight, count]) => ({
          weight: isNaN(Number(weight)) ? weight : Number(weight),
          style: 'normal',
          usage: (count / data.count) * 100,
        }));

        const contexts: FontContext[] = Array.from(data.contexts.entries()).map(([type, ctx]) => ({
          type,
          components: Array.from(ctx.components),
          count: ctx.count,
        }));

        return {
          name,
          weights,
          usage: (data.count / totalUsage) * 100,
          contexts,
          googleFont: this.isGoogleFont(name),
        };
      })
      .sort((a, b) => b.usage - a.usage);
  }

  /**
   * Check if font is a Google Font
   */
  private isGoogleFont(fontName: string): boolean {
    const commonGoogleFonts = [
      'Roboto', 'Open Sans', 'Lato', 'Montserrat', 'Roboto Condensed',
      'Source Sans Pro', 'Oswald', 'Raleway', 'PT Sans', 'Merriweather',
      'Nunito', 'Playfair Display', 'Poppins', 'Ubuntu', 'Roboto Slab',
    ];

    return commonGoogleFonts.some(gf => fontName.includes(gf));
  }

  /**
   * Extract type scale
   */
  private extractTypeScale(): TypeScale {
    const sizes = Array.from(this.sizeUsage.entries())
      .sort((a, b) => a[0] - b[0]);

    if (sizes.length === 0) {
      return {
        base: 16,
        ratio: 1.25,
        sizes: [],
        headingSizes: {},
      };
    }

    // Determine base size (most common size around 14-18px)
    const baseCandidates = sizes.filter(([size]) => size >= 14 && size <= 18);
    const base = baseCandidates.length > 0
      ? baseCandidates.sort((a, b) => b[1].count - a[1].count)[0][0]
      : 16;

    // Calculate scale ratio
    const ratio = this.calculateScaleRatio(sizes.map(([s]) => s), base);

    // Create type scale
    const totalUsage = sizes.reduce((sum, [_, data]) => sum + data.count, 0);

    const typeSizes: TypeSize[] = sizes.map(([px, data]) => ({
      name: this.getSizeName(px, base),
      px,
      rem: Math.round((px / base) * 100) / 100,
      usage: (data.count / totalUsage) * 100,
      contexts: Array.from(data.contexts),
    }));

    // Extract heading sizes
    const headingSizes: Record<string, number> = {};
    for (const [tag, styles] of this.headingStyles) {
      const avgSize = styles.reduce((sum, s) => {
        const size = this.parseFontSize(s.fontSize);
        return sum + (size || 16);
      }, 0) / styles.length;
      headingSizes[tag] = Math.round(avgSize);
    }

    return {
      base,
      ratio,
      sizes: typeSizes,
      headingSizes,
    };
  }

  /**
   * Calculate scale ratio
   */
  private calculateScaleRatio(sizes: number[], base: number): number {
    if (sizes.length < 2) return 1.25;

    // Find sizes above base
    const aboveBase = sizes.filter(s => s > base).sort((a, b) => a - b);

    if (aboveBase.length === 0) return 1.25;

    // Calculate ratio between consecutive sizes
    const ratios: number[] = [];
    for (let i = 1; i < aboveBase.length; i++) {
      ratios.push(aboveBase[i] / aboveBase[i - 1]);
    }

    // Return average ratio or common scale
    const avgRatio = ratios.reduce((a, b) => a + b, 0) / ratios.length;

    // Round to common type scale ratios
    const commonRatios = [1.125, 1.2, 1.25, 1.333, 1.414, 1.5, 1.618];
    const closest = commonRatios.reduce((prev, curr) =>
      Math.abs(curr - avgRatio) < Math.abs(prev - avgRatio) ? curr : prev
    );

    return closest;
  }

  /**
   * Get size name
   */
  private getSizeName(px: number, base: number): string {
    const ratio = px / base;

    if (ratio <= 0.75) return 'xs';
    if (ratio <= 0.875) return 'sm';
    if (ratio <= 1.125) return 'base';
    if (ratio <= 1.25) return 'lg';
    if (ratio <= 1.5) return 'xl';
    if (ratio <= 1.875) return '2xl';
    if (ratio <= 2.25) return '3xl';
    if (ratio <= 3) return '4xl';
    if (ratio <= 4) return '5xl';
    return '6xl';
  }

  /**
   * Extract text styles
   */
  private extractTextStyles(): TextStyles {
    const styles: Partial<TextStyles> = {};

    // Extract heading styles
    for (let i = 1; i <= 6; i++) {
      const tag = `h${i}`;
      styles[tag as keyof TextStyles] = this.getAverageStyle(tag);
    }

    // Extract body styles
    styles.body = this.getAverageStyle('p', 'paragraph');
    styles.bodyLarge = this.getStyleVariant('p', 'large');
    styles.bodySmall = this.getStyleVariant('p', 'small');

    // Extract other styles
    styles.button = this.getAverageStyle('button');
    styles.caption = this.getAverageStyle('caption', 'small');
    styles.link = this.getAverageStyle('a');

    return styles as TextStyles;
  }

  /**
   * Get average style for a component type
   */
  private getAverageStyle(...types: string[]): TextStyle {
    const styles = this.headingStyles.get(types[0]) || [];

    if (styles.length === 0) {
      return {
        fontFamily: 'inherit',
        fontSize: '16px',
        fontWeight: 400,
        lineHeight: 1.5,
        usage: 0,
      };
    }

    // Average the styles
    const avg = styles.reduce((acc, style) => {
      return {
        fontFamily: style.fontFamily,
        fontSize: style.fontSize,
        fontWeight: style.fontWeight,
        lineHeight: style.lineHeight,
        letterSpacing: style.letterSpacing,
        textTransform: style.textTransform,
        color: style.color,
        usage: acc.usage + 1,
      };
    }, {
      fontFamily: '',
      fontSize: '',
      fontWeight: '',
      lineHeight: '',
      usage: 0,
    } as any);

    return {
      fontFamily: styles[0].fontFamily,
      fontSize: styles[0].fontSize,
      fontWeight: styles[0].fontWeight,
      lineHeight: styles[0].lineHeight,
      letterSpacing: styles[0].letterSpacing,
      usage: (avg.usage / styles.length) * 100,
    };
  }

  /**
   * Get style variant
   */
  private getStyleVariant(type: string, variant: 'large' | 'small'): TextStyle {
    return this.getAverageStyle(type);
  }

  /**
   * Determine global typography settings
   */
  private determineGlobalSettings(
    fontFamilies: FontFamily[],
    typeScale: TypeScale
  ): GlobalTypographySettings {
    const bodyFont = fontFamilies.find(f =>
      f.contexts.some(c => c.type === 'body')
    ) || fontFamilies[0];

    const headingFont = fontFamilies.find(f =>
      f.contexts.some(c => c.type === 'heading')
    ) || bodyFont;

    return {
      baseFontSize: typeScale.base,
      baseFontFamily: bodyFont?.name || 'sans-serif',
      baseLineHeight: 1.5,
      baseColor: '#000000',
      headingFontFamily: headingFont?.name,
      headingFontWeight: 700,
      headingColor: '#000000',
      headingLineHeight: 1.2,
    };
  }

  /**
   * Calculate typography statistics
   */
  private calculateStatistics(): TypographyStatistics {
    const totalFontFamilies = this.fontUsage.size;
    const totalFontSizes = this.sizeUsage.size;

    const sizes = Array.from(this.sizeUsage.keys());
    const averageFontSize = sizes.reduce((a, b) => a + b, 0) / sizes.length;

    const mostUsedFont = Array.from(this.fontUsage.entries())
      .sort((a, b) => b[1].count - a[1].count)[0]?.[0] || 'Unknown';

    const mostUsedSize = Array.from(this.sizeUsage.entries())
      .sort((a, b) => b[1].count - a[1].count)[0]?.[0] || 16;

    // Check for consistent type scale
    const hasConsistentTypeScale = totalFontSizes <= 10 && totalFontSizes >= 5;

    // Determine quality
    let typeScaleQuality: TypographyStatistics['typeScaleQuality'];
    if (totalFontSizes <= 8 && totalFontFamilies <= 2) {
      typeScaleQuality = 'excellent';
    } else if (totalFontSizes <= 12 && totalFontFamilies <= 3) {
      typeScaleQuality = 'good';
    } else if (totalFontSizes <= 16 && totalFontFamilies <= 4) {
      typeScaleQuality = 'fair';
    } else {
      typeScaleQuality = 'poor';
    }

    return {
      totalFontFamilies,
      totalFontSizes,
      averageFontSize: Math.round(averageFontSize),
      mostUsedFont,
      mostUsedSize: `${mostUsedSize}px`,
      hasConsistentTypeScale,
      typeScaleQuality,
    };
  }

  /**
   * Generate Elementor global fonts
   */
  private generateElementorGlobalFonts(
    textStyles: TextStyles,
    globalSettings: GlobalTypographySettings
  ): ElementorGlobalFont[] {
    const globalFonts: ElementorGlobalFont[] = [];

    // Primary font (body)
    globalFonts.push({
      _id: 'primary',
      title: 'Primary',
      typography_font_family: globalSettings.baseFontFamily,
      typography_font_weight: '400',
      typography_font_size: { unit: 'px', size: globalSettings.baseFontSize },
      typography_line_height: { unit: 'em', size: globalSettings.baseLineHeight },
    });

    // Secondary font (headings)
    if (globalSettings.headingFontFamily) {
      globalFonts.push({
        _id: 'secondary',
        title: 'Secondary',
        typography_font_family: globalSettings.headingFontFamily,
        typography_font_weight: String(globalSettings.headingFontWeight || 700),
        typography_font_size: { unit: 'px', size: 24 },
        typography_line_height: { unit: 'em', size: globalSettings.headingLineHeight || 1.2 },
      });
    }

    // Heading styles
    ['h1', 'h2', 'h3'].forEach(tag => {
      const style = textStyles[tag as keyof TextStyles];
      const size = this.parseFontSize(style.fontSize) || 24;

      globalFonts.push({
        _id: tag,
        title: tag.toUpperCase(),
        typography_font_family: style.fontFamily,
        typography_font_weight: String(style.fontWeight),
        typography_font_size: { unit: 'px', size },
        typography_line_height: { unit: 'em', size: parseFloat(String(style.lineHeight)) || 1.2 },
      });
    });

    return globalFonts;
  }
}

interface FontUsageData {
  count: number;
  weights: Map<string, number>;
  contexts: Map<FontContext['type'], {
    components: Set<string>;
    count: number;
  }>;
}

interface SizeUsageData {
  count: number;
  contexts: Set<string>;
}

/**
 * Helper function for quick extraction
 */
export function extractTypography(
  pageComponents: Map<string, ComponentInfo[]>
): TypographySystem {
  const extractor = new TypographyExtractor();
  return extractor.extract(pageComponents);
}
