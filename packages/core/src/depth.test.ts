/**
 * Every recursive walker that crosses a condition, driven past its bound.
 *
 * One walker was bounded and the five beside it were not. `evaluate` counted
 * depth through `not` and dropped it through `and` and `or`; `same` counted it
 * through objects and dropped it through arrays; `validateDocument`'s outer
 * `visit` had `MAX_TREE_DEPTH` and the condition walker nested inside it, in the
 * function documented as total, had nothing. So the existing depth tests were
 * green while five of six branches an author's nesting actually goes through
 * were unbounded — `condition.test.ts` nested only `not`, which is the one
 * recursion that already propagated depth.
 *
 * A document is data. The nesting is whatever somebody stored, and a
 * `RangeError` out of any of these is an unhandled 500 on submit or a blank form
 * in the browser. Each row below drives one walker through the branch that
 * lacked the bound and asserts it reports something rather than throwing.
 *
 * Table-driven on purpose. A sixth walker added later is a row, and a row that
 * is not added is a hole somebody can see.
 */

import { describe, expect, it } from 'vitest'

import type { ComponentNode, Condition, FormDocument, JsonValue, PropValue } from './types.js'
import { MAX_CONDITION_DEPTH, evaluateCondition, same } from './condition.js'
import { createDocument } from './factory.js'
import { repointBinding, validateDocument } from './tree.js'
import { rowScopeProblems } from './rows.js'

/*
 * Far past the bound and far past the stack. The same figure `condition.test.ts`
 * already uses, which is known to produce a `RangeError` on every one of these
 * walkers when they are unbounded.
 */
const DEPTH = 50_000

/** `[[[…1…]]]`, n deep. Built with a loop, or building it would overflow too. */
const deepList = (n: number): JsonValue => {
  let value: JsonValue = 1
  for (let i = 0; i < n; i += 1) value = [value]
  return value
}

/** `and(and(and(…)))`, n deep, ending on something readable. */
const deepAnd = (n: number): Condition => {
  let condition: Condition = { op: 'truthy', value: { kind: 'literal', value: true } }
  for (let i = 0; i < n; i += 1) condition = { op: 'and', conditions: [condition] }
  return condition
}

/** `or(or(or(…)))`, the other half of the branch that dropped its depth. */
const deepOr = (n: number): Condition => {
  let condition: Condition = { op: 'truthy', value: { kind: 'literal', value: true } }
  for (let i = 0; i < n; i += 1) condition = { op: 'or', conditions: [condition] }
  return condition
}

const guardedBy = (key: string, condition: Condition): ComponentNode => ({
  key,
  type: 'TextField',
  props: {},
  renderWhen: { kind: 'condition', condition },
  schema: { type: 'string', validations: [] },
})

/*
 * Through the factory. A hand-written envelope is trap 5 -- a fixture shaped
 * more simply than anything the product builds -- and it showed up immediately:
 * the first version of this file quoted `version: 1` where `createDocument`
 * writes `'1'`, so `validateDocument` reported three envelope problems that had
 * nothing to do with depth.
 */
const documentOf = (root: ComponentNode): FormDocument => ({
  ...createDocument('Deep', 'deep'),
  root,
})

/** Which nodes `rowScopeProblems` named, and whether it said why. */
const reported = (result: unknown): { keys: string[]; said: boolean } => {
  const problems = result as { key: string; problem: string }[]
  return {
    keys: problems.map((problem) => problem.key),
    said: problems.every((problem) => problem.problem.includes('nested deeper')),
  }
}

interface Walker {
  /** The function, and the branch that had no bound. */
  name: string
  /** Drive it past the bound. A throw here is the defect this row is about. */
  drive: () => unknown
  /** The result cut down to the fact this row is about. */
  read: (result: unknown) => unknown
  /** What a bounded walker answers instead of throwing. */
  answer: unknown
}

