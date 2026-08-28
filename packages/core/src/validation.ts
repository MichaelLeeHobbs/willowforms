/**
 * Rule evaluation.
 *
 * Pure and dependency-free, so the same rules run in the browser during preview
 * and in Node on the server. That symmetry is the point: a form's validation
 * should not be reimplemented on the backend and drift.
 *
 * Expression-backed rules ('custom', and any rule with a `when` guard) need a JS
 * evaluator, which core deliberately does not provide. The host injects one. With
 * no evaluator, guarded rules are skipped and 'custom' rules pass, so a missing
 * sandbox degrades to permissive rather than throwing.
 */

import { evaluateCondition } from './condition.js'
import { isEmpty, jsonToString, valueOf } from './json.js'
import { dataKeyOf, flatten } from './tree.js'
import { isVisible } from './visibility.js'
import type {
  ComponentNode,
  FormData,
  FormErrors,
  JsonValue,
  PropValue,
  ValidationRule,
} from './types.js'

/** Evaluates a JS expression against the current form data. Host-supplied. */
export type Evaluator = (expression: string, data: FormData) => JsonValue

export const DEFAULT_MESSAGES: Record<ValidationRule['key'], string> = {
  required: 'This field is required.',
  minLength: 'Too short.',
  maxLength: 'Too long.',
  min: 'Too small.',
  max: 'Too large.',
  pattern: 'Invalid format.',
  email: 'Enter a valid email address.',
  url: 'Enter a valid URL.',
  uuid: 'Enter a valid UUID.',
  custom: 'Invalid value.',
}

/**
 * A pattern rule, compiled defensively.
 *
 * The expression is authored one character at a time in the Rules tab, so it is
 * a syntax error for most of the time it is being typed. An uncaught throw here
 * took Preview down in the browser and surfaced as an unhandled 500 on the
 * server. An unfinished pattern matches nothing, which is the same answer the
 * rule would give once the author closes the bracket.
 */
