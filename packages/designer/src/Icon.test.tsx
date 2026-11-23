/**
 * @vitest-environment jsdom
 */

/**
 * The type already makes a missing glyph a compile error. These catch a glyph
 * that exists and draws nothing.
 */

import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Icon, ICON_NAMES } from './Icon.js'

describe('Icon', () => {
  it('declares a vocabulary worth having', () => {
    /*
     * A floor only: names are object keys, so unique, and the type checks
     * coverage. `test/kit-contract.test.tsx` checks that kit icon names resolve.
     */
    expect(ICON_NAMES.length).toBeGreaterThan(15)
  })

  it.each(ICON_NAMES)('%s draws something', (name) => {
    const { container } = render(<Icon name={name} />)
    const svg = container.querySelector('svg')

    expect(svg, name + ' rendered no svg').not.toBeNull()
    expect(svg?.children.length, name + ' is an empty square').toBeGreaterThan(0)
  })

  it.each(ICON_NAMES)('%s is hidden from assistive technology', (name) => {
    const { container } = render(<Icon name={name} />)
    expect(container.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true')
  })

  it('takes its colour from the text around it', () => {
    const { container } = render(<Icon name="text" />)
    expect(container.querySelector('svg')?.getAttribute('stroke')).toBe('currentColor')
  })

  it('defaults to the palette size', () => {
    const { container } = render(<Icon name="text" />)
    const svg = container.querySelector('svg')

    expect(svg?.getAttribute('width')).toBe('16')
    expect(svg?.getAttribute('height')).toBe('16')
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
     * The type rules this out, but kits are third-party code. An empty `<svg>`
     * would read as a glyph that failed to load.
     */
    const { container } = render(<Icon name={'nonsense' as never} />)
    expect(container.querySelector('svg')).toBeNull()
  })

  it('is square, and both sides follow the size', () => {
    const { container } = render(<Icon name="text" size={24} />)
    const svg = container.querySelector('svg')

    expect(svg?.getAttribute('width')).toBe('24')
    expect(svg?.getAttribute('height')).toBe('24')
  })
})
