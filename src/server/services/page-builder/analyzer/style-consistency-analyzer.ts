/**
 * Site-Wide Style Consistency Detection
 *
 * Analyzes multiple pages to detect:
 * - Consistent styling patterns
 * - Design system usage
 * - Style deviations
 * - Recommendations for standardization
 */

import type { ComponentInfo } from '../types/builder.types.js';

export interface StyleConsistencyReport {
  colorConsistency: ColorConsistencyData;
  typographyConsistency: TypographyConsistencyData;
  spacingConsistency: SpacingConsistencyData;
  componentConsistency: ComponentConsistencyData;
  deviations: StyleDeviation[];
  recommendations: string[];
  consistencyScore: number; // 0-100
}

export interface ColorConsistencyData {
  primaryColors: string[]; // Most used colors (80%+ of usage)
  secondaryColors: string[]; // Moderately used colors (20-80%)
  oneOffColors: string[]; // Rarely used colors (<20%)
  colorVariations: ColorVariation[]; // Similar colors that should be unified
  consistencyScore: number;
}

export interface ColorVariation {
  baseColor: string;
  variations: string[];
  recommendation: string;
}

export interface TypographyConsistencyData {
  fontFamilies: FontUsage[];
  fontSizes: SizeUsage[];
  fontWeights: WeightUsage[];
  lineHeights: SizeUsage[];
  inconsistencies: string[];
  consistencyScore: number;
}

export interface FontUsage {
  fontFamily: string;
  usage: number; // Percentage
  contexts: string[]; // Where it's used (headings, body, etc.)
}

export interface SizeUsage {
  value: string;
  usage: number;
  context: string[];
}

export interface WeightUsage {
  weight: string | number;
  usage: number;
  context: string[];
}

export interface SpacingConsistencyData {
  margins: SpacingPattern[];
  paddings: SpacingPattern[];
  gaps: SpacingPattern[];
  spacingScale: number[]; // Detected spacing scale
  inconsistencies: string[];
  consistencyScore: number;
}

export interface SpacingPattern {
  value: string;
  usage: number;
  properties: string[]; // margin-top, padding-left, etc.
}

export interface ComponentConsistencyData {
  buttonStyles: StylePattern[];
  headingStyles: StylePattern[];
  cardStyles: StylePattern[];
  formStyles: StylePattern[];
  inconsistencies: string[];
  consistencyScore: number;
}

export interface StylePattern {
  pattern: string;
  usage: number;
  example: Record<string, any>;
}

export interface StyleDeviation {
  type: 'color' | 'typography' | 'spacing' | 'component';
  severity: 'low' | 'medium' | 'high';
  description: string;
  pageIds: string[];
  suggestion: string;
}

export class StyleConsistencyAnalyzer {
  private components: Map<string, ComponentInfo[]> = new Map();
  private colorUsage: Map<string, number> = new Map();
  private fontUsage: Map<string, Set<string>> = new Map();
  private sizeUsage: Map<string, Set<string>> = new Map();
  private spacingUsage: Map<string, number> = new Map();

  /**
   * Analyze style consistency across multiple pages
   */
  analyze(pageComponents: Map<string, ComponentInfo[]>): StyleConsistencyReport {
    this.components = pageComponents;

    // Collect usage statistics
    this.collectUsageStats();

    // Analyze each aspect
    const colorConsistency = this.analyzeColorConsistency();
    const typographyConsistency = this.analyzeTypographyConsistency();
    const spacingConsistency = this.analyzeSpacingConsistency();
    const componentConsistency = this.analyzeComponentConsistency();

    // Detect deviations
    const deviations = this.detectDeviations(
      colorConsistency,
      typographyConsistency,
      spacingConsistency,
      componentConsistency
    );

    // Generate recommendations
    const recommendations = this.generateRecommendations(
      colorConsistency,
      typographyConsistency,
      spacingConsistency,
      componentConsistency
    );

    // Calculate overall consistency score
    const consistencyScore = this.calculateOverallScore(
      colorConsistency,
      typographyConsistency,
      spacingConsistency,
      componentConsistency
    );

    return {
      colorConsistency,
      typographyConsistency,
      spacingConsistency,
      componentConsistency,
      deviations,
      recommendations,
      consistencyScore,
    };
  }

