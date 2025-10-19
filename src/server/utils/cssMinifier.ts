/**
 * CSS Minification Utility
 * Wrapper around clean-css to handle minification
 */

import CleanCSS from 'clean-css';

export function minifyCSS(css: string): { code: string; bytesSaved: number } {
  const cleanCSS = new CleanCSS({
    level: 2,
    returnPromise: false,
  });

  const result = cleanCSS.minify(css);

  if (result.errors && result.errors.length > 0) {
    console.error('CSS minification errors:', result.errors);
    return { code: css, bytesSaved: 0 };
  }

  const originalSize = css.length;
  const minifiedSize = result.styles.length;
  const bytesSaved = originalSize - minifiedSize;

  return {
    code: result.styles,
    bytesSaved,
  };
}

export function minifyMultipleCSS(cssArray: string[]): {
  minified: string[];
  totalBytesSaved: number;
} {
  let totalBytesSaved = 0;
  const minified: string[] = [];

  for (const css of cssArray) {
    const result = minifyCSS(css);
    minified.push(result.code);
    totalBytesSaved += result.bytesSaved;
  }

  return { minified, totalBytesSaved };
}
