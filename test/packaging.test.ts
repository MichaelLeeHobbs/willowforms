/**
 * What every published package promises a consumer.
 *
 * Nothing here is hand-listed. The packages come from the directory, the way
 * `scripts/check-dist.mjs` reads them, so a sixth is covered the day it exists
 * -- that script's own docblock records the loop that named four packages while
 * five were in the repository, and the one it missed was `kit-html`, the package
 * the whole "a kit is a package, not a rewrite" claim rests on.
 *
 * That script checks what the *build* emitted. This checks what the *manifest*
 * claims, which is the half nothing was reading: two of the five declared
 * `"license": "MIT"` and shipped no licence text, and two gained the
 * `./package.json` subpath in the same change that gave the other three theirs
 * -- both spotted by a reviewer rather than by a test.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const root = new URL('../packages/', import.meta.url)

interface Manifest {
  name?: string
  license?: string
  files?: string[]
  exports?: Record<string, unknown>
}

const names = readdirSync(fileURLToPath(root), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort()

function manifestOf(name: string): Manifest {
  return JSON.parse(
    readFileSync(fileURLToPath(new URL(`${name}/package.json`, root)), 'utf8'),
  ) as Manifest
}

describe('every package the directory holds', () => {
  it('was actually found', () => {
    /*
     * The guard `check-dist.mjs` has, for the same reason and in the same
     * shape: a readdir that finds nothing would let every `it.each` below
     * expand to zero cases and report success having checked no package at all.
     *
     * Non-empty rather than a floor of five. The count is not the invariant --
     * splitting a package or dropping one is an ordinary change, and a number
     * here would fail it with a message about packaging when nothing about
     * packaging had broken.
     */
    expect(names, 'no packages under packages/, so nothing below ran').not.toEqual([])
  })

  it.each(names)('%s ships the licence it declares', (name) => {
    const manifest = manifestOf(name)

    // The premise of the repository is that the *designer* is MIT, so a
    // published tarball with no licence text is the one packaging defect that
    // contradicts the product. npm does not pull the repo root's LICENSE into a
    // workspace package's tarball.
    expect(manifest.license, `${name} declares no licence`).toBe('MIT')
    expect(existsSync(fileURLToPath(new URL(`${name}/LICENSE`, root)))).toBe(true)
    expect(manifest.files ?? [], `${name} would not publish its LICENSE`).toContain('LICENSE')
  })

  it.each(names)('%s exports its own manifest', (name) => {
    // An `exports` map is a closed door: several resolvers read
    // `<pkg>/package.json` and get an error rather than the file sitting right
    // there. The two packages with a stylesheet subpath were the two that
    // missed this.
    expect(Object.keys(manifestOf(name).exports ?? {})).toContain('./package.json')
  })
})
