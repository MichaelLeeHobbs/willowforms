/** The stated grammar. */
export const KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/

/**
 * How long a key may be.
 *
 * `KEY_PATTERN` bounds the characters, not the length, and a key appears in
 * `data-fs-key`, in a CSS selector, in `FormData`, and as a property name in
 * the exported JSON Schema.
 *
 * 128 is an order of magnitude longer than any name in this repository's own
 * fixtures.
 */
export const MAX_KEY_LENGTH = 128

/**
 * Names that pass the grammar and still must not be used.
 *
 * `__proto__` is the one that bites hardest. Assigning it does not add a
 * property, it sets the prototype, so an answer under that key vanishes from the
 * payload and the payload inherits whatever it pointed at.
 *
 * The rest of `Object.prototype` is the same hazard one notch quieter: on a plain
 * object, `merged[key] ??= message` for a key `toString` finds the inherited
 * function and drops the error. All of these pass `KEY_PATTERN`.
 *
 * **This list is the second lock, never the first.** Nothing on the render or
 * validate path calls `validateDocument`, so a document carrying one of these
 * keys reaches the code that must survive it regardless. The fix is always a
 * null prototype at the accumulator; this list only stops an author creating the
 * document by hand.
 *
 * Written out rather than derived from `Object.getOwnPropertyNames`, so a
 * document's validity does not depend on the engine running it. `keys.test.ts`
 * asserts this literal covers the running engine's `Object.prototype`, so a new
 * member fails the suite and a person decides whether the format changes.
 *
 * `prototype` is not on `Object.prototype` at all. It is refused for being
 * confusing next to the others.
 */
export const RESERVED_KEYS: readonly string[] = Object.freeze([
  '__defineGetter__',
  '__defineSetter__',
  '__lookupGetter__',
  '__lookupSetter__',
  '__proto__',
  'constructor',
  'hasOwnProperty',
  'isPrototypeOf',
  'propertyIsEnumerable',
  'prototype',
  'toLocaleString',
  'toString',
  'valueOf',
])

export function keyProblem(key: unknown): string | undefined {
  if (typeof key !== 'string') return 'A key must be text.'

  const trimmed = key.trim()
  if (!trimmed) return 'A key cannot be empty.'

  if (trimmed.length > MAX_KEY_LENGTH) {
    return 'A key can be at most ' + String(MAX_KEY_LENGTH) + ' characters.'
  }

  if (RESERVED_KEYS.includes(trimmed)) {
    return (
      trimmed + ' is reserved, because assigning it changes an object rather than filling it in.'
    )
  }

  if (!KEY_PATTERN.test(key)) {
    return (
      'A key must start with a letter or underscore and hold only letters, numbers and underscores. ' +
      'Expressions are JavaScript, so a hyphen in a key reads as a subtraction.'
    )
  }

  return undefined
}
