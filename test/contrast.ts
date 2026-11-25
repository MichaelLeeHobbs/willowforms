/**
 * The formulas are from WCAG 2.2, sections "relative luminance" and "contrast
 * ratio". sRGB only, no alpha: every colour in these stylesheets is opaque.
 */

export interface Rgb {
  r: number
  g: number
  b: number
}

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

/** A browser reports a computed colour as `rgb()`. One with an alpha is refused. */
export function rgbToHex(rgb: string): string {
  const channels = /^rgb\((\d+), (\d+), (\d+)\)$/.exec(rgb)
  if (!channels) throw new Error('Not an opaque rgb colour: ' + rgb)
  return (
    '#' +
    channels
      .slice(1)
      .map((value) => Number(value).toString(16).padStart(2, '0'))
      .join('')
  )
}

function channel(value: number): number {
  const c = value / 255
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
}

export function luminance({ r, g, b }: Rgb): number {
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

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
 * The selector is matched exactly, not by "contains": `.fs-shell` must not match
 * `.fs-shell:where([data-fs-theme='dark'])`. Deliberately crude otherwise: these are
 * stylesheets this repo owns.
 */
export function tokensFrom(
  css: string,
  selector: string,
  // Contrast callers want the palette; the dark-block drift check passes false
  // to compare every declaration, such as `color-scheme`.
  customOnly = true,
): Record<string, string> {
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
      if (trimmed.startsWith('--') || !customOnly) tokens[trimmed] = value.trim()
    }
  }

  // A selector nobody wrote is a mistake here, not an empty palette.
  if (!found) throw new Error('No rule with the selector ' + selector)

  return tokens
}
