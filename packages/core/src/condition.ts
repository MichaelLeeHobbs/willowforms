/**
 * Structured conditions, evaluated without a sandbox.
 *
 * `renderWhen` could only be an expression, and an expression needs the
 * host-injected evaluator, so conditional visibility — the most common dynamic
 * behaviour a form has — required a JavaScript sandbox and a hand-edited
 * document. A form that cannot show its second field without a sandbox needed
 * one long before anyone pressed a button.
 *
 * This is a closed vocabulary, not a language. The comparisons a form author
 * actually writes are few and finite, so they can be enumerated, given a picker
 * in the panel, and evaluated here in plain TypeScript. The moment it grows
 * arithmetic it has become a language, and expressions already are one: they
 * stay the evaluator's job, as the escape hatch rather than the only door.
 */

import { isEmpty } from './json.js'
import type { Condition, FormData, JsonValue, Operand } from './types.js'

/** Deep equality over JSON, which is the only equality a document can express. */
function same(a: JsonValue | undefined, b: JsonValue | undefined): boolean {
  if (a === b) return true
  if (a === undefined || b === undefined || a === null || b === null) return false
  if (typeof a !== 'object' || typeof b !== 'object') return false

  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false
    return a.every((item, i) => same(item, b[i]))
  }

  const keys = Object.keys(a)
  if (keys.length !== Object.keys(b).length) return false
  return keys.every((key) => key in b && same(a[key], b[key]))
}

/**
 * Both operand shapes, and anything else.
 *
 * A document is data and reaches here straight from the JSON editor, so an
 * operand can be missing, a string, or a shape nobody designed. Treating that
 * as "no value" keeps this function total. `validateDocument` is the place to
 * tell an author their condition is malformed; the renderer's job is to stay
 * on screen, because a form that crashes cannot be fixed by the person filling
 * it in.
 */
function operand(value: Operand | undefined, data: FormData): JsonValue | undefined {
  if (!value || typeof value !== 'object') return undefined
  if (value.kind === 'literal') return value.value
  if (value.kind === 'ref')
    return typeof value.dataKey === 'string' ? data[value.dataKey] : undefined
  return undefined
}

/**
 * Ordering, for the four comparisons that need it.
 *
 * Numbers compare numerically and strings lexicographically, which is what
 * makes an ISO date work without a date type: `2026-01-31` sorts correctly as
 * text, and that is why the date components store ISO strings.
 *
 * Anything else is unordered and the comparison is false rather than coerced.
 * `'10' > 9` has no answer a form author would predict, so it does not get one.
 */
function order(a: JsonValue | undefined, b: JsonValue | undefined): number | undefined {
  if (typeof a === 'number' && typeof b === 'number') return a - b
  if (typeof a === 'string' && typeof b === 'string') return a < b ? -1 : a > b ? 1 : 0
  return undefined
}

/**
 * Whether a condition holds against the current form data.
 *
 * Total, and false for anything it cannot understand. A document is data and
 * can be hand-edited, so an unrecognised `op` is reachable; returning false
 * matches what a computed condition does without an evaluator, which keeps
 * "hidden" the answer to every question this cannot answer.
 */
export function evaluateCondition(condition: Condition, data: FormData): boolean {
  return evaluate(condition, data) ?? false
}

/**
 * The same question, with "cannot read this" told apart from "false".
 *
 * The distinction exists for `not`, and only for `not`. Negating a malformed
 * condition turned false into true and **showed** a component whose rule the
 * code could not read, which is the opposite of the invariant above. Collapsing
 * unreadable to false at the boundary and inverting it inside is exactly the
 * bug, so the inversion has to happen where the difference is still visible.
 *
 * Unreadable propagates through `and` and `or` too. A group containing a part
 * nobody can read is a group nobody can read, and answering from the remainder
 * would be guessing.
 */
function evaluate(condition: Condition, data: FormData): boolean | undefined {
  if (!condition || typeof condition !== 'object') return undefined

  switch (condition.op) {
    case 'eq':
      return same(operand(condition.left, data), operand(condition.right, data))
    case 'ne':
      return !same(operand(condition.left, data), operand(condition.right, data))

    case 'gt':
    case 'gte':
    case 'lt':
    case 'lte': {
      const delta = order(operand(condition.left, data), operand(condition.right, data))
      if (delta === undefined) return false
      if (condition.op === 'gt') return delta > 0
      if (condition.op === 'gte') return delta >= 0
      if (condition.op === 'lt') return delta < 0
      return delta <= 0
    }

    case 'empty':
      return isEmpty(operand(condition.value, data))
    case 'notEmpty':
      return !isEmpty(operand(condition.value, data))

    /*
     * JavaScript truthiness, deliberately, because that is what an author who
     * ticks a checkbox expects. It is not the same as `notEmpty`: an empty
     * string is falsy and empty, but `0` is falsy and an answer.
     */
    case 'truthy':
      return Boolean(operand(condition.value, data))
    case 'falsy':
      return !operand(condition.value, data)

    /*
     * An empty list is a real answer: nothing is in it, and everything is not
     * in it. A list that is not a list is malformed, and malformed is false in
     * both directions, or a broken `notIn` would show the component.
     */
    case 'in':
    case 'notIn': {
      if (!Array.isArray(condition.options)) return false
      const held = condition.options.some((option) => same(operand(condition.value, data), option))
      return condition.op === 'in' ? held : !held
    }

    /*
     * An empty `and` is true and an empty `or` is false, which is what those
     * operations mean over no arguments, and it means a half-built condition in
     * the panel behaves predictably rather than throwing.
     *
     * A `conditions` that is not a list at all is a different thing, and it has
     * to be told apart: routing it through an empty array would make `and` true
     * and show a component whose visibility rule is broken.
     */
    case 'and':
    case 'or': {
      if (!Array.isArray(condition.conditions)) return undefined
      const answers = condition.conditions.map((inner) => evaluate(inner, data))
      if (answers.includes(undefined)) return undefined
      return condition.op === 'and' ? answers.every(Boolean) : answers.some(Boolean)
    }

    case 'not': {
      const inner = condition.condition ? evaluate(condition.condition, data) : undefined
      return inner === undefined ? undefined : !inner
    }

    default:
      return undefined
  }
}
