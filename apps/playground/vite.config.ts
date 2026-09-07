import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

import { willowformsAliases } from '../../aliases.js'

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  // Distribution smoke builds resolve workspace packages through package exports.
  ...(mode === 'dist' ? {} : { resolve: { alias: willowformsAliases } }),
  /*
   * `strictPort`, so `pnpm dev` fails loudly on a busy port rather than
   * quietly starting on 5181 — where the end-to-end suite, which asks for 5180,
   * would then be talking to whatever is actually there. The Playwright config
   * passes `--strictPort` on the command line for the same reason; this is the
   * half that applies when a person runs the dev server themselves.
   */
  server: { port: 5180, strictPort: true },
}))
