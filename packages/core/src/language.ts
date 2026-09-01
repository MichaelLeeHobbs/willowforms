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
  /*
   * A string, not truthiness, which is what the gate's deliberate copy asks.
   *
   * `tree.ts`'s language check requires `dialect` to be a string; this asked
   * whether it was truthy. So `{"code":"en","dialect":5}` validated clean --
   * `validateDocument` never reports a non-string dialect -- while this built
   * the tag `en-5`, which `findLanguage` then matched against nothing. The
   * document named a language it did not have and every translation rendered
   * as its raw key.
   *
   * The docblock above records that this copy has already drifted from the gate
   * once. This is the second time, and the two now ask the same question.
   */
  return typeof language.dialect === 'string' && language.dialect
    ? language.code + '-' + language.dialect
    : language.code
}

/** The language a tag refers to, if the document has it. */
export function findLanguage(languages: Language[], tag: string): Language | undefined {
  return languages.find((language) => languageTag(language) === tag)
}
