/**
 * The type and spacing scales of `docs/spec/11-theming.md`, held against the two stylesheets. Each
 * list of exceptions must match exactly, so a value that moves onto a step leaves its list too.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { styleRules } from './css.js'

const read = (path: string): string =>
  readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8')

const SPEC = read('../docs/spec/11-theming.md')

/** The backticked values on the spec's line that starts with `name`. */
function stepsIn(name: string): string[] {
  const line = SPEC.split('\n').find((each) => each.startsWith(name + ':'))
  if (line === undefined) throw new Error('The theming spec has no line starting ' + name)
  // The list is the first sentence; later ones mention values that are not steps.
  return [...(line.split('. ')[0] ?? '').matchAll(/`([^`]+)`/g)].map((match) => match[1] ?? '')
}

const SPACING = /^(?:margin|padding)(?:-|$)|(?:^|-)gap$/

interface Sheet {
  css: string
  sizeToken: RegExp
  fontSizes: string[]
  spacing: string[]
}

const SHEETS: [name: string, sheet: Sheet][] = [
  [
    'the designer',
    {
      css: read('../packages/designer/src/designer.css'),
      sizeToken: /^--fs-font-size(?:-|$)/,
      fontSizes: [
        '.fs-toolbar__title 17px',
        '.fs-canvas__notice:not(:empty) 13px',
        // A glyph, not text.
        '.fs-dialog__close 18px',
        '.fs-binding__default 10px',
        '.fs-rules__count 10px',
        '.fs-prop-row label 13px',
      ],
      spacing: [
        '.fs-visually-hidden -1px',
        '.fs-panel__heading 14px',
        // One border short of 8px.
        ':where(.fs-toolbar, .fs-panel, .fs-canvas__bar, .fs-mobile-panels) button 7px',
        ':where(.fs-panel) input, :where(.fs-panel) select, :where(.fs-panel) textarea, ' +
          ':where(.fs-toolbar) input, :where(.fs-toolbar, .fs-canvas__bar) select 7px',
        // One border short of 6px.
        '.fs-dialog__actions button, .fs-dialog__file 5px',
        '.fs-palette__preset small 3px',
        // Room above the first component for its selection toolbar.
        '.fs-canvas__surface 40px',
        '.fs-tabs__tab 9px',
        '.fs-actions__event + .fs-actions__event 18px',
        '.fs-drag-label 3px',
        '.fs-selection__toolbar button 3px',
        '.fs-selection__label 1px',
      ],
    },
  ],
  [
    'the HTML kit',
    {
      css: read('../packages/kit-html/src/kit-html.css'),
      sizeToken: /^--fsh-font-size(?:-|$)/,
      fontSizes: [
        // All four are issue 229.
        '.fsh-card__title 1.05rem',
        '.fsh-card__subtitle 0.875rem',
        '.fsh-text--small 0.875rem',
        '.fsh-text--caption 0.8125rem',
      ],
      spacing: [
        // One border short of 10px.
        '.fsh-button 9px',
        '.fsh-alert 14px',
      ],
    },
  ],
]

describe.each(SHEETS)('the scale of %s', (_name, sheet) => {
  const declarations = styleRules(sheet.css).flatMap((rule) =>
    rule.declarations.map(([property, value]) => ({ selector: rule.selector, property, value })),
  )
  // In any rule: one that moved a step for part of the page would be a second scale.
  const tokens = declarations
    .filter(({ property }) => sheet.sizeToken.test(property))
    .map(({ property, value }) => [property, value])

  it('declares each type step the spec names, at the size the spec gives it', () => {
    const named = [...SPEC.matchAll(/`(--fsh?-font-size[a-z0-9-]*)` \((\d+px)\)/g)]
      .map((match) => [match[1] ?? '', match[2] ?? ''])
      .filter(([token]) => sheet.sizeToken.test(token ?? ''))

    expect(tokens.length).toBeGreaterThan(2)
    expect([...tokens].sort()).toEqual(named.sort())
  })

  it('declares no font size off the type scale beyond the listed ones', () => {
    const steps = new Set([
      ...tokens.map(([token]) => 'var(' + token + ')'),
      'inherit',
      // The form starts from the browser's own size, not the chrome's.
      'initial',
    ])
    const sizes = declarations.filter(({ property }) => property === 'font-size')

    expect(sizes.length).toBeGreaterThan(8)
    expect(
      sizes
        .filter(({ value }) => !steps.has(value))
        .map(({ selector, value }) => selector + ' ' + value)
        .sort(),
    ).toEqual([...sheet.fontSizes].sort())
  })

  it('sets a font only through the properties checked here', () => {
    const shorthands = declarations.filter(({ property }) => property === 'font')

    expect(shorthands.length).toBeGreaterThan(0)
    expect(shorthands.filter(({ value }) => value !== 'inherit')).toEqual([])
  })

  it('uses only the font weights the spec names', () => {
    const weights = stepsIn('Font weights')
    const used = declarations.filter(({ property }) => property === 'font-weight')

    expect(weights).toHaveLength(2)
    expect(used.length).toBeGreaterThan(2)
    expect(used.filter(({ value }) => !weights.includes(value))).toEqual([])
  })

  it('declares no margin, padding or gap off the spacing steps beyond the listed ones', () => {
    const steps = stepsIn('Spacing steps')
    const allowed = new Set(['0', 'auto', ...steps, ...steps.map((step) => '-' + step)])
    const lengths = declarations
      .filter(({ property }) => SPACING.test(property))
      .flatMap(({ selector, value }) => value.split(/\s+/).map((length) => ({ selector, length })))

    expect(steps.length).toBeGreaterThan(7)
    expect(lengths.length).toBeGreaterThan(30)
    expect(
      lengths
        .filter(({ length }) => !allowed.has(length))
        .map(({ selector, length }) => selector + ' ' + length)
        .sort(),
    ).toEqual([...sheet.spacing].sort())
  })
})
