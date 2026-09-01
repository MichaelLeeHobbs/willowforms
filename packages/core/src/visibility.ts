/**
 * Whether a component is shown.
 *
 * This exists so that validation and rendering cannot disagree. They used to:
 * the renderer honoured `renderWhen` and skipped a hidden node, while
 * `validateForm` walked every node in the tree and validated it regardless. A
 * required field hidden by a condition therefore failed a submit with an error
 * nobody could see or fix, which is the worst kind of form bug and precisely the
 * class of failure this project set out to beat.
 *
 * One function, both callers. A visibility rule that lives in two places is a
 * visibility rule that will drift.
 */

import { evaluateCondition } from './condition.js'
import { unreadableTag } from './exhaustive.js'
import type { ComponentNode, FormData } from './types.js'
import type { EvalOptions } from './validation.js'

/**
 * A host's evaluator, run without letting it take the caller down.
 *
 * The evaluator is arbitrary JavaScript and the expression is authored a
 * character at a time, so it is a syntax error or a null dereference for most
 * of the time it is being typed. `matchesPattern` in `validation.ts` catches for
 * exactly this and its comment records the incident: an uncaught throw "took
 * Preview down in the browser and surfaced as an unhandled 500 on the server".
 * This called straight through.
 *
 * A throw reads as hidden, which is the answer a missing evaluator already gets
 * one case up — and this function's job is to agree with what the renderer
 * draws, which in both cases is nothing.
 */
function runs(
  evaluate: NonNullable<EvalOptions['evaluate']>,
  expression: string,
  data: FormData,
  options: EvalOptions,
): boolean {
  try {
    /*
     * The row's answers first, the form's underneath, exactly as the `custom`
     * rule scopes its own expression.
     *
     * A `computed` `renderWhen` on a field inside a repeater was evaluated
     * against the top-level data, so an expression reading a per-row answer
     * read the (usually absent) form-level key instead, came back falsy, and
     * hid that field in *every* row -- taking it out of `validateForm` with it,
     * which is a required answer quietly becoming optional. The `condition`
     * case one branch down has always passed `options.row`.
     */
    const scoped = options.row ? { ...data, ...options.row.values } : data
    return Boolean(evaluate(expression, scoped, options.context))
  } catch {
    return false
  }
}

export function isVisible(node: ComponentNode, data: FormData, options: EvalOptions = {}): boolean {
  /*
   * The node is checked before it is read, like every other document walker in
   * the package and unlike this one until now. It is the first thing
   * `validateForm`'s walk calls, on a walk that did not filter its children
   * either, so `"children": [null]` threw here during both render and
   * server-side validation.
   *
   * Visible is the answer for a node that is not one: hidden would take a
   * subtree out of validation, which is the permissive direction, and there is
   * nothing here to hide.
   */
  if (!node || typeof node !== 'object') return true

  const when = node.renderWhen
  if (!when) return true

  switch (when.kind) {
    case 'static':
      return Boolean(when.value)

    /*
     * No evaluator means no answer, and the renderer already treats that as
     * hidden: `resolveProp` returns null for a computed binding without a
     * sandbox, and a null `renderWhen` renders nothing. Validation follows,
     * because agreeing with what the user sees matters more than guessing.
     */
    case 'computed':
      return options.evaluate ? runs(options.evaluate, when.expression, data, options) : false

    /*
     * A translation key is not a condition. Treating it as one would hide a
     * component whenever its bundle happened to be missing, so this reads as
     * "no condition expressed" instead.
     */
    case 'i18n':
      return true

    /*
     * The reason this kind exists. A structured condition needs no evaluator,
     * so a form with conditional visibility works in a host that injected
     * nothing at all.
     */
    case 'condition':
      /*
       * A `condition` kind with no condition on it expresses no rule, so it is
       * shown -- the same answer `i18n` and an unrecognised kind get, for the
       * reason spelled out at both: this function is asked whether a rule was
       * expressed, not whether one holds.
       *
       * It was passed straight to `evaluateCondition`, which correctly reads a
       * missing condition as unreadable and answers false, so the node and its
       * whole subtree left the DOM *and* left `validateForm` -- a required
       * answer quietly becoming advisory on the server. That is the exact
       * failure the `default` branch below was written for, reached by one
       * missing property in a hand-edited document instead of by one mistyped
       * character. `tree.ts` reports this shape; nothing on the validate path
       * calls it.
       */
      if (!when.condition) return true
      return evaluateCondition(when.condition, data, options.context, options.row)

    /*
     * A kind this code does not have. Shown, which is the same answer `i18n`
     * gets one case up and for the same reason: a tag that is not a condition
     * expresses no condition, and the absence of a rule means shown.
     *
     * Not the answer `evaluateCondition` gives, and the two questions are
     * different. That one is asked whether a condition *holds*, and an
     * unreadable one does not hold. This one is asked whether a rule was
     * expressed at all, and answering "hidden" to that takes the node and its
     * whole subtree out of validation over a typo.
     */
    default:
      return unreadableTag(when, true)
  }
}
