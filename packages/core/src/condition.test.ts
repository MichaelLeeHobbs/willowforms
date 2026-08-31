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

  it('is false in both directions when neither operand can be read', () => {
    /*
     * Two operands of a shape nobody designed, which is what a hand-edited
     * document can hold. Equality between them used to be `true` — they are
     * both "nothing", after all — and `ne` was therefore `false`, so a
     * malformed condition either revealed a component or hid one depending on
     * which way round it was written.
     *
     * Unreadable is not a value. Both directions answer false, and false means
     * hidden, which is the invariant this file is about.
     */
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
    // The control beside the rows above: `undefined` is a reading. Both fields
    // are unanswered, so they hold the same answer, and `ne` says so.
    expect(check({ op: 'eq', left: ref('missingA'), right: ref('missingB') })).toBe(true)
    expect(check({ op: 'ne', left: ref('missingA'), right: ref('missingB') })).toBe(false)
  })
})

describe('an operand nobody designed', () => {
  it('reads a ref whose data key is not a string as unreadable', () => {
    /*
     * The junk list this file carries had every malformed shape except this one,
     * and it is the one a hand-edited document reaches by accident: `dataKey`
     * typed as a number. Unreadable rather than "the field named 42", which
     * would be a lookup that can never match and a condition that is quietly
     * false forever.
     */
    const junkRef = { kind: 'ref', dataKey: 42 } as unknown as Operand

    expect(check({ op: 'truthy', value: junkRef })).toBe(false)
    expect(check({ op: 'eq', left: junkRef, right: lit('GB') })).toBe(false)
    // Unreadable, not false: `not` passes it through rather than inverting it
    // into a reason to show the component.
    expect(check({ op: 'not', condition: { op: 'truthy', value: junkRef } })).toBe(false)
  })

  it('reads a row-scoped ref outside a row as nothing rather than as the form value', () => {
    /*
     * The `row` argument, which this file never passed. `scope: 'row'` reads the
     * enclosing row and deliberately does not fall back to the form, so outside
     * a repeater it answers nothing -- and passing a row makes it answer that
     * row.
     */
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
    /*
     * Every operand in this describe is a finite integer, so `a - b` and a pair
     * of comparisons answer identically and the fix here was undefended.
     * `Infinity - Infinity` is `NaN`, `NaN >= 0` is false, and a `gte` between
     * two equal values then hid the component -- and its whole subtree left
     * `validateForm` with it, so a required answer became optional. A host can
     * hand an infinity over as a context value, which is how it arrives.
     */
    const inf: FormData = { limit: Infinity, floor: -Infinity }

    expect(check({ op: 'gte', left: ref('limit'), right: lit(Infinity) }, inf)).toBe(true)
    expect(check({ op: 'lte', left: ref('limit'), right: lit(Infinity) }, inf)).toBe(true)
    expect(check({ op: 'gt', left: ref('limit'), right: lit(Infinity) }, inf)).toBe(false)
    expect(check({ op: 'lte', left: ref('floor'), right: lit(-Infinity) }, inf)).toBe(true)

    // And an infinity still orders against a finite number.
    expect(check({ op: 'gt', left: ref('limit'), right: lit(0) }, inf)).toBe(true)
    expect(check({ op: 'lt', left: ref('floor'), right: lit(0) }, inf)).toBe(true)
  })

  it('answers false for a comparison against NaN, in both directions', () => {
    // Unordered, like a string against a number: `NaN` compares false to
    // everything including itself, and guessing an answer would be worse.
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

describe('a field named after something on the prototype', () => {
  /*
   * `data['toString']` finds a function on Object.prototype. A plain lookup
   * makes a field nobody answered read as present and truthy, and visibility
   * and validation would then disagree with the form the user is looking at.
   */
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
    /*
     * `key in b` counts the prototype chain, so an object that merely inherits
     * the key it is missing compared equal to one that really holds it. Same
     * own-property rule `valueOf` follows.
     */
    /*
     * The own-key counts have to match, or the length check answers first and
     * the comparison never reaches the line under test. The first version of
     * this test gave `inherits` one own key against two, so it passed against
     * the bug it was written for.
     */
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
    /*
     * `country` is both a field and a context path here, holding different
     * values on purpose. Merging the two would make which one a rule reads
     * depend on what the host happened to name a key, and the form author who
     * wrote the rule cannot see the host's names at all.
     */
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
    // This is the quiet failure `contextKeys` and `missingContext` exist for:
    // it is indistinguishable here from a context that has no such key, and a
    // form still has to render for the person filling it in.
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
    // Nesting is where threading an extra argument usually gets dropped.
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

/**
 * An operand this code cannot read at all.
 *
 * `evaluate` already tells "cannot read this" apart from "false", and the file
 * says why: negating a malformed condition turned false into true and **showed**
 * a component whose rule the code could not read. That distinction was made for
 * a malformed *condition* and never reached a malformed *operand* — an operand
 * whose `kind` is a typo returned `undefined`, which every branch then treated
 * as a value it had successfully read.
 *
 * So `not` inverted it, and two of them compared equal to each other.
 * `validateDocument` refuses these now; this is the answer for the document
 * that never went through it.
 */
describe('a malformed operand', () => {
  const bad = { kind: 'refs', dataKey: 'a' } as unknown as Operand
  const alsoBad = { kind: 'ref' } as unknown as Operand

  it('makes the condition false, not true', () => {
    expect(evaluateCondition({ op: 'truthy', value: bad }, { a: 1 })).toBe(false)
  })

  it('is not turned into "shown" by a not', () => {
    // The failure. `not` is the one operator that can turn "I could not read
    // this" into "show it", which is the opposite of what every other unreadable
    // thing here does.
    expect(
      evaluateCondition({ op: 'not', condition: { op: 'truthy', value: bad } }, { a: 1 }),
    ).toBe(false)
  })

  it('does not compare equal to another one', () => {
    // Both read as `undefined`, and `undefined` equals `undefined`, so two
    // unreadable operands used to satisfy an `eq` and show the component.
    expect(evaluateCondition({ op: 'eq', left: bad, right: alsoBad }, {})).toBe(false)
  })

  it('does not satisfy an emptiness test', () => {
    // `empty` on an unreadable operand is not "the field is empty". It is "there
    // is no field here", and answering true shows the component.
    expect(evaluateCondition({ op: 'empty', value: bad }, {})).toBe(false)
    expect(evaluateCondition({ op: 'notEmpty', value: bad }, {})).toBe(false)
  })

  it('does not let a membership test pass on nothing', () => {
    expect(evaluateCondition({ op: 'notIn', value: bad, options: ['x'] }, {})).toBe(false)
  })

  it('leaves a readable operand that holds nothing alone', () => {
    /*
     * The control, and the distinction that matters. A `ref` naming a field
     * nobody has filled in is perfectly readable and reads as `undefined` —
     * that is an unanswered question, not a broken document, and `empty` on it
     * is true.
     */
    expect(evaluateCondition({ op: 'empty', value: { kind: 'ref', dataKey: 'a' } }, {})).toBe(true)
    expect(
      evaluateCondition(
        { op: 'not', condition: { op: 'empty', value: { kind: 'ref', dataKey: 'a' } } },
        {},
      ),
    ).toBe(false)
  })
})

/**
 * Two of the branches a condition can nest through, and only two.
 *
 * This block was written as though it covered `evaluate` and `same`, and for a
 * year it covered `not` and object nesting: the two recursions that already
 * propagated their depth. `and`, `or` and arrays dropped it, so the three
 * branches an author's nesting actually goes through were unbounded the whole
 * time these tests were green. A test that exercises the branch which never had
 * the bug is the review's cross-cutting theme in one file.
 *
 * `depth.test.ts` is now the table over every walker, one row per branch, and it
 * is the file to add to. These stay because a `not` chain and a nested object
 * are still worth pinning, and because the names now say which two they are.
 */
describe('a condition nested beyond any reasonable depth, through not and through objects', () => {
  /** `not(not(not(…)))`, n deep. */
  const deep = (n: number): Condition => {
    let condition: Condition = { op: 'truthy', value: { kind: 'literal', value: true } }
    for (let i = 0; i < n; i += 1) condition = { op: 'not', condition }
    return condition
  }

  it('answers rather than throwing, for a chain of not', () => {
    expect(() => evaluateCondition(deep(50_000), {})).not.toThrow()
  })

  it('answers false, because it could not read it', () => {
    // The same answer every unreadable condition gets, and for the same reason:
    // hidden is what this project says about a rule it cannot evaluate.
    expect(evaluateCondition(deep(50_000), {})).toBe(false)
  })

  it('still evaluates a condition a person would write', () => {
    // The control. A limit low enough to catch real authoring would be worse
    // than the crash: it would silently hide components.
    expect(evaluateCondition(deep(20), {})).toBe(true)
  })

  it('does not throw comparing values nested through lists', () => {
    /*
     * The object case below was the only one, and it is the branch that always
     * carried `depth + 1`. The array branch dropped it, so the bound counted
     * only the levels reached through objects and a list inside a list inside a
     * list recursed with nothing stopping it. Two equally deep arrays are the
     * shape that reaches it: `same` returns early on a length mismatch, so both
     * sides have to nest together.
     */
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
    // The control, again: a bound low enough to refuse real data would answer
    // `ne` on two identical lists and show a component that should be hidden.
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

/**
 * A membership test whose options are not a list.
 *
 * Every branch in `evaluate` answers `undefined` for a shape it cannot read, and
 * `not` passes that through rather than inverting it -- which is the whole
 * reason the distinction exists and is explained three comments above the
 * branch. `in` and `notIn` answered `false`, so `not(in(x, "oops"))` was `true`
 * and a component whose rule nobody can read was *shown*.
 */
describe('a membership condition whose options are malformed', () => {
  const malformed = (op: 'in' | 'notIn'): Condition => ({
    op,
    value: { kind: 'literal', value: 'a' },
    options: 'not-a-list' as never,
  })

  it.each(['in', 'notIn'] as const)('reads %s as unreadable rather than false', (op) => {
    // The boundary turns unreadable into hidden, which is what an unreadable
    // rule gets everywhere else in this file.
    expect(evaluateCondition(malformed(op), {})).toBe(false)
  })

  it.each(['in', 'notIn'] as const)('does not show the component when %s is negated', (op) => {
    /*
     * The half that matters. `false` inverted is `true`: the component whose
     * rule could not be read was the one that appeared.
     */
    expect(evaluateCondition({ op: 'not', condition: malformed(op) }, {})).toBe(false)
  })

  it('still answers a membership test whose options are a list', () => {
    // The controls, in both directions.
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
