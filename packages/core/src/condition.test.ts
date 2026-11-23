import { describe, expect, it } from 'vitest'

import { evaluateCondition } from './condition.js'
import type { Condition, FormData, JsonValue, Operand } from './types.js'

const data: FormData = {
  country: 'GB',
  age: 30,
  consent: true,
  optOut: false,
  nickname: '',
  score: 0,
  tags: ['a', 'b'],
  date: '2026-06-15',
  nothing: null,
}

const check = (condition: Condition, against: FormData = data): boolean =>
  evaluateCondition(condition, against)

const ref = (dataKey: string) => ({ kind: 'ref', dataKey }) as const
const lit = (value: FormData[string]) => ({ kind: 'literal', value }) as const

describe('equality', () => {
  it('compares a field to a literal', () => {
    expect(check({ op: 'eq', left: ref('country'), right: lit('GB') })).toBe(true)
    expect(check({ op: 'eq', left: ref('country'), right: lit('FR') })).toBe(false)
    expect(check({ op: 'ne', left: ref('country'), right: lit('FR') })).toBe(true)
  })

  it('compares two fields', () => {
    expect(check({ op: 'eq', left: ref('score'), right: ref('score') })).toBe(true)
    expect(check({ op: 'eq', left: ref('age'), right: ref('score') })).toBe(false)
  })

  it('does not treat a number as its own spelling', () => {
    expect(check({ op: 'eq', left: ref('age'), right: lit('30') })).toBe(false)
    expect(check({ op: 'eq', left: ref('age'), right: lit(30) })).toBe(true)
  })

  it('compares arrays by their contents', () => {
    expect(check({ op: 'eq', left: ref('tags'), right: lit(['a', 'b']) })).toBe(true)
    expect(check({ op: 'eq', left: ref('tags'), right: lit(['b', 'a']) })).toBe(false)
  })

  it('is false for a field the data does not have', () => {
    expect(check({ op: 'eq', left: ref('missing'), right: lit('x') })).toBe(false)
  })

  it('is false in both directions when neither operand can be read', () => {
    const junk = { kind: 'nonsense' } as unknown as Operand

    expect(check({ op: 'eq', left: junk, right: junk })).toBe(false)
    expect(check({ op: 'ne', left: junk, right: junk })).toBe(false)
    expect(check({ op: 'eq', left: ref('country'), right: junk })).toBe(false)
    expect(check({ op: 'ne', left: ref('country'), right: junk })).toBe(false)
  })

  it('does not let a negation turn an unreadable comparison into a reason to show', () => {
    const junk = { kind: 'nonsense' } as unknown as Operand
    expect(check({ op: 'not', condition: { op: 'eq', left: junk, right: junk } })).toBe(false)
  })

  it('still reads two unanswered fields as equal, which is a value and not a failure', () => {
    expect(check({ op: 'eq', left: ref('missingA'), right: ref('missingB') })).toBe(true)
    expect(check({ op: 'ne', left: ref('missingA'), right: ref('missingB') })).toBe(false)
  })
})

describe('an operand nobody designed', () => {
  it('reads a ref whose data key is not a string as unreadable', () => {
    const junkRef = { kind: 'ref', dataKey: 42 } as unknown as Operand

    expect(check({ op: 'truthy', value: junkRef })).toBe(false)
    expect(check({ op: 'eq', left: junkRef, right: lit('GB') })).toBe(false)
    expect(check({ op: 'not', condition: { op: 'truthy', value: junkRef } })).toBe(false)
  })

  it('reads a row-scoped ref outside a row as nothing rather than as the form value', () => {
    const rowScoped = { kind: 'ref', dataKey: 'country', scope: 'row' } as const

    expect(check({ op: 'eq', left: rowScoped, right: lit('GB') })).toBe(false)
    expect(
      evaluateCondition({ op: 'eq', left: rowScoped, right: lit('FR') }, data, undefined, {
        path: [{ key: 'addresses', index: 0 }],
        values: { country: 'FR' },
      }),
    ).toBe(true)
  })
})

