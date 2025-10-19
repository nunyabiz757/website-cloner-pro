/**
 * Box Shadow Parsing Utilities
 *
 * Parse CSS box-shadow values into structured format
 * for page builder export
 */

import { parseDimension, type ParsedDimension } from './dimension-parser.js';

export interface ParsedBoxShadow {
  horizontal: ParsedDimension;
  vertical: ParsedDimension;
  blur: ParsedDimension;
  spread: ParsedDimension;
  color: string;
  inset: boolean;
  original: string;
}

const BOX_SHADOW_REGEX = /^(inset\s+)?(-?\d+\.?\d*(?:px|em|rem)?)\s+(-?\d+\.?\d*(?:px|em|rem)?)\s+(-?\d+\.?\d*(?:px|em|rem)?)?\s+(-?\d+\.?\d*(?:px|em|rem)?)?\s*(.*)$/i;

/**
 * Parse a box-shadow value
 */
export function parseBoxShadow(value: string | undefined): ParsedBoxShadow | undefined {
  if (!value || value === 'none') return undefined;

  const trimmed = value.trim();
  const match = trimmed.match(BOX_SHADOW_REGEX);

  if (!match) return undefined;

  const inset = !!match[1];
  const horizontal = parseDimension(match[2]);
  const vertical = parseDimension(match[3]);
  const blur = parseDimension(match[4] || '0px');
  const spread = parseDimension(match[5] || '0px');
  const color = match[6]?.trim() || 'rgba(0, 0, 0, 0.5)';

  if (!horizontal || !vertical || !blur || !spread) return undefined;

  return {
    horizontal,
    vertical,
    blur,
    spread,
    color,
    inset,
    original: trimmed,
  };
}

/**
 * Parse multiple box-shadow values (comma-separated)
 */
export function parseBoxShadows(value: string | undefined): ParsedBoxShadow[] {
  if (!value || value === 'none') return [];

  // Split by comma, but not commas inside rgba()
  const shadows: string[] = [];
  let current = '';
  let depth = 0;

  for (let i = 0; i < value.length; i++) {
    const char = value[i];

    if (char === '(') depth++;
    if (char === ')') depth--;

    if (char === ',' && depth === 0) {
      shadows.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  if (current) {
    shadows.push(current.trim());
  }

  return shadows
    .map(shadow => parseBoxShadow(shadow))
    .filter((s): s is ParsedBoxShadow => s !== undefined);
}

/**
 * Format box shadow for export
 */
export function formatBoxShadow(shadow: ParsedBoxShadow | undefined): string {
  if (!shadow) return 'none';

  const parts = [
    shadow.inset ? 'inset' : '',
    `${shadow.horizontal.value}${shadow.horizontal.unit}`,
    `${shadow.vertical.value}${shadow.vertical.unit}`,
    `${shadow.blur.value}${shadow.blur.unit}`,
    `${shadow.spread.value}${shadow.spread.unit}`,
    shadow.color,
  ].filter(p => p);

  return parts.join(' ');
}

/**
 * Format multiple box shadows for export
 */
export function formatBoxShadows(shadows: ParsedBoxShadow[]): string {
  if (shadows.length === 0) return 'none';
  return shadows.map(formatBoxShadow).join(', ');
}

/**
 * Convert box shadow to Elementor format
 */
export function toElementorBoxShadow(shadow: ParsedBoxShadow | undefined): any {
  if (!shadow) {
    return {
      horizontal: 0,
      vertical: 0,
      blur: 0,
      spread: 0,
      color: '',
      position: '',
    };
  }

  return {
    horizontal: shadow.horizontal.value,
    vertical: shadow.vertical.value,
    blur: shadow.blur.value,
    spread: shadow.spread.value,
    color: shadow.color,
    position: shadow.inset ? 'inset' : '',
  };
}

/**
 * Convert box shadow to Gutenberg format
 */
export function toGutenbergBoxShadow(shadow: ParsedBoxShadow | undefined): string {
  return formatBoxShadow(shadow);
}

/**
 * Convert box shadow to Divi format
 */
export function toDiviBoxShadow(shadow: ParsedBoxShadow | undefined): any {
  if (!shadow) return undefined;

  return {
    style: shadow.inset ? 'inset' : 'preset1',
    horizontal_offset: `${shadow.horizontal.value}${shadow.horizontal.unit}`,
    vertical_offset: `${shadow.vertical.value}${shadow.vertical.unit}`,
    blur_strength: `${shadow.blur.value}${shadow.blur.unit}`,
    spread_strength: `${shadow.spread.value}${shadow.spread.unit}`,
    color: shadow.color,
  };
}

/**
 * Convert box shadow to Beaver Builder format
 */
export function toBeaverBuilderBoxShadow(shadow: ParsedBoxShadow | undefined): any {
  if (!shadow) return undefined;

  return {
    h_offset: shadow.horizontal.value,
    v_offset: shadow.vertical.value,
    blur: shadow.blur.value,
    spread: shadow.spread.value,
    color: shadow.color,
    inset: shadow.inset,
  };
}

/**
 * Convert box shadow to Bricks format
 */
export function toBricksBoxShadow(shadow: ParsedBoxShadow | undefined): string {
  return formatBoxShadow(shadow);
}

/**
 * Convert box shadow to Oxygen format
 */
export function toOxygenBoxShadow(shadow: ParsedBoxShadow | undefined): any {
  if (!shadow) return undefined;

  return {
    'box-shadow-horizontal': `${shadow.horizontal.value}${shadow.horizontal.unit}`,
    'box-shadow-vertical': `${shadow.vertical.value}${shadow.vertical.unit}`,
    'box-shadow-blur': `${shadow.blur.value}${shadow.blur.unit}`,
    'box-shadow-spread': `${shadow.spread.value}${shadow.spread.unit}`,
    'box-shadow-color': shadow.color,
    'box-shadow-inset': shadow.inset ? 'inset' : '',
  };
}

/**
 * Extract box shadow from component styles
 */
export function extractBoxShadow(styles: Record<string, any>): ParsedBoxShadow | undefined {
  return parseBoxShadow(styles.boxShadow);
}

/**
 * Extract text shadow (similar structure)
 */
export function extractTextShadow(styles: Record<string, any>): ParsedBoxShadow | undefined {
  // Text shadow doesn't have spread, so we parse it similarly but ignore spread
  const value = styles.textShadow;
  if (!value || value === 'none') return undefined;

  const match = value.trim().match(/^(-?\d+\.?\d*(?:px|em|rem)?)\s+(-?\d+\.?\d*(?:px|em|rem)?)\s+(-?\d+\.?\d*(?:px|em|rem)?)?\s*(.*)$/i);

  if (!match) return undefined;

  const horizontal = parseDimension(match[1]);
  const vertical = parseDimension(match[2]);
  const blur = parseDimension(match[3] || '0px');
  const color = match[4]?.trim() || 'rgba(0, 0, 0, 0.5)';

  if (!horizontal || !vertical || !blur) return undefined;

  return {
    horizontal,
    vertical,
    blur,
    spread: { value: 0, unit: 'px', original: '0px', isResponsive: false },
    color,
    inset: false,
    original: value.trim(),
  };
}
