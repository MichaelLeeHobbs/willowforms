import { describe, expect, it } from 'vitest'

import { KEY_PATTERN, MAX_KEY_LENGTH, RESERVED_KEYS, keyProblem } from './keys.js'

describe('the key grammar', () => {
  it('allows an identifier', () => {
    for (const key of ['email', 'firstName', '_private', 'a1', 'A', 'x_9']) {
      expect(keyProblem(key), key).toBeUndefined()
    }
  })

  it('refuses a hyphen, because an expression would read it as a subtraction', () => {
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
    // Row addresses such as `addresses[1].street` parse only because a key
    // cannot hold `.` or `[`.
    for (const key of ['a.b', 'a[0]']) {
      expect(KEY_PATTERN.test(key), key).toBe(false)
    }
  })

  it('refuses the names that change an object rather than filling it in', () => {
    for (const key of RESERVED_KEYS) {
      expect(keyProblem(key), key).toBeDefined()
    }
    expect(KEY_PATTERN.test('__proto__')).toBe(true)
  })

  it('is not fooled by something that is not text', () => {
    for (const value of [undefined, null, 42, {}, []]) {
      expect(keyProblem(value), JSON.stringify(value)).toBeDefined()
    }
  })

  it('refuses a key still wearing whitespace, because that is what got stored', () => {
    /*
     * A padded key is a different string from its trimmed twin everywhere it is
     * used, so two components could hold what downstream code treats as one
     * name without the duplicate check seeing it.
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
  // Written out rather than read from `RESERVED_KEYS`: a loop over an emptied
  // list passes with zero assertions.
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
    const missing = Object.getOwnPropertyNames(Object.prototype).filter(
      (name) => !RESERVED_KEYS.includes(name),
    )

    expect(missing).toEqual([])
  })

  it('reserves nothing the grammar already refuses, so every entry does work', () => {
    for (const key of RESERVED_KEYS) {
      expect(KEY_PATTERN.test(key), key).toBe(true)
    }
  })

  it('says why, in words a panel can show', () => {
    expect(keyProblem('__proto__')).toMatch(/reserved/i)
  })

  it('accepts a name that merely contains one of them', () => {
    expect(keyProblem('constructorName')).toBeUndefined()
    expect(keyProblem('myPrototype')).toBeUndefined()
  })

  it('refuses a padded reserved name as reserved, not as a spacing mistake', () => {
    // "That name is reserved" tells the author to pick another; "remove the
    // spaces" leads to a second refusal.
    expect(keyProblem(' __proto__ ')).toMatch(/reserved/i)
    expect(keyProblem(' email ')).toMatch(/letters, numbers and underscores/)
  })
})

describe('a key longer than anything a person types', () => {
  it('refuses a key past the bound, and says what the bound is', () => {
    const problem = keyProblem('a'.repeat(MAX_KEY_LENGTH + 1))

    expect(problem).toBeDefined()
    expect(problem).toContain(String(MAX_KEY_LENGTH))
  })

  it('accepts one exactly at it', () => {
    expect(keyProblem('a'.repeat(MAX_KEY_LENGTH))).toBeUndefined()
  })

  it('says it is too long rather than blaming the characters', () => {
    expect(keyProblem('a'.repeat(MAX_KEY_LENGTH + 1))).not.toContain('must start with')
  })
})
