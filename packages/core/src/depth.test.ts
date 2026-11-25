/**
 * Every recursive walker that crosses a condition, driven past its bound.
 *
 * A document's nesting is whatever somebody stored, and a `RangeError` out of
 * any of these is an unhandled 500 on submit or a blank form in the browser. A
 * new walker that crosses a condition gets a row here.
 */

import { describe, expect, it } from 'vitest'

import type { ComponentNode, Condition, FormDocument, JsonValue, PropValue } from './types.js'
import { MAX_CONDITION_DEPTH, evaluateCondition, same } from './condition.js'
import { createDocument } from './factory.js'
import { repointBinding, validateDocument } from './tree.js'
import { rowScopeProblems } from './rows.js'
import { TOO_DEEP, submittedData, validateForm } from './validation.js'

/*
 * Far past the stack, not just past the bound: a thousand-deep structure does
 * not overflow, so an unbounded walker would still pass `not.toThrow()`.
 */
const DEPTH = 50_000

const deepList = (n: number): JsonValue => {
  let value: JsonValue = 1
  for (let i = 0; i < n; i += 1) value = [value]
  return value
}

const deepAnd = (n: number): Condition => {
  let condition: Condition = { op: 'truthy', value: { kind: 'literal', value: true } }
  for (let i = 0; i < n; i += 1) condition = { op: 'and', conditions: [condition] }
  return condition
}

const deepOr = (n: number): Condition => {
  let condition: Condition = { op: 'truthy', value: { kind: 'literal', value: true } }
  for (let i = 0; i < n; i += 1) condition = { op: 'or', conditions: [condition] }
  return condition
}

const deepTree = (n: number): ComponentNode => {
  let node: ComponentNode = {
    key: 'leaf',
    type: 'TextField',
    props: {},
    schema: { type: 'string', validations: [{ key: 'required' }] },
  }
  for (let i = 0; i < n; i += 1) {
    node = { key: 'box' + String(i), type: 'Screen', props: {}, children: [node] }
  }
  return node
}

const guardedBy = (key: string, condition: Condition): ComponentNode => ({
  key,
  type: 'TextField',
  props: {},
  renderWhen: { kind: 'condition', condition },
  schema: { type: 'string', validations: [] },
})

const documentOf = (root: ComponentNode): FormDocument => ({
  ...createDocument('Deep', 'deep'),
  root,
})

const reported = (result: unknown): { keys: string[]; said: boolean } => {
  const problems = result as { key: string; problem: string }[]
  return {
    keys: problems.map((problem) => problem.key),
    said: problems.every((problem) => problem.problem.includes('nested deeper')),
  }
}

interface Walker {
  name: string
  drive: () => unknown
  read: (result: unknown) => unknown
  answer: unknown
}

const WALKERS: Walker[] = [
  {
    name: 'same, through a list inside a list',
    drive: () => same(deepList(DEPTH), deepList(DEPTH)),
    // Two distinct structures: one value compared with itself would hit
    // `a === b` before recursing.
    read: (result) => result,
    answer: false,
  },
  {
    name: 'evaluate, through and',
    drive: () => evaluateCondition(deepAnd(DEPTH), {}),
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
     * `validateDocument` calls `rowScopeProblems`, so this document drives both
     * walkers, and each reports under its own code. A missing `row-scope` would mean
     * the ref check answered "nothing wrong" when it did not look.
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
    // Reads back the shallow rename: a walker bounded by doing nothing would
    // also not throw.
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
  {
    name: 'validateForm, through a tree deeper than the bound',
    drive: () => validateForm(deepTree(DEPTH), {}),
    read: (result) => Object.values(result as Record<string, string>).includes(TOO_DEEP),
    answer: true,
  },
  {
    name: 'submittedData, through the same tree',
    drive: () => submittedData(deepTree(DEPTH), {}),
    // The projection stops rather than refusing, so there is no payload to
    // assert beyond "it returned an object".
    read: (result) => typeof result === 'object' && result !== null,
    answer: true,
  },
]

describe('a recursive walker driven past its bound', () => {
  it.each(WALKERS)('$name answers instead of throwing', ({ drive, read, answer }) => {
    expect(drive).not.toThrow()
    expect(read(drive())).toEqual(answer)
  })

  it('still walks everything a person would author', () => {
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
