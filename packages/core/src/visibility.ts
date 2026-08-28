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
import type { ComponentNode, FormData } from './types.js'
import type { EvalOptions } from './validation.js'

export function isVisible(node: ComponentNode, data: FormData, options: EvalOptions = {}): boolean {
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
      return options.evaluate
        ? Boolean(options.evaluate(when.expression, data, options.context))
        : false

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
      return evaluateCondition(when.condition, data, options.context)
  }
}
