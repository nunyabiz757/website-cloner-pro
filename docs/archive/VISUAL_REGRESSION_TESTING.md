# Visual Regression Testing - Complete Implementation

**Status**: ✅ Complete
**Section**: 13 - Visual Regression Tests

## Overview

Comprehensive visual regression testing system that compares original HTML with converted Elementor output using pixel-perfect screenshot comparison via Pixelmatch integration.

## Problem Solved

**Before**:
```typescript
// visual-regression.test.ts:95, 180
// TODO: Generate Elementor HTML from conversion
const convertedHTML = heroHTML; // Placeholder - no actual conversion
```

**After**:
```typescript
// Complete Elementor HTML generation
const convertedHTML = await generateElementorHTML(heroHTML);
// Full conversion pipeline: HTML → Components → Elementor → Rendered HTML
```

## Files Created

### 1. [elementor-html-generator.ts](__tests__/helpers/elementor-html-generator.ts) (600+ lines)
**Purpose**: Generate complete Elementor-compatible HTML from original HTML

**Features**:
- Component recognition integration
- Elementor widget generation
- Style extraction and preservation
- Complete HTML document generation
- Support for 12+ widget types

**Widget Types Supported**:
- `heading` - H1-H6 with typography
- `text-editor` - Rich text content
- `button` - Interactive buttons
- `image` - Images with styling
- `section` - Layout sections
- `column` - Grid columns
- `container` - Flex containers
- `spacer` - Vertical spacing
- `divider` - Horizontal rules
- `icon` - Icon elements
- `form` - Form fields
- Generic fallback for unknown types

**Key Function**:
```typescript
export async function generateElementorHTML(originalHTML: string): Promise<string> {
  // 1. Recognize components from original HTML
  const components = await recognizeComponents(originalHTML);

  // 2. Export to Elementor format
  const elementorData = await exportToElementor(components);

  // 3. Generate complete HTML with Elementor structure + styles
  const elementorHTML = generateCompleteElementorDocument(
    elementorData,
    originalHTML,
    document
  );

  return elementorHTML;
}
```

## Files Modified

### [visual-comparator.ts](validator/visual-comparator.ts)
**Changes**: Added `compareScreenshots()` function (lines 716-745)

**Purpose**: Wrapper function for test compatibility

**Function**:
```typescript
export async function compareScreenshots(
  screenshot1: Buffer,
  screenshot2: Buffer,
  options?: { threshold?: number }
): Promise<{
  similarity: number;
  differences: number;
  diffPercentage: number;
  diffImage?: Buffer;
}>
```

**Features**:
- Takes raw screenshot buffers
- Uses Pixelmatch for pixel comparison
- Returns similarity score (0-100%)
- Generates diff image highlighting differences
- Configurable threshold (default: 0.1)

### [visual-regression.test.ts](__tests__/visual/visual-regression.test.ts)
**Changes**: Updated 11 test cases to use HTML generator

**Locations Modified**:
- Line 15: Added import for `generateElementorHTML`
- Line 97: Hero section test
- Line 181: Card grid test
- Line 263: Form test
- Line 361: Responsive test
- Line 435: Button styles test
- Line 511: Typography test
- Line 573: Layout spacing test
- Line 635: Nested grid test
- Line 687: Flexbox test
- Line 742: Color preservation test
- Line 790: Gradient test

**Pattern**:
```typescript
// Before
const convertedHTML = originalHTML; // Placeholder

// After
const convertedHTML = await generateElementorHTML(originalHTML);
```

## Test Coverage

### 1. Screenshot Comparison Tests (3 tests)

#### Test: Hero Section
```typescript
it('should produce visually similar output for hero section')
```
- **Input**: Hero with gradient background, heading, text, CTA button
- **Expected Similarity**: >80%
- **Max Differences**: <1000 pixels
- **Viewport**: Default (1920x1080)

#### Test: Card Grid
```typescript
it('should produce visually similar output for card grid')
```
- **Input**: 3-column grid with cards (title, text, button)
- **Expected Similarity**: >85%
- **Viewport**: 1200x800

#### Test: Contact Form
```typescript
it('should produce visually similar output for form')
```
- **Input**: Form with text inputs, textarea, submit button
- **Expected Similarity**: >80%
- **Viewport**: Default

