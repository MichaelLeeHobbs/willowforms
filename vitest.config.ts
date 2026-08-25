import { defineConfig } from 'vitest/config'

import { formsmithAliases } from './aliases.js'

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
    ],
    // Node by default, because core must keep proving it runs without a DOM.
    // Component tests opt in per file with an `@vitest-environment jsdom` docblock.
    environment: 'node',
    setupFiles: ['./test/setup.ts'],
    coverage: { reporter: ['text', 'html'], include: ['packages/*/src/**'] },
  },
})
