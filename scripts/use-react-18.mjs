/**
 * Reinstalls the workspace on React 18, for the CI job that checks that half of the peer range.
 * It edits `pnpm-workspace.yaml` and the lockfile. To go back, restore both and reinstall.
 */

import { execSync } from 'node:child_process'
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const overrides = {
  react: '18.3.1',
  'react-dom': '18.3.1',
  '@types/react': '18.3.32',
  '@types/react-dom': '18.3.7',
}

const root = new URL('../', import.meta.url)
const workspace = new URL('pnpm-workspace.yaml', root)
const settings = readFileSync(workspace, 'utf8')
if (/^overrides:/m.test(settings)) {
  console.error('pnpm-workspace.yaml already has overrides; merge the React 18 ones by hand')
  process.exit(1)
}
const lines = Object.entries(overrides).map(([name, version]) => `  '${name}': ${version}`)
writeFileSync(workspace, `${settings.trimEnd()}\n\noverrides:\n${lines.join('\n')}\n`)

execSync('pnpm install --no-frozen-lockfile', { cwd: fileURLToPath(root), stdio: 'inherit' })

// An override pnpm ignored would leave React 19 in place, and the job would pass on it.
const projects = ['./', ...workspaceDirs('packages'), ...workspaceDirs('apps')]
const wrong = []
const checked = new Map(Object.keys(overrides).map((name) => [name, 0]))
for (const project of projects) {
  const manifest = JSON.parse(readFileSync(new URL(`${project}package.json`, root), 'utf8'))
  const named = {
    ...manifest.devDependencies,
    ...manifest.dependencies,
    ...manifest.peerDependencies,
  }
  // The overrides rewrite peer ranges during resolution, so strict peers cannot see a narrowed one.
  for (const [name, range] of Object.entries(manifest.peerDependencies ?? {})) {
    if (name in overrides && !/(^|\|\| *)\^18\./.test(range)) {
      wrong.push(`${project} declares ${name} ${range}, which leaves out React 18`)
    }
  }
  const require = createRequire(new URL(`${project}package.json`, root))
  for (const [name, version] of Object.entries(overrides)) {
    if (!(name in named)) continue
    checked.set(name, checked.get(name) + 1)
    const installed = require(`${name}/package.json`).version
    if (installed !== version) wrong.push(`${project} resolves ${name} ${installed}`)
  }
}
for (const [name, count] of checked) {
  if (count === 0) wrong.push(`no project names ${name}, so its override was not checked`)
}
if (wrong.length > 0) {
  console.error('React 18 is not in place everywhere:')
  for (const line of wrong) console.error('  ' + line)
  process.exit(1)
}
const places = [...checked.values()].reduce((sum, count) => sum + count, 0)
console.log(`React 18 resolves in all ${places} places that name it`)

function workspaceDirs(parent) {
  return readdirSync(new URL(`${parent}/`, root), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => `./${parent}/${entry.name}/`)
}