const WALKERS: Walker[] = [
  {
    name: 'same, through a list inside a list',
    drive: () => same(deepList(DEPTH), deepList(DEPTH)),
    /*
     * Two distinct structures, not one value compared with itself, or the
     * `a === b` line above the bound would answer before recursing and the row
     * would prove nothing. Past the bound they are not equal, which is what
     * `same` already documents: refusing to answer would make `ne` true and show
     * a component whose rule could not be read.
     */
    read: (result) => result,
    answer: false,
  },
  {
    name: 'evaluate, through and',
    drive: () => evaluateCondition(deepAnd(DEPTH), {}),
    // Unreadable, which the boundary turns into false: hidden is what this
    // project says about a rule it cannot evaluate.
    read: (result) => result,
    answer: false,
  },
  {
    name: 'evaluate, through or',
    drive: () => evaluateCondition(deepOr(DEPTH), {}),
    read: (result) => result,
    answer: false,
  },
  {
    name: "validateDocument's condition walker, inside the function documented as total",
    drive: () =>
      validateDocument(
        documentOf({
          key: 'root',
          type: 'Screen',
          props: {},
          children: [guardedBy('deep', deepAnd(DEPTH))],
        }),
      ),
    /*
     * Both walkers report, under their own codes, which is what a caller
     * branches on. `validateDocument` calls `rowScopeProblems`, so this one
     * document drives two of the seven rows and neither may go quiet: a missing
     * `row-scope` would mean the ref check answered "nothing wrong" when what
     * happened was "did not look".
     */
    read: (result) => {
      const errors = result as { code: string; message: string }[]
      return {
        codes: errors.map((error) => error.code).sort(),
        said: errors.every((error) => error.message.includes('nested deeper')),
      }
    },
    answer: { codes: ['malformed', 'row-scope'], said: true },
  },
  {
    name: "repointBinding's inCondition",
    drive: () =>
      repointBinding(
        {
          kind: 'condition',
          condition: {
            op: 'and',
            conditions: [
              {
                op: 'eq',
                left: { kind: 'context', path: 'step' },
                right: { kind: 'literal', value: 'before' },
              },
              deepAnd(DEPTH),
            ],
          },
        },
        'before',
        'after',
      ),
    /*
     * The shallow half still gets rewritten. Bounding a walker by making it stop
     * doing its job would be a second bug wearing the fix's clothes, so the row
     * reads back the rename it exists to perform.
     */
    read: (result) => {
      const value = result as PropValue & { condition: { conditions: Condition[] } }
      return (value.condition.conditions[0] as { right: { value: string } }).right.value
    },
    answer: 'after',
  },
  {
    name: 'rowScopeProblems, walking a condition on a node inside a repeater',
    drive: () =>
      rowScopeProblems({
        key: 'root',
        type: 'Screen',
        props: {},
        children: [
          {
            key: 'addressList',
            dataKey: 'addresses',
            type: 'Repeater',
            props: {},
            schema: { type: 'array', validations: [] },
            children: [guardedBy('street', deepAnd(DEPTH))],
          },
        ],
      }),
    read: (result) => reported(result),
    answer: { keys: ['street'], said: true },
  },
  {
    name: 'rowScopeProblems, walking a condition on a node outside every repeater',
    drive: () =>
      rowScopeProblems({
        key: 'root',
        type: 'Screen',
        props: {},
        children: [guardedBy('loose', deepAnd(DEPTH))],
      }),
    read: (result) => reported(result),
    answer: { keys: ['loose'], said: true },
  },
]

describe('a recursive walker driven past its bound', () => {
  it.each(WALKERS)('$name answers instead of throwing', ({ drive, read, answer }) => {
    expect(drive).not.toThrow()
    // Driven again rather than captured inside the matcher, so a row that throws
    // fails on the throw above rather than on a confusing undefined below.
    expect(read(drive())).toEqual(answer)
  })

  it('still walks everything a person would author', () => {
    /*
     * The control, and the reason the bound is 200 rather than 20. A limit low
     * enough to catch real authoring would be worse than the crash: conditions
     * would silently stop being read and components would silently disappear.
     */
    expect(evaluateCondition(deepAnd(MAX_CONDITION_DEPTH - 1), {})).toBe(true)
    expect(same(deepList(MAX_CONDITION_DEPTH - 1), deepList(MAX_CONDITION_DEPTH - 1))).toBe(true)
    expect(
      validateDocument(
        documentOf({
          key: 'root',
          type: 'Screen',
          props: {},
          children: [guardedBy('fine', deepAnd(20))],
        }),
      ),
    ).toEqual([])
    expect(
      rowScopeProblems({
        key: 'root',
        type: 'Screen',
        props: {},
        children: [guardedBy('fine', deepAnd(20))],
      }),
    ).toEqual([])
  })
})
