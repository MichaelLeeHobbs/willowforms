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
 * Whether an ancestor compound is chrome the designer owns.
 *
 * Looks inside a zero-specificity wrapper, which the membership test did not.
 * The scope pattern already reads through `:where()` and `:is()` -- a comment
 * in this file explains that wrapping a scope does not stop it being the scope
 * -- and the *exemption* compared the whole compound against the allowlist as a
 * string. So `:where(.fs-canvas__bar) button` was read as reaching into the
 * form: recognised as a scope through the wrapper, and not recognised as
 * chrome through the same wrapper. One direction saw past it and the other did
 * not.
 *
 * A compound naming several scopes is chrome only if *every* one of them is,
 * because the rule applies wherever any of them matches.
 */
function isChrome(part: string): boolean {
  if (CHROME_UNDER_CANVAS.has(part)) return true

  const inner = /^:(?:where|is)\((.*)\)$/.exec(part.trim())
  if (!inner) return false

  const named = (inner[1] ?? '')
    .split(',')
    .map((each) => each.trim())
    .filter((each) => each !== '')

  // Only the ones this guard would treat as form scopes have to be exempt; a
  // chrome-only name such as `.fs-toolbar` never triggers the check at all.
  const scopes = named.filter((each) => SCOPE_PATTERN.test(each))
  return scopes.length > 0 && scopes.every((each) => CHROME_UNDER_CANVAS.has(each))
}

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
 * Every `fs-` class that encloses the rendered form, read out of `Designer.tsx`.
 *
 * The guard used to name these as two literal strings, `shell` and `canvas` --
 * and `.fs-body` is a real wrapper between them today. So `.fs-body input`, the
 * exact rule that broke MUI's notched outline, sat at a genuine ancestor of the
 * form and matched neither name: `reachesIntoTheForm` returned false because
 * the ancestor compound did not match the scope pattern, and
 * `escapesTheDesigner` returned false because `.fs-` appears in the selector.
 * The whole guard stayed green.
 *
 * This file already made this argument once, for scopes *under* the canvas:
 * "a guard that names its scopes as strings cannot notice that the scopes
 * moved". The reasoning was applied to the inside of the canvas and not to the
 * chain leading down to it. Derived now, so a new wrapper is guarded the day it
 * is added rather than the day somebody remembers this list.
 *
 * The window is from `fs-shell` to `fs-canvas` in the source: everything the
 * form is nested inside, by construction.
 */
function formScopes(): string[] {
  const source = readFileSync(fileURLToPath(new URL('./Designer.tsx', import.meta.url)), 'utf8')
  const lines = source.split('\n')

  const at = lines.findIndex((line) => line.includes('"fs-canvas"'))
  // A control: a window that found nothing would make every scope test below
  // vacuous at once.
  expect(at, 'Designer.tsx no longer renders fs-canvas').toBeGreaterThan(-1)

  const indentOf = (line: string): number => line.length - line.trimStart().length
  const canvasIndent = indentOf(lines[at] ?? '')

  /*
   * Ancestors by indentation, not by source order.
   *
   * Everything between `fs-shell` and `fs-canvas` in the file includes the left
   * panel, which is a *sibling* of the canvas rather than something the form
   * sits inside -- and treating it as a form scope makes every legitimate
   * `.fs-panel input` rule a violation. An ancestor is a line above the canvas
   * indented less than it is.
   *
   * Indentation is a real structural signal here because it is machine
   * maintained: `pnpm format:check` gates CI, so a hand-misindented file cannot
   * reach main.
   */
  const names = new Set<string>(['fs-canvas'])
  for (let i = at - 1; i >= 0; i -= 1) {
    const line = lines[i]
    if (!line || line.trim() === '') continue
    if (indentOf(line) >= canvasIndent) continue

    for (const match of line.matchAll(/className="([^"]*)"/g)) {
      for (const name of (match[1] ?? '').split(/\s+/)) {
        if (name.startsWith('fs-')) names.add(name)
      }
    }
    if (line.includes('"fs-shell"')) break
  }

  expect(names.has('fs-shell'), 'the walk never reached the shell').toBe(true)

  /*
   * And every name is safe to put straight into a regular expression.
   *
   * `SCOPE_PATTERN` interpolates these without escaping, and the comment there
   * said an assertion guaranteed it -- which was a description of a check that
   * did not exist. A wrapper class carrying a `.`, a `+` or a `(` would have
   * built a pattern that matches the wrong thing, or throws, and either way the
   * guard would stop guarding what it says it guards.
   *
   * Underscore is in the set because BEM elements use `__`, and it is not a
   * metacharacter.
   */
  for (const name of names) {
    expect(name, 'a scope class needs escaping before it can go in a pattern').toMatch(
      /^[a-zA-Z0-9_-]+$/,
    )
  }

  return [...names]
}

/**
 * The scope test, built from the classes above rather than from two literals.
 *
 * These go into the pattern unescaped, so `formScopes` asserts every one of
 * them is `[a-zA-Z0-9_-]` before returning. That assertion is the reason no
 * escaping is needed here; without it a wrapper class carrying a metacharacter
 * would build a pattern that matches the wrong thing or throws, and the guard
 * would stop guarding what it says it guards.
 */
const SCOPE_NAMES = formScopes()
/*
 * A prefix match, with no trailing boundary, which is what the two literals it
 * replaced did. `.fs-canvas__frame` is inside the form and has to count as a
 * scope -- and `\b` does not fire before `_`, so anchoring the end silently
 * stopped matching every BEM element under the canvas. Six of this file's own
 * self-tests said so, which is the value of a guard that tests itself.
 */
