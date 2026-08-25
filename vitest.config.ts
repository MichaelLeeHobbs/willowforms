import { defineConfig } from 'vitest/config'

import { formsmithAliases } from './aliases.js'

export default defineConfig({
  resolve: { alias: formsmithAliases },
  test: {
    include: ['packages/*/src/**/*.test.ts', 'packages/*/src/**/*.test.tsx'],
    environment: 'node',
    coverage: { reporter: ['text', 'html'], include: ['packages/*/src/**'] },
  },
})
