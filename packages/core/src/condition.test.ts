import { describe, expect, it } from 'vitest'

import { evaluateCondition } from './condition.js'
import type { Condition, FormData } from './types.js'

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
    // The document stores JSON, so 30 and "30" are different answers and a
    // condition that quietly conflated them would be unpredictable.
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
})

describe('ordering', () => {
  it('compares numbers numerically', () => {
    expect(check({ op: 'gte', left: ref('age'), right: lit(18) })).toBe(true)
    expect(check({ op: 'lt', left: ref('age'), right: lit(18) })).toBe(false)
    expect(check({ op: 'lte', left: ref('age'), right: lit(30) })).toBe(true)
    expect(check({ op: 'gt', left: ref('age'), right: lit(30) })).toBe(false)
  })

  it('orders ISO dates as text, which is why the date components store them', () => {
    expect(check({ op: 'gt', left: ref('date'), right: lit('2026-01-01') })).toBe(true)
    expect(check({ op: 'lt', left: ref('date'), right: lit('2026-01-01') })).toBe(false)
  })

  it('refuses to order values it cannot compare, rather than coercing', () => {
    /*
     * `'10' > 9` has no answer a form author would predict, so it does not get
     * one. False in both directions is the honest result.
     */
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
    // Not arbitrary: it is what `and` and `or` mean over no arguments, and it
    // makes a half-built condition in the panel behave rather than throw.
    expect(check({ op: 'and', conditions: [] })).toBe(true)
    expect(check({ op: 'or', conditions: [] })).toBe(false)
  })
})

describe('a document is data, so it can be malformed', () => {
  it('is false for an operator it does not know', () => {
    /*
     * Reachable by hand-editing the JSON. False matches what a computed
     * condition does without an evaluator, so "hidden" stays the answer to
     * every question this cannot answer.
     */
    expect(check({ op: 'sorcery' } as unknown as Condition)).toBe(false)
  })

  it('does not turn a rule it cannot read into a reason to show', () => {
    /*
     * `not` is the only operator that inverts, so it is the only one that can
     * turn "cannot read this" into true. It did: `not({op:'nonsense'})` came
     * back true and showed a component whose rule the code could not read,
     * which is the opposite of the stated default.
     */
    expect(check({ op: 'not', condition: { op: 'sorcery' } } as unknown as Condition)).toBe(false)
    expect(check({ op: 'not', condition: null } as unknown as Condition)).toBe(false)
    expect(
      check({
        op: 'not',
        condition: { op: 'and', conditions: 'not-a-list' },
      } as unknown as Condition),
    ).toBe(false)

    // A readable inner condition still inverts, which is the whole point of it.
    expect(check({ op: 'not', condition: { op: 'falsy', value: ref('consent') } })).toBe(true)
  })

  it('treats a group holding something unreadable as unreadable', () => {
    // Answering from the remainder would be guessing at a document nobody can
    // fully read, and `or` would then show on partial evidence.
    const bad = { op: 'sorcery' } as unknown as Condition
    const good: Condition = { op: 'truthy', value: ref('consent') }

    expect(check({ op: 'or', conditions: [good, bad] })).toBe(false)
    expect(check({ op: 'and', conditions: [good, bad] })).toBe(false)
    expect(check({ op: 'or', conditions: [good, good] })).toBe(true)
  })

  it('never throws, whatever it is handed', () => {
    /*
     * isVisible calls this from both the renderer and validateForm, so a throw
     * here takes the form off screen for the person filling it in, who cannot
     * fix the document. validateDocument is where a malformed condition should
     * be reported; this one stays standing.
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
