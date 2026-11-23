/**
 * Never throws: it runs while rendering, and a document can carry parameters
 * `JSON.stringify` refuses.
 */
// eslint-disable-next-line no-restricted-syntax -- the one definition; the rule refuses copies.
export function paramsText(value: unknown): string {
  try {
    return JSON.stringify(value ?? {}, null, 2) ?? '{}'
  } catch {
    return '{}'
  }
}
