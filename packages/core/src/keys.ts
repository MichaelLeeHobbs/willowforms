/**
 * What a key is allowed to be.
 *
 * A node's `key` is its identity and a `dataKey` is what the payload calls an
 * answer. Between them they are the property name in exported JSON Schema, the
 * key in `FormData` and `FormErrors`, the value of `data-fs-key`, part of a CSS
 * selector, and a name an expression can mention. Uniqueness was the only rule
 * enforced, so a key holding a space, a quote or a newline made a legal document
 * and an awkward everything-else.
 *
 * The grammar is the JavaScript identifier subset, and the reason is the
 * evaluator rather than tidiness. A hyphen is the tempting addition — real forms
 * are full of `first-name` — and it is exactly the one that breaks: `computed`
 * bindings are host-evaluated JavaScript, so `first-name` in an expression is a
 * subtraction, silently, with no error anywhere. A key namespace that expressions
 * can name has to be an identifier namespace.
 *
 * `.`, `[` and `]` are left free deliberately. Row addressing needs them, and
 * settling this before repeated scope is the whole reason the key grammar comes
 * first: a path grammar layered on a key grammar that does not exist is how the
 * libraries that had to break their addressing twice got there.
 */

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

/**
 * Why this key is not allowed, or nothing if it is.
 *
 * A message rather than a boolean, because every caller shows it to someone: the
 * Properties panel refuses a rename with it, and `validateDocument` reports it
 * against a pasted document. One rule, so a rename and a paste are judged the
 * same way.
 */
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

  /*
   * The stored key, not a trimmed reading of it.
   *
   * Trimming is an input convenience in the panel, which stores what it
   * trimmed. A key that reaches a document still wearing spaces was never typed
   * through the panel, and it is not the same string as its trimmed twin
   * anywhere it is used: `data-fs-key=" email "` and `FormData[' email ']` keep
   * the spaces, while a rename of the same field would not. Two components can
   * then hold what everything downstream treats as one name, and the duplicate
   * check would not see it.
   */
  if (!KEY_PATTERN.test(key)) {
    return (
      'A key must start with a letter or underscore and hold only letters, numbers and underscores. ' +
      'Expressions are JavaScript, so a hyphen in a key reads as a subtraction.'
    )
  }

  return undefined
}
