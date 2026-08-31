/**
 * @vitest-environment jsdom
 */

/**
 * The icon vocabulary, checked end to end.
 *
 * `Record<IconName, ReactNode>` already makes a missing glyph a compile error.
 * What the type cannot catch is a glyph that exists and draws nothing, which is
 * the same failure from the user's side: a palette entry with a blank square.
 */

import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Icon, ICON_NAMES } from './Icon.js'

describe('Icon', () => {
  it('declares a vocabulary worth having', () => {
    expect(ICON_NAMES.length).toBeGreaterThan(15)
    expect(new Set(ICON_NAMES).size).toBe(ICON_NAMES.length)
  })

  it.each(ICON_NAMES)('%s draws something', (name) => {
    const { container } = render(<Icon name={name} />)
    const svg = container.querySelector('svg')

    expect(svg, name + ' rendered no svg').not.toBeNull()
    expect(svg?.children.length, name + ' is an empty square').toBeGreaterThan(0)
  })

  it.each(ICON_NAMES)('%s is hidden from assistive technology', (name) => {
    // Every icon sits beside the word it stands for, so naming it would have a
    // screen reader read the palette entry twice.
    const { container } = render(<Icon name={name} />)
    expect(container.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true')
  })

  it('takes its colour from the text around it', () => {
    const { container } = render(<Icon name="text" />)
    expect(container.querySelector('svg')?.getAttribute('stroke')).toBe('currentColor')
  })

  it('honours a requested size', () => {
    const { container } = render(<Icon name="text" size={24} />)
    const svg = container.querySelector('svg')
    expect(svg?.getAttribute('width')).toBe('24')
    // The viewBox never changes, so a glyph scales rather than crops.
    expect(svg?.getAttribute('viewBox')).toBe('0 0 24 24')
  })
})

describe('an icon the vocabulary does not have', () => {
  it('draws nothing rather than an empty square', () => {
    /*
     * The type says this cannot happen and a kit is third-party code, so it
     * can. An unknown name used to render an empty `<svg>`: the space an icon
     * would take, reserved beside the label, which reads as a glyph that failed
     * to load rather than as a kit that ships without one.
     */
    const { container } = render(<Icon name={'nonsense' as never} />)
    expect(container.querySelector('svg')).toBeNull()
  })

  it('is square, and both sides follow the size', () => {
    // `height` was never asserted, so an icon that took its width from the prop
    // and its height from a default would have drawn a rectangle.
    const { container } = render(<Icon name="text" size={24} />)
    const svg = container.querySelector('svg')

    expect(svg?.getAttribute('width')).toBe('24')
    expect(svg?.getAttribute('height')).toBe('24')
  })
})
