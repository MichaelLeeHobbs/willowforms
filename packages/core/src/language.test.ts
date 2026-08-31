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
