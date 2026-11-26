/** A closed vocabulary, not a language: see docs/spec/01-document-model.md#conditions. */

import { isEmpty, readPath, valueOf } from './json.js'
import type { RowContext } from './rows.js'
import type { Condition, FormContext, FormData, JsonValue, Operand } from './types.js'

export function same(a: JsonValue | undefined, b: JsonValue | undefined, depth = 0): boolean {
  if (a === b) return true
  if (depth > MAX_CONDITION_DEPTH) return false
  if (a === undefined || b === undefined || a === null || b === null) return false
  if (typeof a !== 'object' || typeof b !== 'object') return false

  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false
    return a.every((item, i) => same(item, b[i], depth + 1))
  }

  const keys = Object.keys(a)
  if (keys.length !== Object.keys(b).length) return false
  return keys.every((key) => Object.hasOwn(b, key) && same(a[key], b[key], depth + 1))
}

/**
 * `evaluate` and `same` are total, and a stored document nests as deep as whoever wrote it
 * chose: a `RangeError` out of `isVisible` is an unhandled 500 on submit and a blank form
 * in the browser.
 *
 * Every walker that crosses a condition has to stop where the evaluator stops: a gate with
 * a higher bound would accept documents the renderer cannot answer.
 */
export const MAX_CONDITION_DEPTH = 200

const UNREADABLE = Symbol('unreadable operand')

type Reading = JsonValue | undefined | typeof UNREADABLE

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

    // `row` never falls back to the form: once a name can mean either, no caller can tell
    // which one it got.
    if (value.scope === 'row') return row ? valueOf(row.values, value.dataKey) : undefined

    return valueOf(data, value.dataKey)
  }
  /*
   * An unsupplied context reads like a missing key, deliberately: core cannot
   * tell the two apart. `contextKeys` is the boot-time check for wiring.
   */
  if (value.kind === 'context') {
    if (typeof value.path !== 'string') return UNREADABLE
    return readPath(context, value.path)
  }
  return UNREADABLE
}

function order(a: JsonValue | undefined, b: JsonValue | undefined): number | undefined {
  if (typeof a === 'number' && typeof b === 'number') {
    if (Number.isNaN(a) || Number.isNaN(b)) return undefined
    return a < b ? -1 : a > b ? 1 : 0
  }
  if (typeof a === 'string' && typeof b === 'string') return a < b ? -1 : a > b ? 1 : 0
  return undefined
}

/**
 * Total, and false for anything it cannot understand: a document can be hand-edited, and
 * "hidden" is the answer to every question this cannot answer.
 */
export function evaluateCondition(
  condition: Condition,
  data: FormData,
  context?: FormContext,
  row?: RowContext,
): boolean {
  return evaluate(condition, data, context, row) ?? false
}

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
   * An unreadable operand makes the whole condition unreadable: false at the
   * boundary, and passed through rather than inverted by `not`.
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

      if (delta === undefined) return undefined
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

    case 'truthy':
    case 'falsy': {
      const value = read(condition.value)
      if (unreadable(value)) return undefined
      return condition.op === 'truthy' ? Boolean(value) : !value
    }

    case 'in':
    case 'notIn': {
      if (!Array.isArray(condition.options)) return undefined
      const value = read(condition.value)
      if (unreadable(value)) return undefined
      const held = condition.options.some((option) => same(value as JsonValue | undefined, option))
      return condition.op === 'in' ? held : !held
    }

    case 'and':
    case 'or': {
      if (!Array.isArray(condition.conditions)) return undefined
      /*
       * No short-circuit: an unreadable branch anywhere must make the group
       * unreadable, or `or(true, <broken>)` would show the component.
       */
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
