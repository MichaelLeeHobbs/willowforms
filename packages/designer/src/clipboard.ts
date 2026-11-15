/**
 * The outcome of one clipboard write.
 *
 * - `copied`: the browser accepted the text.
 * - `unavailable`: there is no clipboard API here, as on a page that is not a
 *   secure origin or in some embedded webviews.
 * - `refused`: the API exists but the write failed, usually a denied permission.
 */
export type CopyOutcome = 'copied' | 'unavailable' | 'refused'

/**
 * Writes text to the system clipboard. Never throws or rejects: every failure
 * is reported as an outcome so each caller can explain it in its own words.
 */
export async function copyText(text: string): Promise<CopyOutcome> {
  // `navigator.clipboard` is typed as always present, but browsers omit it
  // outside secure contexts.
  const clipboard: Clipboard | undefined =
    typeof navigator === 'undefined' ? undefined : navigator.clipboard
  if (typeof clipboard?.writeText !== 'function') return 'unavailable'
  try {
    // Inside the try so a synchronous throw is a refusal too, not a rejection.
    await clipboard.writeText(text)
    return 'copied'
  } catch {
    return 'refused'
  }
}
