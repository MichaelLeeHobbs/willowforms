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

/**
 * Every rule in the file as prelude and body, at any nesting depth.
 *
 * A brace walk rather than a regex, because both readers built on the regex had
 * a hole that a regex over `([^{}]+)\{` cannot avoid. It cannot tell a rule
 * beside an at-rule from a rule inside one, and it cannot tell where a block
 * ends -- which is how `declarationsFor` came to skip every block inside
 * `@media` and how an allowlisted selector could be re-declared there with
 * anything at all in it.
 *
 * Only leaf blocks are returned. An at-rule's own block holds rules rather than
 * declarations, so returning it would report `.fs-x` as a property name.
 */
interface Block {
  prelude: string
  body: string
}

function blocks(source: string): Block[] {
  const found: Block[] = []
  const stack: { prelude: string; open: number; nested: boolean }[] = []
  let from = 0

  for (let i = 0; i < source.length; i += 1) {
    if (source[i] === '{') {
      const parent = stack[stack.length - 1]
      if (parent) parent.nested = true
      stack.push({ prelude: source.slice(from, i).trim(), open: i, nested: false })
      from = i + 1
    } else if (source[i] === '}') {
      const frame = stack.pop()
      if (frame && !frame.nested) {
        found.push({ prelude: frame.prelude, body: source.slice(frame.open + 1, i) })
      }
      from = i + 1
    }
  }

  return found
}

/**
 * A prelude's selectors, split on the commas that separate them.
 *
 * At paren depth zero, which the old split was not. `:is(.fs-shell, .fs-canvas)
 * input` is one selector containing one comma inside a functional pseudo, and
 * splitting on every comma turned it into `:is(.fs-shell` and `.fs-canvas)
 * input` -- two fragments, neither of which any check in this file can
 * classify, so the rule that broke MUI's notched outline passed in that
 * spelling.
 */
function commaSeparated(prelude: string): string[] {
  const parts: string[] = []
  let depth = 0
  let current = ''

  for (const character of prelude) {
    if (character === '(') depth += 1
    else if (character === ')') depth -= 1

    if (character === ',' && depth === 0) {
      if (current.trim()) parts.push(current.trim())
      current = ''
    } else {
      current += character
    }
  }

  if (current.trim()) parts.push(current.trim())
  return parts
}