describe('ordering', () => {
  it('compares numbers numerically', () => {
    expect(check({ op: 'gte', left: ref('age'), right: lit(18) })).toBe(true)
    expect(check({ op: 'lt', left: ref('age'), right: lit(18) })).toBe(false)
    expect(check({ op: 'lte', left: ref('age'), right: lit(30) })).toBe(true)
    expect(check({ op: 'gt', left: ref('age'), right: lit(30) })).toBe(false)
  })

  it('compares two infinities rather than subtracting them', () => {
    const inf: FormData = { limit: Infinity, floor: -Infinity }

    expect(check({ op: 'gte', left: ref('limit'), right: lit(Infinity) }, inf)).toBe(true)
    expect(check({ op: 'lte', left: ref('limit'), right: lit(Infinity) }, inf)).toBe(true)
    expect(check({ op: 'gt', left: ref('limit'), right: lit(Infinity) }, inf)).toBe(false)
    expect(check({ op: 'lte', left: ref('floor'), right: lit(-Infinity) }, inf)).toBe(true)

    expect(check({ op: 'gt', left: ref('limit'), right: lit(0) }, inf)).toBe(true)
    expect(check({ op: 'lt', left: ref('floor'), right: lit(0) }, inf)).toBe(true)
  })

  it('answers false for a comparison against NaN, in both directions', () => {
    const nan: FormData = { score: NaN }

    for (const op of ['gt', 'gte', 'lt', 'lte'] as const) {
      expect(check({ op, left: ref('score'), right: lit(0) }, nan), op).toBe(false)
      expect(check({ op, left: lit(0), right: ref('score') }, nan), op + ' reversed').toBe(false)
    }
  })

  it('orders ISO dates as text, which is why the date components store them', () => {
    expect(check({ op: 'gt', left: ref('date'), right: lit('2026-01-01') })).toBe(true)
    expect(check({ op: 'lt', left: ref('date'), right: lit('2026-01-01') })).toBe(false)
  })

  it('refuses to order values it cannot compare, rather than coercing', () => {
    expect(check({ op: 'gt', left: lit('10'), right: lit(9) })).toBe(false)
    expect(check({ op: 'lt', left: lit('10'), right: lit(9) })).toBe(false)
    expect(check({ op: 'gt', left: ref('consent'), right: lit(0) })).toBe(false)
  })
})

describe('emptiness and truthiness are different questions', () => {
  it('treats zero and false as answers, not absences', () => {
    expect(check({ op: 'empty', value: ref('score') })).toBe(false)
    expect(check({ op: 'empty', value: ref('optOut') })).toBe(false)
  })

  it('treats zero and false as falsy', () => {
    expect(check({ op: 'falsy', value: ref('score') })).toBe(true)
    expect(check({ op: 'falsy', value: ref('optOut') })).toBe(true)
  })

  it('counts blank text, null and a missing key as empty', () => {
    expect(check({ op: 'empty', value: ref('nickname') })).toBe(true)
    expect(check({ op: 'empty', value: ref('nothing') })).toBe(true)
    expect(check({ op: 'empty', value: ref('missing') })).toBe(true)
    expect(check({ op: 'notEmpty', value: ref('country') })).toBe(true)
  })

  it('reads a ticked box as on', () => {
    expect(check({ op: 'truthy', value: ref('consent') })).toBe(true)
    expect(check({ op: 'truthy', value: ref('optOut') })).toBe(false)
  })
})

describe('membership', () => {
  it('tests a field against a list', () => {
    expect(check({ op: 'in', value: ref('country'), options: ['GB', 'IE'] })).toBe(true)
    expect(check({ op: 'in', value: ref('country'), options: ['FR'] })).toBe(false)
    expect(check({ op: 'notIn', value: ref('country'), options: ['FR'] })).toBe(true)
  })

  it('is false for an empty list, and its negation true', () => {
    expect(check({ op: 'in', value: ref('country'), options: [] })).toBe(false)
    expect(check({ op: 'notIn', value: ref('country'), options: [] })).toBe(true)
  })
})

