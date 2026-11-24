import { defineConfig } from 'vitest/config'

/**
 * Runs the deliberately-failing fixture beside this file, under the same setup the real
 * suite uses.
 */
export default defineConfig({
  test: {
    include: ['test/fixtures/console-gate/cases.test.ts'],
    environment: 'node',
    setupFiles: ['./test/setup.ts'],
  },
})
