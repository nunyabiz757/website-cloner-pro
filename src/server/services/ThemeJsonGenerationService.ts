import * as cheerio from 'cheerio';
import tinycolor from 'tinycolor2';

/**
 * WordPress Theme.json Generation Service
 *
 * Generates theme.json files for WordPress Full Site Editing (FSE) themes including:
 * - Design token extraction
 * - Color palette generation
 * - Typography scale extraction
 * - Spacing and layout settings
 */

// Types
export interface ThemeJson {
  $schema: string;
  version: number;
  settings: ThemeSettings;
  styles?: ThemeStyles;
  templateParts?: TemplatePart[];
  customTemplates?: CustomTemplate[];
  patterns?: string[];
}

export interface ThemeSettings {
  appearanceTools?: boolean;
  useRootPaddingAwareAlignments?: boolean;
  color?: ColorSettings;
  typography?: TypographySettings;
  spacing?: SpacingSettings;
  layout?: LayoutSettings;
  custom?: Record<string, any>;
}

export interface ColorSettings {
  defaultPalette?: boolean;
  defaultGradients?: boolean;
  defaultDuotone?: boolean;
  palette?: ColorPalette[];
  gradients?: Gradient[];
  duotone?: Duotone[];
  link?: boolean;
  text?: boolean;
  background?: boolean;
  custom?: boolean;
}

export interface ColorPalette {
  slug: string;
  color: string;
  name: string;
}

export interface Gradient {
  slug: string;
  gradient: string;
  name: string;
}

export interface Duotone {
  slug: string;
  colors: [string, string];
  name: string;
}

export interface TypographySettings {
  defaultFontSizes?: boolean;
  fontSizes?: FontSize[];
  fontFamilies?: FontFamily[];
  fontWeight?: boolean;
  fontStyle?: boolean;
  textTransform?: boolean;
  textDecoration?: boolean;
  letterSpacing?: boolean;
  lineHeight?: boolean;
  dropCap?: boolean;
  fluid?: boolean | FluidTypography;
  customFontSize?: boolean;
}

export interface FontSize {
  slug: string;
  size: string;
  name: string;
  fluid?: boolean | FluidValue;
}

export interface FluidTypography {
  minFontSize: string;
  maxFontSize?: string;
}

export interface FluidValue {
  min: string;
  max: string;
}

export interface FontFamily {
  slug: string;
  fontFamily: string;
  name: string;
}

export interface SpacingSettings {
  blockGap?: boolean | string;
  margin?: boolean;
  padding?: boolean;
  spacingScale?: SpacingScale;
  spacingSizes?: SpacingSize[];
  units?: string[];
  customSpacingSize?: boolean;
}

export interface SpacingScale {
  operator?: string;
  increment?: number;
  steps?: number;
  mediumStep?: number;
  unit?: string;
}

export interface SpacingSize {
  slug: string;
  size: string;
  name: string;
}

export interface LayoutSettings {
  contentSize?: string;
  wideSize?: string;
  allowEditing?: boolean;
  allowCustomContentAndWideSize?: boolean;
}

export interface ThemeStyles {
  color?: StyleColor;
  typography?: StyleTypography;
  spacing?: StyleSpacing;
  blocks?: Record<string, BlockStyles>;
  elements?: Record<string, ElementStyles>;
}

export interface StyleColor {
  background?: string;
  text?: string;
  gradient?: string;
}

export interface StyleTypography {
  fontFamily?: string;
  fontSize?: string;
  fontWeight?: string;
  lineHeight?: string;
  fontStyle?: string;
}

export interface StyleSpacing {
  margin?: SpacingValue;
  padding?: SpacingValue;
  blockGap?: string;
}

export interface SpacingValue {
  top?: string;
  right?: string;
  bottom?: string;
  left?: string;
}

export interface BlockStyles {
  color?: StyleColor;
  typography?: StyleTypography;
  spacing?: StyleSpacing;
}

export interface ElementStyles {
  color?: StyleColor;
  typography?: StyleTypography;
  spacing?: StyleSpacing;
}

export interface TemplatePart {
  name: string;
  title: string;
  area: string;
}

