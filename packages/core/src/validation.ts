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

import type {
  ComponentNode,
  FormData,
  FormErrors,
  JsonValue,
  PropValue,
  ValidationRule,
} from './types.js'
import { walk } from './tree.js'

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

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function isEmpty(value: JsonValue | undefined): boolean {
  if (value === undefined || value === null) return true
  if (typeof value === 'string') return value.trim() === ''
  if (Array.isArray(value)) return value.length === 0
  return false
}

function asString(value: JsonValue | undefined): string {
  return typeof value === 'string' ? value : String(value ?? '')
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
  }
}

/**
 * Apply one rule. Returns an error message, or undefined when the value passes.
 *
 * Every rule except 'required' passes on an empty value. Requiredness is one
 * rule's job; a 'url' rule reporting "required" on an empty field is the exact
 * bug the FormEngine teardown flagged in its own demo.
 */
export function applyRule(
  rule: ValidationRule,
  value: JsonValue | undefined,
  data: FormData,
  evaluate?: Evaluator,
): string | undefined {
  if (!guardPasses(rule.when, data, evaluate)) return undefined

  const fail = (): string => rule.message ?? DEFAULT_MESSAGES[rule.key]

  if (rule.key === 'required') return isEmpty(value) ? fail() : undefined
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
      return new RegExp(rule.value).test(asString(value)) ? undefined : fail()
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
    const error = applyRule(rule, data[node.key], data, evaluate)
    if (error) return error
  }
  return undefined
}

/** Validate every data-bound node in the tree. Empty object means the form is valid. */
export function validateForm(
  root: ComponentNode,
  data: FormData,
  evaluate?: Evaluator,
): FormErrors {
  const errors: FormErrors = {}
  walk(root, (node) => {
    const error = validateField(node, data, evaluate)
    if (error) errors[node.key] = error
  })
  return errors
}
