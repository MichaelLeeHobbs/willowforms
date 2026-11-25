/*
 * Builds the playground and serves the bundle, for a browser suite.
 *
 * Takes the port before it builds. A taken port then fails at once, before the build empties a
 * folder another suite is serving, and nothing else can take the port while the build runs.
 */

import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

import { build, preview } from 'vite'

const { values } = parseArgs({
  options: {
    port: { type: 'string' },
    // From the playground's folder.
    'out-dir': { type: 'string' },
    mode: { type: 'string', default: 'production' },
    minify: { type: 'boolean', default: true },
  },
  allowNegative: true,
})
const port = Number(values.port)
const outDir = values['out-dir']
if (!Number.isInteger(port) || port < 1 || outDir === undefined) {
  throw new Error(
    'Usage: serve-playground.mjs --port <n> --out-dir <path> [--mode <name>] [--no-minify]',
  )
}

const at = (path) => fileURLToPath(new URL('../' + path, import.meta.url))
const config = {
  root: at('apps/playground'),
  mode: values.mode,
  build: { outDir, ...(values.minify ? {} : { minify: false }) },
}

// An address rather than `localhost`, which Node and the browser can resolve differently.
await preview({ ...config, preview: { host: '127.0.0.1', port, strictPort: true } })
// This mode resolves the packages through their exports, so they have to be built.
if (values.mode === 'dist') {
  execFileSync(process.execPath, ['--run', 'build'], { cwd: at(''), stdio: 'inherit' })
}
await build(config)

// Both Playwright configs wait for this line.
console.log('Bundle ready on port ' + String(port))
