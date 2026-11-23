import type { FormDocument, Language } from '@willowforms/core'

/**
 * A designer document may not have passed `validateDocument` (`store.ts` only
 * warns about a malformed one), and `languageTag` reads `.code` and `.dialect`
 * unguarded, so designer code reads languages through this or `languagesOf`.
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

/** Filtered, not rewritten: reading drops nothing from the document; only an edit writes this list back. */
export function languagesOf(document: FormDocument): Language[] {
  return Array.isArray(document.languages) ? document.languages.filter(isLanguage) : []
}

/** A nameless language is supported, not broken; callers fall back to its tag. */
// eslint-disable-next-line no-restricted-syntax -- the one definition; the rule refuses copies.
export function nameOf(language: { name?: unknown }): string {
  return typeof language.name === 'string' ? language.name.trim() : ''
}
