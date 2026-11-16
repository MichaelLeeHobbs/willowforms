import { defineConfig } from 'vitest/config'

import { willowformsAliases } from './aliases.js'

export default defineConfig({
  resolve: { alias: willowformsAliases },
  // The root tsconfig is a project-reference stub with no compilerOptions, so
  // the transform finds no `jsx` setting for files outside packages/. Stating
  // the runtime here covers every directory.
  oxc: { jsx: { runtime: 'automatic' } },
  test: {
    include: [
      'packages/*/src/**/*.test.ts',
      'packages/*/src/**/*.test.tsx',
      // Cross-package contract tests belong to no single package.
      'test/**/*.test.ts',
      'test/**/*.test.tsx',
      /*
       * And the apps. A test written beside `apps/demo-server/src/index.ts`
       * would have linted and typechecked clean and never run -- the worst of
       * the three, because the file looks like a suite and reports nothing.
       */
      'apps/*/src/**/*.test.ts',
      'apps/*/src/**/*.test.tsx',
    ],
    /*
     * Playwright owns e2e/. Vitest would load those specs and fail on an import
     * it cannot resolve, which reads as a broken suite rather than a mistake.
     *
     * `test/fixtures/` holds suites that are meant to be red:
     * `console-errors.test.ts` runs one through its own config and reads the
     * failure, which is how the console gate proves it can fire.
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
      /*
       * Not the tests themselves. A `*.test.ts` file is 100% covered by
       * definition -- it is the thing doing the covering -- so counting them
       * inflated the number by the size of the suite, which here is larger than
       * the source.
       */
      exclude: ['**/*.test.ts', '**/*.test.tsx'],
    },
  },
})