describe('composition', () => {
  const yes: Condition = { op: 'truthy', value: ref('consent') }
  const no: Condition = { op: 'falsy', value: ref('consent') }

  it('combines with and, or and not', () => {
    expect(check({ op: 'and', conditions: [yes, yes] })).toBe(true)
    expect(check({ op: 'and', conditions: [yes, no] })).toBe(false)
    expect(check({ op: 'or', conditions: [yes, no] })).toBe(true)
    expect(check({ op: 'or', conditions: [no, no] })).toBe(false)
    expect(check({ op: 'not', condition: no })).toBe(true)
  })

  it('nests', () => {
    expect(
      check({
        op: 'and',
        conditions: [
          yes,
          { op: 'or', conditions: [no, { op: 'gte', left: ref('age'), right: lit(18) }] },
        ],
      }),
    ).toBe(true)
  })

  it('reads an empty group the way the operation means it', () => {
    expect(check({ op: 'and', conditions: [] })).toBe(true)
    expect(check({ op: 'or', conditions: [] })).toBe(false)
  })
})

describe('a document is data, so it can be malformed', () => {
  it('is false for an operator it does not know', () => {
    expect(check({ op: 'sorcery' } as unknown as Condition)).toBe(false)
  })

  it('does not turn a rule it cannot read into a reason to show', () => {
    expect(check({ op: 'not', condition: { op: 'sorcery' } } as unknown as Condition)).toBe(false)
    expect(check({ op: 'not', condition: null } as unknown as Condition)).toBe(false)
    expect(
      check({
        op: 'not',
        condition: { op: 'and', conditions: 'not-a-list' },
      } as unknown as Condition),
    ).toBe(false)

    expect(check({ op: 'not', condition: { op: 'falsy', value: ref('consent') } })).toBe(true)
  })

  it('treats a group holding something unreadable as unreadable', () => {
    const bad = { op: 'sorcery' } as unknown as Condition
    const good: Condition = { op: 'truthy', value: ref('consent') }

    expect(check({ op: 'or', conditions: [good, bad] })).toBe(false)
    expect(check({ op: 'and', conditions: [good, bad] })).toBe(false)
    expect(check({ op: 'or', conditions: [good, good] })).toBe(true)
  })

  it('never throws, whatever it is handed', () => {
    /*
     * A throw here blanks the form for the person filling it in.
     * `validateDocument` is where a malformed condition gets reported.
     */
    const junk: unknown[] = [
      { op: 'eq', left: undefined, right: lit(1) },
      { op: 'eq', left: 'nonsense', right: lit(1) },
      { op: 'in', value: ref('country'), options: 'not-a-list' },
      { op: 'and', conditions: 'not-a-list' },
      { op: 'or', conditions: 'not-a-list' },
      { op: 'notIn', value: ref('country'), options: 'not-a-list' },
      { op: 'not' },
      { op: 'truthy' },
      {},
      null,
      'a string',
    ]

    for (const value of junk) {
      expect(() => check(value as Condition), JSON.stringify(value)).not.toThrow()
      expect(check(value as Condition), JSON.stringify(value)).toBe(false)
    }
  })
})

describe('a field named after something on the prototype', () => {
  const proto = ['toString', 'constructor', 'valueOf', 'hasOwnProperty']

  it.each(proto)('treats %s as missing when the data does not hold it', (key) => {
    expect(check({ op: 'notEmpty', value: ref(key) }, {})).toBe(false)
    expect(check({ op: 'empty', value: ref(key) }, {})).toBe(true)
    expect(check({ op: 'truthy', value: ref(key) }, {})).toBe(false)
  })

  it('still reads one the data really does hold', () => {
    expect(check({ op: 'eq', left: ref('toString'), right: lit('yes') }, { toString: 'yes' })).toBe(
      true,
    )
  })
})

