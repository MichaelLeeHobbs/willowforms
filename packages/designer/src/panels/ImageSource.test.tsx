/**
 * @vitest-environment jsdom
 */

import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { ImageSource } from './ImageSource.js'

describe('a file the image field cannot embed', () => {
  it('is refused again in words that changed, so the refusal is read out again', () => {
    render(<ImageSource id="picture" value="" onChange={() => undefined} />)
    const choose = screen.getByLabelText('Embed an image')
    const refused = new File(['x'], 'notes.txt', { type: 'text/plain' })

    fireEvent.change(choose, { target: { files: [refused] } })
    const first = screen.getByRole('alert').textContent
    expect(first).toContain('Choose a PNG')

    fireEvent.change(choose, { target: { files: [refused] } })
    expect(screen.getByRole('alert').textContent).toContain('Choose a PNG')
    expect(screen.getByRole('alert').textContent).not.toBe(first)
  })
})
