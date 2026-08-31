import { describe, expect, it } from 'vitest'

import { KEY_PATTERN, RESERVED_KEYS, keyProblem } from './keys.js'

describe('the key grammar', () => {
  it('allows an identifier', () => {
    for (const key of ['email', 'firstName', '_private', 'a1', 'A', 'x_9']) {
      expect(keyProblem(key), key).toBeUndefined()
    }
  })

  it('refuses a hyphen, because an expression would read it as a subtraction', () => {
    /*
     * The one an author will actually try. `computed` bindings are evaluated as
     * host JavaScript, so `first-name` in an expression is `first` minus `name`
     * — no error anywhere, just the wrong answer.
     */
    const problem = keyProblem('first-name')
    expect(problem).toBeDefined()
    expect(problem).toContain('subtraction')
  })

  it('refuses what would break the things a key is used for', () => {
    for (const key of [
      'first name',
      'a.b',
      'a[0]',
      'a"b',
      "a'b",
      'a/b',
      'a\nb',
      '1st',
      'ção',
      '',
      '   ',
    ]) {
      expect(keyProblem(key), JSON.stringify(key)).toBeDefined()
    }
  })

  it('leaves the path characters free on purpose', () => {
    // Row addressing will need `.` and `[`, and settling this before repeated
    // scope is the reason the key grammar comes first.
    for (const key of ['a.b', 'a[0]']) {
      expect(KEY_PATTERN.test(key), key).toBe(false)
    }
  })

  it('refuses the names that change an object rather than filling it in', () => {
    for (const key of RESERVED_KEYS) {
      expect(keyProblem(key), key).toBeDefined()
    }
    // `__proto__` passes the pattern, so the list is doing the work, not the regex.
    expect(KEY_PATTERN.test('__proto__')).toBe(true)
  })

  it('is not fooled by something that is not text', () => {
    for (const value of [undefined, null, 42, {}, []]) {
      expect(keyProblem(value), JSON.stringify(value)).toBeDefined()
    }
  })

  it('refuses a key still wearing whitespace, because that is what got stored', () => {
    /*
     * Trimming is an input convenience in the panel, which stores what it
     * trimmed. A key reaching a document with spaces was never typed through
     * the panel, and it is not the same string as its trimmed twin anywhere it
     * is used: `data-fs-key=" email "` keeps the spaces while a rename of the
     * same field would not. Two components could then hold what everything
     * downstream treats as one name, and the duplicate check would not see it.
     */
    expect(keyProblem('  email  ')).toBeDefined()
    expect(keyProblem('email ')).toBeDefined()
    expect(keyProblem('email')).toBeUndefined()
  })

  it('still says "empty" for whitespace alone, which is the more useful message', () => {
    expect(keyProblem('   ')).toContain('empty')
  })
})

describe('the names that are refused by name', () => {
  /*
   * Written out rather than read from `RESERVED_KEYS`. The loop that iterates
   * the list is vacuous if the list is emptied -- zero iterations, zero
   * assertions, green -- so every name is also stated here, where deleting one
   * from the source makes a test that names it go red.
   */
  it.each([
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
  ])('refuses %s', (key) => {
    expect(keyProblem(key)).toBeTruthy()
  })

  it('covers every own name the running engine puts on Object.prototype', () => {
    /*
     * The staleness guard for the decision above. `RESERVED_KEYS` is a written
     * literal so that a document's validity does not depend on the engine
     * reading it. But a literal can go stale, and the failure mode is silent: a
     * new member of `Object.prototype` would be a key that passes the grammar
     * and shadows a builtin, exactly the class this list closes.
     *
     * So the engine is the oracle and the literal is the contract. If they ever
     * disagree this goes red and a person decides whether to widen the format,
     * rather than the format widening itself on whichever Node happens to run.
     */
    const missing = Object.getOwnPropertyNames(Object.prototype).filter(
      (name) => !RESERVED_KEYS.includes(name),
    )

    expect(missing).toEqual([])
  })

  it('reserves nothing the grammar already refuses, so every entry does work', () => {
    /*
     * The other half. An entry the pattern rejects anyway would be a line that
     * looks like protection and provides none, and the loop over
     * `RESERVED_KEYS` above could not tell the difference.
     */
    for (const key of RESERVED_KEYS) {
      expect(KEY_PATTERN.test(key), key).toBe(true)
    }
  })

  it('says why, in words a panel can show', () => {
    expect(keyProblem('__proto__')).toMatch(/reserved/i)
  })

  it('accepts a name that merely contains one of them', () => {
    // The control: the rule is the whole key, not a substring, or `constructorName`
    // would be refused for no reason.
    expect(keyProblem('constructorName')).toBeUndefined()
    expect(keyProblem('myPrototype')).toBeUndefined()
  })

  it('refuses a padded reserved name as reserved, not as a spacing mistake', () => {
    /*
     * Both rules apply to ` __proto__ ` and which message a caller shows was
     * unpinned. The reserved check reads the trimmed key and comes first, which
     * is the right way round: "that name is reserved" tells the author to pick
     * another one, where "remove the spaces" invites them to try again with a
     * key that will be refused for a second reason.
     */
    expect(keyProblem(' __proto__ ')).toMatch(/reserved/i)
    // And a padded ordinary name is still refused, for the spacing.
    expect(keyProblem(' email ')).toMatch(/letters, numbers and underscores/)
  })
})
