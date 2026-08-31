/**
 * WCAG relative luminance and contrast, for the stylesheet audits.
 *
 * Small enough to write out rather than take a dependency for, and having it
 * here means the contrast rules are enforced by tests rather than by someone
 * remembering to check a palette in a browser tool.
 *
 * The formulas are from WCAG 2.2, sections "relative luminance" and "contrast
 * ratio". sRGB only, no alpha: every colour in these stylesheets is opaque.
 */

export interface Rgb {
  r: number
  g: number
  b: number
}

/** Parse `#rgb` or `#rrggbb`. Throws rather than guessing at anything else. */
export function parseHex(hex: string): Rgb {
  const value = hex.trim().replace(/^#/, '')
  const full =
    value.length === 3
      ? value
          .split('')
          .map((c) => c + c)
          .join('')
      : value

  if (!/^[0-9a-f]{6}$/i.test(full)) throw new Error('Not a hex colour: ' + hex)

  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  }
}

function channel(value: number): number {
  const c = value / 255
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
}

export function luminance({ r, g, b }: Rgb): number {
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

/** Contrast ratio between two opaque colours, from 1 to 21. */
export function contrast(a: string, b: string): number {
  const one = luminance(parseHex(a))
  const two = luminance(parseHex(b))
  const lighter = Math.max(one, two)
  const darker = Math.min(one, two)
  return (lighter + 0.05) / (darker + 0.05)
}

/** Rounded to two places, which is how WCAG results are usually quoted. */
export function ratio(a: string, b: string): number {
  return Math.round(contrast(a, b) * 100) / 100
}

/**
 * Custom properties declared in the rule whose selector is exactly `selector`.
 *
 * Exactly, not "contains". A substring match for `.fs-shell` also matches
 * `.fs-shell[data-fs-theme='dark']`, so the light palette silently came back
 * holding the dark values and every light-theme assertion checked dark twice.
 *
 * Deliberately crude otherwise: these are stylesheets this repo owns, so a real
 * parser would be more machinery than the job needs.
 */
export function tokensFrom(css: string, selector: string): Record<string, string> {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '')
  const tokens: Record<string, string> = {}
  let found = false

  for (const match of withoutComments.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if ((match[1]?.trim() ?? '') !== selector) continue
    found = true

    for (const declaration of (match[2] ?? '').split(';')) {
      const [name, value] = declaration.split(':')
      if (!name || !value) continue
      const trimmed = name.trim()
      if (trimmed.startsWith('--')) tokens[trimmed] = value.trim()
    }
  }

  /*
   * A selector nobody wrote is a mistake here, not an empty palette.
   *
   * This answered `{}` and left the loudness to one caller's own check, so any
   * other caller -- a new suite, a one-off script -- silently measured nothing
   * and reported that everything passed. A misspelled selector is the likeliest
   * way to reach this, and it is exactly the case a contrast suite must not
   * shrug at.
   */
  if (!found) throw new Error('No rule with the selector ' + selector)

  return tokens
}
