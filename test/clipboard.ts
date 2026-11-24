import { onTestFinished } from 'vitest'

/**
 * Replaces `navigator.clipboard` until the test ends. Call it after
 * `userEvent.setup()`, which installs a stub of its own.
 */
export function stubClipboard(clipboard: unknown): void {
  const before = Object.getOwnPropertyDescriptor(navigator, 'clipboard')
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: clipboard })

  onTestFinished(() => {
    if (before) Object.defineProperty(navigator, 'clipboard', before)
    else delete (navigator as { clipboard?: unknown }).clipboard
  })
}

/** A clipboard that answers each write with `writeText`. Returns the texts written to it. */
export function stubClipboardWrites(
  writeText: () => Promise<void> = () => Promise.resolve(),
): string[] {
  const written: string[] = []
  stubClipboard({
    writeText: (text: string) => {
      written.push(text)
      return writeText()
    },
  })
  return written
}
