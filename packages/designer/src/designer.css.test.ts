/**
 * Invariant 3, enforced. A designer rule that reaches into kit components on
 * the canvas fails silently (builds and tests pass), so this reads the
 * stylesheet. ARCHITECTURE.md describes the incident behind it.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const css = readFileSync(fileURLToPath(new URL('./designer.css', import.meta.url)), 'utf8')
const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '')

/**
 * A brace walk, not a regex: a regex cannot tell a rule inside an at-rule from
 * one beside it. Only leaf blocks are returned, because an at-rule's own block
 * holds rules, not declarations.
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

/** Split at paren depth zero: `:is(.fs-shell, .fs-canvas) input` is one selector. */
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

/**
 * Selector text of every rule, at-rule preludes removed. `source` must hold no
 * comments.
 */
function selectors(source: string): string[] {
  return blocks(source)
    .filter((block) => !block.prelude.startsWith('@'))
    .flatMap((block) => commaSeparated(block.prelude))
}

/**
 * Property names under a selector across all of its blocks: a selector may be
 * declared more than once, so a second block on an allowlisted one must count.
 */
function declarationsFor(selector: string, source: string = withoutComments): string[] {
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
 * The sanctioned exceptions (ARCHITECTURE.md), each pinned to the properties it
 * may set. An entry may only give a kit component back something the designer
 * took from it, never make an appearance decision.
 */
const ALLOWED_CANVAS_REACH: Record<string, string[]> = {
  // Restores hit-testing on a kit component that set `pointer-events: none`.
  '.fs-canvas__surface:not(.is-preview) [data-fs-key]': ['pointer-events'],
  // Undoes the scrollbar inheritance the surface would otherwise push inward.
  '.fs-canvas__surface [data-fs-key]': ['scrollbar-color', 'scrollbar-width'],
}

/**
 * Designer chrome under `.fs-canvas`, beside the form rather than around it
 * (ARCHITECTURE.md). An allowlist, so a new wrapper under the canvas counts as
 * form scope until it is listed here.
 */
const CHROME_UNDER_CANVAS = new Set([
  // The designer's own toolbar over the canvas. Beside the form, not around it.
  '.fs-canvas__bar',
  // Preview's data and errors panes; their `<pre>` blocks are designer markup.
  '.fs-canvas__data',
])

/**
 * Reads through `:where()` and `:is()`, as the scope test does. A compound
 * naming several scopes is chrome only if every one is, because the rule
 * applies wherever any of them matches.
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

/** Split on combinators at paren depth zero, so `:where(.a, .b)` stays whole. */
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
 * `:is(.fs-drop, input)` carries an `fs-` class yet targets `input`, so a
 * compound holding alternatives is refused rather than guessed at.
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
 * Every `fs-` class from `fs-shell` down to `fs-canvas` in `Designer.tsx`.
 * Derived rather than listed, so a new wrapper is guarded the day it is added.
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
   * An ancestor is a line above the canvas indented less than it, which skips
   * siblings such as the left panel. Reliable because `pnpm format:check` gates
   * CI.
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

  // `SCOPE_PATTERN` interpolates these unescaped. `_` is not a metacharacter.
  for (const name of names) {
    expect(name, 'a scope class needs escaping before it can go in a pattern').toMatch(
      /^[a-zA-Z0-9_-]+$/,
    )
  }

  return [...names]
}

const SCOPE_NAMES = formScopes()
/*
 * A prefix match with no trailing anchor: `.fs-canvas__frame` must count as a
 * scope, and `\b` does not fire before `_`.
 */
const SCOPE_PATTERN = new RegExp('\\.(' + SCOPE_NAMES.join('|') + ')')

/**
 * Whether a selector descends from a form scope that is not chrome and ends on
 * a compound with no `fs-` class. Designer markup always carries an `fs-`
 * class; nothing a kit renders does.
 */
function reachesIntoTheForm(selector: string): boolean {
  const parts = compounds(selector)
  const target = parts[parts.length - 1]
  if (target === undefined || parts.length < 2) return false

  // Not anchored: a scope wrapped in `:where()` or `:is()` is still the scope.
  const insideTheForm = parts
    .slice(0, -1)
    .some((part) => SCOPE_PATTERN.test(part) && !isChrome(part))

  if (!insideTheForm) return false

  if (holdsAlternatives(target)) return true

  return !/\.fs-/.test(target)
}

/**
 * Whether a selector names no `fs-` class, so styles the host's page. The reach
 * check cannot see this: it needs a scope to reach from.
 */
function escapesTheDesigner(selector: string): boolean {
  return !/\.fs-/.test(selector)
}

/**
 * Containers holding open-ended kinds of control, so a type-keyed rule under
 * one is a base that must not out-rank later class rules. A container holding
 * one or two known kinds (`.fs-dialog__actions`) does not qualify.
 */
const SHARED_SCOPES = ['.fs-panel', '.fs-toolbar', '.fs-canvas__bar']

