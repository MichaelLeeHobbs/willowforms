/**
 * Colour contrast, enforced.
 *
 * The study in docs/prior-art records the product this project studied
 * shipping a primary button whose label sat at 3.03:1, failing WCAG AA. Beating
 * that is a stated goal, and a goal nobody measures is a wish, so both
 * stylesheets in this repo are measured here in both themes.
 *
 * Thresholds are WCAG 2.2 AA: 4.5:1 for body text, 3:1 for large text and for
 * the boundaries of user interface components. Where a pair only needs 3:1 the
 * test says which rule applies and why.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { contrast, luminance, parseHex, ratio, tokensFrom } from './contrast.js'

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
 * A theme's tokens, with the dark overrides folded onto the light base.
 *
 * The dark blocks only restate what changes, so reading them alone would miss
 * every token they inherit.
 */
/**
 * Every palette a viewer can actually get.
 *
 * There are three, and only two were measured. A stylesheet here declares the
 * light tokens on the bare scope, overrides them for an explicit dark choice,
 * and overrides them *again* inside `@media (prefers-color-scheme: dark)` for a
 * viewer who has chosen nothing — under a different selector, so the exact-match
 * reader never found it.
 *
 * That third one is the palette most people see. The theme control defaults to
 * `system`, which sets no attribute at all, so a viewer whose OS is dark gets
 * the block nothing was checking. Editing one dark block and not the other left
 * the suite green while the two drifted apart.
 */
function palettes(css: string, base: string, chosenDark: string, systemDark: string): Palette[] {
  const light = tokensFrom(css, base)
  const chosen = tokensFrom(css, chosenDark)
  const system = tokensFrom(css, systemDark)

  // Selectors are matched exactly, so a typo in one would silently produce an
  // empty override set and check the light palette again under another name.
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
 * The two dark palettes have to be the same palette.
 *
 * They are two spellings of one decision — "this viewer wants dark" — and
 * nothing but discipline keeps them in step. Measuring both for contrast is not
 * enough: two different dark themes can each clear AA and still be two different
 * dark themes, and only one of them was ever looked at.
 */
function darkBlocks(
  css: string,
  chosenDark: string,
  systemDark: string,
): { chosen: Record<string, string>; system: Record<string, string> } {
  return { chosen: tokensFrom(css, chosenDark), system: tokensFrom(css, systemDark) }
}

describe("the designer's two dark blocks", () => {
  it('declare the same tokens', () => {
    const { chosen, system } = darkBlocks(
      designerCss,
      ".fs-shell[data-fs-theme='dark']",
      ".fs-shell:where(:not([data-fs-theme='light']))",
    )
    expect(system, 'the two dark blocks have drifted apart').toEqual(chosen)
  })
})

describe.each(
  palettes(
    designerCss,
    '.fs-shell',
    ".fs-shell[data-fs-theme='dark']",
    ".fs-shell:where(:not([data-fs-theme='light']))",
  ),
)('designer chrome, $name theme', ({ tokens }) => {
  const on = (fg: string, bg: string): number => {
    const foreground = tokens[fg]
    const background = tokens[bg]
    if (!foreground || !background) throw new Error('Missing token: ' + fg + ' or ' + bg)
    return ratio(foreground, background)
  }

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
    // The exact failure the prior-art study recorded, at 3.03:1.
    expect(on('--fs-primary-text', '--fs-primary')).toBeGreaterThanOrEqual(AA_TEXT)
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
     * The kit's field borders were measured and the designer's were not, which
     * is the wrong way round for a builder somebody uses all day. A text field
     * in a panel is a shade off the panel's own background -- 1.08:1 in light --
     * so the border is the only thing saying a control is there, and at 1.39:1
     * it was not saying it. WCAG 1.4.11: a control boundary needs 3:1.
     *
     * All three surfaces, because panels, the canvas bar and the preview data
     * pane each host controls.
     */
    expect(on('--fs-control-border', '--fs-bg-panel')).toBeGreaterThanOrEqual(AA_LARGE)
    expect(on('--fs-control-border', '--fs-bg-app')).toBeGreaterThanOrEqual(AA_LARGE)
    expect(on('--fs-control-border', '--fs-bg-well')).toBeGreaterThanOrEqual(AA_LARGE)
  })

  it('the drop indicator is distinguishable from the panel it is drawn over', () => {
    expect(on('--fs-accent', '--fs-bg-panel')).toBeGreaterThanOrEqual(AA_LARGE)
  })

  it('the scrollbar thumb is visible on every surface that scrolls', () => {
    /*
     * The track is transparent, so the thumb is drawn straight onto the
     * surface underneath and has to hold up against all three: panes are
     * bg-panel, the canvas is bg-app, the preview data block is bg-well. A
     * scrollbar is a user interface component, so 3:1.
     */
    expect(on('--fs-scrollbar-thumb', '--fs-bg-panel')).toBeGreaterThanOrEqual(AA_LARGE)
    expect(on('--fs-scrollbar-thumb', '--fs-bg-app')).toBeGreaterThanOrEqual(AA_LARGE)
    expect(on('--fs-scrollbar-thumb', '--fs-bg-well')).toBeGreaterThanOrEqual(AA_LARGE)
  })
})

