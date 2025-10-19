# Page Builder Testing Suite

Comprehensive testing infrastructure for the Website Cloner Pro page builder conversion system.

## Overview

This testing suite validates the complete HTML to Elementor conversion pipeline with:

- **Unit Tests**: Component recognition pattern matching
- **Integration Tests**: End-to-end conversion pipeline
- **Visual Regression Tests**: Screenshot comparison and visual fidelity
- **Performance Benchmarks**: Speed, memory usage, and scalability metrics
- **Edge Case Tests**: Robustness testing for unusual scenarios

## Test Structure

```
__tests__/
├── setup.ts                    # Global test setup and utilities
├── fixtures/                   # Sample HTML test data
│   └── sample-components.html  # Comprehensive component examples
├── unit/                       # Unit tests
│   └── component-recognizer.test.ts
├── integration/                # Integration tests
│   └── full-conversion.test.ts
├── visual/                     # Visual regression tests
│   └── visual-regression.test.ts
├── performance/                # Performance benchmarks
│   └── performance.test.ts
└── edge-cases/                 # Edge case tests
    └── edge-cases.test.ts
```

## Running Tests

### Run All Tests
```bash
npm test
```

### Run Specific Test Suites
```bash
# Unit tests only
npm run test:unit

# Integration tests only
npm run test:integration

# Visual regression tests only
npm run test:visual

# Performance benchmarks only
npm run test:performance

# Edge case tests only
npm run test:edge
```

### Run Tests with Coverage
```bash
npm run test:coverage
```

### Watch Mode (Auto-rerun on changes)
```bash
npm run test:watch
```

### Interactive UI Mode
```bash
npm run test:ui
```

## Test Categories

### 1. Unit Tests (`unit/component-recognizer.test.ts`)

Tests individual component recognition patterns in isolation.

**Coverage:**
- Button recognition (tag, class, role attributes)
- Heading recognition (h1-h6)
- Image recognition (img, picture elements)
- Grid layout detection (CSS Grid)
- Card structure detection
- Form components (form, input, textarea, select)
- Advanced components (accordion, tabs, modal)
- Confidence scoring (high/low confidence, manual review flags)

**Example:**
```typescript
it('should recognize button by tag name', () => {
  const html = '<button>Click Me</button>';
  const result = recognizeComponent(button, styles, context);

  expect(result.componentType).toBe('button');
  expect(result.confidence).toBeGreaterThanOrEqual(90);
});
```

### 2. Integration Tests (`integration/full-conversion.test.ts`)

Tests the complete conversion pipeline from HTML → Components → Elementor JSON.

**Coverage:**
- Component recognition from fixture HTML
- Style extraction for all components
- Parent-child relationship preservation
- Elementor JSON structure validation
- Section/Column/Widget hierarchy
- Unique ID generation
- Text content preservation
- Attribute preservation
- Error handling

**Example:**
```typescript
it('should convert complete HTML page to Elementor', () => {
  // Step 1: Recognize components
  const components = recognizeComponents(sampleHTML);

  // Step 2: Convert to widgets
  const widgets = convertToWidgets(components);

  // Step 3: Export to Elementor
  const elementorJSON = exportToElementor(widgets);

  expect(elementorJSON.content.length).toBeGreaterThan(0);
});
```

### 3. Visual Regression Tests (`visual/visual-regression.test.ts`)

Tests visual fidelity using screenshot comparison with Puppeteer.

**Coverage:**
- Hero section visual comparison
- Card grid layout comparison
- Form component rendering
- Responsive testing (mobile, tablet, desktop viewports)
- Button style accuracy
- Typography rendering
- Spacing and layout preservation
- Color and gradient accuracy
- Complex nested layouts

**Example:**
```typescript
it('should produce visually similar output for hero section', async () => {
  const page = await browser.newPage();

  await page.setContent(heroHTML);
  const originalScreenshot = await page.screenshot({ fullPage: true });

  await page.setContent(convertedHTML);
  const convertedScreenshot = await page.screenshot({ fullPage: true });

  const comparison = await compareScreenshots(
    originalScreenshot,
    convertedScreenshot
  );

  expect(comparison.similarity).toBeGreaterThan(80);
});
```

### 4. Performance Benchmarks (`performance/performance.test.ts`)

Tests performance characteristics and scalability.

**Coverage:**
- Component recognition speed (small, medium, large HTML)
- Export generation time
- End-to-end pipeline performance
- Memory usage and leak detection
- Scalability (linear scaling with input size)
- Deep nesting efficiency
- Concurrent processing
- Caching optimization

**Metrics:**
- Small HTML: < 50ms
- Medium HTML: < 500ms
- Large HTML (1000 components): < 5 seconds
- Memory increase: < 50MB for 100 conversions

**Example:**
```typescript
it('should recognize components in small HTML quickly', () => {
  const startTime = performance.now();
  const components = recognizeComponents(smallHTML);
  const endTime = performance.now();

  expect(endTime - startTime).toBeLessThan(50); // Under 50ms
});
```

### 5. Edge Case Tests (`edge-cases/edge-cases.test.ts`)

Tests robustness with unusual scenarios and malformed input.

**Coverage:**
- Malformed HTML (unclosed tags, mismatched tags)
- Special characters and Unicode (emoji, Chinese, Arabic, Russian)
- HTML entities
- Empty and minimal elements
- Deeply nested structures (50-100 levels)
- Very large content (100k+ characters)
- Many siblings (1000+ elements)
- Custom web components
- Invalid CSS syntax
- Missing required attributes
- Complex attribute scenarios
- SVG and graphics elements

