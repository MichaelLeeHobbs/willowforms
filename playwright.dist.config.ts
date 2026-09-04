import { defineConfig, devices } from '@playwright/test'

const PORT = 5181
const baseURL = `http://localhost:${PORT}`

export default defineConfig({
  testDir: './e2e-dist',
  workers: 1,
  retries: 0,
  forbidOnly: Boolean(process.env['CI']),
  reporter: process.env['CI'] ? [['github'], ['list']] : [['list']],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium-dist', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command:
      'pnpm build && pnpm --filter playground build --mode dist && pnpm --filter playground exec vite preview --port ' +
      String(PORT) +
      ' --strictPort',
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120_000,
  },
})
