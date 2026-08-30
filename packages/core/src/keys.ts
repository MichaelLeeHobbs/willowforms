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
 * Names that pass the grammar and still must not be used.
 *
 * `__proto__` is the one that bites. Assigning it does not add a property, it
 * sets the prototype, so an answer under that key vanishes from the payload and
 * the payload inherits whatever it pointed at. `submittedData` builds on a null
 * prototype to survive it; refusing the name is the other half, and the cheaper
 * one. The other two are refused for being confusing rather than dangerous, now
 * that there is a list to put them on.
 */
export const RESERVED_KEYS: readonly string[] = ['__proto__', 'constructor', 'prototype']

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
