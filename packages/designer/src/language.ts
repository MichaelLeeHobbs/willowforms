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

  /*
   * Every field the type declares, not just the one that made it stop throwing.
   *
   * A predicate written `language is Language` is a promise to the compiler, and
   * checking `code` alone made it a false one: `{ code: 'en' }` was handed on as
   * a `Language`, the toolbar rendered `entry.name` as nothing, and
   * `api.setLanguages` -- typed `Language[]` -- accepted it back. The compiler
   * then has no reason to question `.name` or `.bidi` anywhere downstream,
   * which is worse than no predicate at all.
   *
   * `bidi` is a two-value union in the type, so a third string is not one.
   * `dialect` is optional, so absent is fine and a non-string is not: a
   * `{"code":"en","dialect":5}` builds the tag `en-5`, which `findLanguage`
   * matches against nothing -- the exact defect `languageTag`'s own docblock
   * records having fixed once in core.
   */
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
