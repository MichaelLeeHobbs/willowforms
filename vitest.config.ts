import { defineConfig } from 'vitest/config'

import { willowformsAliases } from './aliases.js'

export default defineConfig({
  resolve: { alias: willowformsAliases },
  // The root tsconfig is a references-only stub, so files outside packages/ get no `jsx`
  // setting from it.
  oxc: { jsx: { runtime: 'automatic' } },
  test: {
    include: [
      'packages/*/src/**/*.test.ts',
      'packages/*/src/**/*.test.tsx',
      'test/**/*.test.ts',
      'test/**/*.test.tsx',
      'apps/*/src/**/*.test.ts',
      'apps/*/src/**/*.test.tsx',
    ],
    /*
     * Playwright owns e2e/. `test/fixtures/` holds suites meant to fail, which
     * `console-errors.test.ts` runs through its own config.
     */
    exclude: ['**/node_modules/**', '**/dist/**', 'e2e/**', 'test/fixtures/**'],
    // Node by default, because core must keep proving it runs without a DOM.
    // Component tests opt in per file with an `@vitest-environment jsdom` docblock.
    environment: 'node',
    testTimeout: 10_000,
    setupFiles: ['./test/setup.ts'],
    reporters: ['default'],
    coverage: {
      reporter: ['text', 'html'],
      include: ['packages/*/src/**'],
      exclude: ['**/*.test.ts', '**/*.test.tsx'],
    },
  },
})
