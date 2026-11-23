import { describe, expect, it } from 'vitest'

import { findLanguage, languageTag } from './language.js'

describe('languageTag and an empty dialect', () => {
  it('reads an empty dialect as no dialect', () => {
    expect(languageTag({ code: 'en', dialect: '', name: 'English', bidi: 'ltr' })).toBe('en')
  })

  it('still uses a dialect that is one', () => {
    expect(languageTag({ code: 'en', dialect: 'US', name: 'English', bidi: 'ltr' })).toBe('en-US')
  })

  it('finds the language a document names', () => {
    const languages = [{ code: 'en', dialect: '', name: 'English', bidi: 'ltr' as const }]
    expect(findLanguage(languages, 'en')?.code).toBe('en')
    expect(findLanguage(languages, 'en-')).toBeUndefined()
  })
})

/*
 * Two dialects of one code, as `createDocument` produces (`en-US`): only then do
 * the tag and the code differ.
 */
describe('findLanguage across dialects of one code', () => {
  const languages = [
    { code: 'en', dialect: 'US', name: 'English (US)', bidi: 'ltr' as const },
    { code: 'en', dialect: 'GB', name: 'English (UK)', bidi: 'ltr' as const },
    { code: 'ar', dialect: '', name: 'Arabic', bidi: 'rtl' as const },
  ]

  it('matches on the tag, not on the code', () => {
    expect(findLanguage(languages, 'en-US')?.name).toBe('English (US)')
    expect(findLanguage(languages, 'en-GB')?.name).toBe('English (UK)')
  })

  it('does not answer a bare code that no entry carries', () => {
    expect(findLanguage(languages, 'en')).toBeUndefined()
  })

  it('still matches an entry that genuinely has no dialect', () => {
    expect(findLanguage(languages, 'ar')?.name).toBe('Arabic')
    expect(findLanguage(languages, 'ar-EG')).toBeUndefined()
  })
})
