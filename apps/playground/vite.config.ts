import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

import { willowformsAliases } from '../../aliases.js'

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  // Distribution smoke builds resolve workspace packages through package exports.
  ...(mode === 'dist' ? {} : { resolve: { alias: willowformsAliases } }),
  server: { port: 5180, strictPort: true },
}))
