import { describe, expect, it } from 'vitest'

import {
  parseDeclarations,
  printDeclarations,
  safeStyleValue,
  readDeclaration,
  safeDeclarations,
  setDeclaration,
  styleSheetFor,
} from './css.js'
import type { ComponentNode } from './types.js'

const node = (key: string, css: ComponentNode['css']): ComponentNode => ({
  key,
  type: 'Box',
  props: {},
  ...(css ? { css } : {}),
})

const root = (children: ComponentNode[]): ComponentNode => ({
  key: 'root',
  type: 'Screen',
  props: {},
  children,
})

describe('safeDeclarations', () => {
  it('keeps ordinary declarations', () => {
    expect(safeDeclarations('padding: 8px; color: red')).toBe('padding: 8px; color: red')
    expect(safeDeclarations('  margin: 0  ')).toBe('margin: 0')
  })

  it('refuses text that could close the block and start a new rule', () => {
    /*
     * This is the whole reason the function exists. A document is data, so an
     * author can write anything here, and `}` is how one component's styling
     * reaches the entire page.
     */
    expect(safeDeclarations('color: red } body { display: none')).toBeUndefined()
    expect(safeDeclarations('a { color: red }')).toBeUndefined()
  })

  it('refuses text that could leave CSS altogether', () => {
    // The text is placed inside a <style> element, and </style> closes it.
    expect(safeDeclarations('color: red</style><script>alert(1)</script>')).toBeUndefined()
  })

  it('refuses at-rules', () => {
    expect(safeDeclarations('@import url(https://evil.example)')).toBeUndefined()
    expect(safeDeclarations('color: red; @media print { a { color: blue } }')).toBeUndefined()
  })

  it('treats nothing, and nothing but space, as no declarations', () => {
    expect(safeDeclarations(undefined)).toBeUndefined()
    expect(safeDeclarations('')).toBeUndefined()
    expect(safeDeclarations('   \n  ')).toBeUndefined()
  })
})

