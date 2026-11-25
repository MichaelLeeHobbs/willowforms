/**
 * Thresholds are WCAG 2.2 AA: 4.5:1 for body text, 3:1 for large text and for
 * the boundaries of user interface components.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { contrast, luminance, parseHex, ratio, tokensFrom } from './contrast.js'
import { styleRules } from './css.js'

const read = (path: string): string =>
  readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8')

const designerCss = read('../packages/designer/src/designer.css')
const kitCss = read('../packages/kit-html/src/kit-html.css')

const AA_TEXT = 4.5
const AA_LARGE = 3

interface Palette {
  name: string
  tokens: Record<string, string>
}

/**
 * Three palettes: light, an explicit dark choice, and the dark block inside
 * `@media (prefers-color-scheme: dark)` that a viewer on the default `system`
 * theme gets. The dark blocks only restate what changes, so each is folded onto
 * the light base.
 */
function palettes(css: string, base: string, chosenDark: string, systemDark: string): Palette[] {
  const light = tokensFrom(css, base)
  const chosen = tokensFrom(css, chosenDark)
  const system = tokensFrom(css, systemDark)

  // A block that declares no tokens would check the light palette again under another
  // name.
  for (const [selector, tokens] of [
    [base, light],
    [chosenDark, chosen],
    [systemDark, system],
  ] as const) {
    if (Object.keys(tokens).length === 0) throw new Error('No tokens found for ' + selector)
  }

  return [
    { name: 'light', tokens: light },
    { name: 'dark, chosen', tokens: { ...light, ...chosen } },
    { name: 'dark, from the system', tokens: { ...light, ...system } },
  ]
}

/**
 * Both dark blocks spell one decision. Each clearing AA does not make them the
 * same palette, so they are compared declaration by declaration.
 */
function darkBlocks(
  css: string,
  chosenDark: string,
  systemDark: string,
): { chosen: Record<string, string>; system: Record<string, string> } {
  return {
    chosen: tokensFrom(css, chosenDark, false),
    system: tokensFrom(css, systemDark, false),
  }
}

describe("the designer's two dark blocks", () => {
  it('match declaration for declaration, not only token for token', () => {
    const { chosen, system } = darkBlocks(
      designerCss,
      ".fs-shell:where([data-fs-theme='dark'])",
      ".fs-shell:where(:not([data-fs-theme='light']))",
    )
    expect(system, 'the two dark blocks have drifted apart').toEqual(chosen)
  })
})

/**
 * Every pair this file measured. `docs/accessibility.md` quotes the lowest ratio
 * in each palette, and the check at the bottom of this file compares the two.
 */
interface Measured {
  palette: string
  fg: string
  bg: string
  ratio: number
}

const MEASURED: Measured[] = []

function measurer(palette: string, tokens: Record<string, string>) {
  return (fg: string, bg: string): number => {
    const foreground = tokens[fg]
    const background = tokens[bg]
    if (!foreground || !background) throw new Error('Missing token: ' + fg + ' or ' + bg)
    const value = ratio(foreground, background)
    MEASURED.push({ palette, fg, bg, ratio: value })
    return value
  }
}

