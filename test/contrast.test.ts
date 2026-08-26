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

import { ratio, tokensFrom } from './contrast.js'

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
function palettes(css: string, base: string, dark: string): Palette[] {
  const light = tokensFrom(css, base)
  const overrides = tokensFrom(css, dark)

  // Selectors are matched exactly, so a typo in one would silently produce an
  // empty override set and check the light palette twice under both names.
  if (Object.keys(light).length === 0) throw new Error('No tokens found for ' + base)
  if (Object.keys(overrides).length === 0) throw new Error('No tokens found for ' + dark)

  return [
    { name: 'light', tokens: light },
    { name: 'dark', tokens: { ...light, ...overrides } },
  ]
}

describe.each(palettes(designerCss, '.fs-shell', ".fs-shell[data-fs-theme='dark']"))(
  'designer chrome, $name theme',
  ({ tokens }) => {
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
  },
)

describe.each(palettes(kitCss, '.fsh-screen', ".fsh-screen[data-fsh-theme='dark']"))(
  'html kit, $name theme',
  ({ tokens }) => {
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
  },
)
