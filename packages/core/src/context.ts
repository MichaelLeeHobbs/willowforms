/**
 * What a document expects the host to hand it.
 *
 * A condition that reads context and a host that never supplies it produce the
 * quietest failure in this project. The path reads as missing, the condition is
 * false, the component is hidden, and `validateForm` skips it: a required field
 * silently becomes advisory, on the server, where nobody is looking.
 *
 * Nothing at evaluation time can fix that. Core cannot tell an unwired host from
 * a context that genuinely has no such key, and a form still has to render for
 * the person filling it in either way. But wiring is not a per-submit question,
 * it is a boot-time one, so it gets a boot-time answer: this names every path a
 * document reads, and a host asserts against it once, next to the code that
 * builds the context.
 *
 * The same shape as `autoValidateKeys`: core states what the document asked
 * for, and the host decides what to do about it.
 */

import { readPath } from './json.js'
import { flatten } from './tree.js'
import type { ComponentNode, Condition, FormContext, Operand, PropValue } from './types.js'

/** Every context path a condition anywhere in this condition reads. */
function fromCondition(condition: Condition | undefined, out: Set<string>): void {
  if (!condition || typeof condition !== 'object') return

  const operand = (value: Operand | undefined): void => {
    if (value && typeof value === 'object' && value.kind === 'context') {
      if (typeof value.path === 'string' && value.path !== '') out.add(value.path)
    }
  }

  /*
   * Read structurally rather than by `op`, because this walks documents that
   * are data and may be malformed, and because a new operator would otherwise
   * be silently excluded from the check that exists to catch omissions.
   */
  const shape = condition as Partial<Record<string, unknown>>
  operand(shape['left'] as Operand | undefined)
  operand(shape['right'] as Operand | undefined)
  operand(shape['value'] as Operand | undefined)

  if (Array.isArray(shape['conditions'])) {
    for (const inner of shape['conditions'] as Condition[]) fromCondition(inner, out)
  }
  fromCondition(shape['condition'] as Condition | undefined, out)
}

function fromPropValue(value: PropValue | undefined, out: Set<string>): void {
  if (value && typeof value === 'object' && value.kind === 'condition') {
    fromCondition(value.condition, out)
  }
}

/**
 * Every context path this document reads, in no particular order.
 *
 * Covers visibility rules, condition-bound properties, and the `when` guard on
 * a validation rule, which are the three places a `Condition` can appear.
 * Expressions are not covered and cannot be: what a string of JavaScript reads
 * is the evaluator's business, and core does not parse it.
 */
export function contextKeys(root: ComponentNode): Set<string> {
  const keys = new Set<string>()

  for (const { node } of flatten(root)) {
    fromPropValue(node.renderWhen, keys)
    for (const value of Object.values(node.props ?? {})) fromPropValue(value, keys)
    for (const rule of node.schema?.validations ?? []) fromPropValue(rule.when, keys)
  }

  return keys
}

/**
 * The paths this document reads that the context does not hold.
 *
 * Call it once at startup and fail loudly. An empty set is the only result a
 * host should accept, because every path in it is a rule that will quietly not
 * apply.
 *
 * A path is missing when it cannot be read at all, not when it holds a falsy
 * value: `false` and `0` are answers a condition is entitled to see, the same
 * rule `valueOf` and `isEmpty` follow everywhere else.
 */
export function missingContext(root: ComponentNode, context: FormContext): string[] {
  const missing: string[] = []
  for (const path of contextKeys(root)) {
    if (readPath(context, path) === undefined) missing.push(path)
  }
  return missing.sort()
}
