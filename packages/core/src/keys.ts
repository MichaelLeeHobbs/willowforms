export const KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/

/**
 * `KEY_PATTERN` does not bound the length, and a key reaches `data-fs-key`, a CSS selector,
 * `FormData` and the exported JSON Schema.
 */
export const MAX_KEY_LENGTH = 128

/**
 * The second lock, never the first: nothing on the render or validate path calls
 * `validateDocument`, so an accumulator keyed by a document's names also needs a null
 * prototype. Assigning `__proto__` sets the prototype, and on a plain object `merged[key]
 * ??= message` finds the inherited `toString` and drops the error.
 *
 * Written out, so a document's validity does not depend on the engine running it.
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
