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
    const sheet = styleSheetFor(root([node('card', { [device]: 'padding: 4px' })]))
    expect(sheet).toBe('@media ' + query + '{[data-fs-key="card"]{padding: 4px}}')
  })

  it('escapes the scope, not only the key', () => {
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

  it.each(['any', 'mobile', 'tablet', 'desktop'] as const)(
    'leaves out a declaration it refused on the %s layer rather than emitting a broken rule',
    (layer) => {
      const sheet = styleSheetFor(
        root([node('card', { [layer]: 'color: red } body { display: none' })]),
      )

      expect(sheet).not.toContain('display: none')
      expect(sheet).not.toContain('body')
    },
  )

  it('still emits a legitimate declaration on every layer', () => {
    for (const layer of ['any', 'mobile', 'tablet', 'desktop'] as const) {
      expect(
        styleSheetFor(root([node('card', { [layer]: 'color: red' })])),
        layer + ' emitted nothing',
      ).toContain('color: red')
    }
  })

  it('escapes a key that would otherwise break out of the selector', () => {
    const sheet = styleSheetFor(root([node('a"] , body [x="', { any: 'color: red' })]))
    expect(sheet).toBe('[data-fs-key="a\\000022 ] , body [x=\\000022 "]{color: red}')
  })

  it('terminates an escape so it cannot eat the character after it', () => {
    // A CSS escape takes at most six hex digits and then swallows one
    // whitespace, so the escape must bring its own space.
    const sheet = styleSheetFor(root([node('" b', { any: 'color: red' })]))
    expect(sheet).toBe('[data-fs-key="\\000022  b"]{color: red}')
  })

  it('escapes a key that would otherwise break out of the style element', () => {
    const sheet = styleSheetFor(
      root([node('a</style><script>x()</script>', { any: 'color: red' })]),
    )
    expect(sheet).not.toContain('<')
    expect(sheet).toContain('\\00003c')
  })

  it('escapes a backslash, which would otherwise escape the quote that follows it', () => {
    const sheet = styleSheetFor(
      root([node('a\\', { any: 'color: red' }), node('b', { any: 'color: blue' })]),
    )

    expect(sheet).toContain('[data-fs-key="a\\00005c "]{color: red}')
    expect(sheet).toContain('[data-fs-key="b"]{color: blue}')
    expect(sheet).not.toContain('\\"')
  })

  it('escapes a newline in a key, which would end the string on its own', () => {
    const sheet = styleSheetFor(root([node('a\n{}', { any: 'color: red' })]))
    expect(sheet).not.toContain('\n')
  })

  it('confines every rule to one rendered form when given a scope', () => {
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
    const text = 'grid-template-areas: "a b"; padding: 8px'
    const next = setDeclaration(text, 'padding', '16px')
    expect(readDeclaration(next, 'grid-template-areas')).toBe('"a b"')
  })

  it('keeps a semicolon that belongs to a value', () => {
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

  it('is not confused by an escaped separator outside a string either', () => {
    expect(parseDeclarations('content: a\\; b; padding: 8px')).toEqual([
      ['content', 'a\\; b'],
      ['padding', '8px'],
    ])

    expect(parseDeclarations('grid-template: a\\: b')).toEqual([['grid-template', 'a\\: b']])
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
    // A `Box`'s `background` reaches emotion, which writes it into stylesheet text.
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

  it.each([
    ['a number', 5],
    ['an object', { background: 'red' }],
    ['true', true],
  ])('refuses %s rather than throwing, because an evaluator result is untyped', (_what, value) => {
    expect(safeStyleValue(value as never)).toBeUndefined()
  })
})

/**
 * Every node's rules share one stylesheet, so a comment opened in one node and
 * closed in another hides every rule between them.
 */
describe('safeDeclarations and comments', () => {
  it('refuses an unterminated comment', () => {
    expect(safeDeclarations('color: red /*')).toBeUndefined()
  })

  it('refuses a comment that closes, because the pair is what does the damage', () => {
    expect(safeDeclarations('color: red /* a note */')).toBeUndefined()
    expect(safeDeclarations('*/ ; outline: none')).toBeUndefined()
  })

  it('keeps declarations that merely contain a slash or a star', () => {
    expect(safeDeclarations('font: 12px/1.5 sans-serif')).toBe('font: 12px/1.5 sans-serif')
    expect(safeDeclarations('grid-area: 1 / 2 / 3 / 4')).toBe('grid-area: 1 / 2 / 3 / 4')
  })
})

describe('declaration names and case', () => {
  it('keeps a custom property spelled the way it was written', () => {
    expect(parseDeclarations('--brandColor: red')).toEqual([['--brandColor', 'red']])
  })

  it('still matches an ordinary property however it was capitalised', () => {
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

describe('a raw declaration block this will not emit', () => {
  it.each([
    ['an unterminated double quote', 'content: "'],
    ['an unterminated single quote', "content: '"],
    ['a quote that hides a brace', 'content: "} body { display: none'],
  ])('refuses %s', (_what, text) => {
    // The sheet has no newlines, so an unterminated string runs past the
    // block's closing brace to the next quote, taking later rules with it.
    expect(safeDeclarations(text)).toBeUndefined()
  })

  it('refuses a block that fetches, which the single-value sink already refused', () => {
    expect(safeDeclarations('background: url(https://evil.example/p.png)')).toBeUndefined()
    expect(safeDeclarations('background-image: image-set("https://evil.example/p.png" 1x)')).toBe(
      undefined,
    )
  })

  it('refuses an entry that is not text at all', () => {
    expect(safeDeclarations(7 as unknown as string)).toBeUndefined()
    expect(safeDeclarations({ colour: 'red' } as unknown as string)).toBeUndefined()
    expect(() => styleSheetFor(root([node('card', { any: 7 as unknown as string })]))).not.toThrow()
  })

  it('still emits an ordinary block, including one with a balanced quote', () => {
    expect(safeDeclarations('color: red')).toBe('color: red')
    expect(safeDeclarations('content: "hello"')).toBe('content: "hello"')
    expect(safeDeclarations("font-family: 'Segoe UI'")).toBe("font-family: 'Segoe UI'")
  })
})

/**
 * Editing one declaration leaves the others where they were. Reordering would change
 * the raw text under the author's cursor, and the cascade where two properties overlap.
 */
describe('setDeclaration and the order of a block', () => {
  const SEP = ';' + String.fromCharCode(10)

  it('replaces a declaration in place', () => {
    expect(setDeclaration('color: red; padding: 8px', 'color', 'blue').split(SEP)).toEqual([
      'color: blue',
      'padding: 8px',
    ])
  })

  it('appends one the block does not have', () => {
    expect(setDeclaration('color: red', 'padding', '8px').split(SEP)).toEqual([
      'color: red',
      'padding: 8px',
    ])
  })

  it('removes one without disturbing the rest', () => {
    expect(setDeclaration('color: red; padding: 8px; margin: 0', 'padding', '').split(SEP)).toEqual(
      ['color: red', 'margin: 0'],
    )
  })
})

describe('styleSheetFor on a malformed tree', () => {
  it.each([
    ['an object', { nope: true }],
    ['a string', 'children'],
    ['a number', 7],
  ])('answers rather than throwing for children that are %s', (_what, children) => {
    const broken = {
      key: 'root',
      type: 'Screen',
      props: {},
      css: { any: 'color: red' },
      children,
    } as never

    expect(() => styleSheetFor(broken)).not.toThrow()
    expect(styleSheetFor(broken)).toContain('color: red')
  })

  it('answers rather than overflowing on a tree nested past any bound', () => {
    let deep: ComponentNode = { key: 'leaf', type: 'Field', props: {}, css: { any: 'color: red' } }
    for (let i = 0; i < 5000; i += 1) {
      deep = { key: 'stack' + String(i), type: 'Stack', props: {}, children: [deep] }
    }

    expect(() => styleSheetFor(deep)).not.toThrow()
  })

  it('still emits a rule for a node a person would author', () => {
    const fine: ComponentNode = {
      key: 'root',
      type: 'Screen',
      props: {},
      children: [{ key: 'card', type: 'Box', props: {}, css: { any: 'padding: 8px' } }],
    }

    expect(styleSheetFor(fine)).toContain('padding: 8px')
  })
})

describe('the backslash, which one of the two grammars did not treat as significant', () => {
  const ESCAPED_URL: [string, string][] = [
    ['hex escape with a space terminator', 'background:\\75 rl(https://evil.example/beacon)'],
    ['hex escape, zero padded', 'background:\\000075rl(https://evil.example/beacon)'],
    ['a single escaped letter', 'background:\\75rl(https://evil.example/beacon)'],
    ['escape inside the middle of the name', 'background:u\\72 l(https://evil.example/beacon)'],
    ['escaped opening paren', 'background:url\\28 https://evil.example/beacon)'],
  ]

  it.each(ESCAPED_URL)('refuses a fetch written with %s', (_what, block) => {
    expect(safeDeclarations(block)).toBeUndefined()
  })

  it('refuses a trailing backslash, which swallows the closing brace', () => {
    expect(safeDeclarations('color:red\\')).toBeUndefined()
  })

  it('does not delete the rules that follow such a component', () => {
    const root: ComponentNode = {
      key: 'root',
      type: 'Screen',
      props: {},
      children: [
        { key: 'first', type: 'Field', props: {}, css: { any: 'color:red\\' } },
        { key: 'second', type: 'Field', props: {}, css: { any: 'color:blue' } },
      ],
    }

    const sheet = styleSheetFor(root, { scope: 'scope' })

    expect(sheet, "the later component's rule was swallowed").toContain('color:blue')
    const opens = (sheet.match(/\{/g) ?? []).length
    const closes = (sheet.match(/\}/g) ?? []).length
    expect(opens, 'the emitted sheet has an unclosed block').toBe(closes)
  })

  it('still accepts the declarations an author actually writes', () => {
    // None of these needs a backslash, which is why it is refused outright.
    expect(safeDeclarations('color:red')).toContain('color:red')
    expect(safeDeclarations('padding:8px 12px')).toContain('padding')
    expect(safeDeclarations("font-family:'Helvetica Neue', Arial, sans-serif")).toContain('Arial')
    expect(safeDeclarations('border-radius:4px;color:#333')).toContain('border-radius')
  })
})

describe('a node whose key is not a string', () => {
  const withKey = (key: unknown): ComponentNode =>
    ({
      key: 'root',
      type: 'Screen',
      props: {},
      children: [{ key, type: 'Field', props: {}, css: { any: 'color:red' } }],
    }) as unknown as ComponentNode

  it.each([
    ['a number', 42],
    ['null', null],
    ['an object', {}],
    ['undefined', undefined],
  ])('does not throw when a css-carrying node has %s for a key', (_what, key) => {
    expect(() => styleSheetFor(withKey(key), { scope: 'scope' })).not.toThrow()
  })

  it('still emits the rule for a node whose key is a string', () => {
    expect(styleSheetFor(withKey('field'), { scope: 'scope' })).toContain('color:red')
  })
})

describe('the case of a fetching function', () => {
  it.each([
    ['URL', 'background:URL(https://evil.example/x)'],
    ['Image-Set', 'background:Image-Set("https://evil.example/x" 1x)'],
    ['ELEMENT', 'background:ELEMENT(#other)'],
    ['Cross-Fade', 'background:Cross-Fade(url(a), url(b))'],
  ])('refuses %s in a declaration block', (_what, block) => {
    expect(safeDeclarations(block)).toBeUndefined()
  })

  it.each([
    ['URL', 'URL(https://evil.example/x)'],
    ['Image-Set', 'Image-Set("https://evil.example/x" 1x)'],
  ])('refuses %s as a style value', (_what, value) => {
    expect(safeStyleValue(value)).toBeUndefined()
  })
})