describe("the HTML kit's two dark blocks", () => {
  it('declare the same tokens', () => {
    const { chosen, system } = darkBlocks(
      kitCss,
      ".fsh-screen[data-fsh-theme='dark']",
      ".fsh-screen:where(:not([data-fsh-theme='light']))",
    )
    expect(system, 'the two dark blocks have drifted apart').toEqual(chosen)
  })
})

describe.each(
  palettes(
    kitCss,
    '.fsh-screen',
    ".fsh-screen[data-fsh-theme='dark']",
    ".fsh-screen:where(:not([data-fsh-theme='light']))",
  ),
)('html kit, $name theme', ({ tokens }) => {
  const on = (fg: string, bg: string): number => {
    const foreground = tokens[fg]
    const background = tokens[bg]
    if (!foreground || !background) throw new Error('Missing token: ' + fg + ' or ' + bg)
    return ratio(foreground, background)
  }

  it('field text clears AA on the field background', () => {
    expect(on('--fsh-text', '--fsh-field')).toBeGreaterThanOrEqual(AA_TEXT)
    expect(on('--fsh-text', '--fsh-surface')).toBeGreaterThanOrEqual(AA_TEXT)
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
})

/**
 * The instrument, against values that are not ours to choose.
 *
 * Every ratio in this file comes out of twenty lines of arithmetic in
 * `contrast.ts`, and nothing checked the arithmetic. Change a luminance
 * coefficient or the `0.03928` branch and every number here moves together,
 * every threshold is still cleared, and the suite stays green while reporting
 * fiction.
 *
 * So these are fixed points from WCAG 2.2 itself and from the reference values
 * every contrast tool agrees on. They cannot be satisfied by a formula that has
 * drifted.
 */
describe('the contrast instrument', () => {
  it('puts black on white at 21:1 and a colour on itself at 1:1', () => {
    // The two ends of the scale, which the ratio is defined to produce.
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
    /*
     * The published reference values. `#767676` on white is the canonical
     * "smallest grey that passes AA for body text" and every checker in the
     * world puts it at 4.54; `#949494` on black is its counterpart.
     */
    expect(ratio(fg, bg)).toBe(expected)
  })

  it('applies the linear branch below the threshold and the curve above it', () => {
    /*
     * The `0.03928` branch, pinned directly. Channel 10 is 10/255 = 0.0392,
     * just under it, so it stays linear: 0.0392/12.92. Channel 11 is just over
     * and takes the power curve. A build that dropped the branch would be
     * wrong here by a hair and nowhere else visibly.
     */
    expect(luminance(parseHex('#0a0a0a'))).toBeCloseTo(10 / 255 / 12.92, 12)
    expect(luminance(parseHex('#0b0b0b'))).toBeCloseTo(
      Math.pow((11 / 255 + 0.055) / 1.055, 2.4),
      12,
    )
  })

  it('weights green most and blue least, as the coefficients say', () => {
    // Pure green is the brightest primary and pure blue the darkest. A
    // transposed coefficient would swap these and nothing else would notice.
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
