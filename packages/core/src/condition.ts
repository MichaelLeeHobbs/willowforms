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

import { isEmpty, readPath, valueOf } from './json.js'
import type { RowContext } from './rows.js'
import type { Condition, FormContext, FormData, JsonValue, Operand } from './types.js'

/** Deep equality over JSON, which is the only equality a document can express. */
export function same(a: JsonValue | undefined, b: JsonValue | undefined, depth = 0): boolean {
  // Beyond the bound, two values are not equal. Refusing to answer would make
  // `ne` true, which shows a component whose rule could not be read.
  if (depth > MAX_CONDITION_DEPTH) return false
  if (a === b) return true
  if (a === undefined || b === undefined || a === null || b === null) return false
  if (typeof a !== 'object' || typeof b !== 'object') return false

  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false
    // `depth + 1`, like the object branch below. This dropped it, so the bound
    // above counted only the levels reached through objects and a list nested
    // inside a list inside a list recursed without one.
    return a.every((item, i) => same(item, b[i], depth + 1))
  }

  const keys = Object.keys(a)
  if (keys.length !== Object.keys(b).length) return false
  /*
   * `Object.hasOwn`, not `in`: `in` counts inherited properties, so an object
   * that merely inherits the key it is missing would compare equal to one that
   * really holds it. The same own-property rule `valueOf` follows, and missed
   * here when that one was written.
   */
  return keys.every((key) => Object.hasOwn(b, key) && same(a[key], b[key], depth + 1))
}

/**
 * How deep a stored structure this will walk before giving up.
 *
 * `evaluate` and `same` both recurse, in functions whose whole contract is that
 * they are total — and a document is data, so the nesting is whatever somebody
 * stored. A `RangeError` out of `isVisible` is an unhandled 500 on submit and a
 * blank form in the browser, which is the one outcome "total" exists to rule
 * out.
 *
 * High enough that nothing a person authors can reach it: the panel draws
 * nesting by indentation in a 288px pane, and a hundred levels is already
 * unreadable. Low enough that the stack does not.
 *
 * Exported because four other walkers cross a condition and every one of them
 * has to stop where the evaluator stops. `validateDocument` bounded at 500
 * would pass a condition `evaluate` reads as unreadable at 200, so the gate
 * would accept documents the renderer cannot answer — which is the gate saying
 * the opposite of what it exists to say. One number, imported, rather than a
 * second one that agrees today.
 */
export const MAX_CONDITION_DEPTH = 200

/**
 * An operand this code cannot read at all.
 *
 * Told apart from an operand that reads `undefined`, and the two are genuinely
 * different questions. A `ref` naming a field nobody has filled in is perfectly
 * readable and reads as nothing — that is an unanswered question, and `empty`
 * on it is true. An operand whose `kind` is a typo is not an operand.
 *
 * Collapsing the two is how `not` turned "I could not read this" into "show
 * it": `truthy` on an unreadable operand was false, and negating false is true.
 * This file already made that distinction for a malformed *condition*, with a
 * comment saying exactly why; it never reached the operands inside one.
 */
const UNREADABLE = Symbol('unreadable operand')

type Reading = JsonValue | undefined | typeof UNREADABLE

/**
 * Both operand shapes, and anything else.
 *
 * A document is data and reaches here straight from the JSON editor, so an
 * operand can be missing, a string, or a shape nobody designed. Saying so keeps
 * this function total. `validateDocument` is the place to tell an author their
 * condition is malformed; the renderer's job is to stay on screen, because a
 * form that crashes cannot be fixed by the person filling it in.
 */
