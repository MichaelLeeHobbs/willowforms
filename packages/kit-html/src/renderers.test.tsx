import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

describe('the classes this kit renders', () => {
  const read = (name: string): string =>
    readFileSync(fileURLToPath(new URL(name, import.meta.url)), 'utf8')

  const source = read('./renderers.tsx')

  /*
   * Comments stripped before anything is read out of the stylesheet.
   *
   * `declared` is a scan for `.fsh-…`, and a comment explaining a rule names
   * the class it explains -- the forced-colours block below mentions
   * `.fsh-progress` in its own prose. Counting those would mean a class could
   * satisfy this guard by being *described* rather than styled, which is the
   * failure mode the guard exists to catch, one level up. The same strip is
   * what `designer.css.test.ts` does for the same reason.
   */
  const css = read('./kit-html.css').replace(/\/\*[\s\S]*?\*\//g, '')

  const declared = new Set([...css.matchAll(/\.(fsh-[a-z0-9_-]+)/g)].map((m) => m[1] as string))
  const emitted = [...new Set([...source.matchAll(/fsh-[a-z0-9_-]+/g)].map((m) => m[0]))]

  /*
   * A name ending in `--` is a prefix the renderer completes at runtime, as in
   * `'fsh-text fsh-text--' + variant`. The value comes from a document, so the
   * full name is not in the source to compare. What is checkable is that the
   * family exists at all: a prefix with no modifier declared anywhere means
   * every variant of that component is unstyled.
   */
  const prefixes = emitted.filter((name) => name.endsWith('--'))
  const complete = emitted.filter((name) => !name.endsWith('--'))

  it('found classes on both sides to compare', () => {
    // Neither list may go empty and report a clean sweep of nothing.
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
