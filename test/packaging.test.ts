/** What each manifest claims; `scripts/check-dist.mjs` checks what the build emitted. */

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
    // Non-empty rather than a floor: adding or dropping a package is an ordinary change.
    expect(names, 'no packages under packages/, so nothing below ran').not.toEqual([])
  })

  it.each(names)('%s ships the licence it declares', (name) => {
    const manifest = manifestOf(name)

    // npm does not pull the repo root's LICENSE into a workspace package's
    // tarball.
    expect(manifest.license, `${name} declares no licence`).toBe('MIT')
    expect(existsSync(fileURLToPath(new URL(`${name}/LICENSE`, root)))).toBe(true)
    expect(manifest.files ?? [], `${name} would not publish its LICENSE`).toContain('LICENSE')
  })

  it.each(names)('%s exports its own manifest', (name) => {
    // An `exports` map is closed: several resolvers read `<pkg>/package.json`
    // and get an error unless the map lists it.
    expect(manifestOf(name).exports?.['./package.json']).toBe('./package.json')
  })
})