function operand(
  value: Operand | undefined,
  data: FormData,
  context: FormContext | undefined,
  row: RowContext | undefined,
): Reading {
  if (!value || typeof value !== 'object') return UNREADABLE
  if (value.kind === 'literal') {
    // A literal with no `value` at all reads as nothing, which is a value: an
    // author who cleared the box meant the empty answer.
    return value.value
  }
  if (value.kind === 'ref') {
    if (typeof value.dataKey !== 'string') return UNREADABLE

    /*
     * `row` reads the enclosing row and nothing else. There is deliberately no
     * fallback to the form when the row has no such field: once a name can mean
     * either, no caller can tell which one it got, and the fix is always another
     * flavour of path. An unreadable ref is `undefined`, like every other one.
     */
    if (value.scope === 'row') return row ? valueOf(row.values, value.dataKey) : undefined

    return valueOf(data, value.dataKey)
  }
  /*
   * A context the host never supplied reads the same as a context that has no
   * such key, and that is deliberate. Core cannot usefully tell "you forgot to
   * wire this up" from "there is no such key" here, and guessing would make one
   * of them behave differently for no reason a form author could see.
   *
   * Wiring is a boot-time question, so it gets a boot-time answer: `contextKeys`
   * names every path a document reads, and a host asserts against it once.
   */
  if (value.kind === 'context') {
    if (typeof value.path !== 'string') return UNREADABLE
    return readPath(context, value.path)
  }
  return UNREADABLE
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
  /*
   * Compared, not subtracted. `Infinity - Infinity` is `NaN`, so every
   * comparison between two infinities answered false and `gte` on a pair of
   * equal values hid the component -- and `JsonValue` admits an infinity
   * because a host can hand one over as a context value.
   */
  if (typeof a === 'number' && typeof b === 'number') {
    if (Number.isNaN(a) || Number.isNaN(b)) return undefined
    return a < b ? -1 : a > b ? 1 : 0
  }
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
export function evaluateCondition(
  condition: Condition,
  data: FormData,
  context?: FormContext,
  row?: RowContext,
): boolean {
  return evaluate(condition, data, context, row) ?? false
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
function evaluate(
  condition: Condition,
  data: FormData,
  context: FormContext | undefined,
  row: RowContext | undefined,
  depth = 0,
): boolean | undefined {
  if (!condition || typeof condition !== 'object') return undefined
  // Unreadable rather than false, so `not` passes it through instead of
  // inverting it into "show this".
  if (depth > MAX_CONDITION_DEPTH) return undefined

  const read = (value: Operand | undefined): Reading => operand(value, data, context, row)

  /*
   * Every branch below asks this before it answers. An operand nobody can read
   * makes the whole condition unreadable, which the boundary turns into false
   * and `not` passes through rather than inverting.
   */
  const unreadable = (...readings: Reading[]): boolean =>
    readings.some((reading) => reading === UNREADABLE)

  switch (condition.op) {
    case 'eq':
    case 'ne': {
      const left = read(condition.left)
      const right = read(condition.right)
      if (unreadable(left, right)) return undefined
      const equal = same(left as JsonValue | undefined, right as JsonValue | undefined)
      return condition.op === 'eq' ? equal : !equal
    }

    case 'gt':
    case 'gte':
    case 'lt':
    case 'lte': {
      const left = read(condition.left)
      const right = read(condition.right)
      if (unreadable(left, right)) return undefined
      const delta = order(left as JsonValue | undefined, right as JsonValue | undefined)
      if (delta === undefined) return false
      if (condition.op === 'gt') return delta > 0
      if (condition.op === 'gte') return delta >= 0
      if (condition.op === 'lt') return delta < 0
      return delta <= 0
    }

    case 'empty':
    case 'notEmpty': {
      const value = read(condition.value)
      if (unreadable(value)) return undefined
      const empty = isEmpty(value as JsonValue | undefined)
      return condition.op === 'empty' ? empty : !empty
    }

    /*
     * JavaScript truthiness, deliberately, because that is what an author who
     * ticks a checkbox expects. It is not the same as `notEmpty`: an empty
     * string is falsy and empty, but `0` is falsy and an answer.
     */
    case 'truthy':
    case 'falsy': {
      const value = read(condition.value)
      if (unreadable(value)) return undefined
      return condition.op === 'truthy' ? Boolean(value) : !value
    }

    /*
     * An empty list is a real answer: nothing is in it, and everything is not
     * in it. A list that is not a list is malformed, and malformed is false in
     * both directions, or a broken `notIn` would show the component.
     */
    case 'in':
    case 'notIn': {
      if (!Array.isArray(condition.options)) return false
      const value = read(condition.value)
      if (unreadable(value)) return undefined
      /*
       * Read once. It was read inside `.some()`, so a context operand walked
       * `readPath` again for every option in the list.
       */
      const held = condition.options.some((option) => same(value as JsonValue | undefined, option))
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
      // `depth + 1`, like `not` below. This dropped it, so `MAX_CONDITION_DEPTH` bounded
      // only chains of `not` -- and `and` and `or` are the two an author's
      // nesting actually goes through, because they are the ones the panel
      // draws a group for.
      const answers = condition.conditions.map((inner) =>
        evaluate(inner, data, context, row, depth + 1),
      )
      if (answers.includes(undefined)) return undefined
      return condition.op === 'and' ? answers.every(Boolean) : answers.some(Boolean)
    }

    case 'not': {
      const inner = condition.condition
        ? evaluate(condition.condition, data, context, row, depth + 1)
        : undefined
      return inner === undefined ? undefined : !inner
    }

    default:
      return undefined
  }
}
