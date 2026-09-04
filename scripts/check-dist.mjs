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

import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, posix, relative, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

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

if (ASSETS.length === 0) {
  // Same trap as an empty package list: the asset list is derived now, so a
  // derivation that finds nothing must fail rather than check nothing.
  console.error('no stylesheets found under packages/*/src, so none were checked')
  process.exit(1)
}

for (const [, to] of ASSETS) {
  if (!existsSync(at(to))) missing.push(to)
}

if (missing.length > 0) {
  console.error('the build did not produce:')
  for (const path of missing) console.error('  ' + path)
  process.exit(1)
}

// Resolve package names through their public export maps, as a consumer does.
const broken = []
const consumerRequire = createRequire(new URL('../apps/playground/package.json', import.meta.url))
for (const name of packages) {
  const manifest = JSON.parse(readFileSync(at('packages/' + name + '/package.json'), 'utf8'))
  const packageName = manifest.name
  try {
    const entry = consumerRequire.resolve(packageName)
    await import(pathToFileURL(entry).href)
    for (const subpath of Object.keys(manifest.exports ?? {})) {
      if (subpath === '.' || subpath === './package.json') continue
      const resolved = consumerRequire.resolve(packageName + subpath.slice(1))
      if (!existsSync(resolved)) throw new Error(subpath + ' resolves to a missing file')
    }
  } catch (error) {
    broken.push(packageName + ': ' + (error instanceof Error ? error.message : String(error)))
  }
}

if (broken.length > 0) {
  console.error('a built package does not load:')
  for (const line of broken) console.error('  ' + line)
  process.exit(1)
}

/*
 * And what the tarball contains covers what the source maps point at.
 *
 * `declarationMap` and `sourceMap` are on for every package, so `dist` ships
 * `.js.map` and `.d.ts.map` files whose `sources` name `../src/*.ts`. `files`
 * listed only `dist` and the README, so every one of those maps resolved to
 * nothing on a consumer's disk: step into a stack frame or a go-to-definition
 * and the editor lands on a file that was never published.
 *
 * npm's own packing rules decide this, not a pattern re-implemented here, which
 * is why this shells out to `npm pack --dry-run` rather than reading `files` and
 * guessing what it means.
 */
const unreachable = []
for (const name of packages) {
  const dir = at('packages/' + name)
  const command = process.platform === 'win32' ? (process.env['ComSpec'] ?? 'cmd.exe') : 'npm'
  const args =
    process.platform === 'win32'
      ? ['/d', '/s', '/c', 'npm', 'pack', '--dry-run', '--json']
      : ['pack', '--dry-run', '--json']
  const output = execFileSync(command, args, {
    cwd: dir,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  })
  const published = new Set(
    JSON.parse(output.slice(output.indexOf('[')))[0].files.map((file) =>
      file.path.split(sep).join('/'),
    ),
  )

  const dist = resolve(dir, 'dist')
  const maps = readdirSync(dist, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.map'))
    .map((entry) => resolve(entry.parentPath, entry.name))

  for (const map of maps) {
    for (const source of JSON.parse(readFileSync(map, 'utf8')).sources) {
      const path = posix.normalize(
        relative(dir, resolve(dirname(map), source))
          .split(sep)
          .join('/'),
      )
      if (!published.has(path)) {
        unreachable.push(name + ': ' + relative(dir, map) + ' points at unpublished ' + path)
      }
    }
  }
}

if (unreachable.length > 0) {
  console.error('a published source map points outside the package:')
  for (const line of new Set(unreachable)) console.error('  ' + line)
  process.exit(1)
}

console.log(
  'all ' +
    String(packages.length) +
    ' packages built with types, loaded, mapped to published sources, and every asset was copied',
)
