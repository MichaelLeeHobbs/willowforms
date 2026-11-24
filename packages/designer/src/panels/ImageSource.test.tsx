/**
 * @vitest-environment jsdom
 */

import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { ImageSource } from './ImageSource.js'

function setup(): { address: HTMLElement; onChange: ReturnType<typeof vi.fn> } {
  const onChange = vi.fn<(value: string) => void>()
  render(<ImageSource id="picture" value="" onChange={onChange} />)
  return { address: screen.getByRole('textbox'), onChange }
}

const error = (): string => screen.getByRole('alert').textContent ?? ''

const refuse = (address: HTMLElement): void => {
  fireEvent.change(address, { target: { value: 'javascript:alert(1)' } })
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

    fireEvent.change(address, { target: { value: '/logo.png' } })
    expect(screen.queryByRole('alert')).toBeNull()
    fireEvent.blur(address)

    expect(onChange).toHaveBeenCalledExactlyOnceWith('/logo.png')
  })
})
