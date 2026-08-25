import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

import { formsmithAliases } from '../../aliases.js'

export default defineConfig({
  plugins: [react()],
  resolve: { alias: formsmithAliases },
  server: { port: 5180 },
})
