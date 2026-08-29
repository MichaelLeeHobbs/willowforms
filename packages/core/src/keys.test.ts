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

  it('judges the trimmed key, matching what a rename stores', () => {
    expect(keyProblem('  email  ')).toBeUndefined()
  })
})
