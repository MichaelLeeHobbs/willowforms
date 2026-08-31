/**
 * How a language is identified.
 *
 * A `Language` carries a `code` and an optional `dialect`, and the document
 * keys its translation bundles by the combined BCP 47 tag. Those are two
 * different strings, and the code was using them interchangeably: the renderer
 * looked up `translations['en-US']` while the designer wrote `translations['en']`,
 * so every translation authored in the panel went into a bundle nothing read.
 * The same confusion made `setLanguages` decide `'en-US'` was not in `['en']`
 * and quietly rewrite the document's default language.
 *
 * One function, used everywhere a language is named, so the two spellings cannot
 * drift apart again.
 *
 * With one deliberate exception, named here because a claim of "one place" that
 * has two is worse than a claim of two: `validateDocument` spells the rule out
 * inline, because its input is untrusted and `languageTag` takes a `Language`.
 * That copy has already drifted once -- it read `typeof dialect === 'string'`,
 * which is true of `''`, and computed `en-` for a document this function reads
 * as `en`. If the rule here changes, that is the other place to change.
 */

import type { Language } from './types.js'

export function languageTag(language: Language): string {
  return language.dialect ? language.code + '-' + language.dialect : language.code
}

/** The language a tag refers to, if the document has it. */
export function findLanguage(languages: Language[], tag: string): Language | undefined {
  return languages.find((language) => languageTag(language) === tag)
}