describe('styleSheetFor', () => {
  it('scopes every rule to the node that carries it', () => {
    const sheet = styleSheetFor(root([node('card', { any: 'padding: 8px' })]))
    expect(sheet).toBe('[data-fs-key="card"]{padding: 8px}')
  })

  it('emits nothing for a tree with no styling', () => {
    expect(styleSheetFor(root([node('card', undefined)]))).toBe('')
  })

  it('turns each device into its own media query when none is simulated', () => {
    const sheet = styleSheetFor(
      root([node('card', { any: 'padding: 8px', mobile: 'padding: 4px' })]),
    )

    expect(sheet).toContain('[data-fs-key="card"]{padding: 8px}')
    expect(sheet).toContain('@media (max-width: 767px){[data-fs-key="card"]{padding: 4px}}')
  })

  it.each([
    ['mobile', '(max-width: 767px)'],
    ['tablet', '(min-width: 768px) and (max-width: 1023px)'],
    ['desktop', '(min-width: 1024px)'],
  ])('turns %s into its own query', (device, query) => {
    /*
     * All three breakpoints, not just mobile. The other two could have moved --
     * a tablet rule that starts at 640px, a desktop one that overlaps it -- and
     * the only test here asserted the mobile query, so the two that decide
     * whether a rule reaches the screen at all were unpinned.
     */
    const sheet = styleSheetFor(root([node('card', { [device]: 'padding: 4px' })]))
    expect(sheet).toBe('@media ' + query + '{[data-fs-key="card"]{padding: 4px}}')
  })

  it('escapes the scope, not only the key', () => {
    /*
     * `escapeKey` is applied to both and only one was ever given anything to
     * escape. A scope is a `useId` value today, so nothing in it needs escaping
     * -- and it is a string this library accepts from a caller, which is the
     * definition of a value not to trust: a scope holding a quote would close
     * the attribute selector and start a different one.
     */
    const sheet = styleSheetFor(root([node('card', { any: 'padding: 4px' })]), {
      scope: 'a"] , body [x="',
    })

    expect(sheet).not.toContain('"] , body')
    expect(sheet).toContain('000022')
  })

  it('puts the base layer before the queries, so a device overrides it', () => {
    const sheet = styleSheetFor(
      root([node('card', { any: 'padding: 8px', mobile: 'padding: 4px' })]),
    )
    expect(sheet.indexOf('padding: 8px')).toBeLessThan(sheet.indexOf('@media'))
  })

  it('emits only the simulated device, flat, with no query', () => {
    /*
     * The canvas simulates a device by sizing a frame, so a media query would
     * answer about the browser window and the frame would be ignored.
     */
    const css = { any: 'padding: 8px', mobile: 'padding: 4px', tablet: 'padding: 6px' }
    const sheet = styleSheetFor(root([node('card', css)]), { device: 'mobile' })

    expect(sheet).not.toContain('@media')
    expect(sheet).toContain('padding: 4px')
    expect(sheet).not.toContain('padding: 6px')
    expect(sheet.indexOf('padding: 8px')).toBeLessThan(sheet.indexOf('padding: 4px'))
  })

  it('emits only the base when the simulated device has no rules of its own', () => {
    const sheet = styleSheetFor(
      root([node('card', { any: 'padding: 8px', mobile: 'padding: 4px' })]),
      { device: 'desktop' },
    )
    expect(sheet).toBe('[data-fs-key="card"]{padding: 8px}')
  })

  it('leaves out a declaration it refused rather than emitting a broken rule', () => {
    const sheet = styleSheetFor(root([node('card', { any: 'color: red } body { display: none' })]))
    expect(sheet).toBe('')
  })

  it('escapes a key that would otherwise break out of the selector', () => {
    // Keys are author-controlled, so one holding a quote must not end the
    // attribute selector and start a different one.
    const sheet = styleSheetFor(root([node('a"] , body [x="', { any: 'color: red' })]))
    expect(sheet).toBe('[data-fs-key="a\\000022 ] , body [x=\\000022 "]{color: red}')
  })

  it('terminates an escape so it cannot eat the character after it', () => {
    /*
     * A CSS parser reads at most six hex digits and then swallows one following
     * whitespace as the terminator. With no space of ours it ate the author's:
     * a key of `" b` produced an escape immediately followed by the real space,
     * which parses as `"b` -- a selector naming a string no element carries, so
     * the component's styling silently applied to nothing.
     */
    const sheet = styleSheetFor(root([node('" b', { any: 'color: red' })]))
    expect(sheet).toBe('[data-fs-key="\\000022  b"]{color: red}')
  })

  it('escapes a key that would otherwise break out of the style element', () => {
    /*
     * Worse than a broken selector, and it survives every defence aimed at CSS,
     * because it never has to be valid CSS. This text is placed inside a
     * `<style>` element, and `</style>` closes one wherever it appears.
     */
    const sheet = styleSheetFor(
      root([node('a</style><script>x()</script>', { any: 'color: red' })]),
    )
    expect(sheet).not.toContain('<')
    expect(sheet).toContain('\\00003c')
  })

  it('escapes a newline in a key, which would end the string on its own', () => {
    const sheet = styleSheetFor(root([node('a\n{}', { any: 'color: red' })]))
    expect(sheet).not.toContain('\n')
  })

  it('confines every rule to one rendered form when given a scope', () => {
    /*
     * Keys are unique inside a document, not inside a page. Two forms rendered
     * together both have a `root`, so an unscoped sheet from the first styles
     * the second.
     */
    const sheet = styleSheetFor(
      root([node('card', { any: 'color: red', mobile: 'color: blue' })]),
      {
        scope: ':r1:',
      },
    )

    expect(sheet).toContain('[data-fs-scope=":r1:"][data-fs-key="card"]')
    // The compound has to reach into the media query too, or the base layer is
    // confined and the device override is not.
    expect(sheet.match(/data-fs-scope/g)).toHaveLength(2)
    expect(sheet).not.toContain('[data-fs-scope=":r1:"] [data-fs-key')
  })

  it('reaches components nested anywhere in the tree', () => {
    const inner = node('inner', { any: 'color: red' })
    const outer: ComponentNode = { key: 'outer', type: 'Box', props: {}, children: [inner] }
    expect(styleSheetFor(root([outer]))).toContain('[data-fs-key="inner"]')
  })
})

describe('printDeclarations', () => {
  it('writes one declaration per line, so the raw field stays readable', () => {
    // Its own contract, which was only ever checked through `setDeclaration`.
    expect(
      printDeclarations([
        ['padding', '8px'],
        ['color', 'red'],
      ]),
    ).toBe('padding: 8px;' + String.fromCharCode(10) + 'color: red')
  })

  it('answers nothing for nothing', () => {
    expect(printDeclarations([])).toBe('')
  })

  it('round-trips what parseDeclarations produced', () => {
    const text = 'padding: 8px;' + String.fromCharCode(10) + 'color: red'
    expect(printDeclarations(parseDeclarations(text))).toBe(text)
  })
})

