// Positional behaviour jsdom cannot check. These tests read the screen, not the stored document.

import { defineConfig, devices } from '@playwright/test'

const PORT = Number(process.env['WILLOWFORMS_E2E_PORT'] ?? 5180)
if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65_535) {
  throw new Error('WILLOWFORMS_E2E_PORT must be an integer from 1 to 65535.')
}
const baseURL = 'http://localhost:' + String(PORT)

// No pnpm in front: see #163.
const vite = 'node node_modules/vite/bin/vite.js'
// Per port, so a second suite keeps its own bundle, and outside `dist`, which `e2e:dist` empties.
const outDir = 'node_modules/.e2e/' + String(PORT)

export default defineConfig({
  testDir: './e2e',
  // For a machine that is also running something else.
  timeout: 60_000,
  // Keep below `timeout-minutes` in ci.yml, because a cancelled job uploads no traces.
  globalTimeout: process.env['CI'] ? 600_000 : 0,
  // The server only serves files and the document lives in each test's own browser storage, so no
  // test can see another.
  fullyParallel: true,
  // See #190 before raising this.
  workers: 2,
  forbidOnly: !!process.env['CI'],
  // The second run exists to record a trace, so that passing tests record none (#184). It never
  // turns a failure into a pass: a flaky test is a bug to fix.
  retries: 1,
  failOnFlakyTests: true,
  reporter: process.env['CI']
    ? [['github'], ['list'], ['json', { outputFile: 'test-reports/playwright.json' }]]
    : [['list']],

  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],

  webServer: {
    /*
     * A bundle and not the dev server, which sends every source module separately to every test's
     * empty browser cache. Unminified, so a custom property reads the way the stylesheet writes it.
     *
     * `--strictPort` so a busy port fails loudly instead of starting somewhere else and leaving
     * every test to time out against the wrong address.
     */
    command:
      `${vite} build --minify false --outDir ${outDir} && ` +
      `${vite} preview --outDir ${outDir} --port ${String(PORT)} --strictPort`,
    cwd: 'apps/playground',
    // Bundles development React, for StrictMode and for the warnings a production build leaves out.
    env: { NODE_ENV: 'development' },
    url: baseURL,
    /*
     * Never reuse: Playwright would skip the command when something already answers on the port,
     * and test another checkout's server instead of this one.
     */
    reuseExistingServer: false,
    timeout: 120_000,
  },
})