describe.each(
  palettes(
    designerCss,
    '.fs-shell',
    ".fs-shell:where([data-fs-theme='dark'])",
    ".fs-shell:where(:not([data-fs-theme='light']))",
  ),
)('designer chrome, $name theme', ({ name, tokens }) => {
  const on = measurer('Designer, ' + (name === 'light' ? 'light' : 'dark'), tokens)

  it.each([
    ['--fs-text', '--fs-bg-app'],
    ['--fs-text', '--fs-bg-panel'],
    ['--fs-text', '--fs-bg-well'],
  ])('body text %s on %s clears AA', (fg, bg) => {
    expect(on(fg, bg)).toBeGreaterThanOrEqual(AA_TEXT)
  })

  it.each([
    ['--fs-text-muted', '--fs-bg-panel'],
    ['--fs-text-muted', '--fs-bg-well'],
    ['--fs-text-muted', '--fs-bg-app'],
  ])('muted text %s on %s clears AA', (fg, bg) => {
    // Muted is used for hints and secondary labels, which are still body text.
    expect(on(fg, bg)).toBeGreaterThanOrEqual(AA_TEXT)
  })

  it('primary button text clears AA', () => {
    expect(on('--fs-primary-text', '--fs-primary')).toBeGreaterThanOrEqual(AA_TEXT)
  })

  it.each([
    ['--fs-text', '--fs-bg-field', AA_TEXT],
    ['--fs-text-muted', '--fs-bg-field', AA_TEXT],
    ['--fs-text', '--fs-bg-hover', AA_TEXT],
    ['--fs-text-muted', '--fs-bg-hover', AA_TEXT],
    ['--fs-control-border', '--fs-bg-field', AA_LARGE],
    ['--fs-primary', '--fs-bg-field', AA_LARGE],
    ['--fs-primary', '--fs-bg-selected', AA_LARGE],
    ['--fs-text-selected', '--fs-bg-selected', AA_TEXT],
    ['--fs-primary-text', '--fs-primary-hover', AA_TEXT],
  ] as const)('state token %s on %s clears its contrast requirement', (fg, bg, minimum) => {
    expect(on(fg, bg)).toBeGreaterThanOrEqual(minimum)
  })

  it('the danger colour clears AA on both panel surfaces', () => {
    expect(on('--fs-danger', '--fs-bg-panel')).toBeGreaterThanOrEqual(AA_TEXT)
    expect(on('--fs-danger', '--fs-bg-well')).toBeGreaterThanOrEqual(AA_TEXT)
  })

  it('the focus ring is distinguishable from every surface it lands on', () => {
    // A focus indicator is a user interface component boundary, so 3:1.
    expect(on('--fs-primary', '--fs-bg-app')).toBeGreaterThanOrEqual(AA_LARGE)
    expect(on('--fs-primary', '--fs-bg-panel')).toBeGreaterThanOrEqual(AA_LARGE)
    expect(on('--fs-primary', '--fs-bg-well')).toBeGreaterThanOrEqual(AA_LARGE)
  })

  it('the designer own controls have a visible boundary', () => {
    /*
     * A text field is a shade off the panel's own background, so the border is
     * the only thing saying a control is there. WCAG 1.4.11: a control boundary
     * needs 3:1. Panels, the canvas bar and the preview data pane all host
     * controls.
     */
    expect(on('--fs-control-border', '--fs-bg-panel')).toBeGreaterThanOrEqual(AA_LARGE)
    expect(on('--fs-control-border', '--fs-bg-app')).toBeGreaterThanOrEqual(AA_LARGE)
    expect(on('--fs-control-border', '--fs-bg-well')).toBeGreaterThanOrEqual(AA_LARGE)
  })

  it('the drop indicator is distinguishable from the panel it is drawn over', () => {
    expect(on('--fs-accent', '--fs-bg-panel')).toBeGreaterThanOrEqual(AA_LARGE)
  })

  it('the scrollbar thumb is visible on every surface that scrolls', () => {
    // The track is transparent, so the thumb sits on each surface directly. A
    // scrollbar is a user interface component, so 3:1.
    expect(on('--fs-scrollbar-thumb', '--fs-bg-panel')).toBeGreaterThanOrEqual(AA_LARGE)
    expect(on('--fs-scrollbar-thumb', '--fs-bg-app')).toBeGreaterThanOrEqual(AA_LARGE)
    expect(on('--fs-scrollbar-thumb', '--fs-bg-well')).toBeGreaterThanOrEqual(AA_LARGE)
  })
})

describe("the HTML kit's two dark blocks", () => {
  it('declare the same tokens', () => {
    const { chosen, system } = darkBlocks(
      kitCss,
      ".fsh-screen:where([data-fsh-theme='dark'])",
      ".fsh-screen:where(:not([data-fsh-theme='light']))",
    )
    expect(system, 'the two dark blocks have drifted apart').toEqual(chosen)
  })
})

