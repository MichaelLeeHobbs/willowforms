/**
 * @vitest-environment jsdom
 */

import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { useAnnouncement } from './announce.js'

/** `say` sends every message in one event and answers with the text left on screen. */
function setup(): { say: (...messages: string[]) => string } {
  const { result } = renderHook(() => useAnnouncement())
  return {
    say: (...messages) => {
      act(() => {
        for (const message of messages) result.current[1](message)
      })
      return result.current[0]
    },
  }
}

const visible = (text: string): string =>
  text.replace(new RegExp(String.fromCharCode(0x200b), 'g'), '')

describe('useAnnouncement', () => {
  it('changes the text every time the same message is sent', () => {
    const { say } = setup()

    const texts = [say('Copied.'), say('Copied.'), say('Copied.')]

    expect(texts.map(visible)).toEqual(['Copied.', 'Copied.', 'Copied.'])
    expect(texts[1]).not.toBe(texts[0])
    expect(texts[2]).not.toBe(texts[1])
  })

  it('changes the text when one event clears it and sends the same message', () => {
    const { say } = setup()

    const first = say('Saved.')
    const second = say('', 'Saved.')

    expect(visible(second)).toBe('Saved.')
    expect(second).not.toBe(first)
  })

  it('changes the text when one event sends the same message twice', () => {
    const { say } = setup()

    const first = say('Saved.')
    const second = say('Saved.', 'Saved.')

    expect(visible(second)).toBe('Saved.')
    expect(second).not.toBe(first)
  })

  it('leaves a message that differs from the last one as it is', () => {
    const { say } = setup()

    expect([say('Copied.'), say('Refused.')]).toEqual(['Copied.', 'Refused.'])
  })

  it('stays empty when cleared twice, so a style for an empty region still applies', () => {
    const { say } = setup()

    expect([say(''), say('Copied.'), say(''), say('')]).toEqual(['', 'Copied.', '', ''])
  })
})