### 2. Responsive Visual Testing (3 viewports)

Tests all viewports with same HTML:
- **Mobile**: 375x667
- **Tablet**: 768x1024
- **Desktop**: 1920x1080

**Expected Similarity**: >75% (accounts for responsive changes)

### 3. Component-Specific Tests (4 tests)

#### Test: Button Styles
- **Input**: 4 button variants (primary, secondary, success, outline)
- **Expected Similarity**: >90%
- **Focus**: Color, padding, border-radius preservation

#### Test: Typography
- **Input**: H1, H2, H3, paragraphs, lead text
- **Expected Similarity**: >85%
- **Focus**: Font sizes, weights, line heights, colors

#### Test: Spacing and Layout
- **Input**: Section with padding/margin, 3-column flex layout
- **Expected Similarity**: >85%
- **Focus**: Padding, margin, gap, flexbox

### 4. Complex Layout Tests (2 tests)

#### Test: Nested Grid Layouts
- **Input**: 2-column outer grid with 2x2 inner grid
- **Expected Similarity**: >80%
- **Viewport**: 1200x800

#### Test: Flexbox Layouts
- **Input**: Space-between flex container with 3 items
- **Expected Similarity**: >85%

### 5. Color and Background Tests (2 tests)

#### Test: Background Colors
- **Input**: 4 colored boxes (red, teal, blue, yellow)
- **Expected Similarity**: >95% (colors should match exactly)

#### Test: Gradients
- **Input**: Linear gradient purple→violet with centered text
- **Expected Similarity**: >90%

## Visual Comparison Pipeline

### Step 1: HTML Processing
```
Original HTML
    ↓
Parse DOM (JSDOM)
    ↓
Extract Components (recognizeComponents)
    ↓
Component Array
```

### Step 2: Elementor Conversion
```
Component Array
    ↓
Export to Elementor Format (exportToElementor)
    ↓
Elementor Widget Array
    ↓
Generate HTML (generateElementorHTML)
    ↓
Complete Elementor HTML Document
```

### Step 3: Visual Comparison
```
Original HTML          Elementor HTML
    ↓                       ↓
Puppeteer Render      Puppeteer Render
    ↓                       ↓
Screenshot Buffer     Screenshot Buffer
    ↓                       ↓
         Pixelmatch Comparison
                 ↓
        Similarity Score (0-100%)
        Pixel Differences Count
        Diff Image (red highlights)
```

## Pixelmatch Integration

### Configuration
```typescript
pixelmatch(
  img1Data,
  img2Data,
  diff.data,
  width,
  height,
  {
    threshold: 0.1,           // Pixel sensitivity (0-1)
    alpha: 0.1,               // Opacity of diff pixels
    diffColor: [255, 0, 0],   // Red for differences
    diffColorAlt: [255, 255, 0], // Yellow for alt
  }
)
```

### Metrics Calculated

1. **Similarity Score** (0-100%)
   ```typescript
   similarity = 100 - diffPercentage
   ```

2. **Pixel Differences**
   - Raw count of different pixels
   - Reported in test assertions

3. **Diff Percentage**
   ```typescript
   diffPercentage = (pixelDifference / totalPixels) * 100
   ```

4. **Diff Image**
   - PNG image highlighting differences in red
   - Available as base64 or Buffer
   - Useful for debugging visual regressions

## Usage Examples

### Example 1: Run All Visual Tests

```bash
# Run all visual regression tests
npm run test:visual

# Or with vitest directly
npx vitest run --dir src/server/services/page-builder/__tests__/visual
```

### Example 2: Run Specific Test

```bash
# Run only hero section test
npx vitest run -t "should produce visually similar output for hero section"

# Run responsive tests
npx vitest run -t "Responsive Visual Testing"
```

### Example 3: Use HTML Generator Programmatically

```typescript
import { generateElementorHTML } from './helpers/elementor-html-generator.js';

const originalHTML = `
  <!DOCTYPE html>
  <html>
    <body>
      <h1 style="color: blue;">Hello World</h1>
      <p>This is a test.</p>
      <button style="background: green; color: white;">Click Me</button>
    </body>
  </html>
