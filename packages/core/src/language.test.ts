import { describe, expect, it } from 'vitest'

import { findLanguage, languageTag } from './language.js'

/**
 * An empty dialect is not a dialect.
 *
 * `language.dialect ? …` is truthiness, and `''` is falsy, so `languageTag`
 * already answered `en` for `{ code: 'en', dialect: '' }`. `validateDocument`
 * spelled the same rule out as `typeof dialect === 'string'`, which is true for
 * `''` — so the gate computed `en-` and compared *that* against
 * `defaultLanguage`. A document with an empty dialect validated clean and then
 * had no resolvable default language at runtime.
 *
 * One spelling, in one function, which is what the file's own header promises.
 */
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

/**
 * A lookup where the tag and the code are different strings.
 *
 * Trap 11. The only fixture was one entry with `dialect: ''`, so `languageTag(l)`
 * and `l.code` were both `'en'` and the whole distinction this module exists for
 * was invisible: replace the filter with `languages.find((l) => l.code === tag)`
 * and both assertions above still pass. That confusion -- the renderer reading
 * `translations['en-US']` while the designer wrote `translations['en']` -- is
 * what `language.ts` was written to end.
 *
 * `createDocument` produces `{ code: 'en', dialect: 'US' }`, so this is what a
 * real document holds, and two dialects of one code is what makes the tag the
 * only usable key.
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
    // `en` is the code of two entries here and the tag of neither. Matching on
    // the code would hand back the first, which is how a bundle keyed `en-US`
    // came to be read under `en`.
    expect(findLanguage(languages, 'en')).toBeUndefined()
  })

  it('still matches an entry that genuinely has no dialect', () => {
    expect(findLanguage(languages, 'ar')?.name).toBe('Arabic')
    expect(findLanguage(languages, 'ar-EG')).toBeUndefined()
  })
})