describe.each(
  palettes(
    kitCss,
    '.fsh-screen',
    ".fsh-screen:where([data-fsh-theme='dark'])",
    ".fsh-screen:where(:not([data-fsh-theme='light']))",
  ),
)('html kit, $name theme', ({ name, tokens }) => {
  const on = measurer('HTML kit, ' + (name === 'light' ? 'light' : 'dark'), tokens)

  it('field text clears AA on the field background', () => {
    expect(on('--fsh-text', '--fsh-field')).toBeGreaterThanOrEqual(AA_TEXT)
    expect(on('--fsh-text', '--fsh-surface')).toBeGreaterThanOrEqual(AA_TEXT)
  })

  it('the state colours on an alert are distinguishable from the surface', () => {
    // The stripe is the only thing distinguishing one alert from another, which
    // makes it a user interface component: 3:1.
    expect(on('--fsh-success', '--fsh-surface')).toBeGreaterThanOrEqual(AA_LARGE)
    expect(on('--fsh-warning', '--fsh-surface')).toBeGreaterThanOrEqual(AA_LARGE)
    expect(on('--fsh-danger', '--fsh-surface')).toBeGreaterThanOrEqual(AA_LARGE)
  })

  it('the progress track is visible against the surface it sits on', () => {
    /*
     * `--fsh-field` and `--fsh-surface` are the same colour in the light
     * palette, so the ring (`--fsh-border`) carries the track's boundary.
     * Darkening the track instead would take the fill against it under 3:1.
     * WCAG 1.4.11 asks 3:1 of anything that identifies a component.
     */
    expect(on('--fsh-border', '--fsh-surface')).toBeGreaterThanOrEqual(AA_LARGE)
    expect(on('--fsh-accent', '--fsh-field')).toBeGreaterThanOrEqual(AA_LARGE)
  })

  it('helper text clears AA rather than fading into the surface', () => {
    expect(on('--fsh-muted', '--fsh-surface')).toBeGreaterThanOrEqual(AA_TEXT)
    expect(on('--fsh-muted', '--fsh-field')).toBeGreaterThanOrEqual(AA_TEXT)
  })

  it('error text clears AA, since it is the one message that must be read', () => {
    expect(on('--fsh-danger', '--fsh-surface')).toBeGreaterThanOrEqual(AA_TEXT)
    expect(on('--fsh-danger', '--fsh-field')).toBeGreaterThanOrEqual(AA_TEXT)
  })

  it('the solid button label clears AA', () => {
    expect(on('--fsh-accent-text', '--fsh-accent')).toBeGreaterThanOrEqual(AA_TEXT)
  })

  it('the outline button label clears AA on the surface', () => {
    expect(on('--fsh-accent', '--fsh-surface')).toBeGreaterThanOrEqual(AA_TEXT)
  })

  it('field borders are visible against their surface', () => {
    // An input's boundary is a user interface component, so 3:1.
    expect(on('--fsh-border', '--fsh-field')).toBeGreaterThanOrEqual(AA_LARGE)
    expect(on('--fsh-border', '--fsh-surface')).toBeGreaterThanOrEqual(AA_LARGE)
  })

  it('the scrollbar thumb is visible against kit surfaces', () => {
    expect(on('--fsh-scrollbar-thumb', '--fsh-surface')).toBeGreaterThanOrEqual(AA_LARGE)
    expect(on('--fsh-scrollbar-thumb', '--fsh-field')).toBeGreaterThanOrEqual(AA_LARGE)
  })
})

/**
 * Fixed points from WCAG 2.2 and published reference values, which a drifted
 * formula cannot satisfy.
 */
