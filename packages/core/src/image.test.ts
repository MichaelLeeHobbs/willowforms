import { describe, expect, it } from 'vitest'
import { MAX_EMBEDDED_IMAGE_BYTES, safeImageSource } from './image.js'

describe('image sources', () => {
  it.each([
    'https://example.com/logo.svg',
    'http://example.com/photo.jpg',
    '/images/logo.svg',
    'image.png',
  ])('accepts %s', (source) => {
    expect(safeImageSource(source)).toBe(source)
  })
  it.each([
    'mailto:a@example.com',
    'tel:123',
    'javascript:alert(1)',
    'java\nscript:alert(1)',
    '//example.com/a.png',
    '\\example.com/a.png',
    'data:image/svg+xml;base64,PHN2Zy8+',
    'data:text/html;base64,PHN2Zy8+',
    'data:image/png;base64,abc',
    'data:image/png;base64,',
    'data:image/png;base64,a===',
  ])('refuses %s', (source) => {
    expect(safeImageSource(source)).toBeUndefined()
  })
  it('allows exactly the embedded byte budget and refuses one byte more', () => {
    const source =
      'data:image/png;base64,' + Buffer.alloc(MAX_EMBEDDED_IMAGE_BYTES).toString('base64')
    expect(safeImageSource(source)).toBe(source)
    expect(
      safeImageSource(
        'data:image/png;base64,' + Buffer.alloc(MAX_EMBEDDED_IMAGE_BYTES + 1).toString('base64'),
      ),
    ).toBeUndefined()
  })
})
