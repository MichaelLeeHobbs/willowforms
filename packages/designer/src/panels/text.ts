/**
 * Action parameters as the text an author edits: pretty-printed JSON, or `{}`
 * when there are none or they cannot be serialised.
 *
 * Never throws, because it runs while rendering and a document can arrive from
 * a host or the JSON dialog carrying parameters `JSON.stringify` refuses.
 */
// eslint-disable-next-line no-restricted-syntax -- the one definition; the rule refuses copies.
export function paramsText(value: unknown): string {
  try {
    return JSON.stringify(value ?? {}, null, 2) ?? '{}'
  } catch {
    return '{}'
  }
}
