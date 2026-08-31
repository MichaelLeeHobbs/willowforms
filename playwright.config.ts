/**
 * End-to-end tests against a real browser.
 *
 * Everything positional in this repo has been checked by driving the playground
 * by hand: drop geometry, selection frames, keyboard moves, what the canvas
 * actually renders. jsdom cannot do any of it, so those checks lived in a
 * transcript and protected nothing.
 *
 * They are gates now. The localization bug that shipped is the argument: it was
 * "verified in a browser" and the verification was worthless, because it read
 * the stored document rather than the rendered label. These tests read the
 * screen.
 */

import { defineConfig, devices } from '@playwright/test'

const PORT = 5180
const baseURL = 'http://localhost:' + String(PORT)

export default defineConfig({
  testDir: './e2e',
  // Everything here shares one dev server, and several tests drag components
  // around the same document, so they run in order rather than in parallel.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 1 : 0,
  reporter: process.env['CI'] ? [['github'], ['list']] : [['list']],

  use: {
    baseURL,
    // A failure that cannot be seen is a failure that gets guessed at.
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
     * Never reuse. This was `!CI`, which cancels the `--strictPort` reasoning
     * two lines above it: when something already answers on this port,
     * Playwright does not run the command at all — so a sibling worktree's dev
     * server meant the whole suite ran green against another branch's code, and
     * the strict port never got a chance to say so.
     *
     * The cost is a few seconds of startup per local run. The thing it buys is
     * knowing which code the green came from.
     */
    reuseExistingServer: false,
    timeout: 60_000,
  },
})
