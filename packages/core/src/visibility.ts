import { evaluateCondition } from './condition.js'
import { unreadableTag } from './exhaustive.js'
import { expressionData } from './rows.js'
import type { ComponentNode, FormData } from './types.js'
import type { EvalOptions } from './validation.js'

/** A throw reads as hidden, like a missing evaluator: `resolveProp` gives null for both. */
function runs(
  evaluate: NonNullable<EvalOptions['evaluate']>,
  expression: string,
  data: FormData,
  options: EvalOptions,
): boolean {
  try {
    const scoped = expressionData(data, options.row)
    return Boolean(evaluate(expression, scoped, options.context))
  } catch {
    return false
  }
}

export function isVisible(node: ComponentNode, data: FormData, options: EvalOptions = {}): boolean {
  if (!node || typeof node !== 'object') return true

  const when = node.renderWhen
  if (!when) return true

  switch (when.kind) {
    case 'static':
      return Boolean(when.value)

    // Hidden without an evaluator, to agree with the renderer: `resolveProp`
    // gives a computed binding null, and a null `renderWhen` renders nothing.
    case 'computed':
      return options.evaluate ? runs(options.evaluate, when.expression, data, options) : false

    // A translation key is not a condition: treating it as one would hide a component whenever
    // its bundle is missing.
    case 'i18n':
      return true

    case 'condition':
      if (!when.condition) return true
      return evaluateCondition(when.condition, data, options.context, options.row)

    /*
     * An unreadable kind expresses no condition, so shown, as for `i18n`.
     * `evaluateCondition` answers whether a condition holds; this answers
     * whether one was expressed, and hiding would drop the subtree from
     * validation over a typo.
     */
    default:
      return unreadableTag(when, true)
  }
}