export interface CustomTemplate {
  name: string;
  title: string;
  postTypes?: string[];
}

export interface DesignTokens {
  colors: ExtractedColors;
  typography: ExtractedTypography;
  spacing: ExtractedSpacing;
  layout: ExtractedLayout;
}

export interface ExtractedColors {
  primary: string[];
  secondary: string[];
  neutral: string[];
  accent: string[];
  semantic: {
    success?: string;
    warning?: string;
    error?: string;
    info?: string;
  };
  extracted: ColorPalette[];
}

export interface ExtractedTypography {
  fontFamilies: string[];
  fontSizes: number[];
  fontWeights: number[];
  lineHeights: number[];
  scale: FontSize[];
}

export interface ExtractedSpacing {
  margins: number[];
  paddings: number[];
  gaps: number[];
  scale: SpacingSize[];
}

export interface ExtractedLayout {
  maxWidth: number;
  contentWidth: number;
  wideWidth: number;
  containerPadding: number;
}

class ThemeJsonGenerationService {
  /**
   * Generate complete theme.json from HTML and CSS
   */
  async generateThemeJson(
    html: string,
    css: string,
    options?: {
      themeName?: string;
      includeDefaultPalettes?: boolean;
      fluidTypography?: boolean;
    }
  ): Promise<ThemeJson> {
    // Extract design tokens
    const tokens = this.extractDesignTokens(html, css);

    // Generate theme.json structure
    const themeJson: ThemeJson = {
      $schema: 'https://schemas.wp.org/trunk/theme.json',
      version: 2,
      settings: {
        appearanceTools: true,
        useRootPaddingAwareAlignments: true,
        color: this.generateColorSettings(tokens.colors, options?.includeDefaultPalettes),
        typography: this.generateTypographySettings(tokens.typography, options?.fluidTypography),
        spacing: this.generateSpacingSettings(tokens.spacing),
        layout: this.generateLayoutSettings(tokens.layout),
      },
      styles: this.generateThemeStyles(tokens),
      templateParts: this.generateTemplateParts(),
      customTemplates: this.generateCustomTemplates(),
    };

    return themeJson;
  }

  /**
   * Extract design tokens from HTML and CSS
   */
  extractDesignTokens(html: string, css: string): DesignTokens {
    const $ = cheerio.load(html);

    // Extract colors
    const colors = this.extractColors(html, css, $);

    // Extract typography
    const typography = this.extractTypography(html, css, $);

    // Extract spacing
    const spacing = this.extractSpacing(html, css, $);

    // Extract layout
    const layout = this.extractLayout(html, css, $);

    return {
      colors,
      typography,
      spacing,
      layout,
    };
  }

