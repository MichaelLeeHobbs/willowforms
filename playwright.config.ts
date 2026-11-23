// Positional behaviour jsdom cannot check. These tests read the screen, not the stored document.

import { defineConfig, devices } from '@playwright/test'

const PORT = Number(process.env['WILLOWFORMS_E2E_PORT'] ?? 5180)
if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65_535) {
  throw new Error('WILLOWFORMS_E2E_PORT must be an integer from 1 to 65535.')
}
const baseURL = 'http://localhost:' + String(PORT)

export default defineConfig({
  testDir: './e2e',
  // The first navigation includes Vite's cold compilation on a clean runner.
  timeout: 60_000,
  // Everything here shares one dev server, and several tests drag components
  // around the same document, so they run in order rather than in parallel.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env['CI'],
  // No retries: every check is deterministic for a build, so a flaky test is a bug to fix.
  retries: 0,
  reporter: process.env['CI'] ? [['github'], ['list']] : [['list']],

  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },

  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],

  webServer: {
    // `--strictPort` so a busy port fails loudly instead of starting somewhere
    // else and leaving every test to time out against the wrong address.
    command: 'pnpm --filter playground exec vite --port ' + String(PORT) + ' --strictPort',
    url: baseURL,
    /*
     * Never reuse: Playwright would skip the command when something already answers on the port,
     * and test another checkout's server instead of this one.
     */
    reuseExistingServer: false,
    timeout: 60_000,
  },
})
