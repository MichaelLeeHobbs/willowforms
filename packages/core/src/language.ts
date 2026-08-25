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
 */

import type { Language } from './types.js'

export function languageTag(language: Language): string {
  return language.dialect ? language.code + '-' + language.dialect : language.code
}

/** The language a tag refers to, if the document has it. */
export function findLanguage(languages: Language[], tag: string): Language | undefined {
  return languages.find((language) => languageTag(language) === tag)
}