  /**
   * Extract colors from HTML and CSS
   */
  private extractColors(html: string, css: string, $: cheerio.CheerioAPI): ExtractedColors {
    const colors: Set<string> = new Set();

    // Extract from inline styles
    $('[style*="color"], [style*="background"]').each((_, element) => {
      const style = $(element).attr('style') || '';
      const colorMatches = style.match(/#[0-9a-fA-F]{3,6}|rgb\([^)]+\)|rgba\([^)]+\)/g);
      if (colorMatches) {
        colorMatches.forEach(color => colors.add(this.normalizeColor(color)));
      }
    });

    // Extract from CSS
    const cssColorMatches = css.match(/#[0-9a-fA-F]{3,6}|rgb\([^)]+\)|rgba\([^)]+\)/g);
    if (cssColorMatches) {
      cssColorMatches.forEach(color => colors.add(this.normalizeColor(color)));
    }

    // Convert to array and categorize
    const colorArray = Array.from(colors);
    const categorized = this.categorizeColors(colorArray);

    // Generate color palette
    const extracted = this.generateColorPalette(categorized);

    return {
      ...categorized,
      extracted,
    };
  }

  /**
   * Normalize color to hex format
   */
  private normalizeColor(color: string): string {
    const tc = tinycolor(color);
    return tc.isValid() ? tc.toHexString() : color;
  }

  /**
   * Categorize colors into groups
   */
  private categorizeColors(colors: string[]): {
    primary: string[];
    secondary: string[];
    neutral: string[];
    accent: string[];
    semantic: Record<string, string>;
  } {
    const primary: string[] = [];
    const secondary: string[] = [];
    const neutral: string[] = [];
    const accent: string[] = [];
    const semantic: Record<string, string> = {};

    colors.forEach(color => {
      const tc = tinycolor(color);
      if (!tc.isValid()) return;

      const hsl = tc.toHsl();

      // Categorize by saturation and lightness
      if (hsl.s < 0.1) {
        // Neutral colors (grays)
        neutral.push(color);
      } else if (hsl.l < 0.3) {
        // Dark colors
        primary.push(color);
      } else if (hsl.l > 0.7) {
        // Light colors
        secondary.push(color);
      } else {
        // Mid-tone colors
        accent.push(color);
      }

      // Semantic colors
      if (this.isGreenish(hsl) && !semantic.success) {
        semantic.success = color;
      } else if (this.isYellowish(hsl) && !semantic.warning) {
        semantic.warning = color;
      } else if (this.isReddish(hsl) && !semantic.error) {
        semantic.error = color;
      } else if (this.isBluish(hsl) && !semantic.info) {
        semantic.info = color;
      }
    });

    return {
      primary: this.selectMostDistinct(primary, 3),
      secondary: this.selectMostDistinct(secondary, 3),
      neutral: this.selectMostDistinct(neutral, 5),
      accent: this.selectMostDistinct(accent, 3),
      semantic,
    };
  }

  /**
   * Check if color is greenish
   */
  private isGreenish(hsl: { h: number; s: number; l: number }): boolean {
    return hsl.h >= 90 && hsl.h <= 150 && hsl.s > 0.3;
  }

  /**
   * Check if color is yellowish
   */
  private isYellowish(hsl: { h: number; s: number; l: number }): boolean {
    return hsl.h >= 40 && hsl.h <= 60 && hsl.s > 0.4;
  }

  /**
   * Check if color is reddish
   */
  private isReddish(hsl: { h: number; s: number; l: number }): boolean {
    return (hsl.h >= 0 && hsl.h <= 20) || (hsl.h >= 340 && hsl.h <= 360);
  }

  /**
   * Check if color is bluish
   */
  private isBluish(hsl: { h: number; s: number; l: number }): boolean {
    return hsl.h >= 200 && hsl.h <= 240 && hsl.s > 0.3;
  }

  /**
   * Select most distinct colors from array
   */
  private selectMostDistinct(colors: string[], count: number): string[] {
    if (colors.length <= count) return colors;

    const selected: string[] = [colors[0]];

    while (selected.length < count && selected.length < colors.length) {
      let maxDistance = 0;
      let nextColor = '';

      colors.forEach(color => {
        if (selected.includes(color)) return;

        const minDistanceToSelected = Math.min(
          ...selected.map(s => this.colorDistance(color, s))
        );

        if (minDistanceToSelected > maxDistance) {
          maxDistance = minDistanceToSelected;
          nextColor = color;
        }
      });

      if (nextColor) selected.push(nextColor);
      else break;
    }

    return selected;
  }

  /**
   * Calculate color distance
   */
  private colorDistance(color1: string, color2: string): number {
    const c1 = tinycolor(color1).toRgb();
    const c2 = tinycolor(color2).toRgb();

    return Math.sqrt(
      Math.pow(c1.r - c2.r, 2) +
      Math.pow(c1.g - c2.g, 2) +
      Math.pow(c1.b - c2.b, 2)
    );
  }

  /**
   * Generate color palette from categorized colors
   */
  private generateColorPalette(categorized: {
    primary: string[];
    secondary: string[];
    neutral: string[];
    accent: string[];
    semantic: Record<string, string>;
  }): ColorPalette[] {
    const palette: ColorPalette[] = [];

    // Primary colors
    categorized.primary.forEach((color, i) => {
      palette.push({
        slug: `primary-${i + 1}`,
        color,
        name: `Primary ${i + 1}`,
      });
    });

    // Secondary colors
    categorized.secondary.forEach((color, i) => {
      palette.push({
        slug: `secondary-${i + 1}`,
        color,
        name: `Secondary ${i + 1}`,
      });
    });

    // Neutral colors
    categorized.neutral.forEach((color, i) => {
      palette.push({
        slug: `neutral-${i + 1}`,
        color,
        name: `Neutral ${i + 1}`,
      });
    });

    // Accent colors
    categorized.accent.forEach((color, i) => {
      palette.push({
        slug: `accent-${i + 1}`,
        color,
        name: `Accent ${i + 1}`,
      });
    });

    // Semantic colors
    Object.entries(categorized.semantic).forEach(([key, color]) => {
      palette.push({
        slug: key,
        color,
        name: key.charAt(0).toUpperCase() + key.slice(1),
      });
    });

    return palette;
  }

  /**
   * Extract typography from HTML and CSS
   */
  private extractTypography(html: string, css: string, $: cheerio.CheerioAPI): ExtractedTypography {
    const fontFamilies: Set<string> = new Set();
    const fontSizes: Set<number> = new Set();
    const fontWeights: Set<number> = new Set();
    const lineHeights: Set<number> = new Set();

    // Extract from CSS
    const fontFamilyMatches = css.match(/font-family:\s*([^;]+)/g);
    if (fontFamilyMatches) {
      fontFamilyMatches.forEach(match => {
        const family = match.replace(/font-family:\s*/, '').trim();
        fontFamilies.add(this.normalizeFontFamily(family));
      });
    }

    const fontSizeMatches = css.match(/font-size:\s*(\d+(?:\.\d+)?)(px|rem|em)/g);
    if (fontSizeMatches) {
      fontSizeMatches.forEach(match => {
        const size = parseFloat(match.match(/(\d+(?:\.\d+)?)/)?.[1] || '0');
        if (size > 0) fontSizes.add(size);
      });
    }

    const fontWeightMatches = css.match(/font-weight:\s*(\d+|normal|bold)/g);
    if (fontWeightMatches) {
      fontWeightMatches.forEach(match => {
        const weight = this.normalizeFontWeight(match.replace(/font-weight:\s*/, ''));
        if (weight) fontWeights.add(weight);
      });
    }

    const lineHeightMatches = css.match(/line-height:\s*(\d+(?:\.\d+)?)/g);
    if (lineHeightMatches) {
      lineHeightMatches.forEach(match => {
        const height = parseFloat(match.match(/(\d+(?:\.\d+)?)/)?.[1] || '0');
        if (height > 0) lineHeights.add(height);
      });
    }

    // Generate typography scale
    const scale = this.generateTypographyScale(Array.from(fontSizes));

    return {
      fontFamilies: Array.from(fontFamilies),
      fontSizes: Array.from(fontSizes).sort((a, b) => a - b),
      fontWeights: Array.from(fontWeights).sort((a, b) => a - b),
      lineHeights: Array.from(lineHeights).sort((a, b) => a - b),
      scale,
    };
  }

  /**
   * Normalize font family
   */
  private normalizeFontFamily(family: string): string {
    return family
      .replace(/['"]/g, '')
      .split(',')[0]
      .trim();
  }

  /**
   * Normalize font weight
   */
  private normalizeFontWeight(weight: string): number | null {
    const weightMap: Record<string, number> = {
      normal: 400,
      bold: 700,
    };

    const parsed = parseInt(weight);
    if (!isNaN(parsed)) return parsed;

    return weightMap[weight.toLowerCase()] || null;
  }

  /**
   * Generate typography scale
   */
  private generateTypographyScale(fontSizes: number[]): FontSize[] {
    const scale: FontSize[] = [];
    const sizes = fontSizes.sort((a, b) => a - b);

    const sizeNames = ['Small', 'Medium', 'Large', 'X-Large', 'XX-Large'];
    const slugs = ['small', 'medium', 'large', 'x-large', 'xx-large'];

    if (sizes.length === 0) {
      // Default scale
      return [
        { slug: 'small', size: '0.875rem', name: 'Small' },
        { slug: 'medium', size: '1rem', name: 'Medium' },
        { slug: 'large', size: '1.25rem', name: 'Large' },
        { slug: 'x-large', size: '1.5rem', name: 'X-Large' },
        { slug: 'xx-large', size: '2rem', name: 'XX-Large' },
      ];
    }

    // Create scale from detected sizes
    const step = Math.floor(sizes.length / 5);
    for (let i = 0; i < Math.min(5, sizes.length); i++) {
      const index = Math.min(i * step, sizes.length - 1);
      scale.push({
        slug: slugs[i],
        size: `${sizes[index]}px`,
        name: sizeNames[i],
      });
    }

    return scale;
  }

  /**
   * Extract spacing from HTML and CSS
   */
  private extractSpacing(html: string, css: string, $: cheerio.CheerioAPI): ExtractedSpacing {
    const margins: Set<number> = new Set();
    const paddings: Set<number> = new Set();
    const gaps: Set<number> = new Set();

    // Extract from CSS
    const marginMatches = css.match(/margin(?:-(?:top|right|bottom|left))?:\s*(\d+(?:\.\d+)?)(px|rem|em)/g);
    if (marginMatches) {
      marginMatches.forEach(match => {
        const value = parseFloat(match.match(/(\d+(?:\.\d+)?)/)?.[1] || '0');
        if (value > 0) margins.add(value);
      });
    }

    const paddingMatches = css.match(/padding(?:-(?:top|right|bottom|left))?:\s*(\d+(?:\.\d+)?)(px|rem|em)/g);
    if (paddingMatches) {
      paddingMatches.forEach(match => {
        const value = parseFloat(match.match(/(\d+(?:\.\d+)?)/)?.[1] || '0');
        if (value > 0) paddings.add(value);
      });
    }

    const gapMatches = css.match(/gap:\s*(\d+(?:\.\d+)?)(px|rem|em)/g);
    if (gapMatches) {
      gapMatches.forEach(match => {
        const value = parseFloat(match.match(/(\d+(?:\.\d+)?)/)?.[1] || '0');
        if (value > 0) gaps.add(value);
      });
    }

    // Generate spacing scale
    const scale = this.generateSpacingScale(
      Array.from(new Set([...margins, ...paddings, ...gaps]))
    );

    return {
      margins: Array.from(margins).sort((a, b) => a - b),
      paddings: Array.from(paddings).sort((a, b) => a - b),
      gaps: Array.from(gaps).sort((a, b) => a - b),
      scale,
    };
  }

  /**
   * Generate spacing scale
   */
  private generateSpacingScale(spacings: number[]): SpacingSize[] {
    const scale: SpacingSize[] = [];
    const sizes = spacings.sort((a, b) => a - b);

    const sizeNames = ['Small', 'Medium', 'Large', 'X-Large', 'XX-Large'];
    const slugs = ['small', 'medium', 'large', 'x-large', 'xx-large'];

    if (sizes.length === 0) {
      // Default scale (8px base)
      return [
        { slug: 'small', size: '0.5rem', name: 'Small' },
        { slug: 'medium', size: '1rem', name: 'Medium' },
        { slug: 'large', size: '1.5rem', name: 'Large' },
        { slug: 'x-large', size: '2rem', name: 'X-Large' },
        { slug: 'xx-large', size: '3rem', name: 'XX-Large' },
      ];
    }

    const step = Math.floor(sizes.length / 5);
    for (let i = 0; i < Math.min(5, sizes.length); i++) {
      const index = Math.min(i * step, sizes.length - 1);
      scale.push({
        slug: slugs[i],
        size: `${sizes[index]}px`,
        name: sizeNames[i],
      });
    }

    return scale;
  }

  /**
   * Extract layout information
   */
  private extractLayout(html: string, css: string, $: cheerio.CheerioAPI): ExtractedLayout {
    let maxWidth = 1200;
    let contentWidth = 840;
    let wideWidth = 1000;
    let containerPadding = 20;

    // Look for container max-width
    const maxWidthMatches = css.match(/max-width:\s*(\d+)(px|rem|em)/g);
    if (maxWidthMatches) {
      const widths = maxWidthMatches
        .map(m => parseFloat(m.match(/(\d+)/)?.[1] || '0'))
        .filter(w => w > 0)
        .sort((a, b) => b - a);

      if (widths.length > 0) maxWidth = widths[0];
      if (widths.length > 1) wideWidth = widths[1];
      if (widths.length > 2) contentWidth = widths[2];
    }

    // Look for padding
    const paddingMatches = css.match(/padding(?:-(?:left|right))?:\s*(\d+)(px|rem|em)/g);
    if (paddingMatches) {
      const paddings = paddingMatches
        .map(m => parseFloat(m.match(/(\d+)/)?.[1] || '0'))
        .filter(p => p > 0);

      if (paddings.length > 0) {
        containerPadding = Math.max(...paddings.slice(0, 5));
      }
    }

    return {
      maxWidth,
      contentWidth,
      wideWidth,
      containerPadding,
    };
  }

  /**
   * Generate color settings
   */
  private generateColorSettings(colors: ExtractedColors, includeDefaults = false): ColorSettings {
    return {
      defaultPalette: includeDefaults,
      defaultGradients: false,
      defaultDuotone: false,
      palette: colors.extracted,
      link: true,
      text: true,
      background: true,
      custom: true,
    };
  }

  /**
   * Generate typography settings
   */
  private generateTypographySettings(
    typography: ExtractedTypography,
    fluidTypography = true
  ): TypographySettings {
    const fontFamilies: FontFamily[] = typography.fontFamilies.map((family, i) => ({
      slug: `font-${i + 1}`,
      fontFamily: family,
      name: family,
    }));

    return {
      defaultFontSizes: false,
      fontSizes: typography.scale,
      fontFamilies,
      fontWeight: true,
      fontStyle: true,
      textTransform: true,
      textDecoration: true,
      letterSpacing: true,
      lineHeight: true,
      dropCap: true,
      fluid: fluidTypography,
      customFontSize: true,
    };
  }

  /**
   * Generate spacing settings
   */
  private generateSpacingSettings(spacing: ExtractedSpacing): SpacingSettings {
    return {
      blockGap: true,
      margin: true,
      padding: true,
      spacingSizes: spacing.scale,
      units: ['px', 'em', 'rem', '%', 'vh', 'vw'],
      customSpacingSize: true,
    };
  }

  /**
   * Generate layout settings
   */
  private generateLayoutSettings(layout: ExtractedLayout): LayoutSettings {
    return {
      contentSize: `${layout.contentWidth}px`,
      wideSize: `${layout.wideWidth}px`,
      allowEditing: true,
      allowCustomContentAndWideSize: true,
    };
  }

  /**
   * Generate theme styles
   */
  private generateThemeStyles(tokens: DesignTokens): ThemeStyles {
    const primaryColor = tokens.colors.primary[0] || '#000000';
    const backgroundColor = tokens.colors.neutral[tokens.colors.neutral.length - 1] || '#ffffff';
    const textColor = tokens.colors.neutral[0] || '#000000';

    return {
      color: {
        background: backgroundColor,
        text: textColor,
      },
      typography: {
        fontFamily: tokens.typography.fontFamilies[0] || 'system-ui',
        fontSize: '1rem',
        lineHeight: '1.5',
      },
      spacing: {
        blockGap: '1.5rem',
      },
      elements: {
        link: {
          color: {
            text: primaryColor,
          },
        },
        heading: {
          typography: {
            fontWeight: '700',
            lineHeight: '1.2',
          },
        },
      },
    };
  }

  /**
   * Generate template parts
   */
  private generateTemplateParts(): TemplatePart[] {
    return [
      {
        name: 'header',
        title: 'Header',
        area: 'header',
      },
      {
        name: 'footer',
        title: 'Footer',
        area: 'footer',
      },
    ];
  }

  /**
   * Generate custom templates
   */
  private generateCustomTemplates(): CustomTemplate[] {
    return [
      {
        name: 'blank',
        title: 'Blank',
      },
      {
        name: 'page-no-title',
        title: 'Page (No Title)',
        postTypes: ['page'],
      },
    ];
  }
}

export default new ThemeJsonGenerationService();
