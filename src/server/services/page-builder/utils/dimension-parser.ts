/**
 * Dimension Parsing Utilities
 *
 * Parse CSS dimension values (px, em, rem, %, vh, vw, etc.)
 * into structured format for page builder export
 */

export interface ParsedDimension {
  value: number;
  unit: string;
  original: string;
  isResponsive: boolean;
}

export interface DimensionSet {
  top?: ParsedDimension;
  right?: ParsedDimension;
  bottom?: ParsedDimension;
  left?: ParsedDimension;
}

export interface BoxModel {
  margin?: DimensionSet;
  padding?: DimensionSet;
  border?: DimensionSet;
  width?: ParsedDimension;
  height?: ParsedDimension;
  minWidth?: ParsedDimension;
  maxWidth?: ParsedDimension;
  minHeight?: ParsedDimension;
  maxHeight?: ParsedDimension;
}

const DIMENSION_REGEX = /^(-?\d+\.?\d*)(px|em|rem|%|vh|vw|vmin|vmax|ch|ex|cm|mm|in|pt|pc)?$/i;

/**
 * Parse a CSS dimension value
 */
export function parseDimension(value: string | number | undefined): ParsedDimension | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  const stringValue = String(value).trim();

  // Handle 'auto', 'inherit', etc.
  if (stringValue === 'auto' || stringValue === 'inherit' || stringValue === 'initial') {
    return {
      value: 0,
      unit: stringValue,
      original: stringValue,
      isResponsive: false,
    };
  }

  const match = stringValue.match(DIMENSION_REGEX);
  if (!match) {
    return undefined;
  }

  const numValue = parseFloat(match[1]);
  const unit = match[2] || 'px';

  return {
    value: numValue,
    unit,
    original: stringValue,
    isResponsive: ['%', 'vh', 'vw', 'vmin', 'vmax', 'em', 'rem'].includes(unit),
  };
}

/**
 * Parse shorthand dimension values (e.g., "10px 20px 30px 40px")
 */
export function parseShorthandDimension(value: string | undefined): DimensionSet | undefined {
  if (!value) return undefined;

  const parts = value.trim().split(/\s+/);

  if (parts.length === 1) {
    const parsed = parseDimension(parts[0]);
    return parsed ? {
      top: parsed,
      right: parsed,
      bottom: parsed,
      left: parsed,
    } : undefined;
  }

  if (parts.length === 2) {
    const topBottom = parseDimension(parts[0]);
    const leftRight = parseDimension(parts[1]);
    return (topBottom && leftRight) ? {
      top: topBottom,
      right: leftRight,
      bottom: topBottom,
      left: leftRight,
    } : undefined;
  }

  if (parts.length === 3) {
    const top = parseDimension(parts[0]);
    const leftRight = parseDimension(parts[1]);
    const bottom = parseDimension(parts[2]);
    return (top && leftRight && bottom) ? {
      top,
      right: leftRight,
      bottom,
      left: leftRight,
    } : undefined;
  }

  if (parts.length === 4) {
    const top = parseDimension(parts[0]);
    const right = parseDimension(parts[1]);
    const bottom = parseDimension(parts[2]);
    const left = parseDimension(parts[3]);
    return (top && right && bottom && left) ? {
      top,
      right,
      bottom,
      left,
    } : undefined;
  }

  return undefined;
}

/**
 * Extract box model from component styles
 */