describe('the contrast instrument', () => {
  it('puts black on white at 21:1 and a colour on itself at 1:1', () => {
    expect(ratio('#000000', '#ffffff')).toBe(21)
    expect(ratio('#ffffff', '#ffffff')).toBe(1)
    expect(ratio('#7c838d', '#7c838d')).toBe(1)
  })

  it('is symmetric, because a ratio has no direction', () => {
    expect(ratio('#0b6fa4', '#ffffff')).toBe(ratio('#ffffff', '#0b6fa4'))
  })

  it.each([
    ['#767676', '#ffffff', 4.54],
    ['#595959', '#ffffff', 7.0],
    ['#949494', '#000000', 6.92],
    ['#0000ff', '#ffffff', 8.59],
    ['#ff0000', '#ffffff', 4.0],
  ])('rates %s on %s at %s to one', (fg, bg, expected) => {
    // Published reference values: `#767676` on white is the canonical smallest
    // grey passing AA for body text, at 4.54; `#949494` on black is its counterpart.
    expect(ratio(fg, bg)).toBe(expected)
  })

  it('applies the linear branch below the threshold and the curve above it', () => {
    // Channel 10 is 10/255 = 0.0392, just under `0.03928`, so it stays linear;
    // channel 11 is just over and takes the power curve.
    expect(luminance(parseHex('#0a0a0a'))).toBeCloseTo(10 / 255 / 12.92, 12)
    expect(luminance(parseHex('#0b0b0b'))).toBeCloseTo(
      Math.pow((11 / 255 + 0.055) / 1.055, 2.4),
      12,
    )
  })

  it('weights green most and blue least, as the coefficients say', () => {
    expect(luminance(parseHex('#00ff00'))).toBeCloseTo(0.7152, 4)
    expect(luminance(parseHex('#ff0000'))).toBeCloseTo(0.2126, 4)
    expect(luminance(parseHex('#0000ff'))).toBeCloseTo(0.0722, 4)
  })

  it('reads a three-digit hex as the six-digit one it stands for', () => {
    expect(parseHex('#fff')).toEqual(parseHex('#ffffff'))
    expect(contrast('#fff', '#000')).toBe(contrast('#ffffff', '#000000'))
  })

  it('refuses anything that is not a colour rather than guessing', () => {
    // `tokensFrom` hands over whatever the stylesheet said, so a token holding
    // `var(--other)` or `rgb(0 0 0)` must stop the suite, not score 1:1.
    expect(() => parseHex('rgb(0 0 0)')).toThrow()
    expect(() => parseHex('var(--fs-text)')).toThrow()
    expect(() => parseHex('#12345')).toThrow()
  })
})

const UNMEASURED_BORDERS: Record<string, string> = {
  '--fs-border':
    'A panel divider is decoration, and WCAG 1.4.11 asks nothing of decoration. ' +
    'The boundary of a control is --fs-control-border, which is measured on all three surfaces.',
}

describe('the contrast figures the documents quote', () => {
  // Declared last: these read `MEASURED`, which the blocks above fill, and
  // vitest runs a file's tests in declaration order.
  const lowest = (): Map<string, Measured> => {
    const best = new Map<string, Measured>()
    for (const entry of MEASURED) {
      const held = best.get(entry.palette)
      if (!held || entry.ratio < held.ratio) best.set(entry.palette, entry)
    }
    return best
  }

  it('measured something in all four palettes', () => {
    // An empty recording would make the table check below pass vacuously.
    expect([...lowest().keys()].sort()).toEqual([
      'Designer, dark',
      'Designer, light',
      'HTML kit, dark',
      'HTML kit, light',
    ])
    expect(MEASURED.length).toBeGreaterThan(50)
  })

  it('quotes the lowest pair this suite actually asserts, in docs/accessibility.md', () => {
    // Compared to two decimals, which is how the table is written.
    const table = read('../docs/accessibility.md')
    const rows = new Map<string, number>()
    for (const match of table.matchAll(/^\| (Designer|HTML kit), (light|dark) +\| +([\d.]+):1/gm)) {
      rows.set((match[1] ?? '') + ', ' + (match[2] ?? ''), Number(match[3]))
    }

    expect([...rows.keys()].sort(), 'the contrast table could not be read').toEqual([
      'Designer, dark',
      'Designer, light',
      'HTML kit, dark',
      'HTML kit, light',
    ])

    const wrong: string[] = []
    for (const [palette, measured] of lowest()) {
      const quoted = rows.get(palette)
      const actual = Math.round(measured.ratio * 100) / 100
      if (quoted !== actual) {
        wrong.push(
          palette +
            ': the document says ' +
            String(quoted) +
            ':1, the suite asserts ' +
            String(actual) +
            ':1 for ' +
            measured.fg +
            ' on ' +
            measured.bg,
        )
      }
    }

    expect(wrong).toEqual([])
  })

  it.each([
    ['designer.css', designerCss],
    ['kit-html.css', kitCss],
  ])('measures every border token in %s, or says why not', (_name, css) => {
    const declared = [
      ...new Set(
        [...css.matchAll(/(--fsh?-[a-z0-9-]*border[a-z0-9-]*)\s*:/g)].map(
          (match) => match[1] ?? '',
        ),
      ),
    ].sort()

    expect(declared.length, 'no border tokens found, so this checked nothing').toBeGreaterThan(0)

    const measured = new Set(MEASURED.map((entry) => entry.fg))
    const unaccounted = declared.filter(
      (token) => !measured.has(token) && !(token in UNMEASURED_BORDERS),
    )

    expect(
      unaccounted,
      'these border tokens are neither asserted for contrast nor listed in ' +
        'UNMEASURED_BORDERS with a reason',
    ).toEqual([])
  })
})

