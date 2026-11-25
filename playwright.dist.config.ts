import { defineConfig, devices } from '@playwright/test'

const PORT = Number(process.env['WILLOWFORMS_E2E_DIST_PORT'] ?? 5181)
if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65_535) {
  throw new Error('WILLOWFORMS_E2E_DIST_PORT must be an integer from 1 to 65535.')
}
// Not `localhost`: see playwright.config.ts.
const baseURL = `http://127.0.0.1:${PORT}`

export default defineConfig({
  testDir: './e2e-dist',
  outputDir: `test-results/dist-${PORT}`,
  workers: 1,
  retries: 0,
  forbidOnly: Boolean(process.env['CI']),
  reporter: process.env['CI']
    ? [['github'], ['list'], ['json', { outputFile: 'test-reports/playwright-dist.json' }]]
    : [['list']],
  // See playwright.config.ts.
  captureGitInfo: { commit: false, diff: false },
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium-dist', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // No pnpm in front: see #163.
    command:
      'node scripts/serve-playground.mjs --mode dist ' +
      `--port ${PORT} --out-dir node_modules/.e2e/dist-${PORT}`,
    // No `url`: see playwright.config.ts.
    wait: { stdout: /Bundle ready/ },
    timeout: 120_000,
  },
})