**Example:**
```typescript
it('should handle emoji in content', () => {
  const html = '<h1>Welcome 👋</h1><p>Hello 🌍 World 🚀</p>';
  const components = recognizeComponents(html);

  const heading = components.find(c => c.tagName === 'h1');
  expect(heading?.textContent).toContain('👋');
});
```

## Test Fixtures

### `fixtures/sample-components.html`

Comprehensive HTML fixture containing all 49+ component types:

- Header with navigation
- Hero section
- Grid layout (CSS Grid)
- Card components
- Accordion
- Tabs
- Contact form
- Image gallery
- Carousel/Slider
- Pricing table
- Footer with columns

This fixture is used across multiple test suites for consistent testing.

## Test Utilities

### Global Setup (`setup.ts`)

Provides common utilities for all tests:

```typescript
// Wait utility for async operations
export const wait = (ms: number) => Promise<void>

// Create mock HTML elements
export const createMockElement = (
  tag: string,
  attrs?: Record<string, string>,
  children?: string
) => string
```

## Configuration

### Vitest Configuration (`vitest.config.ts`)

```typescript
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./src/server/services/page-builder/__tests__/setup.ts'],
    include: ['src/server/services/page-builder/__tests__/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/server/services/page-builder/**/*.ts'],
      exclude: [
        'src/server/services/page-builder/**/*.test.ts',
        'src/server/services/page-builder/__tests__/**',
        'src/server/services/page-builder/types/**',
      ],
    },
    testTimeout: 30000,  // 30 seconds for integration tests
    hookTimeout: 30000,
  },
});
```

## Coverage Goals

Target coverage metrics:

- **Statement Coverage**: > 80%
- **Branch Coverage**: > 75%
- **Function Coverage**: > 80%
- **Line Coverage**: > 80%

View coverage report:
```bash
npm run test:coverage
```

Coverage reports are generated in:
- Terminal (text format)
- `coverage/index.html` (interactive HTML report)
- `coverage/coverage-final.json` (JSON format)

## Continuous Integration

These tests are designed to run in CI/CD pipelines:

```yaml
# Example GitHub Actions workflow
- name: Run Tests
  run: npm test

- name: Run Tests with Coverage
  run: npm run test:coverage

- name: Upload Coverage
  uses: codecov/codecov-action@v3
  with:
    files: ./coverage/coverage-final.json
```

## Best Practices

### Writing New Tests

1. **Use descriptive test names**:
   ```typescript
   it('should recognize button by class keywords', () => { ... })
   ```

2. **Follow AAA pattern** (Arrange, Act, Assert):
   ```typescript
   // Arrange
   const html = '<button>Click</button>';

   // Act
   const result = recognizeComponent(button, styles, context);

   // Assert
   expect(result.componentType).toBe('button');
   ```

3. **Test one thing per test**: Each test should validate one specific behavior

4. **Use appropriate timeouts**: Visual and performance tests may need longer timeouts

5. **Clean up resources**: Close browser pages, clear caches, etc.

### Performance Testing Guidelines

- Run performance tests in isolation for accurate measurements
- Use `performance.now()` for high-precision timing
- Run multiple iterations for statistical significance
- Test across different input sizes to verify scalability

### Visual Testing Guidelines

- Use consistent viewport sizes
- Allow for minor rendering differences (80-90% similarity threshold)
- Test at multiple breakpoints (mobile, tablet, desktop)
- Consider font rendering differences across platforms

## Debugging Tests

### Run Single Test File
```bash
npx vitest run src/server/services/page-builder/__tests__/unit/component-recognizer.test.ts
```

### Run Specific Test Suite
```bash
npx vitest run -t "Button Recognition"
```

### Run with Verbose Output
```bash
npx vitest run --reporter=verbose
```

### Enable Debug Logging
```typescript
import { beforeEach } from 'vitest';

beforeEach(() => {
  console.log('Starting test...');
});
```

## Common Issues

### Puppeteer Installation Issues

If visual tests fail with Puppeteer errors:

```bash
# Manually install Chrome
npx puppeteer browsers install chrome
```

### Timeout Issues

For slow tests, increase timeout in test file:

```typescript
it('should handle large files', () => {
  // test code
}, 60000); // 60 second timeout
```

### Memory Issues

For memory-intensive tests:

```bash
# Increase Node.js memory limit
NODE_OPTIONS=--max-old-space-size=4096 npm test
```

## Contributing

When adding new features to the page builder:

1. Add corresponding unit tests for new component types
2. Update integration tests if conversion pipeline changes
3. Add visual regression tests for new layouts
4. Update performance benchmarks if optimization is a goal
5. Add edge cases for new parsing logic
6. Update this README with new test documentation

## Test Results

Expected test counts:
- **Unit Tests**: ~40 tests
- **Integration Tests**: ~20 tests
- **Visual Regression Tests**: ~15 tests
- **Performance Tests**: ~15 tests
- **Edge Case Tests**: ~50 tests

**Total**: ~140 comprehensive tests

## Further Reading

- [Vitest Documentation](https://vitest.dev/)
- [JSDOM Documentation](https://github.com/jsdom/jsdom)
- [Puppeteer Documentation](https://pptr.dev/)
- [Component Recognizer Architecture](../recognizer/README.md)
- [Elementor Exporter Documentation](../exporters/README.md)