  /**
   * Collect usage statistics from all components
   */
  private collectUsageStats(): void {
    for (const [pageId, components] of this.components) {
      for (const component of components) {
        if (!component.styles) continue;

        // Track colors
        const colorProps = ['color', 'backgroundColor', 'borderColor'];
        for (const prop of colorProps) {
          const color = component.styles[prop];
          if (color && typeof color === 'string') {
            this.colorUsage.set(color, (this.colorUsage.get(color) || 0) + 1);
          }
        }

        // Track fonts
        const fontFamily = component.styles.fontFamily;
        if (fontFamily && typeof fontFamily === 'string') {
          if (!this.fontUsage.has(fontFamily)) {
            this.fontUsage.set(fontFamily, new Set());
          }
          this.fontUsage.get(fontFamily)!.add(component.componentType);
        }

        // Track font sizes
        const fontSize = component.styles.fontSize;
        if (fontSize && typeof fontSize === 'string') {
          if (!this.sizeUsage.has(fontSize)) {
            this.sizeUsage.set(fontSize, new Set());
          }
          this.sizeUsage.get(fontSize)!.add(component.componentType);
        }

        // Track spacing
        const spacingProps = ['margin', 'marginTop', 'marginBottom', 'marginLeft', 'marginRight',
                              'padding', 'paddingTop', 'paddingBottom', 'paddingLeft', 'paddingRight', 'gap'];
        for (const prop of spacingProps) {
          const value = component.styles[prop];
          if (value && typeof value === 'string') {
            const key = `${prop}:${value}`;
            this.spacingUsage.set(key, (this.spacingUsage.get(key) || 0) + 1);
          }
        }
      }
    }
  }

  /**
   * Analyze color consistency
   */
  private analyzeColorConsistency(): ColorConsistencyData {
    const totalColorUsage = Array.from(this.colorUsage.values()).reduce((a, b) => a + b, 0);
    const colorEntries = Array.from(this.colorUsage.entries())
      .sort((a, b) => b[1] - a[1]);

    const primaryColors: string[] = [];
    const secondaryColors: string[] = [];
    const oneOffColors: string[] = [];

    for (const [color, count] of colorEntries) {
      const percentage = (count / totalColorUsage) * 100;

      if (percentage >= 5) {
        primaryColors.push(color);
      } else if (percentage >= 1) {
        secondaryColors.push(color);
      } else {
        oneOffColors.push(color);
      }
    }

    // Detect similar colors that should be unified
    const colorVariations = this.detectColorVariations(colorEntries.map(([c]) => c));

    // Calculate consistency score (fewer unique colors = higher consistency)
    const uniqueColors = colorEntries.length;
    const consistencyScore = Math.max(0, 100 - (uniqueColors * 2));

    return {
      primaryColors,
      secondaryColors,
      oneOffColors,
      colorVariations,
      consistencyScore,
    };
  }

  /**
   * Detect similar colors that should be unified
   */
  private detectColorVariations(colors: string[]): ColorVariation[] {
    const variations: ColorVariation[] = [];
    const processed = new Set<string>();

    for (let i = 0; i < colors.length; i++) {
      if (processed.has(colors[i])) continue;

      const similar: string[] = [];
      const base = colors[i];

      for (let j = i + 1; j < colors.length; j++) {
        if (this.areColorsSimilar(base, colors[j])) {
          similar.push(colors[j]);
          processed.add(colors[j]);
        }
      }

      if (similar.length > 0) {
        variations.push({
          baseColor: base,
          variations: similar,
          recommendation: `Unify ${similar.length + 1} similar colors to ${base}`,
        });
        processed.add(base);
      }
    }

    return variations;
  }

  /**
   * Check if two colors are similar
   */
  private areColorsSimilar(color1: string, color2: string): boolean {
    const rgb1 = this.parseColor(color1);
    const rgb2 = this.parseColor(color2);

    if (!rgb1 || !rgb2) return false;

    // Calculate color distance
    const distance = Math.sqrt(
      Math.pow(rgb1.r - rgb2.r, 2) +
      Math.pow(rgb1.g - rgb2.g, 2) +
      Math.pow(rgb1.b - rgb2.b, 2)
    );

    // Consider similar if distance < 30
    return distance < 30;
  }

  /**
   * Parse color to RGB
   */
  private parseColor(color: string): { r: number; g: number; b: number } | null {
    // Handle hex colors
    if (color.startsWith('#')) {
      const hex = color.substring(1);
      if (hex.length === 3) {
        return {
          r: parseInt(hex[0] + hex[0], 16),
          g: parseInt(hex[1] + hex[1], 16),
          b: parseInt(hex[2] + hex[2], 16),
        };
      } else if (hex.length === 6) {
        return {
          r: parseInt(hex.substring(0, 2), 16),
          g: parseInt(hex.substring(2, 4), 16),
          b: parseInt(hex.substring(4, 6), 16),
        };
      }
    }

    // Handle rgb/rgba
    const rgbMatch = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (rgbMatch) {
      return {
        r: parseInt(rgbMatch[1]),
        g: parseInt(rgbMatch[2]),
        b: parseInt(rgbMatch[3]),
      };
    }

    return null;
  }

