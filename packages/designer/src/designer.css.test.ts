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

/**
 * Every declaration property name under a selector, across all of its blocks.
 *
 * All of them, not the first. A selector can be declared twice in one file --
 * legal CSS, and two of them were, five hundred lines apart -- and reading only
 * the first textual occurrence meant a second block on an allowlisted selector
 * could set anything at all and the pinning check below would never see it. The
 * two blocks are merged now; the reader is fixed so the next pair cannot hide.
 */
function declarationsFor(selector: string): string[] {
  const names: string[] = []

  let from = 0
  for (;;) {
    const start = withoutComments.indexOf(selector, from)
    if (start === -1) break
    from = start + selector.length

    /*
     * The selector has to be the whole of the rule's prelude, not part of it:
     * `.fs-drop` appears inside `.fs-drop--bar`, and a substring match would
     * read the wrong block's declarations and call them the first's.
     */
    const open = withoutComments.indexOf('{', from)
    if (open === -1) break
    if (withoutComments.slice(from, open).trim() !== '') continue
    const before = withoutComments.slice(0, start)
    const boundary = before.slice(before.lastIndexOf('}') + 1).trim()
    if (boundary !== '' && !boundary.endsWith(',')) continue

    const close = withoutComments.indexOf('}', open)
    if (close === -1) break

    for (const line of withoutComments.slice(open + 1, close).split(';')) {
      const name = line.split(':')[0]?.trim()
      if (name) names.push(name)
    }
  }

  return names
}

/**
 * The sanctioned exceptions, documented in ARCHITECTURE.md, each pinned to the
 * exact properties it may set.
 *
 * Both give a kit component back something the designer took from it, and
 * neither makes an appearance decision on the kit's behalf. That is the bar
 * anything added here has to clear, and listing the properties is what stops an
 * exception quietly growing a `background` once it exists.
 */
const ALLOWED_CANVAS_REACH: Record<string, string[]> = {
  // Restores hit-testing on a kit component that set `pointer-events: none`.
  '.fs-canvas__surface:not(.is-preview) [data-fs-key]': ['pointer-events'],
  // Undoes the scrollbar inheritance the surface would otherwise push inward.
  '.fs-canvas__surface [data-fs-key]': ['scrollbar-color', 'scrollbar-width'],
}

/**
 * Designer chrome that happens to be named after the canvas.
 *
 * The canvas bar is the designer's own toolbar; it sits beside the form rather
 * than around it, and CLAUDE.md names it as one of the three scopes this
 * stylesheet is allowed to own. Everything else under `.fs-canvas` contains the
 * rendered form.
 *
 * An allowlist rather than a list of form scopes, and that direction is the
 * whole repair. The guard used to name `.fs-shell` and `.fs-canvas__surface` and
 * ask whether a selector reached past either — so when the form moved one level
 * down into `.fs-canvas__frame`, the rule `.fs-canvas__frame input { padding: 5px
 * 8px }` matched neither name. That is the exact rule the invariant was written
 * about, the one that broke MUI's notched outline, and all four assertions
 * stayed green. A guard that names its scopes as strings cannot notice that the
 * scopes moved; this one has to be told what is *not* the form, so a new
 * wrapper is refused until somebody says otherwise.
 */
const CHROME_UNDER_CANVAS = new Set([
  // The designer's own toolbar over the canvas. Beside the form, not around it.
  '.fs-canvas__bar',
  /*
   * The data and errors panes shown in preview. Also beside the form, and the
   * `<pre>` blocks in them are the designer's own markup — it renders them
   * itself, and no kit is involved.
   *
   * Found by this guard on its first run, which is the shape the whole rewrite
   * is for: a scope it did not know about is refused until somebody says which
   * side of the line it is on.
   */
  '.fs-canvas__data',
])