export function extractBoxModel(styles: Record<string, any>): BoxModel {
  const boxModel: BoxModel = {};

  // Margin
  if (styles.margin) {
    boxModel.margin = parseShorthandDimension(styles.margin);
  } else {
    const marginTop = parseDimension(styles.marginTop);
    const marginRight = parseDimension(styles.marginRight);
    const marginBottom = parseDimension(styles.marginBottom);
    const marginLeft = parseDimension(styles.marginLeft);

    if (marginTop || marginRight || marginBottom || marginLeft) {
      boxModel.margin = {
        top: marginTop,
        right: marginRight,
        bottom: marginBottom,
        left: marginLeft,
      };
    }
  }

  // Padding
  if (styles.padding) {
    boxModel.padding = parseShorthandDimension(styles.padding);
  } else {
    const paddingTop = parseDimension(styles.paddingTop);
    const paddingRight = parseDimension(styles.paddingRight);
    const paddingBottom = parseDimension(styles.paddingBottom);
    const paddingLeft = parseDimension(styles.paddingLeft);

    if (paddingTop || paddingRight || paddingBottom || paddingLeft) {
      boxModel.padding = {
        top: paddingTop,
        right: paddingRight,
        bottom: paddingBottom,
        left: paddingLeft,
      };
    }
  }

  // Border
  if (styles.borderWidth) {
    boxModel.border = parseShorthandDimension(styles.borderWidth);
  } else {
    const borderTop = parseDimension(styles.borderTopWidth);
    const borderRight = parseDimension(styles.borderRightWidth);
    const borderBottom = parseDimension(styles.borderBottomWidth);
    const borderLeft = parseDimension(styles.borderLeftWidth);

    if (borderTop || borderRight || borderBottom || borderLeft) {
      boxModel.border = {
        top: borderTop,
        right: borderRight,
        bottom: borderBottom,
        left: borderLeft,
      };
    }
  }

  // Width/Height
  boxModel.width = parseDimension(styles.width);
  boxModel.height = parseDimension(styles.height);
  boxModel.minWidth = parseDimension(styles.minWidth);
  boxModel.maxWidth = parseDimension(styles.maxWidth);
  boxModel.minHeight = parseDimension(styles.minHeight);
  boxModel.maxHeight = parseDimension(styles.maxHeight);

  return boxModel;
}

/**
 * Convert dimension to specific unit
 */
export function convertDimensionToUnit(
  dimension: ParsedDimension,
  targetUnit: string,
  baseSize: number = 16
): ParsedDimension {
  let valueInPx = dimension.value;

  // Convert to px first
  switch (dimension.unit) {
    case 'em':
    case 'rem':
      valueInPx = dimension.value * baseSize;
      break;
    case 'pt':
      valueInPx = dimension.value * 1.333;
      break;
    case 'cm':
      valueInPx = dimension.value * 37.8;
      break;
    case 'mm':
      valueInPx = dimension.value * 3.78;
      break;
    case 'in':
      valueInPx = dimension.value * 96;
      break;
    case 'pc':
      valueInPx = dimension.value * 16;
      break;
    // px, vh, vw, % stay as-is
  }

  // Convert from px to target unit
  let newValue = valueInPx;
  switch (targetUnit) {
    case 'em':
    case 'rem':
      newValue = valueInPx / baseSize;
      break;
    case 'pt':
      newValue = valueInPx / 1.333;
      break;
    case 'cm':
      newValue = valueInPx / 37.8;
      break;
    case 'mm':
      newValue = valueInPx / 3.78;
      break;
    case 'in':
      newValue = valueInPx / 96;
      break;
    case 'pc':
      newValue = valueInPx / 16;
      break;
  }

  return {
    value: Math.round(newValue * 100) / 100,
    unit: targetUnit,
    original: `${newValue}${targetUnit}`,
    isResponsive: dimension.isResponsive,
  };
}

/**
 * Format dimension for export
 */
export function formatDimension(dimension: ParsedDimension | undefined): string {
  if (!dimension) return '';
  return `${dimension.value}${dimension.unit}`;
}

/**
 * Format dimension set for export
 */
export function formatDimensionSet(set: DimensionSet | undefined): string {
  if (!set) return '';

  const top = formatDimension(set.top);
  const right = formatDimension(set.right);
  const bottom = formatDimension(set.bottom);
  const left = formatDimension(set.left);

  // If all sides are the same, use shorthand
  if (top === right && right === bottom && bottom === left) {
    return top;
  }

  // If top/bottom and left/right match
  if (top === bottom && left === right) {
    return `${top} ${left}`;
  }

  // If only left/right match
  if (left === right) {
    return `${top} ${left} ${bottom}`;
  }

  // All different
  return `${top} ${right} ${bottom} ${left}`;
}