  /**
   * Analyze typography consistency
   */
  private analyzeTypographyConsistency(): TypographyConsistencyData {
    const totalComps = Array.from(this.components.values()).flat().length;

    // Analyze font families
    const fontFamilies: FontUsage[] = Array.from(this.fontUsage.entries()).map(([font, contexts]) => ({
      fontFamily: font,
      usage: (contexts.size / totalComps) * 100,
      contexts: Array.from(contexts),
    })).sort((a, b) => b.usage - a.usage);

    // Analyze font sizes
    const fontSizes: SizeUsage[] = Array.from(this.sizeUsage.entries()).map(([size, contexts]) => ({
      value: size,
      usage: (contexts.size / totalComps) * 100,
      context: Array.from(contexts),
    })).sort((a, b) => b.usage - a.usage);

    // Detect inconsistencies
    const inconsistencies: string[] = [];
    if (fontFamilies.length > 3) {
      inconsistencies.push(`Too many font families (${fontFamilies.length}). Recommended: 2-3 max.`);
    }
    if (fontSizes.length > 8) {
      inconsistencies.push(`Too many font sizes (${fontSizes.length}). Recommended: 6-8 sizes in a type scale.`);
    }

    // Calculate consistency score
    const fontFamilyScore = Math.max(0, 100 - (fontFamilies.length * 15));
    const fontSizeScore = Math.max(0, 100 - (fontSizes.length * 5));
    const consistencyScore = (fontFamilyScore + fontSizeScore) / 2;

    return {
      fontFamilies,
      fontSizes,
      fontWeights: [], // Would need weight tracking
      lineHeights: [], // Would need line-height tracking
      inconsistencies,
      consistencyScore,
    };
  }

  /**
   * Analyze spacing consistency
   */
  private analyzeSpacingConsistency(): SpacingConsistencyData {
    const spacingValues = new Map<string, number>();

    // Extract spacing values
    for (const [key, count] of this.spacingUsage) {
      const [prop, value] = key.split(':');
      spacingValues.set(value, (spacingValues.get(value) || 0) + count);
    }

    const totalSpacing = Array.from(spacingValues.values()).reduce((a, b) => a + b, 0);

    // Create spacing patterns
    const margins: SpacingPattern[] = [];
    const paddings: SpacingPattern[] = [];
    const gaps: SpacingPattern[] = [];

    for (const [key, count] of this.spacingUsage) {
      const [prop, value] = key.split(':');
      const usage = (count / totalSpacing) * 100;

      const pattern: SpacingPattern = {
        value,
        usage,
        properties: [prop],
      };

      if (prop.startsWith('margin')) {
        margins.push(pattern);
      } else if (prop.startsWith('padding')) {
        paddings.push(pattern);
      } else if (prop === 'gap') {
        gaps.push(pattern);
      }
    }

    // Detect spacing scale
    const spacingScale = this.detectSpacingScale(Array.from(spacingValues.keys()));

    // Detect inconsistencies
    const inconsistencies: string[] = [];
    if (spacingValues.size > 15) {
      inconsistencies.push(`Too many unique spacing values (${spacingValues.size}). Consider using a spacing scale.`);
    }

    // Calculate consistency score
    const consistencyScore = Math.max(0, 100 - (spacingValues.size * 3));

    return {
      margins: margins.slice(0, 10),
      paddings: paddings.slice(0, 10),
      gaps: gaps.slice(0, 10),
      spacingScale,
      inconsistencies,
      consistencyScore,
    };
  }

  /**
   * Detect spacing scale from usage
   */
  private detectSpacingScale(values: string[]): number[] {
    const pxValues = values
      .map(v => {
        const match = v.match(/^(\d+)px$/);
        return match ? parseInt(match[1]) : null;
      })
      .filter((v): v is number => v !== null)
      .sort((a, b) => a - b);

    // Common spacing scales (multiples of 4 or 8)
    return [...new Set(pxValues)].filter(v => v % 4 === 0);
  }

