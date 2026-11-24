/**
 * @vitest-environment jsdom
 */

import { describe, expect, it } from 'vitest'

import { stubClipboard, stubClipboardWrites } from '../../../test/clipboard.js'
import { copyText } from './clipboard.js'

describe('copyText', () => {
  it('reports copied and writes exactly the text it was given', async () => {
    const written = stubClipboardWrites()

    await expect(copyText('{"a":1}')).resolves.toBe('copied')
    expect(written).toEqual(['{"a":1}'])
  })

  it('reports unavailable when the browser has no clipboard API', async () => {
    stubClipboard(undefined)

    await expect(copyText('x')).resolves.toBe('unavailable')
  })

  it('reports refused when the write rejects', async () => {
    stubClipboardWrites(() => Promise.reject(new Error('denied')))

    await expect(copyText('x')).resolves.toBe('refused')
  })

  it('reports refused when the write throws synchronously', async () => {
    stubClipboardWrites(() => {
      throw new Error('denied')
    })

    await expect(copyText('x')).resolves.toBe('refused')
  })
})
