import type { FormDocument, Language } from '@formsmith/core'

/**
 * Whether a stored entry is a language this designer can draw.
 *
 * `languageTag` reads `.code` and `.dialect` without guarding either, because
 * its callers in core have already been past `validateDocument`. The designer's
 * callers have not: a document arrives from a host, from `localStorage`, or
 * from somebody typing into the JSON dialog, and `store.ts` only *warns* about
 * a malformed `initialDocument`.
 *
 * So `{"languages":[{}]}` made `languageTag` answer `undefined` and the
 * settings panel call `.toLowerCase()` on it, and `{"languages":[null]}` made
 * it throw on `.dialect` in the toolbar's language select. Both take the
 * designer down, including the JSON dialog that would repair the document.
 *
 * An array is refused explicitly. `typeof [] === 'object'` is exactly why a
 * "non-null object" check -- which is what the settings panel had -- is never
 * enough on its own.
 *
 * One predicate rather than one per caller: the panel and the toolbar had
 * different guards for the same question, which is how one of them came to have
 * none.
 */
export function isLanguage(language: unknown): language is Language {
  if (!language || typeof language !== 'object' || Array.isArray(language)) return false
  return typeof (language as { code?: unknown }).code === 'string'
}

/**
 * The languages of a document, as the designer may draw them.
 *
 * Filtered, never rewritten: what this drops stays in the document, so a host
 * that repairs its JSON gets it back and opening a tab never deletes data.
 */
export function languagesOf(document: FormDocument): Language[] {
  return Array.isArray(document.languages) ? document.languages.filter(isLanguage) : []
}
