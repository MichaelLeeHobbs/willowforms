/**
 * - `unavailable`: no clipboard API, as outside a secure context or in some
 *   embedded webviews.
 * - `refused`: the API exists but the write failed, usually a denied permission.
 */
export type CopyOutcome = 'copied' | 'unavailable' | 'refused'

/** Never throws or rejects; every failure is an outcome for the caller to explain. */
export async function copyText(text: string): Promise<CopyOutcome> {
  // `navigator.clipboard` is typed as always present, but browsers omit it
  // outside secure contexts.
  const clipboard: Clipboard | undefined =
    typeof navigator === 'undefined' ? undefined : navigator.clipboard
  if (typeof clipboard?.writeText !== 'function') return 'unavailable'
  try {
    // Inside the try so a rejection and a synchronous throw both report `refused`.
    await clipboard.writeText(text)
    return 'copied'
  } catch {
    return 'refused'
  }
}