/** Pseudo-classes are stripped first: `button:disabled` is still keyed on the type. */
function isBareType(compound: string): boolean {
  const bare = compound.replace(/:{1,2}[a-z-]+(\([^()]*\))?/g, '').trim()
  return bare !== '' && /^[a-z][a-z0-9-]*$/.test(bare)
}

describe('a base rule does not out-specify the rules it is a base for', () => {
  /*
   * `.fs-panel button` is (0,1,1) and beats every (0,1,0) class rule whatever
   * the source order. A shared scope before a bare type must be zero-specificity
   * so the base sits at (0,0,1). Pseudo-classes on the subject still count.
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
    // Asserted against the base: a box declaring the token still loses to a
    // base that outranks it.
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

describe('panel placeholders', () => {
  it('are not faded in older Firefox, which no browser test here runs', () => {
    const rules = blocks(withoutComments).filter((block) =>
      commaSeparated(block.prelude).includes(':where(.fs-panel) ::placeholder'),
    )

    expect(rules).toHaveLength(1)
    expect(rules[0]?.body).toMatch(/(^|[\s;])opacity:\s*1\s*(;|$)/)
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
     * The dark palette lives inside `@media`, and the checks above pass long
     * before the reader reaches it.
     */
    expect(all).toContain(".fs-shell:where(:not([data-fs-theme='light']))")
    expect(selectors('@media (min-width: 1px) { .fs-x .y { color: red } }')).toEqual(['.fs-x .y'])
  })

  it('pins an exception re-declared inside an at-rule as well as beside one', () => {
    const sheet =
      '.fs-canvas__surface [data-fs-key] { scrollbar-width: thin }' +
      '@media (prefers-color-scheme: dark) {' +
      '  .fs-canvas__surface [data-fs-key] { background: #000 }' +
      '}'

    expect(declarationsFor('.fs-canvas__surface [data-fs-key]', sheet)).toEqual([
      'scrollbar-width',
      'background',
    ])

    expect(declarationsFor('.fs-drop', '.fs-drop--bar { color: red }')).toEqual([])
  })

  it('only reaches into the form through the sanctioned exceptions', () => {
    const reaching = all.filter((s) => reachesIntoTheForm(s) && !(s in ALLOWED_CANVAS_REACH))
    expect(reaching).toEqual([])
  })

  it('styles nothing outside its own namespace', () => {
    const escaping = all.filter(escapesTheDesigner)
    expect(escaping).toEqual([])
  })

  describe('the guard itself', () => {
    it.each([
      ['.fs-shell input', 'the original incident, at the top'],
      ['.fs-body input', 'and at the wrapper between them, which nothing named'],
      ['.fs-body .fs-canvas input', 'through that wrapper and on down'],
      ['.fs-canvas__frame input', 'the same rule, at the wrapper the form is in now'],
      ['.fs-canvas__surface input', 'and at the one it used to be in'],
      ['.fs-canvas input', 'and at any other depth'],
      ['.fs-shell [data-fs-key] label', 'reaching by attribute rather than by element'],
      ['.fs-canvas__frame > *', 'or by wildcard'],
      [':where(.fs-shell) input', 'the original incident, with the scope in :where()'],
      [':is(.fs-canvas__frame) input', 'and in :is()'],
      ['.fs-shell:where(:not([data-fs-theme="light"])) input', 'and qualified after the scope'],
      ['.fs-canvas__frame :where(input)', 'or with the target wrapped instead'],
      ['.fs-canvas__frame :is(.fs-drop, input)', 'alternatives it cannot choose between'],
    ])('flags %s — %s', (selector) => {
      expect(reachesIntoTheForm(selector)).toBe(true)
    })

    it('flags a scope written as a list inside :is(), comma and all', () => {
      // Through `selectors()`, because the comma split is what this pins.
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
      ['.fs-canvas__bar button', 'chrome that is, and is named in ARCHITECTURE.md'],
      ['.fs-panel .fs-prop-row', 'the designer styling its own markup'],
      ['.fs-canvas__frame .fs-drop', 'and doing it over the canvas'],
      ['.fs-shell:where(:not([data-fs-theme="light"]))', 'the scope, qualified, on its own'],
      ['.fs-canvas__bar :where(.fs-icon)', 'chrome under chrome, wrapped'],
      ['.fs-panel button:not(:disabled)', 'a state on a control the designer renders'],
    ])('leaves %s alone — %s', (selector) => {
      expect(reachesIntoTheForm(selector)).toBe(false)
    })
  })

  describe('the reader the pinning check depends on', () => {
    const newline = String.fromCharCode(10)

    it('reads every block a selector has, not the first one', () => {
      const sheet = [
        '.a { color: red }',
        '.b { padding: 0 }',
        '.a { background: blue; z-index: 1 }',
      ].join(newline)

      expect(declarationsFor('.a', sheet)).toEqual(['color', 'background', 'z-index'])
    })

    it('does not read a block belonging to a selector that merely starts the same', () => {
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
