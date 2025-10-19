/**
 * Test Setup
 *
 * Runs before all tests to set up the test environment
 */

import { beforeAll, afterAll } from 'vitest';

// Global test timeout
const TEST_TIMEOUT = 30000;

// Setup before all tests
beforeAll(() => {
  // Set environment to test
  process.env.NODE_ENV = 'test';

  // Suppress console.log in tests (optional)
  // global.console = {
  //   ...console,
  //   log: vi.fn(),
  // };
});

// Cleanup after all tests
afterAll(() => {
  // Clean up any resources
});

// Export common test utilities
export const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const createMockElement = (tag: string, attrs?: Record<string, string>, children?: string): string => {
  const attrString = attrs
    ? Object.entries(attrs).map(([key, val]) => `${key}="${val}"`).join(' ')
    : '';

  return children !== undefined
    ? `<${tag} ${attrString}>${children}</${tag}>`
    : `<${tag} ${attrString} />`;
};