function matchesPattern(pattern: string, value: string): boolean {
  try {
    return new RegExp(pattern).test(value)
  } catch {
    return false
  }
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Requiredness is stricter than emptiness, and only for booleans.
 *
 * An unchecked box is a non-answer, not a value of false. "I accept the terms"
 * is the canonical required checkbox and it has to be checked, which is exactly
 * what the platform's own `<input type="checkbox" required>` means. Treating
 * `false` as a supplied value let a required consent box pass while unticked.
 *
 * Every other rule keeps using `isEmpty`, where `false` is a value: requiredness
 * is one rule's job.
 */
function isMissing(value: JsonValue | undefined): boolean {
  return value === false || isEmpty(value)
}

function asString(value: JsonValue | undefined): string {
  return jsonToString(value)
}

function asNumber(value: JsonValue | undefined): number {
  return typeof value === 'number' ? value : Number(value)
}

/** Is a rule's `when` guard satisfied? Unguarded rules always apply. */
function guardPasses(when: PropValue | undefined, data: FormData, evaluate?: Evaluator): boolean {
  if (!when) return true
  switch (when.kind) {
    case 'static':
      return Boolean(when.value)
    case 'computed':
      // Without a sandbox we cannot know, so skip the rule rather than guess.
      return evaluate ? Boolean(evaluate(when.expression, data)) : false
    case 'i18n':
      return true
    // No sandbox needed, so a guarded rule works where an expression would not.
    case 'condition':
      return evaluateCondition(when.condition, data)
  }
}

/**
 * Apply one rule. Returns an error message, or undefined when the value passes.
 *
 * Every rule except 'required' passes on an empty value. Requiredness is one
 * rule's job; a 'url' rule reporting "required" on an empty field is the exact
 * bug the prior-art study found in the demo it examined.
 */
export function applyRule(
  rule: ValidationRule,
  value: JsonValue | undefined,
  data: FormData,
  evaluate?: Evaluator,
): string | undefined {
  if (!guardPasses(rule.when, data, evaluate)) return undefined

  const fail = (): string => rule.message ?? DEFAULT_MESSAGES[rule.key]

  if (rule.key === 'required') return isMissing(value) ? fail() : undefined
  if (isEmpty(value)) return undefined

  switch (rule.key) {
    case 'minLength':
      return asString(value).length < rule.value ? fail() : undefined
    case 'maxLength':
      return asString(value).length > rule.value ? fail() : undefined
    case 'min':
      return asNumber(value) < rule.value ? fail() : undefined
    case 'max':
      return asNumber(value) > rule.value ? fail() : undefined
    case 'pattern':
      return matchesPattern(rule.value, asString(value)) ? undefined : fail()
    case 'email':
      return EMAIL.test(asString(value)) ? undefined : fail()
    case 'url':
      return URL.canParse(asString(value)) ? undefined : fail()
    case 'uuid':
      return UUID.test(asString(value)) ? undefined : fail()
    case 'custom':
      if (!evaluate) return undefined
      return evaluate(rule.expression, data) ? undefined : fail()
  }
}

/** First failing rule for one field, or undefined when all pass. */
export function validateField(
  node: ComponentNode,
  data: FormData,
  evaluate?: Evaluator,
): string | undefined {
  if (!node.schema) return undefined
  for (const rule of node.schema.validations) {
    const error = applyRule(rule, valueOf(data, dataKeyOf(node)), data, evaluate)
    if (error) return error
  }
  return undefined
}

/** Validate every data-bound node in the tree. Empty object means the form is valid. */
/**
 * Validate every visible field.
 *
 * Hidden components are skipped, and so is everything beneath them: hiding a
 * container hides its children, and a required field the user cannot see must
 * never block a submit. `isVisible` is shared with the renderer so the two
 * cannot disagree about what "hidden" means.
 */
export function validateForm(
  root: ComponentNode,
  data: FormData,
  evaluate?: Evaluator,
): FormErrors {
  const errors: FormErrors = {}

  const visit = (node: ComponentNode): void => {
    if (!isVisible(node, data, evaluate)) return

    const error = validateField(node, data, evaluate)
    if (error) errors[node.key] = error

    for (const child of node.children ?? []) visit(child)
  }

  visit(root)
  return errors
}

/**
 * The fields that asked to be validated while they are being typed into.
 *
 * `FieldSchema.autoValidate` is a per-field hint, and the host decides what to
 * do with it: Formsmith never owns the form's data, so it cannot own the moment
 * validation runs either. The designer's preview reads this, and a host that
 * wants the same behaviour reads it the same way.
 *
 * It was written by the Rules tab and read by nothing at all for the whole of
 * the tab's life, so the checkbox looked like a setting and was decoration.
 */
export function autoValidateKeys(root: ComponentNode): Set<string> {
  const keys = new Set<string>()
  for (const { node } of flatten(root)) {
    if (node.schema?.autoValidate === true) keys.add(node.key)
  }
  return keys
}

/**
 * The data a form is actually asking for, with answers to hidden questions left out.
 *
 * A value stays in `data` after the field that collected it is hidden. Tick
 * "married", fill in a spouse's name, untick it: `validateForm` correctly stops
 * checking that field, and the answer is still sitting in the payload. The form
 * submits an answer to a question it is no longer asking, and in insurance,
 * medical and legal forms that is a correctness problem rather than a tidiness
 * one.
 *
 * Formsmith cannot clear it unilaterally, because the host owns `data` and
 * hiding is often temporary — an accordion closing must not destroy what
 * someone typed. So this is a projection the host applies when it submits,
 * rather than something done to the value as it is held.
 *
 * Visibility is decided by the same `isVisible` the renderer and `validateForm`
 * use, so all three agree about what is on screen.
 */
export function submittedData(root: ComponentNode, data: FormData, evaluate?: Evaluator): FormData {
  const kept: FormData = {}

  const visit = (node: ComponentNode): void => {
    if (!isVisible(node, data, evaluate)) return
    if (node.schema) {
      const key = dataKeyOf(node)
      const value = valueOf(data, key)
      if (value !== undefined) kept[key] = value
    }
    for (const child of node.children ?? []) visit(child)
  }

  visit(root)
  return kept
}
