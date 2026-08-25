import { defineConfig } from 'vitest/config'

import { formsmithAliases } from './aliases.js'

export default defineConfig({
  resolve: { alias: formsmithAliases },
  test: {
    include: ['packages/*/src/**/*.test.ts', 'packages/*/src/**/*.test.tsx'],
    // Node by default, because core must keep proving it runs without a DOM.
    // Component tests opt in per file with an `@vitest-environment jsdom` docblock.
    environment: 'node',
    setupFiles: ['./test/setup.ts'],
    coverage: { reporter: ['text', 'html'], include: ['packages/*/src/**'] },
  },
})