/** Selector text of every rule in the file, comments and at-rule preludes removed. */
function selectors(source: string): string[] {
  return blocks(source)
    .filter((block) => !block.prelude.startsWith('@'))
    .flatMap((block) => commaSeparated(block.prelude))
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
function declarationsFor(selector: string, source: string = withoutComments): string[] {
  /*
   * Every block whose prelude names this selector, wherever it sits.
   *
   * The previous reader walked the text looking for the selector and then
   * checked what came before it: empty, or a comma. Inside `@media` that text
   * is the at-rule's own prelude, so the block was skipped -- and the exception
   * pinning below could not see a second block on an allowlisted selector in a
   * media query. `designer.css` has such a block today, for the dark theme, so
   * this was not a hypothetical shape.
   *
   * Matching on the split prelude also keeps the reason the old boundary check
   * existed: `.fs-drop` must not read `.fs-drop--bar`'s declarations, and it
   * does not, because the comparison is against a whole selector rather than a
   * substring of one.
   */
  return blocks(source)
    .filter((block) => commaSeparated(block.prelude).includes(selector))
    .flatMap((block) =>
      block.body
        .split(';')
        .map((line) => line.split(':')[0]?.trim() ?? '')
        .filter((name) => name !== ''),
    )
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

/**
 * The compound selectors of one selector, in order, split on combinators.
 *
 * Only at paren depth zero. A naive split on whitespace shatters
 * `:where(.fs-shell, .fs-canvas)` into two pieces that are each half a selector,
 * and the checks below then read them as two compounds that mean nothing.
 */
function compounds(selector: string): string[] {
  const parts: string[] = []
  let depth = 0
  let current = ''

  const flush = (): void => {
    const part = current.trim()
    if (part) parts.push(part)
    current = ''
  }

  for (const character of selector) {
    if (character === '(') depth += 1
    else if (character === ')') depth -= 1

    if (depth === 0 && /[\s>+~]/.test(character)) flush()
    else current += character
  }
  flush()

  return parts
}

/**
 * A functional pseudo-class holding alternatives, which this guard cannot read.
 *
 * `:is(.fs-drop, input)` targets an `input`, and every check here that asks
 * "does this compound carry an `fs-` class" answers yes because one of the two
 * alternatives does. Rather than guess, the guard says it cannot read the rule.
 * No such selector exists in the file, so this costs nothing today and refuses
 * the class rather than waiting to be surprised by it.
 */
function holdsAlternatives(compound: string): boolean {
  let depth = 0
  for (const character of compound) {
    if (character === '(') depth += 1
    else if (character === ')') depth -= 1
    else if (character === ',' && depth > 0) return true
  }
  return false
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

  /*
   * Anywhere in the compound, not anchored at its start.
   *
   * This was `/^\.fs-(shell|canvas)/`, which asks whether the compound *begins*
   * with the scope. `:where(.fs-shell) input` begins with `:where(`, so it named
   * no scope, so there was nothing to reach from and the rule passed -- and it
   * passed the namespace check too, because `.fs-` does appear in the string. A
   * selector wrapping the scope in a zero-specificity pseudo is the ordinary way
   * to write that rule, and it is the exact rule that broke MUI's notched
   * outline. Wrapping a scope does not stop it being the scope.
   */
  const insideTheForm = parts
    .slice(0, -1)
    .some((part) => /\.fs-(shell|canvas)/.test(part) && !CHROME_UNDER_CANVAS.has(part))

  if (!insideTheForm) return false

  // A compound the guard cannot read is refused rather than guessed at.
  if (holdsAlternatives(target)) return true

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

  it('reads the rules inside an at-rule, not just the ones beside it', () => {
    /*
     * The third helper in this file, guarded for the same reason as the other
     * two. Every dark-theme rule lives inside `@media`, so a reader that stopped
     * at the at-rule prelude would leave the whole dark palette unchecked and
     * both assertions above would still pass -- 20 selectors and `.fs-shell` are
     * both satisfied long before the file gets there.
     *
     * Asserted against the real sheet rather than a synthetic one, so it is a
     * claim about the file this guard actually reads.
     */
    expect(all).toContain(".fs-shell:where(:not([data-fs-theme='light']))")
    expect(selectors('@media (min-width: 1px) { .fs-x .y { color: red } }')).toEqual(['.fs-x .y'])
  })

  it('pins an exception re-declared inside an at-rule as well as beside one', () => {
    /*
     * `declarationsFor` used to look for the selector in the text and then check
     * what came before it -- empty, or a comma. Inside `@media` what comes
     * before is the at-rule's own prelude, so every block in a media query was
     * skipped, and an allowlisted selector could be re-declared there setting
     * anything at all. The stylesheet has such blocks today, for the dark theme.
     *
     * A synthetic sheet, because the point is what the reader can see rather
     * than what this file currently contains.
     */
    const sheet =
      '.fs-canvas__surface [data-fs-key] { scrollbar-width: thin }' +
      '@media (prefers-color-scheme: dark) {' +
      '  .fs-canvas__surface [data-fs-key] { background: #000 }' +
      '}'

    expect(declarationsFor('.fs-canvas__surface [data-fs-key]', sheet)).toEqual([
      'scrollbar-width',
      'background',
    ])

    // And the reason the old boundary check existed, which must survive: a
    // selector is matched whole, so `.fs-drop` does not read `.fs-drop--bar`.
    expect(declarationsFor('.fs-drop', '.fs-drop--bar { color: red }')).toEqual([])
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
      /*
       * The scope wrapped in a zero-specificity pseudo, which is the ordinary
       * way somebody writes that rule and the way the guard could not see. The
       * scope test was anchored at the start of the compound, so `:where(` meant
       * no scope was named, so there was nothing to reach from -- and the
       * namespace check passed too, because `.fs-` is in the string.
       */
      [':where(.fs-shell) input', 'the original incident, with the scope in :where()'],
      [':is(.fs-canvas__frame) input', 'and in :is()'],
      ['.fs-shell:where(:not([data-fs-theme="light"])) input', 'and qualified after the scope'],
      ['.fs-canvas__frame :where(input)', 'or with the target wrapped instead'],
      /*
       * And a compound the guard cannot read. One alternative carries an `fs-`
       * class and the other does not, so every "does this target our own markup"
       * check answers yes while the rule styles an `input`.
       */
      ['.fs-canvas__frame :is(.fs-drop, input)', 'alternatives it cannot choose between'],
    ])('flags %s — %s', (selector) => {
      expect(reachesIntoTheForm(selector)).toBe(true)
    })

    it('flags a scope written as a list inside :is(), comma and all', () => {
      /*
       * One selector holding one comma, and the prelude reader used to split on
       * every comma it saw -- so this arrived as `:is(.fs-shell` and
       * `.fs-canvas) input`, two fragments neither check can classify, and the
       * rule that broke MUI's notched outline passed in this spelling. The split
       * is at paren depth zero now.
       *
       * Driven through `selectors()` rather than through `reachesIntoTheForm`
       * directly, because splitting is the half that was wrong.
       */
      const found = selectors(':is(.fs-shell, .fs-canvas) input { padding: 5px 8px }')

      expect(found).toEqual([':is(.fs-shell, .fs-canvas) input'])
      expect(found.filter(reachesIntoTheForm)).toEqual(found)
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
      /*
       * The controls for the widened scope test. Unanchoring it must not make
       * every rule mentioning the shell a reach, and it must not break the one
       * selector in the file that already qualifies a scope with a pseudo.
       */
      ['.fs-shell:where(:not([data-fs-theme="light"]))', 'the scope, qualified, on its own'],
      ['.fs-canvas__bar :where(.fs-icon)', 'chrome under chrome, wrapped'],
      ['.fs-panel button:not(:disabled)', 'a state on a control the designer renders'],
    ])('leaves %s alone — %s', (selector) => {
      // Without these the guard could be `() => true` and the suite would pass
      // by refusing a stylesheet that has to exist.
      expect(reachesIntoTheForm(selector)).toBe(false)
    })
  })

  describe('the reader the pinning check depends on', () => {
    /*
     * These call `declarationsFor`. That sentence is the whole repair.
     *
     * The guard-of-the-guard written for this reader re-implemented the scan
     * inline, over a synthetic sheet, with a different algorithm -- so it proved
     * that the twenty lines in the test body read every block, and said nothing
     * about the function shipped beside it. `declarationsFor` could have been
     * deleted and this stayed green. It is the same defect as the contract suite
     * in item 3, one level up: a check whose subject is not the thing it names.
     *
     * `declarationsFor` now takes the sheet to read, which is what made calling
     * it possible at all. Nothing else about it changed.
     */
    const newline = String.fromCharCode(10)

    it('reads every block a selector has, not the first one', () => {
      /*
       * Two blocks on one selector is legal CSS and this file had two such
       * pairs, so an allowlisted selector could have been given a second block
       * setting anything at all and the pinning check would have compared the
       * first block and passed.
       */
      const sheet = [
        '.a { color: red }',
        '.b { padding: 0 }',
        '.a { background: blue; z-index: 1 }',
      ].join(newline)

      expect(declarationsFor('.a', sheet)).toEqual(['color', 'background', 'z-index'])
    })

    it('does not read a block belonging to a selector that merely starts the same', () => {
      // `.fs-drop` appears inside `.fs-drop--bar`. A substring match would call
      // the wrong block's declarations the first's.
      const sheet = ['.a--wide { color: red }', '.a { padding: 0 }'].join(newline)

      expect(declarationsFor('.a', sheet)).toEqual(['padding'])
    })

    it('does not read a block belonging to a selector that merely ends the same', () => {
      const sheet = ['.outer .a { color: red }', '.a { padding: 0 }'].join(newline)

      expect(declarationsFor('.a', sheet)).toEqual(['padding'])
    })

    it('reads a selector that shares its block with another', () => {
      // `.a, .b { … }` declares both. Skipping it would let an allowlisted
      // selector pick up properties by joining a list.
      const sheet = ['.b, .a { color: red }'].join(newline)

      expect(declarationsFor('.a', sheet)).toEqual(['color'])
    })

    it('finds nothing for a selector the sheet does not have', () => {
      // The control. A reader that returned the previous rule's declarations
      // would make the pinning check pass for an exception that was deleted.
      expect(declarationsFor('.missing', '.a { color: red }')).toEqual([])
    })
  })

  it('keeps every sanctioned exception to exactly what it was allowed', () => {
    for (const [selector, allowed] of Object.entries(ALLOWED_CANVAS_REACH)) {
      const declared = declarationsFor(selector)
      expect(declared, `${selector} is allowlisted but missing from the file`).toEqual(allowed)
    }
  })
})