`;

// Generate Elementor-compatible HTML
const elementorHTML = await generateElementorHTML(originalHTML);

console.log(elementorHTML);
// Output: Complete Elementor document with widgets
```

### Example 4: Compare Screenshots Directly

```typescript
import { compareScreenshots } from '../validator/visual-comparator.js';
import puppeteer from 'puppeteer';

const browser = await puppeteer.launch();
const page = await browser.newPage();

// Original
await page.setContent(originalHTML);
const screenshot1 = await page.screenshot({ fullPage: true });

// Converted
await page.setContent(convertedHTML);
const screenshot2 = await page.screenshot({ fullPage: true });

// Compare
const result = await compareScreenshots(screenshot1, screenshot2);

console.log(`Similarity: ${result.similarity}%`);
console.log(`Differences: ${result.differences} pixels`);

await browser.close();
```

## Elementor HTML Structure

### Generated Document Structure

```html
<!DOCTYPE html>
<html>
<head>
  <style>
    /* Reset */
    /* Elementor base styles */
    /* Extracted original styles */
    /* Widget-specific styles */
  </style>
</head>
<body>
  <div class="elementor elementor-kit-1">
    <!-- Sections -->
    <section class="elementor-section">
      <div class="elementor-container">
        <!-- Columns -->
        <div class="elementor-column">
          <div class="elementor-widget-wrap">
            <!-- Widgets -->
            <div class="elementor-widget elementor-widget-heading">
              <div class="elementor-widget-container">
                <h1>...</h1>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  </div>
</body>
</html>
```

### Widget Generation Example

Input heading:
```html
<h1 style="color: #333; font-size: 48px; text-align: center;">Welcome</h1>
```

Generated Elementor widget:
```html
<div class="elementor-widget elementor-widget-heading">
  <div class="elementor-widget-container">
    <h1 class="elementor-heading-title" style="color: #333; font-size: 48px; text-align: center;">
      Welcome
    </h1>
  </div>
</div>
```

## Similarity Thresholds

### Recommended Thresholds by Component Type

| Component Type | Expected Similarity | Rationale |
|----------------|---------------------|-----------|
| Colors | >95% | Should match exactly |
| Gradients | >90% | Slight rendering differences |
| Typography | >85% | Font rendering variations |
| Buttons | >90% | Simple elements, high accuracy |
| Forms | >80% | Input elements vary by browser |
| Layouts | >85% | Flexbox/Grid should be accurate |
| Cards/Grids | >85% | Complex but predictable |
| Hero Sections | >80% | Large areas, some variation OK |
| Responsive | >75% | Breakpoint changes expected |

### Threshold Configuration

Adjust thresholds in Pixelmatch:

```typescript
// Strict comparison (pixel-perfect)
threshold: 0.0

// Default (recommended)
threshold: 0.1

// Lenient (allows more variation)
threshold: 0.3
```

## Debugging Visual Failures

### 1. View Diff Image

```typescript
const comparison = await compareScreenshots(original, converted);

if (comparison.diffImage) {
  // Save diff image for inspection
  const fs = require('fs');
  fs.writeFileSync('diff.png', comparison.diffImage);
}
```

### 2. Check Specific Metrics

```typescript
console.log(`Similarity: ${comparison.similarity}%`);
console.log(`Differences: ${comparison.differences} pixels`);
console.log(`Diff Percentage: ${comparison.diffPercentage}%`);

// Investigate if similarity < expected
if (comparison.similarity < 80) {
  console.warn('Visual regression detected!');
  console.log('Expected: >80%, Got:', comparison.similarity);
}
```

### 3. Compare Element Counts

```typescript
// In visual-comparator.ts, detailed metrics available:
const result = await compareVisually(originalHTML, convertedHTML, {
  includeMetrics: true
});

console.log('Missing elements:', result.comparisonMetrics.missingElements);
console.log('Extra elements:', result.comparisonMetrics.extraElements);
console.log('Style discrepancies:', result.comparisonMetrics.styleDiscrepancies);
```

### 4. Check Layout Shift

```typescript
console.log(`Layout shift: ${result.comparisonMetrics.layoutShift}px`);
// High values indicate positioning problems
```

