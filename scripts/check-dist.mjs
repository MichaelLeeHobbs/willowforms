/**
 * Prove that every package emitted what a consumer installs.
 *
 * A script rather than eight lines of YAML, and that is the point. The check
 * lived inline in `ci.yml`, where nobody could run it, and it had drifted: the
 * loop named `core renderer designer kit-mui` and `kit-html` had been added to
 * the repository since. The one package the whole "a kit is a package, not a
 * rewrite" claim rests on was the one package nothing checked shipped.
 *
 * So nothing here is hand-listed. The packages come from the directory, so a
 * sixth is covered the day it exists, and the stylesheets come from
 * `copy-assets.mjs` itself, so the thing that copies them and the thing that
 * checks they arrived cannot name different files.
 */

import { existsSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { ASSETS } from './copy-assets.mjs'

const root = new URL('../', import.meta.url)
const at = (path) => fileURLToPath(new URL(path, root))

const missing = []

const packages = readdirSync(at('packages'), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)

if (packages.length === 0) {
  // A readdir that finds nothing would otherwise report success having checked
  // nothing at all, which is the failure this whole run is about.
  console.error('no packages found under packages/, so nothing was checked')
  process.exit(1)
}

for (const name of packages) {
  for (const file of ['dist/index.js', 'dist/index.d.ts']) {
    const path = 'packages/' + name + '/' + file
    if (!existsSync(at(path))) missing.push(path)
  }
}

for (const [, to] of ASSETS) {
  if (!existsSync(at(to))) missing.push(to)
}

if (missing.length > 0) {
  console.error('the build did not produce:')
  for (const path of missing) console.error('  ' + path)
  process.exit(1)
}

console.log(
  'all ' + String(packages.length) + ' packages built with types, and every asset was copied',
)
