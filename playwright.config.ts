// Positional behaviour jsdom cannot check. These tests read the screen, not the stored document.

import { defineConfig, devices } from '@playwright/test'

const PORT = Number(process.env['WILLOWFORMS_E2E_PORT'] ?? 5180)
if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65_535) {
  throw new Error('WILLOWFORMS_E2E_PORT must be an integer from 1 to 65535.')
}
const baseURL = 'http://127.0.0.1:' + String(PORT)

export default defineConfig({
  testDir: './e2e',
  // Per port: Playwright empties this folder when a run starts, and another suite may be using it.
  outputDir: 'test-results/' + String(PORT),
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
  // On in CI by default, and puts the author's email and the diff in the uploaded report.
  captureGitInfo: { commit: false, diff: false },

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
     * A folder per port, so a second suite keeps its own bundle. No pnpm in front: see #163.
     */
    command:
      'node scripts/serve-playground.mjs --no-minify ' +
      `--port ${String(PORT)} --out-dir node_modules/.e2e/${String(PORT)}`,
    // Bundles development React, for StrictMode and for the warnings a production build leaves out.
    env: { NODE_ENV: 'development' },
    /*
     * The command's own line and no `url`, not even beside it: Playwright starts the tests at
     * whichever comes first, and any server on the port can answer a `url`.
     */
    wait: { stdout: /Bundle ready/ },
    timeout: 120_000,
  },
})
