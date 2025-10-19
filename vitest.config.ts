import { defineConfig } from 'vitest/config';
import path from 'path';

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
    testTimeout: 30000, // 30 seconds for integration tests
    hookTimeout: 30000,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
