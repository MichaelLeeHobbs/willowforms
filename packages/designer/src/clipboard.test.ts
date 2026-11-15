/**
 * @vitest-environment jsdom
 */

import { afterEach, describe, expect, it } from 'vitest'

import { copyText } from './clipboard.js'

const original = Object.getOwnPropertyDescriptor(navigator, 'clipboard')

function setClipboard(value: unknown): void {
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value })
}

afterEach(() => {
  if (original) Object.defineProperty(navigator, 'clipboard', original)
  else delete (navigator as { clipboard?: unknown }).clipboard
})

describe('copyText', () => {
  it('reports copied and writes exactly the text it was given', async () => {
    const written: string[] = []
    setClipboard({
      writeText: (text: string) => {
        written.push(text)
        return Promise.resolve()
      },
    })

    await expect(copyText('{"a":1}')).resolves.toBe('copied')
    expect(written).toEqual(['{"a":1}'])
  })

  it('reports unavailable when the browser has no clipboard API', async () => {
    setClipboard(undefined)

    await expect(copyText('x')).resolves.toBe('unavailable')
  })

  it('reports refused when the write rejects', async () => {
    setClipboard({ writeText: () => Promise.reject(new Error('denied')) })

    await expect(copyText('x')).resolves.toBe('refused')
  })

  it('reports refused when the write throws synchronously', async () => {
    setClipboard({
      writeText: () => {
        throw new Error('denied')
      },
    })

    await expect(copyText('x')).resolves.toBe('refused')
  })
})
