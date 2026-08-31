import { defineConfig } from 'vitest/config'

import { formsmithAliases } from './aliases.js'
import DocumentedCountReporter from './test/count-reporter.js'

export default defineConfig({
  resolve: { alias: formsmithAliases },
  // The root tsconfig is a project-reference stub with no compilerOptions, so
  // esbuild finds no `jsx` setting for files outside packages/ and falls back to
  // the classic transform. Stating it here covers every directory.
  esbuild: { jsx: 'automatic' },
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
    // Playwright owns e2e/. Vitest would load those specs and fail on an import
    // it cannot resolve, which reads as a broken suite rather than a mistake.
    exclude: ['**/node_modules/**', '**/dist/**', 'e2e/**'],
    // Node by default, because core must keep proving it runs without a DOM.
    // Component tests opt in per file with an `@vitest-environment jsdom` docblock.
    environment: 'node',
    setupFiles: ['./test/setup.ts'],
    /*
     * The default reporter, plus one that compares the suite size the documents
     * quote with the number of tests that actually ran. No test can do that: the
     * count is not known until every file has finished, which is where a
     * reporter stands. It fails the process on a mismatch and skips itself on a
     * filtered run, saying which it did.
     */
    reporters: ['default', new DocumentedCountReporter()],
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