## Advanced Features

### 1. SSIM (Structural Similarity Index)

The visual-comparator includes SSIM calculation:

```typescript
const result = await compareVisually(originalHTML, convertedHTML, {
  includeMetrics: true
});

console.log('SSIM:', result.comparisonMetrics.structuralSimilarity);
// Range: 0-1 (1 = identical structure)
```

### 2. Color Difference Analysis

```typescript
console.log('Avg color diff:', result.comparisonMetrics.colorDifference);
// Average RGB difference per pixel
```

### 3. Responsive Comparison

```typescript
import { compareResponsive } from '../validator/visual-comparator.js';

const results = await compareResponsive(originalHTML, convertedHTML);

console.log('Mobile similarity:', results.mobile.similarityScore);
console.log('Tablet similarity:', results.tablet.similarityScore);
console.log('Desktop similarity:', results.desktop.similarityScore);
```

### 4. Custom Viewport Testing

```typescript
const result = await compareVisually(originalHTML, convertedHTML, {
  viewport: { width: 1440, height: 900 },
  fullPage: true,
  threshold: 0.15,
  includeMetrics: true,
});
```

## Performance Considerations

### Browser Instance Management

The visual-comparator uses a singleton browser instance:

```typescript
// Browser is created once and reused
const browser = await getBrowser();

// Close when done (end of test suite)
await closeBrowser();
```

### Parallel Screenshot Capture

```typescript
// Screenshots taken in parallel for speed
const [originalScreenshot, convertedScreenshot] = await Promise.all([
  originalPage.screenshot({ fullPage: true }),
  convertedPage.screenshot({ fullPage: true }),
]);
```

### Optimization Tips

1. **Limit full-page screenshots**: Use `fullPage: false` for above-the-fold testing
2. **Reduce viewport size**: Smaller viewports = faster screenshots
3. **Batch tests**: Run similar tests together to reuse browser
4. **Cache HTML generation**: Store converted HTML if testing multiple viewports

## Troubleshooting

### Issue: "Module not found: elementor-html-generator"

**Cause**: File paths or imports incorrect

**Solution**: Ensure import path is correct:
```typescript
import { generateElementorHTML } from '../helpers/elementor-html-generator.js';
```

### Issue: Tests timing out

**Cause**: Puppeteer operations taking too long

**Solution**: Increase timeout in tests:
```typescript
it('should compare visually', async () => {
  // ...
}, 60000); // 60 second timeout
```

### Issue: Low similarity scores

**Cause**: Conversion not preserving styles

**Solution**:
1. Check extracted styles in generated HTML
2. Verify component recognition is working
3. Ensure Elementor exporter preserves all properties
4. Lower expected similarity threshold if variations are acceptable

### Issue: "Cannot find module 'pixelmatch'"

**Cause**: Missing dependency

**Solution**:
```bash
npm install pixelmatch pngjs
npm install --save-dev @types/pixelmatch @types/pngjs
```

## Completion Checklist

- ✅ Created elementor-html-generator.ts (600+ lines)
- ✅ Added compareScreenshots() to visual-comparator.ts
- ✅ Updated 11 visual regression tests
- ✅ All tests use actual HTML conversion (not placeholders)
- ✅ Pixelmatch integration complete
- ✅ Support for 12+ Elementor widget types
- ✅ Style extraction and preservation
- ✅ Responsive viewport testing
- ✅ Component-specific visual tests
- ✅ Complex layout testing
- ✅ Color and gradient testing
- ✅ Comprehensive documentation

## Summary

**Section 13: Visual Regression Tests - COMPLETE ✅**

The visual regression testing system is now fully implemented with:

- **Elementor HTML Generation**: Complete conversion pipeline from original HTML to Elementor-compatible output
- **Pixelmatch Integration**: Pixel-perfect screenshot comparison with similarity scoring
- **11 Complete Test Cases**: Hero sections, cards, forms, responsive layouts, components, and complex layouts
- **Flexible Testing**: Support for custom viewports, thresholds, and detailed metrics
- **Production Ready**: Comprehensive error handling, browser management, and performance optimization

Run tests with:
```bash
npm run test:visual
```

All TODOs resolved. Visual regression testing is production-ready.