describe('declarations round-trip, so two editors can share one string', () => {
  it('reads a property back out', () => {
    expect(readDeclaration('padding: 8px; color: red', 'padding')).toBe('8px')
    expect(readDeclaration('padding: 8px', 'margin')).toBe('')
    expect(readDeclaration(undefined, 'padding')).toBe('')
  })

  it('is case-insensitive about the property name', () => {
    expect(readDeclaration('PADDING: 8px', 'padding')).toBe('8px')
  })

  it('sets a property that was not there', () => {
    expect(setDeclaration('color: red', 'padding', '8px')).toBe('color: red;\npadding: 8px')
  })

  it('replaces one that was, without duplicating it', () => {
    const next = setDeclaration('padding: 8px; color: red', 'padding', '16px')
    expect(readDeclaration(next, 'padding')).toBe('16px')
    expect(parseDeclarations(next).filter(([name]) => name === 'padding')).toHaveLength(1)
  })

  it('removes a property when the value is emptied', () => {
    expect(setDeclaration('padding: 8px; color: red', 'padding', '')).toBe('color: red')
    expect(setDeclaration('padding: 8px; color: red', 'padding', undefined)).toBe('color: red')
  })

  it('leaves declarations it has no control for alone', () => {
    /*
     * The property that lets a structured control and a raw field edit one
     * string: a control only ever touches its own line, so anything typed by
     * hand survives being near a widget.
     */
    const text = 'grid-template-areas: "a b"; padding: 8px'
    const next = setDeclaration(text, 'padding', '16px')
    expect(readDeclaration(next, 'grid-template-areas')).toBe('"a b"')
  })

  it('keeps a semicolon that belongs to a value', () => {
    /*
     * A data URI has a `;` in the middle of it. Splitting on every `;` cut the
     * value in half, and because a structured control rewrites the whole string
     * when it is touched, adjusting the padding would have destroyed a
     * background nobody was editing.
     */
    const text = 'background: url(data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=); padding: 8px'

    expect(parseDeclarations(text)).toEqual([
      ['background', 'url(data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=)'],
      ['padding', '8px'],
    ])

    const next = setDeclaration(text, 'padding', '16px')
    expect(readDeclaration(next, 'background')).toBe(
      'url(data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=)',
    )
  })

  it('keeps a semicolon and a colon inside a quoted value', () => {
    const text = 'content: "a; b: c"; padding: 8px'
    expect(parseDeclarations(text)).toEqual([
      ['content', '"a; b: c"'],
      ['padding', '8px'],
    ])
  })

  it('keeps a colon that belongs to the value rather than the name', () => {
    // Splitting on the first colon is right; splitting on every one is not.
    expect(parseDeclarations('background: url(https://x/y.png)')).toEqual([
      ['background', 'url(https://x/y.png)'],
    ])
  })

  it('is not confused by an escaped quote inside a string', () => {
    expect(parseDeclarations('content: "a\\"; b"; padding: 8px')).toEqual([
      ['content', '"a\\"; b"'],
      ['padding', '8px'],
    ])
  })

  it('ignores a fragment that is not a declaration', () => {
    expect(parseDeclarations('padding: 8px; nonsense; : 4px; color:')).toEqual([['padding', '8px']])
  })

  it('survives a round trip through the sheet builder', () => {
    const text = setDeclaration(setDeclaration('', 'padding', '8px'), 'color', 'red')
    expect(safeDeclarations(text)).toBe(text)
    expect(styleSheetFor(root([node('card', { any: text })]))).toContain('padding: 8px')
  })
})

