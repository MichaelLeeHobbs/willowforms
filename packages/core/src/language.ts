import type { Language } from './types.js'

export function languageTag(language: Language): string {
  return typeof language.dialect === 'string' && language.dialect
    ? language.code + '-' + language.dialect
    : language.code
}

/** The language a tag refers to, if the document has it. */
export function findLanguage(languages: Language[], tag: string): Language | undefined {
  return languages.find((language) => languageTag(language) === tag)
}