/**
 * `tokensFrom` reads custom properties, so a colour literal in a rule is invisible
 * to every assertion above, and neither the dark palette nor a host can change it.
 * `rgb(from ...)` builds on a token, and a `var()` fallback is only a default.
 */
describe('no colour is written outside the token blocks', () => {
  const LITERAL =
    /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\((?!\s*from\b)[^)]*\)/gi
  const WITH_FALLBACK = /var\(\s*--[a-z0-9-]+\s*,[^()]*(?:\([^()]*\))?[^()]*\)/gi

  const literals = (css: string): string[] => {
    const found: string[] = []

    for (const { selector, declarations } of styleRules(css)) {
      for (const [name, value] of declarations) {
        if (name.startsWith('--')) continue

        const written = value.replace(WITH_FALLBACK, '').match(LITERAL)
        if (written) found.push(selector + ' { ' + name + ': ' + written.join(' ') + ' }')
      }
    }

    return found
  }

  it('the designer stylesheet uses tokens for every colour', () => {
    expect(literals(designerCss)).toEqual([])
  })

  it('the HTML kit stylesheet uses tokens for every colour', () => {
    expect(literals(kitCss)).toEqual([])
  })

  it('finds a literal when there is one', () => {
    expect(literals('.fs-dialog__actions button { border-color: #e8eaed }')).toEqual([
      '.fs-dialog__actions button { border-color: #e8eaed }',
    ])
    expect(literals('.fs-drop--bar { box-shadow: 0 0 0 1px rgb(255 255 255 / 65%) }')).toEqual([
      '.fs-drop--bar { box-shadow: rgb(255 255 255 / 65%) }',
    ])
    expect(literals(':root { --fs-accent: #1a73e8 }')).toEqual([])
    expect(literals('.fs-a { color: rgb(from var(--fs-text) r g b / 50%) }')).toEqual([])
    expect(literals('.fs-a { color: var(--fs-text, rgb(0 0 0 / 50%)) }')).toEqual([])
    expect(literals('.fs-a { color: var(--fs-text) rgb(0 0 0 / 50%) }')).toEqual([
      '.fs-a { color: rgb(0 0 0 / 50%) }',
    ])
  })
})

/** A `var()` naming a token nobody declares silently paints nothing. */
describe('every token a stylesheet reads is declared in its light palette', () => {
  const undeclared = (css: string, base: string): string[] => {
    const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '')
    const declared = tokensFrom(css, base)
    const read = [...withoutComments.matchAll(/var\(\s*(--[a-z0-9-]+)/g)].map(
      (match) => match[1] ?? '',
    )
    if (read.length === 0) throw new Error('no var() found, so this checked nothing')
    return [...new Set(read)].filter((token) => !(token in declared)).sort()
  }

  it('the designer stylesheet', () => {
    expect(undeclared(designerCss, '.fs-shell')).toEqual([])
  })

  it('the HTML kit stylesheet', () => {
    expect(undeclared(kitCss, '.fsh-screen')).toEqual([])
  })
})
