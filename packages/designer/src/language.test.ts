import { describe, expect, it } from 'vitest'
import type { Language } from '@willowforms/core'

import { isLanguage, nameOf } from './language.js'

const english: Language = { code: 'en', dialect: 'US', name: 'English', bidi: 'ltr' }

describe('nameOf', () => {
  it("answers a language's name", () => {
    expect(nameOf(english)).toBe('English')
  })

  it('trims surrounding whitespace from the name', () => {
    expect(nameOf({ ...english, name: '  English (US)\t' })).toBe('English (US)')
  })

  it('answers the empty string for a whitespace-only name, which is still a valid language', () => {
    const blank = { ...english, name: '   ' }

    expect(isLanguage(blank)).toBe(true)
    expect(nameOf(blank)).toBe('')
  })

  it.each([
    ['absent', {}],
    ['undefined', { name: undefined }],
    ['null', { name: null }],
    ['a number', { name: 42 }],
    ['an object', { name: { en: 'English' } }],
  ])('answers the empty string when the name is %s', (_name, language) => {
    expect(nameOf(language)).toBe('')
  })
})
