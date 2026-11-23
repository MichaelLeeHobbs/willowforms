import { format } from 'node:util'
import { afterEach, beforeEach } from 'vitest'

/**
 * A test that writes to `console.error` fails unless it declared it with
 * `expectConsoleError`, and a declaration nothing matched fails too.
 *
 * Matches `util.format(...args)`: React 19 logs a format string first, so
 * `args[0]` alone matches nothing a test would write.
 */
interface Gate {
  expected: RegExp[]
  seen: string[]
  installed: boolean
}

const gate: Gate = ((globalThis as { willowformsConsoleGate?: Gate }).willowformsConsoleGate ??= {
  expected: [],
  seen: [],
  installed: false,
})

export function expectConsoleError(pattern: RegExp): void {
  if (pattern.global || pattern.sticky) {
    // `RegExp.prototype.test` advances `lastIndex` under these flags and
    // alternates true/false on the same input.
    throw new Error(
      `expectConsoleError: /${pattern.source}/${pattern.flags} is stateful; drop the g/y flag`,
    )
  }
  gate.expected.push(pattern)
}

export function installConsoleErrorGate(): void {
  if (!gate.installed) {
    gate.installed = true
    const original = console.error
    console.error = (...args: unknown[]): void => {
      const text = format(...args)
      gate.seen.push(text)
      if (!gate.expected.some((p) => p.test(text))) original.apply(console, args)
    }
  }
  beforeEach(() => {
    gate.expected.length = 0
    gate.seen.length = 0
  })
  afterEach(() => {
    const seen = gate.seen.splice(0)
    const expected = gate.expected.splice(0)
    const unexpected = seen.filter((text) => !expected.some((p) => p.test(text)))
    const unmet = expected.filter((p) => !seen.some((text) => p.test(text)))
    const lines = [
      ...unexpected.map((text) => `console.error was called and no test expected it:\n${text}`),
      ...unmet.map((p) => `expectConsoleError(${String(p)}) but nothing matching was logged`),
    ]
    if (lines.length > 0) throw new Error(lines.join('\n\n'))
  })
}
