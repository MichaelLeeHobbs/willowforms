/**
 * Invariant 3, enforced.
 *
 * The canvas hosts the kit's components. A designer rule that reaches into them
 * overrides styling the kit owns, and the failure is silent: the build passes,
 * the tests pass, and the damage only shows up by eye. It has happened once
 * already, when `.fs-shell input { padding: 5px 8px }` broke MUI's notched
 * outline so every field label sat on top of its own border.
 *
 * So this reads the stylesheet and fails on the shape of that mistake rather
 * than trusting anyone to remember the rule.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const css = readFileSync(fileURLToPath(new URL('./designer.css', import.meta.url)), 'utf8')
const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '')

/** Selector text of every rule in the file, comments and at-rule preludes removed. */
function selectors(source: string): string[] {
  const out: string[] = []
  for (const match of source.matchAll(/([^{}]+)\{/g)) {
    const head = match[1]?.trim()
    if (!head || head.startsWith('@')) continue
    for (const part of head.split(',')) {
      const selector = part.trim()
      if (selector) out.push(selector)
    }
  }
  return out
}

/** Declaration property names inside the block that follows a selector. */
function declarationsFor(selector: string): string[] {
  const start = withoutComments.indexOf(selector)
  if (start === -1) return []
  const open = withoutComments.indexOf('{', start + selector.length)
  const close = withoutComments.indexOf('}', open)
  if (open === -1 || close === -1) return []

  return withoutComments
    .slice(open + 1, close)
    .split(';')
    .map((line) => line.split(':')[0]?.trim())
    .filter((name): name is string => Boolean(name))
}

/**
 * The single sanctioned exception, documented in ARCHITECTURE.md. It restores
 * hit-testing on a kit component that set `pointer-events: none`, and sets no
 * visual property. Anything added here needs the same justification.
 */
const ALLOWED_CANVAS_REACH = ['.fs-canvas__surface:not(.is-preview) [data-fs-key]']

/** Does the selector reach past `base` into a descendant? */
function reachesPast(selector: string, base: string): boolean {
  const index = selector.indexOf(base)
  if (index === -1) return false

  const rest = selector.slice(index + base.length)
  // A class or element continuing the same compound selector is not a reach:
  // `.fs-canvas__surface.is-preview` still targets the surface itself.
  const firstCombinator = rest.search(/[\s>+~]/)
  return firstCombinator !== -1 && rest.slice(firstCombinator).trim().length > 0
}

describe('designer.css isolation', () => {
  const all = selectors(withoutComments)

  it('parses the stylesheet', () => {
    expect(all.length).toBeGreaterThan(20)
    expect(all).toContain('.fs-shell')
  })

  it('never uses .fs-shell as a descendant scope', () => {
    // `.fs-shell` alone carries the theme tokens and is fine. `.fs-shell x`
    // reaches through the canvas into whatever the kit rendered.
    expect(all.filter((s) => reachesPast(s, '.fs-shell'))).toEqual([])
  })

  it('only reaches into the canvas through the sanctioned exception', () => {
    const reaching = all.filter(
      (s) => reachesPast(s, '.fs-canvas__surface') && !ALLOWED_CANVAS_REACH.includes(s),
    )
    expect(reaching).toEqual([])
  })

  it('keeps the sanctioned exception to interaction, never appearance', () => {
    for (const selector of ALLOWED_CANVAS_REACH) {
      const declared = declarationsFor(selector)
      expect(declared, `${selector} is allowlisted but missing from the file`).toEqual([
        'pointer-events',
      ])
    }
  })
})
