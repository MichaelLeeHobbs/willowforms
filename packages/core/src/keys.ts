/** The stated grammar. Anything outside it was working by accident. */
export const KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/

/**
 * How long a key may be.
 *
 * The grammar bounds the characters and not the length, so a megabyte-long
 * `dataKey` in an imported document passed every gate and then appeared in
 * `data-fs-key`, in a CSS selector, in `FormData`, and as a property name in
 * the exported JSON Schema. Nothing breaks -- the regex is linear and has no
 * nested quantifier -- but nothing a person types is anywhere near this, and a
 * grammar is the place a bound belongs.
 *
 * 128, which is longer than any name in this repository's own fixtures by an
 * order of magnitude and shorter than anything that reads as an attack.
 */
export const MAX_KEY_LENGTH = 128

/**
 * Names that pass the grammar and still must not be used.
 *
 * `__proto__` is the one that bites hardest. Assigning it does not add a
 * property, it sets the prototype, so an answer under that key vanishes from the
 * payload and the payload inherits whatever it pointed at.
 *
 * The rest of `Object.prototype` is the same hazard one notch quieter, and the
 * second-pass review found it live: `validateAcross` merged with
 * `merged[key] ??= message`, so a required field keyed `toString` had its error
 * compared against `Object.prototype.toString`, found not nullish, and dropped —
 * a form with a missing required answer submitting clean. `toString`, `valueOf`,
 * `hasOwnProperty`, `constructor` and `isPrototypeOf` all pass `KEY_PATTERN`, so
 * nothing had to be bypassed to author one.
 *
 * **This list is the second lock, never the first.** Nothing on the render or
 * validate path calls `validateDocument`, so a document carrying one of these
 * keys reaches the code that must survive it regardless. The fix is always a
 * null prototype at the accumulator; this list only stops an author creating the
 * document by hand.
 *
 * Written out rather than derived from `Object.getOwnPropertyNames`. Which keys
 * a document may use is part of the format, and a format whose validity depends
 * on the JavaScript engine running it is not one — a document authored on Node
 * 22 must not become invalid on Node 30. `keys.test.ts` asserts this literal
 * covers the running engine's `Object.prototype`, so the day an engine grows a
 * member the suite goes red and a person decides, rather than the format
 * changing under everyone silently.
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
