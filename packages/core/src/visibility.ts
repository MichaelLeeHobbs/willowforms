import { evaluateCondition } from './condition.js'
import { unreadableTag } from './exhaustive.js'
import type { ComponentNode, FormData } from './types.js'
import type { EvalOptions } from './validation.js'

/**
 * A host's evaluator, run without letting it take the caller down. The expression is
 * authored a character at a time, so it throws for most of the time it is being typed.
 *
 * A throw reads as hidden, which is the answer a missing evaluator gets and what the
 * renderer draws: `resolveProp` gives null for both.
 */
function runs(
  evaluate: NonNullable<EvalOptions['evaluate']>,
  expression: string,
  data: FormData,
  options: EvalOptions,
): boolean {
  try {
    const scoped = options.row ? { ...data, ...options.row.values } : data
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

    /*
     * A translation key is not a condition. Treating it as one would hide a
     * component whenever its bundle happened to be missing, so this reads as
     * "no condition expressed" instead.
     */
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