describe('object equality is about own properties', () => {
  it('does not count an inherited key as one the object holds', () => {
    // Two own keys on each side, so the length check passes and the own-property
    // check is what answers.
    const inherits = Object.create({ a: 1 }) as Record<string, unknown>
    inherits['b'] = 2
    inherits['c'] = 3

    expect(Object.keys(inherits)).toHaveLength(2)
    expect('a' in inherits).toBe(true)
    expect(Object.hasOwn(inherits, 'a')).toBe(false)

    expect(check({ op: 'eq', left: lit({ a: 1, b: 2 }), right: lit(inherits as never) })).toBe(
      false,
    )
  })

  it('still compares two plain objects by their contents', () => {
    expect(check({ op: 'eq', left: lit({ a: 1, b: 2 }), right: lit({ b: 2, a: 1 }) })).toBe(true)
    expect(check({ op: 'eq', left: lit({ a: 1 }), right: lit({ a: 2 }) })).toBe(false)
  })
})

describe('what the host knows', () => {
  const context = { user: { role: 'admin', seats: 0 }, country: 'FR' }
  const ctx = (path: string) => ({ kind: 'context', path }) as const

  it('compares against a path the host supplied', () => {
    expect(
      evaluateCondition({ op: 'eq', left: ctx('user.role'), right: lit('admin') }, data, context),
    ).toBe(true)
    expect(
      evaluateCondition({ op: 'eq', left: ctx('user.role'), right: lit('viewer') }, data, context),
    ).toBe(false)
  })

  it('keeps the context and the answers in separate namespaces', () => {
    expect(
      evaluateCondition({ op: 'eq', left: ref('country'), right: lit('GB') }, data, context),
    ).toBe(true)
    expect(
      evaluateCondition({ op: 'eq', left: ctx('country'), right: lit('GB') }, data, context),
    ).toBe(false)
    expect(
      evaluateCondition({ op: 'eq', left: ctx('country'), right: lit('FR') }, data, context),
    ).toBe(true)
  })

  it('reads a zero the host supplied as a zero', () => {
    expect(evaluateCondition({ op: 'empty', value: ctx('user.seats') }, data, context)).toBe(false)
    expect(
      evaluateCondition({ op: 'eq', left: ctx('user.seats'), right: lit(0) }, data, context),
    ).toBe(true)
  })

  it('reads a context nobody supplied as missing, not as an error', () => {
    expect(evaluateCondition({ op: 'empty', value: ctx('user.role') }, data)).toBe(true)
    expect(evaluateCondition({ op: 'truthy', value: ctx('user.role') }, data)).toBe(false)
    expect(evaluateCondition({ op: 'notEmpty', value: ctx('nope') }, data, context)).toBe(false)
  })

  it('does not read a path that is not a string', () => {
    expect(
      evaluateCondition(
        { op: 'truthy', value: { kind: 'context', path: 42 } } as unknown as Condition,
        data,
        context,
      ),
    ).toBe(false)
  })

  it('reaches a context inside a group and inside a not', () => {
    const isAdmin: Condition = { op: 'eq', left: ctx('user.role'), right: lit('admin') }
    expect(evaluateCondition({ op: 'not', condition: isAdmin }, data, context)).toBe(false)
    expect(evaluateCondition({ op: 'and', conditions: [isAdmin, isAdmin] }, data, context)).toBe(
      true,
    )
    expect(
      evaluateCondition(
        { op: 'or', conditions: [{ op: 'not', condition: isAdmin }] },
        data,
        context,
      ),
    ).toBe(false)
  })
})