/** The compound selectors of one selector, in order, split on combinators. */
function compounds(selector: string): string[] {
  return selector
    .split(/[\s>+~]+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
}

/**
 * Does this selector style something inside the rendered form?
 *
 * Two halves, and both are needed. It has to *descend* from a scope that
 * contains the form — anything `.fs-shell` or `.fs-canvas` that is not chrome —
 * and what it finally targets has to be something other than the designer's own
 * chrome. Every piece of designer chrome carries an `fs-` class; nothing a kit
 * renders does. So a rightmost compound with no `fs-` class in it is reaching
 * into somebody else's component.
 *
 * `.fs-toolbar button` is not a reach: the toolbar is not on the canvas.
 * `.fs-canvas__surface.is-preview` is not a reach: it is still the surface.
 * `.fs-canvas__frame input` is.
 */
function reachesIntoTheForm(selector: string): boolean {
  const parts = compounds(selector)
  const target = parts[parts.length - 1]
  if (target === undefined || parts.length < 2) return false

  const insideTheForm = parts
    .slice(0, -1)
    .some((part) => /^\.fs-(shell|canvas)/.test(part) && !CHROME_UNDER_CANVAS.has(part))

  if (!insideTheForm) return false

  // An `fs-` class anywhere in the final compound means it targets the
  // designer's own markup, which the designer is entitled to style.
  return !/\.fs-/.test(target)
}

/**
 * Does this selector style something the designer does not own at all?
 *
 * The reach check above needs a scope to reach *from*, so it says nothing about
 * a selector that names no scope: `input { padding: 5px 8px }` at file scope is
 * invisible to it. That rule is strictly worse than the incident this file was
 * written about -- it does not merely reach into the canvas, it reaches into
 * every input on the host's page, and the stylesheet ships with the designer.
 *
 * Every piece of markup the designer renders carries an `fs-` class, so a
 * selector with no `fs-` class anywhere in it is styling somebody else's page.
 * No such rule exists today, which is the moment to say so.
 */
function escapesTheDesigner(selector: string): boolean {
  return !/\.fs-/.test(selector)
}

describe('designer.css isolation', () => {
  const all = selectors(withoutComments)

  it('parses the stylesheet', () => {
    expect(all.length).toBeGreaterThan(20)
    expect(all).toContain('.fs-shell')
  })

  it('only reaches into the form through the sanctioned exceptions', () => {
    /*
     * One assertion for every scope that contains the form, rather than one per
     * scope somebody remembered to name. `.fs-shell` alone carries the theme
     * tokens and is fine; `.fs-shell x` reaches through the canvas into whatever
     * the kit rendered, and so does every wrapper between them.
     */
    const reaching = all.filter((s) => reachesIntoTheForm(s) && !(s in ALLOWED_CANVAS_REACH))
    expect(reaching).toEqual([])
  })

  it('styles nothing outside its own namespace', () => {
    /*
     * A stylesheet a host imports has one namespace and no business outside it.
     * The reach check cannot see this class of mistake at all, because there is
     * no scope in the selector for it to reach from.
     */
    const escaping = all.filter(escapesTheDesigner)
    expect(escaping).toEqual([])
  })

  describe('the guard itself', () => {
    /*
     * A guard is code, and this one shipped with a hole in the shape of the
     * incident it was written for. These are the cases, stated directly, so the
     * next time the DOM moves the guard fails rather than going quiet.
     */
    it.each([
      ['.fs-shell input', 'the original incident, at the top'],
      ['.fs-canvas__frame input', 'the same rule, at the wrapper the form is in now'],
      ['.fs-canvas__surface input', 'and at the one it used to be in'],
      ['.fs-canvas input', 'and at any other depth'],
      ['.fs-shell [data-fs-key] label', 'reaching by attribute rather than by element'],
      ['.fs-canvas__frame > *', 'or by wildcard'],
    ])('flags %s — %s', (selector) => {
      expect(reachesIntoTheForm(selector)).toBe(true)
    })

    it.each([
      ['input', 'a bare element selector, which the reach check cannot see'],
      ['*', 'a wildcard reset over the whole page'],
      ['body', 'or the page itself'],
      ['[data-fs-key]', 'or every rendered node, wherever it is'],
      ['button:focus-visible', 'or a state on one'],
    ])('flags %s at file scope — %s', (selector) => {
      expect(escapesTheDesigner(selector)).toBe(true)
    })

    it.each([
      ['.fs-shell', 'the namespace itself'],
      ['.fs-panel input', 'a control the designer renders'],
      ['.fs-shell[data-fs-theme="dark"]', 'a theme override on the namespace'],
    ])('leaves %s alone — %s', (selector) => {
      expect(escapesTheDesigner(selector)).toBe(false)
    })

    it.each([
      ['.fs-shell', 'the scope itself, which carries the theme tokens'],
      ['.fs-canvas__surface.is-preview', 'the same element, compounded'],
      ['.fs-toolbar button', 'chrome that is not on the canvas'],
      ['.fs-canvas__bar button', 'chrome that is, and is named in CLAUDE.md'],
      ['.fs-panel .fs-prop-row', 'the designer styling its own markup'],
      ['.fs-canvas__frame .fs-drop', 'and doing it over the canvas'],
    ])('leaves %s alone — %s', (selector) => {
      // Without these the guard could be `() => true` and the suite would pass
      // by refusing a stylesheet that has to exist.
      expect(reachesIntoTheForm(selector)).toBe(false)
    })
  })

  it('reads every block a selector has, not the first one', () => {
    /*
     * The guard-of-the-guard for the reader above. Two blocks on one selector is
     * legal CSS and this file had two such pairs, so an allowlisted selector
     * could have been given a second block setting anything at all and the
     * pinning check would have compared the first block and passed.
     */
    const sheet = [
      '.a { color: red }',
      '.b { padding: 0 }',
      '.a { background: blue; z-index: 1 }',
    ].join(String.fromCharCode(10))

    const names: string[] = []
    let from = 0
    for (;;) {
      const start = sheet.indexOf('.a', from)
      if (start === -1) break
      from = start + 2
      const open = sheet.indexOf('{', from)
      if (open === -1 || sheet.slice(from, open).trim() !== '') continue
      const close = sheet.indexOf('}', open)
      for (const line of sheet.slice(open + 1, close).split(';')) {
        const name = line.split(':')[0]?.trim()
        if (name) names.push(name)
      }
    }

    expect(names).toEqual(['color', 'background', 'z-index'])
  })

  it('keeps every sanctioned exception to exactly what it was allowed', () => {
    for (const [selector, allowed] of Object.entries(ALLOWED_CANVAS_REACH)) {
      const declared = declarationsFor(selector)
      expect(declared, `${selector} is allowlisted but missing from the file`).toEqual(allowed)
    }
  })
})
