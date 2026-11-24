/**
 * @vitest-environment jsdom
 */

import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { ImageSource } from './ImageSource.js'

function setup(value = ''): { address: HTMLElement; onChange: ReturnType<typeof vi.fn> } {
  const onChange = vi.fn<(value: string) => void>()
  render(<ImageSource id="picture" value={value} onChange={onChange} />)
  return { address: screen.getByRole('textbox'), onChange }
}

const error = (): string => screen.getByRole('alert').textContent ?? ''

const type = (address: HTMLElement, value: string): void => {
  fireEvent.change(address, { target: { value } })
}

const refuse = (address: HTMLElement): void => {
  type(address, 'javascript:alert(1)')
  fireEvent.keyDown(address, { key: 'Enter' })
}

describe('an image the field refuses', () => {
  it('says so in words that changed when a second file is refused, so it is read out again', () => {
    setup()
    const choose = screen.getByLabelText('Embed an image')
    const refused = new File(['x'], 'notes.txt', { type: 'text/plain' })

    fireEvent.change(choose, { target: { files: [refused] } })
    const first = error()
    expect(first).toContain('Choose a PNG')

    fireEvent.change(choose, { target: { files: [refused] } })
    expect(error()).toContain('Choose a PNG')
    expect(error()).not.toBe(first)
  })

  it('says so in words that changed when Enter is pressed again', () => {
    const { address } = setup()

    refuse(address)
    const first = error()
    expect(first).toContain('Use an image URL')

    fireEvent.keyDown(address, { key: 'Enter' })
    expect(error()).toContain('Use an image URL')
    expect(error()).not.toBe(first)
  })

  it('says so on leaving the field', () => {
    const { address, onChange } = setup()

    type(address, 'javascript:alert(1)')
    fireEvent.blur(address)

    expect(error()).toContain('Use an image URL')
    expect(onChange).not.toHaveBeenCalled()
  })

  it('does not say it again when the field is left without an edit', () => {
    const { address } = setup()
    refuse(address)
    const first = error()

    fireEvent.blur(address)

    expect(error()).toBe(first)
  })

  it('takes an edit made after it, on leaving the field', () => {
    const { address, onChange } = setup()
    refuse(address)

    type(address, '/logo.png')
    expect(screen.queryByRole('alert')).toBeNull()
    fireEvent.blur(address)

    expect(onChange).toHaveBeenCalledExactlyOnceWith('/logo.png')
  })
})

describe('a field with nothing new in it', () => {
  it.each([
    ['no image', ''],
    ['an address', '/logo.png'],
    ['an address that is refused', 'ftp://example.com/logo.png'],
    ['an embedded image that is refused', 'data:image/svg+xml,<svg/>'],
  ])('stores nothing and says nothing new when it is left holding %s', (_what, value) => {
    const { address, onChange } = setup(value)
    const before = screen.queryByRole('alert')?.textContent

    fireEvent.blur(address)

    expect(onChange).not.toHaveBeenCalled()
    expect(screen.queryByRole('alert')?.textContent).toBe(before)
  })

  it.each(['', '/logo.png'])('stores nothing on Enter, holding "%s"', (value) => {
    const { address, onChange } = setup(value)

    fireEvent.keyDown(address, { key: 'Enter' })

    expect(onChange).not.toHaveBeenCalled()
  })

  it('takes spaces around the stored address for nothing new', () => {
    const { address, onChange } = setup('/missing.png')
    fireEvent.error(screen.getByAltText('Preview'))
    const before = error()

    type(address, ' /missing.png ')
    fireEvent.blur(address)

    expect(onChange).not.toHaveBeenCalled()
    expect(error()).toBe(before)
  })
})

describe('what is wrong with the stored address', () => {
  it.each([
    ['refused', 'ftp://example.com/logo.png', false],
    ['not found', '/missing.png', true],
  ])('is not said about the address being typed over it: %s', (_what, value, fails) => {
    const { address } = setup(value)
    if (fails) fireEvent.error(screen.getByAltText('Preview'))
    expect(error()).not.toBe('')

    type(address, value + 'x')
    expect(screen.queryByRole('alert')).toBeNull()

    fireEvent.keyDown(address, { key: 'Escape' })
    expect(error()).not.toBe('')
  })
})
