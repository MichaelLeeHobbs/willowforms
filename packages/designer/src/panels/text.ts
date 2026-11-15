/**
 * Action parameters as the text an author edits: pretty-printed JSON, or `{}`
 * when there are none or they cannot be serialised.
 *
 * Never throws, because it runs while rendering and a document can arrive from
 * a host or the JSON dialog carrying parameters `JSON.stringify` refuses.
 */
export function paramsText(value: unknown): string {
  try {
    return JSON.stringify(value ?? {}, null, 2) ?? '{}'
  } catch {
    return '{}'
  }
}
