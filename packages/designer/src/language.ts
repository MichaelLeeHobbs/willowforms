import type { FormDocument, Language } from '@willowforms/core'

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

  const shape = language as { code?: unknown; dialect?: unknown; name?: unknown; bidi?: unknown }

  if (typeof shape.code !== 'string' || shape.code === '') return false
  if (typeof shape.name !== 'string') return false
  if (shape.bidi !== 'ltr' && shape.bidi !== 'rtl') return false
  if (shape.dialect !== undefined && typeof shape.dialect !== 'string') return false

  return true
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

/**
 * A language's name, trimmed, or the empty string.
 *
 * A `Language` can arrive from a pasted document, so `name` can be absent or
 * not a string, and a nameless language is a state this product supports
 * rather than a broken one. Callers fall back to the language's tag.
 */
// eslint-disable-next-line no-restricted-syntax -- the one definition; the rule refuses copies.
export function nameOf(language: { name?: unknown }): string {
  return typeof language.name === 'string' ? language.name.trim() : ''
}