describe('a malformed operand', () => {
  const bad = { kind: 'refs', dataKey: 'a' } as unknown as Operand
  const alsoBad = { kind: 'ref' } as unknown as Operand

  it('makes the condition false, not true', () => {
    expect(evaluateCondition({ op: 'truthy', value: bad }, { a: 1 })).toBe(false)
  })

  it('is not turned into "shown" by a not', () => {
    expect(
      evaluateCondition({ op: 'not', condition: { op: 'truthy', value: bad } }, { a: 1 }),
    ).toBe(false)
  })

  it('does not compare equal to another one', () => {
    expect(evaluateCondition({ op: 'eq', left: bad, right: alsoBad }, {})).toBe(false)
  })

  it('does not satisfy an emptiness test', () => {
    expect(evaluateCondition({ op: 'empty', value: bad }, {})).toBe(false)
    expect(evaluateCondition({ op: 'notEmpty', value: bad }, {})).toBe(false)
  })

  it('does not let a membership test pass on nothing', () => {
    expect(evaluateCondition({ op: 'notIn', value: bad, options: ['x'] }, {})).toBe(false)
  })

  it('leaves a readable operand that holds nothing alone', () => {
    expect(evaluateCondition({ op: 'empty', value: { kind: 'ref', dataKey: 'a' } }, {})).toBe(true)
    expect(
      evaluateCondition(
        { op: 'not', condition: { op: 'empty', value: { kind: 'ref', dataKey: 'a' } } },
        {},
      ),
    ).toBe(false)
  })
})

/** `depth.test.ts` holds the depth table over every walker; add new branches there. */
describe('a condition nested beyond any reasonable depth, through not and through objects', () => {
  const deep = (n: number): Condition => {
    let condition: Condition = { op: 'truthy', value: { kind: 'literal', value: true } }
    for (let i = 0; i < n; i += 1) condition = { op: 'not', condition }
    return condition
  }

  it('answers rather than throwing, for a chain of not', () => {
    expect(() => evaluateCondition(deep(50_000), {})).not.toThrow()
  })

  it('answers false, because it could not read it', () => {
    expect(evaluateCondition(deep(50_000), {})).toBe(false)
  })

  it('still evaluates a condition a person would write', () => {
    expect(evaluateCondition(deep(20), {})).toBe(true)
  })

  it('does not throw comparing values nested through lists', () => {
    // Both sides nest together: `same` returns early on a length mismatch.
    const nest = (n: number): JsonValue => {
      let value: JsonValue = [1]
      for (let i = 0; i < n; i += 1) value = [value]
      return value
    }

    expect(() =>
      evaluateCondition(
        {
          op: 'eq',
          left: { kind: 'literal', value: nest(50_000) },
          right: { kind: 'literal', value: nest(50_000) },
        },
        {},
      ),
    ).not.toThrow()
  })

  it('still compares lists a person would write', () => {
    expect(
      evaluateCondition(
        {
          op: 'eq',
          left: { kind: 'literal', value: [[['a'], ['b']]] },
          right: { kind: 'literal', value: [[['a'], ['b']]] },
        },
        {},
      ),
    ).toBe(true)
  })

  it('does not throw comparing values nested through objects', () => {
    const nest = (n: number): JsonValue => {
      let value: JsonValue = 1
      for (let i = 0; i < n; i += 1) value = { inner: value }
      return value
    }

    expect(() =>
      evaluateCondition(
        {
          op: 'eq',
          left: { kind: 'literal', value: nest(50_000) },
          right: { kind: 'literal', value: 1 },
        },
        {},
      ),
    ).not.toThrow()
  })
})

describe('a membership condition whose options are malformed', () => {
  const malformed = (op: 'in' | 'notIn'): Condition => ({
    op,
    value: { kind: 'literal', value: 'a' },
    options: 'not-a-list' as never,
  })

  it.each(['in', 'notIn'] as const)('reads %s as unreadable rather than false', (op) => {
    expect(evaluateCondition(malformed(op), {})).toBe(false)
  })

  it.each(['in', 'notIn'] as const)('does not show the component when %s is negated', (op) => {
    expect(evaluateCondition({ op: 'not', condition: malformed(op) }, {})).toBe(false)
  })

  it('still answers a membership test whose options are a list', () => {
    const held: Condition = {
      op: 'in',
      value: { kind: 'literal', value: 'a' },
      options: ['a', 'b'],
    }
    expect(evaluateCondition(held, {})).toBe(true)
    expect(evaluateCondition({ op: 'not', condition: held }, {})).toBe(false)
    expect(
      evaluateCondition({ op: 'in', value: { kind: 'literal', value: 'z' }, options: ['a'] }, {}),
    ).toBe(false)
  })
})
