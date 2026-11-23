import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

describe('the classes this kit renders', () => {
  const read = (name: string): string =>
    readFileSync(fileURLToPath(new URL(name, import.meta.url)), 'utf8')

  const source = read('./renderers.tsx')

  // Comments stripped, so a class named in a CSS comment does not count as
  // styled.
  const css = read('./kit-html.css').replace(/\/\*[\s\S]*?\*\//g, '')

  const declared = new Set([...css.matchAll(/\.(fsh-[a-z0-9_-]+)/g)].map((m) => m[1] as string))
  const emitted = [...new Set([...source.matchAll(/fsh-[a-z0-9_-]+/g)].map((m) => m[0]))]

  // A name ending in `--` is completed at runtime from document data, as in
  // `'fsh-text--' + variant`, so only its family can be checked.
  const prefixes = emitted.filter((name) => name.endsWith('--'))
  const complete = emitted.filter((name) => !name.endsWith('--'))

  it('found classes on both sides to compare', () => {
    expect(complete.length, 'no classes found in the renderer').toBeGreaterThan(0)
    expect(declared.size, 'no classes found in the stylesheet').toBeGreaterThan(0)
    expect(prefixes.length, 'no modifier prefixes found in the renderer').toBeGreaterThan(0)
  })

  it('declares every complete class name the renderer emits', () => {
    expect(
      complete.filter((name) => !declared.has(name)),
      'the renderer emits a class this stylesheet never styles',
    ).toEqual([])
  })

  it('declares at least one modifier for every prefix the renderer builds', () => {
    const orphans = prefixes.filter(
      (prefix) => ![...declared].some((name) => name.startsWith(prefix) && name !== prefix),
    )

    expect(orphans, 'the renderer builds modifier names from a family with no rules').toEqual([])
  })
})