describe('safeStyleValue', () => {
  it('refuses a value that closes its block and opens a rule of its own', () => {
    // The CRITICAL. A `Box`'s `background` reaches emotion, which concatenates
    // it into stylesheet text, so a value holding a brace authors a second
    // top-level rule against the whole page.
    expect(safeStyleValue('red}html{display:none}.x{')).toBeUndefined()
  })

  it.each([
    ['a brace', 'red}'],
    ['a closing angle bracket to leave CSS', 'red</style'],
    ['an at-rule', '@import url(https://evil.example/x.css)'],
    ['a second declaration', 'red;position:fixed'],
    ['an importance flag', 'red !important'],
    ['a comment opener', 'red/*'],
    ['a NUL', 'red\u0000'],
    ['a newline', 'red\nposition:fixed'],
    ['a backslash escape', '\\75 rl(https://evil.example/p.png)'],
  ])('refuses %s', (_what, value) => {
    expect(safeStyleValue(value)).toBeUndefined()
  })

  it.each([
    ['a bare url', 'url(https://evil.example/p.png)'],
    ['a url behind a custom property fallback', 'var(--x, url(https://evil.example/p.png))'],
    ['an image-set', 'image-set("https://evil.example/p.png" 1x)'],
    ['a prefixed image-set', '-webkit-image-set("https://evil.example/p.png" 1x)'],
    ['an element reference', 'element(#somewhere)'],
    ['a cross-fade', 'cross-fade(url(https://evil.example/p.png), red)'],
    ['a data uri', 'url(data:image/svg+xml;base64,AAA)'],
  ])('refuses %s, because a fetch is exfiltration on a form', (_what, value) => {
    // The rendering shape does not close this one: a React `style` object takes
    // `url()` happily, and the outbound request fires the same either way.
    expect(safeStyleValue(value)).toBeUndefined()
  })

  it.each([
    'red',
    '#ff0000',
    '#ff000080',
    'rgb(255 0 0)',
    'rgba(255, 0, 0, 0.5)',
    'hsl(0deg 100% 50%)',
    'transparent',
    'currentColor',
    'linear-gradient(to right, red, blue)',
    'var(--brand)',
  ])('keeps the legitimate value %s', (value) => {
    expect(safeStyleValue(value)).toBe(value)
  })

  it('trims, and reads an empty value as no value', () => {
    expect(safeStyleValue('  red  ')).toBe('red')
    expect(safeStyleValue('   ')).toBeUndefined()
    expect(safeStyleValue('')).toBeUndefined()
    expect(safeStyleValue(undefined)).toBeUndefined()
  })
})

/**
 * A comment is a way out of a declaration too.
 *
 * `FORBIDDEN` covers `{`, `}`, `<` and `@` — everything that ends the block.
 * It did not cover `/*`, which does not end the block so much as swallow it:
 * `color: red /*` on one node and `*` + `/ ; outline: none` on another are
 * concatenated into one stylesheet, and everything between them disappears
 * inside the comment. A third node's rule is deleted, and one node's
 * declaration lands under another node's selector.
 *
 * It cannot reach outside the form, so this is not the injection the value
 * refusal is for. What it breaks is the sentence this file opens with: a
 * component's styling affects that component.
 */
describe('safeDeclarations and comments', () => {
  it('refuses an unterminated comment', () => {
    expect(safeDeclarations('color: red /*')).toBeUndefined()
  })

  it('refuses a comment that closes, because the pair is what does the damage', () => {
    // Refused as a set rather than balanced, for the reason the braces are:
    // deciding which comment is safe invites an argument this does not need.
    expect(safeDeclarations('color: red /* a note */')).toBeUndefined()
    expect(safeDeclarations('*/ ; outline: none')).toBeUndefined()
  })

  it('keeps declarations that merely contain a slash or a star', () => {
    // The control. Refusing either character alone would take out real values.
    expect(safeDeclarations('font: 12px/1.5 sans-serif')).toBe('font: 12px/1.5 sans-serif')
    expect(safeDeclarations('grid-area: 1 / 2 / 3 / 4')).toBe('grid-area: 1 / 2 / 3 / 4')
  })
})

/**
 * A custom property's name is case-sensitive; a CSS property's is not.
 *
 * `parseDeclarations` lowercased every name, and `setDeclaration` wrote the
 * lowercased form back — so `--brandColor` became `--brandcolor` the first time
 * any structured control was touched, and stopped matching the `var()` that
 * read it. Silently: the declaration is still there and still valid.
 */
describe('declaration names and case', () => {
  it('keeps a custom property spelled the way it was written', () => {
    expect(parseDeclarations('--brandColor: red')).toEqual([['--brandColor', 'red']])
  })

  it('still matches an ordinary property however it was capitalised', () => {
    // The control, and why the lowercasing was there: CSS property names are
    // case-insensitive, and a control looking for `padding` has to find it.
    expect(parseDeclarations('PADDING: 8px')).toEqual([['padding', '8px']])
    expect(readDeclaration('Padding: 8px', 'padding')).toBe('8px')
  })

  it('does not rewrite a custom property when an unrelated control is used', () => {
    const text = setDeclaration('--brandColor: red', 'padding', '8px')

    expect(text).toContain('--brandColor: red')
    expect(readDeclaration(text, '--brandColor')).toBe('red')
  })

  it('reads a custom property back only by its exact name', () => {
    expect(readDeclaration('--brandColor: red', '--brandcolor')).toBe('')
    expect(readDeclaration('--brandColor: red', '--brandColor')).toBe('red')
  })
})