const SCOPE_PATTERN = new RegExp('\\.(' + SCOPE_NAMES.join('|') + ')')

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
    .some((part) => SCOPE_PATTERN.test(part) && !isChrome(part))

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

/**
 * The containers that hold many different kinds of control.
 *
 * Not every container qualifies. `.fs-selection__toolbar` holds one kind of
 * button and `.fs-dialog__actions` holds two, so a type-keyed rule under either
 * is describing every element that will ever be there. These three are the ones
 * a rule cannot be written *about*, because what sits inside them is open-ended
 * -- which is what makes a type-keyed rule under them a base rather than a
 * decision, and what makes it beating a later class rule a defect.
 */
const SHARED_SCOPES = ['.fs-panel', '.fs-toolbar', '.fs-canvas__bar']

/**
 * Whether a compound is a bare element type -- no class, id or attribute.
 *
 * Pseudo-classes are stripped first, because `button:disabled` is still keyed
 * on the type: the pseudo raises specificity, but it does not change what the
 * rule is for.
 */
function isBareType(compound: string): boolean {
  const bare = compound.replace(/:{1,2}[a-z-]+(\([^()]*\))?/g, '').trim()
  return bare !== '' && /^[a-z][a-z0-9-]*$/.test(bare)
}

describe('a base rule does not out-specify the rules it is a base for', () => {
  /*
   * The defect, in one sentence: `.fs-panel button` is (0,1,1) and beat every
   * later (0,1,0) rule styling the same elements, whatever the source order, so
   * whole blocks that read as deliberate never applied.
   *
   * `.fs-tabs__tab` is a `<button>` inside both panel asides and never got its
   * `background: none`. `.fs-color__swatch` never got the 28px its own comment
   * argues for -- logical and physical properties cascade together, so
   * `inline-size` did not escape `width`. And `11-theming.md` documents
   * `--fs-font-mono` for "The JSON editor, the raw CSS box, the code editor",
   * of which only `.fs-dialog__editor` sits outside `.fs-panel`: the other two
   * rendered in the proportional UI font with the token they name unreachable.
   * `test/docs.test.ts` checks that a token is declared, not that the rule
   * using it wins, so nothing here reported any of it.
   *
   * What is pinned is the scope's *contribution*: a shared scope in front of a
   * bare type has to be zero-specificity, so the rule sits at (0,0,1) and any
   * later class rule takes it. Pseudo-classes on the subject are untouched --
   * `button:disabled` should outrank `button`, and it still does.
   */
  const underSharedScope = selectors(withoutComments).flatMap((selector) =>
    commaSeparated(selector).flatMap((one) => {
      const parts = compounds(one)
      const subject = parts[parts.length - 1] ?? ''
      if (parts.length < 2 || !isBareType(subject)) return []
      return parts
        .slice(0, -1)
        .filter((part) => SHARED_SCOPES.some((scope) => part.includes(scope)))
        .map((part) => ({ selector: one, scope: part }))
    }),
  )

  it('found the rules it is meant to be checking', () => {
    // Without this the list could go empty -- a scope renamed, the bases
    // rewritten -- and the assertion below would pass having looked at nothing.
    expect(
      underSharedScope.map((each) => each.selector),
      'no rule keys a bare element type off a shared scope',
    ).not.toEqual([])

    for (const type of ['button', 'input', 'select', 'textarea']) {
      expect(
        underSharedScope.some((each) => each.selector.endsWith(' ' + type)),
        `nothing bases ${type} off a shared scope, so this type is unchecked`,
      ).toBe(true)
    }
  })

  it.each(SHARED_SCOPES)('%s contributes no specificity to a type-keyed rule', (scope) => {
    const offenders = underSharedScope
      .filter((each) => each.scope.includes(scope) && !/^:where\(/.test(each.scope))
      .map((each) => each.selector)

    expect(offenders).toEqual([])
  })

  it('the two boxes 11-theming.md names outrank the base that was overriding them', () => {
    /*
     * The named consequence, asserted against the base rather than against
     * itself. Checking that `.fs-code__area` declares the token is the check
     * that was already passing while the box rendered proportional.
     */
    const bases = underSharedScope
      .filter((each) => /\b(input|textarea)$/.test(each.selector))
      .map((each) => each.selector)
    expect(bases, 'no base rule styles a text control here').not.toEqual([])

    for (const victim of ['.fs-code__area', '.fs-binding__expression']) {
      expect(declarationsFor(victim), victim).toContain('font-family')
      for (const base of bases) {
        // The conflict is real: the base sets the `font` shorthand, which
        // includes the family, over every text control in the panel.
        expect(declarationsFor(base), `${base} sets no font, so it never won one`).toContain('font')
        expect(base.startsWith(':where('), `${base} still outranks ${victim}`).toBe(true)
      }
    }
  })
})

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
      /*
       * `.fs-body` is a real wrapper between the shell and the canvas, and the
       * guard named its scopes as the two literal strings `shell` and `canvas`
       * -- so this exact rule, at a genuine ancestor of the form, matched
       * neither. `reachesIntoTheForm` said false because the ancestor compound
       * did not match, and `escapesTheDesigner` said false because `.fs-`
       * appears in the selector. The whole guard stayed green on the one rule
       * it exists for.
       */
      ['.fs-body input', 'and at the wrapper between them, which nothing named'],
      ['.fs-body .fs-canvas input', 'through that wrapper and on down'],
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