  /**
   * Analyze component consistency
   */
  private analyzeComponentConsistency(): ComponentConsistencyData {
    const buttonStyles = this.analyzeComponentType('button');
    const headingStyles = this.analyzeComponentType('heading');
    const cardStyles = this.analyzeComponentType('card');
    const formStyles = this.analyzeComponentType('input');

    const inconsistencies: string[] = [];

    if (buttonStyles.length > 3) {
      inconsistencies.push(`Too many button variations (${buttonStyles.length}). Recommended: 2-3 button styles.`);
    }

    const avgPatterns = (buttonStyles.length + headingStyles.length + cardStyles.length) / 3;
    const consistencyScore = Math.max(0, 100 - (avgPatterns * 10));

    return {
      buttonStyles,
      headingStyles,
      cardStyles,
      formStyles,
      inconsistencies,
      consistencyScore,
    };
  }

  /**
   * Analyze specific component type
   */
  private analyzeComponentType(type: string): StylePattern[] {
    const patterns = new Map<string, { count: number; example: Record<string, any> }>();

    for (const components of this.components.values()) {
      for (const comp of components) {
        if (comp.componentType === type && comp.styles) {
          const key = JSON.stringify(comp.styles);
          if (!patterns.has(key)) {
            patterns.set(key, { count: 0, example: comp.styles });
          }
          patterns.get(key)!.count++;
        }
      }
    }

    const total = Array.from(patterns.values()).reduce((sum, { count }) => sum + count, 0);

    return Array.from(patterns.entries())
      .map(([pattern, { count, example }]) => ({
        pattern: pattern.substring(0, 50) + '...',
        usage: (count / total) * 100,
        example,
      }))
      .sort((a, b) => b.usage - a.usage)
      .slice(0, 5);
  }

  /**
   * Detect style deviations
   */
  private detectDeviations(
    color: ColorConsistencyData,
    typography: TypographyConsistencyData,
    spacing: SpacingConsistencyData,
    component: ComponentConsistencyData
  ): StyleDeviation[] {
    const deviations: StyleDeviation[] = [];

    // Color deviations
    if (color.oneOffColors.length > 10) {
      deviations.push({
        type: 'color',
        severity: 'medium',
        description: `${color.oneOffColors.length} rarely-used colors detected`,
        pageIds: [],
        suggestion: 'Consolidate colors into a consistent color palette',
      });
    }

    // Typography deviations
    if (typography.fontFamilies.length > 3) {
      deviations.push({
        type: 'typography',
        severity: 'high',
        description: `${typography.fontFamilies.length} different font families in use`,
        pageIds: [],
        suggestion: 'Reduce to 2-3 font families maximum',
      });
    }

    // Spacing deviations
    if (spacing.inconsistencies.length > 0) {
      deviations.push({
        type: 'spacing',
        severity: 'medium',
        description: spacing.inconsistencies[0],
        pageIds: [],
        suggestion: 'Implement a consistent spacing scale (4px or 8px base)',
      });
    }

    return deviations;
  }

  /**
   * Generate recommendations
   */
  private generateRecommendations(
    color: ColorConsistencyData,
    typography: TypographyConsistencyData,
    spacing: SpacingConsistencyData,
    component: ComponentConsistencyData
  ): string[] {
    const recommendations: string[] = [];

    // Color recommendations
    if (color.primaryColors.length < 3) {
      recommendations.push('Define a primary color palette with 3-5 main colors');
    }
    if (color.colorVariations.length > 0) {
      recommendations.push(`Unify ${color.colorVariations.length} sets of similar colors`);
    }

    // Typography recommendations
    if (typography.fontSizes.length > 8) {
      recommendations.push('Create a type scale with 6-8 predefined font sizes');
    }

    // Spacing recommendations
    if (!spacing.spacingScale.length) {
      recommendations.push('Implement a spacing scale (e.g., 4px, 8px, 12px, 16px, 24px, 32px, 48px, 64px)');
    }

    // Component recommendations
    if (component.inconsistencies.length > 0) {
      recommendations.push(...component.inconsistencies);
    }

    return recommendations;
  }

  /**
   * Calculate overall consistency score
   */
  private calculateOverallScore(
    color: ColorConsistencyData,
    typography: TypographyConsistencyData,
    spacing: SpacingConsistencyData,
    component: ComponentConsistencyData
  ): number {
    return Math.round(
      (color.consistencyScore +
        typography.consistencyScore +
        spacing.consistencyScore +
        component.consistencyScore) / 4
    );
  }
}

/**
 * Helper function for quick analysis
 */
export function analyzeStyleConsistency(
  pageComponents: Map<string, ComponentInfo[]>
): StyleConsistencyReport {
  const analyzer = new StyleConsistencyAnalyzer();
  return analyzer.analyze(pageComponents);
}
