/**
 * Pure, so the browser and the server run the same rules.
 *
 * Core deliberately provides no JS evaluator. Without a host's, a rule with a `computed`
 * guard is skipped and a `custom` rule passes.
 */

import { RE2JS } from 're2js'

import { evaluateCondition, same } from './condition.js'
import { isEmpty, jsonToString, safeHref, valueOf } from './json.js'
import { NO_ROWS, addressOf, expressionData, pushRow, rowContext, rowsOf } from './rows.js'
import type { RowContext } from './rows.js'
import {
  MAX_TREE_DEPTH,
  childNodesOf,
  dataKeyOf,
  flatten,
  isRowScope,
  validationsOf,
} from './tree.js'
import { unreadableTag } from './exhaustive.js'
import { isVisible } from './visibility.js'
import type {
  ComponentNode,
  FieldSchema,
  FormContext,
  FormData,
  FormErrors,
  JsonValue,
  PropValue,
  ValidationRule,
} from './types.js'

/**
 * Evaluates a JS expression against the current form data. Host-supplied.
 *
 * `context` is the third argument rather than merged into `data`, because the
 * two have different owners and only one of them is submitted. An evaluator
 * written before context existed ignores it and keeps working.
 */
export type Evaluator = (expression: string, data: FormData, context?: FormContext) => JsonValue

/**
 * Everything the rules need beyond the answers themselves.
 *
 * A bag rather than more positional arguments, because all are optional
 * and `validateForm(root, data, undefined, context)` is a call nobody should
 * have to write. They are declared `| undefined` on purpose:
 * `exactOptionalPropertyTypes` is on, and a caller forwarding its own optional
 * prop is the normal case, not a mistake.
 */
export interface EvalOptions {
  evaluate?: Evaluator | undefined
  context?: FormContext | undefined
  /** Active-language strings used by localized validation messages. */
  messages?: Record<string, string> | undefined
  /**
   * Which repeater row this evaluation is inside. Absent at the top level.
   *
   * Set by the walk that enters a row, never by a caller: a host passing one
   * would be claiming a position in data it does not control.
   */
  row?: RowContext | undefined
}

export { isRowScope }

export const DEFAULT_MESSAGES: Record<ValidationRule['key'], string> = {
  required: 'This field is required.',
  minLength: 'Too short.',
  maxLength: 'Too long.',
  minItems: 'Add more items.',
  maxItems: 'Remove some items.',
  min: 'Too small.',
  max: 'Too large.',
  matches: 'Values do not match.',
  after: 'Must be later.',
  pattern: 'Invalid format.',
  email: 'Enter a valid email address.',
  url: 'Enter a valid URL.',
  uuid: 'Enter a valid UUID.',
  custom: 'Invalid value.',
}

/**
 * How many rows of one repeater will be validated.
 *
 * A form asking somebody to fill in more than this many rows is not a form.
 */
export const MAX_ROWS = 5000

/** What a repeater reports when the submitted body asks for more rows than that. */
export const TOO_MANY_ROWS = 'This list has too many rows to check.'

export const NOT_A_LIST = 'This list was not sent as a list.'

export const TOO_DEEP = 'This form is nested too deeply to check.'

export const UNREADABLE_RULE = 'This field could not be checked. The form has an unreadable rule.'
export const INVALID_TYPE = 'This value does not match the field type.'

// `DEFAULT_MESSAGES` is a total record over the rule union, so this set cannot
// fall behind it.
const KNOWN_RULES: ReadonlySet<string> = new Set(Object.keys(DEFAULT_MESSAGES))

const PATTERN_SOURCE_LIMIT = 1024
const PATTERN_INPUT_LIMIT = 4096
/*
 * Matching is linear in the input, but the cost per character grows with the
 * compiled program. Counted repeats expand it: `(a|b){999}` is ten characters of
 * source and about 3,000 instructions. This limit bounds the work one submitted
 * character can cause.
 */
const PATTERN_PROGRAM_LIMIT = 512
const PATTERN_CACHE_LIMIT = 256

type CompiledPattern = { regex: RE2JS } | { problem: string }

const compiledPatterns = new Map<string, CompiledPattern>()

function compilePattern(pattern: string): CompiledPattern {
  if (pattern.length > PATTERN_SOURCE_LIMIT) {
    return {
      problem: `A pattern cannot be longer than ${String(PATTERN_SOURCE_LIMIT)} characters.`,
    }
  }
  let regex: RE2JS
  try {
    regex = RE2JS.compile(pattern)
  } catch {
    return { problem: 'This pattern is invalid or uses syntax unsupported by the bounded matcher.' }
  }
  if (regex.programSize() > PATTERN_PROGRAM_LIMIT) {
    return {
      problem:
        'This pattern is too complex to check safely. Use fewer or smaller repeat counts, and a length rule for long values.',
    }
  }
  return { regex }
}

function compiledPattern(pattern: string): CompiledPattern {
  const cached = compiledPatterns.get(pattern)
  if (cached) return cached
  const result = compilePattern(pattern)
  if (compiledPatterns.size >= PATTERN_CACHE_LIMIT) {
    const oldest = compiledPatterns.keys().next()
    if (!oldest.done) compiledPatterns.delete(oldest.value)
  }
  compiledPatterns.set(pattern, result)
  return result
}

/**
 * Explain why a pattern cannot be evaluated by the bounded matcher.
 *
 * WillowForms pattern rules use RE2 syntax. Backreferences, lookarounds, and other
 * constructs without a linear-time implementation are intentionally unsupported,
 * as are patterns whose compiled program exceeds the complexity limit.
 */
export function patternProblem(pattern: string): string | undefined {
  const compiled = compiledPattern(pattern)
  return 'problem' in compiled ? compiled.problem : undefined
}

function matchesPattern(pattern: string, value: string): boolean {
  if (value.length > PATTERN_INPUT_LIMIT) return false
  const compiled = compiledPattern(pattern)
  return 'regex' in compiled && compiled.regex.test(value)
}
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * An unchecked box is a non-answer, as with `<input type="checkbox" required>`.
 * Every other rule uses `isEmpty`, where `false` is a value.
 */
function isMissing(value: JsonValue | undefined): boolean {
  return value === false || isEmpty(value)
}

function lengthOf(value: JsonValue | undefined): number {
  return Array.isArray(value) ? value.length : jsonToString(value).length
}

function asNumber(value: JsonValue | undefined): number {
  return typeof value === 'number' ? value : Number(value)
}

function matchesFieldType(type: FieldSchema['type'], value: JsonValue | undefined): boolean {
  if (isEmpty(value)) return true

  switch (type) {
    case 'string':
    case 'date':
    case 'file':
      return typeof value === 'string'
    case 'number':
      return typeof value === 'number' && Number.isFinite(value)
    case 'boolean':
      return typeof value === 'boolean'
    case 'array':
      return Array.isArray(value)
    case 'object':
      return typeof value === 'object' && value !== null && !Array.isArray(value)
    default:
      return false
  }
}

function isUrl(value: string): boolean {
  return URL.canParse(value) && safeHref(value) !== undefined
}

function comparableNumber(value: JsonValue | undefined): number | undefined {
  const asNum = asNumber(value)
  return Number.isNaN(asNum) ? undefined : asNum
}

function guardPasses(when: PropValue | undefined, data: FormData, options: EvalOptions): boolean {
  if (!when) return true
  switch (when.kind) {
    case 'static':
      return Boolean(when.value)
    case 'computed':
      // Without a sandbox we cannot know, so skip the rule rather than guess.
      if (!options.evaluate) return false

      try {
        const scoped = expressionData(data, options.row)
        return Boolean(options.evaluate(when.expression, scoped, options.context))
      } catch {
        return true
      }
    // A translation key expresses no guard, so the rule applies, matching
    // `isVisible` for the same kind.
    case 'i18n':
      return true
    case 'condition':
      return evaluateCondition(when.condition, data, options.context, options.row)

    // An unreadable guard has not said no. Skipping the rule would make a
    // required answer optional on the server over a mistyped tag.
    default:
      return unreadableTag(when, true)
  }
}

/**
 * Apply one rule. Returns an error message, or undefined when the value passes.
 *
 * Every rule except 'required' passes on an empty value. Requiredness is one
 * rule's job.
 */
export function applyRule(
  rule: ValidationRule,
  value: JsonValue | undefined,
  data: FormData,
  options: EvalOptions = {},
): string | undefined {
  if (!rule || typeof rule !== 'object') return UNREADABLE_RULE

  if (!guardPasses(rule.when, data, options)) return undefined

  // Before the empty short-circuit: a mistyped `required` arrives with an empty
  // value and must still fail.
  if (!KNOWN_RULES.has(rule.key)) return UNREADABLE_RULE

  const fail = (): string => {
    const fallback = DEFAULT_MESSAGES[rule.key]
    const message = rule.message
    if (typeof message === 'string') return message || fallback
    if (!message || typeof message !== 'object') return fallback

    if (message.kind === 'static') {
      return typeof message.value === 'string' && message.value ? message.value : fallback
    }
    if (message.kind === 'i18n') {
      if (typeof message.key !== 'string' || !message.key) return fallback
      const translated =
        options.messages && Object.hasOwn(options.messages, message.key)
          ? options.messages[message.key]
          : undefined
      return typeof translated === 'string' && translated ? translated : message.key
    }
    if (message.kind === 'computed' && options.evaluate) {
      try {
        const scoped = expressionData(data, options.row)
        const resolved = options.evaluate(message.expression, scoped, options.context)
        return typeof resolved === 'string' && resolved ? resolved : fallback
      } catch {
        return fallback
      }
    }
    return fallback
  }

  if (rule.key === 'required') return isMissing(value) ? fail() : undefined
  if (isEmpty(value)) return undefined

  const measurable = (bound: number): boolean => typeof bound === 'number' && Number.isFinite(bound)

  switch (rule.key) {
    case 'minLength':
      if (!measurable(rule.value)) return fail()
      return lengthOf(value) < rule.value ? fail() : undefined
    case 'maxLength':
      if (!measurable(rule.value)) return fail()
      return lengthOf(value) > rule.value ? fail() : undefined
    case 'minItems':
      if (!measurable(rule.value) || !Array.isArray(value)) return fail()
      return value.length < rule.value ? fail() : undefined
    case 'maxItems':
      if (!measurable(rule.value) || !Array.isArray(value)) return fail()
      return value.length > rule.value ? fail() : undefined
    case 'min': {
      if (!measurable(rule.value)) return fail()
      const held = comparableNumber(value)
      return held === undefined || held < rule.value ? fail() : undefined
    }
    case 'max': {
      if (!measurable(rule.value)) return fail()
      const held = comparableNumber(value)
      return held === undefined || held > rule.value ? fail() : undefined
    }
    case 'matches': {
      const source = rule.scope === 'row' ? options.row?.values : data
      const other =
        source && typeof rule.field === 'string' ? valueOf(source, rule.field) : undefined
      return same(value, other) ? undefined : fail()
    }
    case 'after': {
      const source = rule.scope === 'row' ? options.row?.values : data
      const other =
        source && typeof rule.field === 'string' ? valueOf(source, rule.field) : undefined
      if (typeof value === 'number' && typeof other === 'number') {
        return value > other ? undefined : fail()
      }
      if (typeof value === 'string' && typeof other === 'string') {
        return value > other ? undefined : fail()
      }
      return fail()
    }
    case 'pattern':
      /*
       * A document is data, so a pattern rule with no `value` can reach here. It fails,
       * as a pattern this refuses to run does: what cannot be checked has not been
       * satisfied.
       */
      if (typeof rule.value !== 'string') return fail()
      return matchesPattern(rule.value, jsonToString(value)) ? undefined : fail()
    case 'email':
      return EMAIL.test(jsonToString(value)) ? undefined : fail()
    case 'url':
      // `URL.canParse` accepts any scheme, `javascript:` and `data:` included;
      // `isUrl` adds the `safeHref` allowlist.
      return isUrl(jsonToString(value)) ? undefined : fail()
    case 'uuid':
      return UUID.test(jsonToString(value)) ? undefined : fail()
    case 'custom':
      if (!options.evaluate) return undefined
      /*
       * A throw fails the rule: a rule that cannot be run has not been
       * satisfied. No evaluator passes instead, because failing every custom
       * rule would make core unusable without a sandbox.
       */
      try {
        const scoped = expressionData(data, options.row)
        return options.evaluate(rule.expression, scoped, options.context) ? undefined : fail()
      } catch {
        return fail()
      }

    default:
      return unreadableTag(rule, UNREADABLE_RULE)
  }
}

/** Without runtime data, only unconditional required rules can be established. */
export function isRequired(
  node: ComponentNode,
  data?: FormData,
  options: EvalOptions = {},
): boolean {
  const rules = validationsOf(node)
  return rules.some(
    (rule) =>
      rule?.key === 'required' &&
      (data === undefined ? !rule.when : guardPasses(rule.when, data, options)),
  )
}

/** Row counts allowed by all applicable list bounds. */
export function itemLimits(
  node: ComponentNode,
  data?: FormData,
  options: EvalOptions = {},
): { min: number; max: number } {
  let min = 0
  let max = Number.POSITIVE_INFINITY
  for (const rule of validationsOf(node)) {
    if (rule?.key !== 'minItems' && rule?.key !== 'maxItems') continue
    if (typeof rule.value !== 'number' || !Number.isFinite(rule.value)) continue
    if (data === undefined ? rule.when : !guardPasses(rule.when, data, options)) continue
    if (rule.key === 'minItems') min = Math.max(min, Math.ceil(rule.value))
    else max = Math.min(max, Math.max(0, Math.floor(rule.value)))
  }
  return { min, max }
}

/** First failing rule for one field, or undefined when all pass. */
export function validateField(
  node: ComponentNode,
  data: FormData,
  options: EvalOptions = {},
): string | undefined {
  if (!node.schema) return undefined
  const held = valueOf(options.row?.values ?? data, dataKeyOf(node))
  if (!matchesFieldType(node.schema.type, held)) return INVALID_TYPE
  for (const rule of validationsOf(node)) {
    const error = applyRule(rule, held, data, options)
    if (error) return error
  }
  return undefined
}

/**
 * Validate every visible field. An empty object means the form is valid.
 *
 * Hidden components are skipped, and so is everything beneath them: hiding a
 * container hides its children, and a required field the user cannot see must
 * never block a submit. `isVisible` is shared with the renderer so the two
 * cannot disagree about what "hidden" means.
 */
export function validateForm(
  root: ComponentNode,
  data: FormData,
  options: EvalOptions = {},
): FormErrors {
  /*
   * No prototype: `validateDocument` is not on this path, and on a plain object
   * `errors['__proto__'] = message` runs the setter and adds no key, which reads
   * as a valid form.
   */
  const errors: FormErrors = Object.create(null) as FormErrors

  const visit = (node: ComponentNode, scope: EvalOptions, depth = 0): void => {
    if (!isVisible(node, data, scope)) return

    const path = scope.row?.path ?? NO_ROWS

    // Reported, not returned silently: an unchecked subtree would read as valid.
    if (depth > MAX_TREE_DEPTH) {
      const at = addressOf(path, node.key)
      if (!Object.hasOwn(errors, at)) errors[at] = TOO_DEEP
      return
    }
    const error = validateField(node, data, scope)
    if (error) errors[addressOf(path, node.key)] = error

    if (isRowScope(node)) {
      const stored = valueOf(rowData(data, scope), dataKeyOf(node))

      // Reported rather than read as no rows, which would make every required
      // field inside optional.
      if (stored !== undefined && stored !== null && !Array.isArray(stored)) {
        const at = addressOf(path, node.key)
        if (!Object.hasOwn(errors, at) || errors[at] === INVALID_TYPE) errors[at] = NOT_A_LIST
        return
      }

      const all = rowsOf(stored)

      /*
       * Rows come from the data, never from a count the client sends, so the
       * request body decides the work and rows nest multiplicatively. Over the
       * cap the form fails rather than validating a prefix.
       */
      if (all.length > MAX_ROWS) {
        // Keep the repeater's own rule failure, the message a person can act on.
        const at = addressOf(path, node.key)
        if (!Object.hasOwn(errors, at)) errors[at] = TOO_MANY_ROWS
        return
      }

      const rows = all
      rows.forEach((row, index) => {
        const inner: EvalOptions = {
          ...scope,
          row: rowContext(pushRow(path, { key: dataKeyOf(node), index }), row),
        }
        for (const child of childNodesOf(node)) visit(child, inner, depth + 1)
      })
      return
    }

    for (const child of childNodesOf(node)) visit(child, scope, depth + 1)
  }

  visit(root, options)
  return errors
}

function rowData(data: FormData, scope: EvalOptions): FormData {
  return scope.row?.values ?? data
}

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
 * WillowForms cannot clear it unilaterally, because the host owns `data` and
 * hiding is often temporary — an accordion closing must not destroy what
 * someone typed. So this is a projection the host applies when it submits,
 * rather than something done to the value as it is held.
 *
 * Visibility is decided by the same `isVisible` the renderer and `validateForm`
 * use, so all three agree about what is on screen.
 */
export function submittedData(
  root: ComponentNode,
  data: FormData,
  options: EvalOptions = {},
): FormData {
  const collect = (node: ComponentNode, scope: EvalOptions, into: FormData, depth = 0): void => {
    if (depth > MAX_TREE_DEPTH) return
    if (!isVisible(node, data, scope)) return

    const held = scope.row?.values ?? data

    // No row is dropped: a filled-in row is an answer, not a question the form
    // stopped asking. Each row keeps only the answers it still asks for.
    if (isRowScope(node)) {
      const key = dataKeyOf(node)
      const stored = valueOf(held, key)
      const rows = rowsOf(stored)
      const path = scope.row?.path ?? NO_ROWS

      if (!Array.isArray(stored)) return

      // Over the cap, the list is not projected at all -- the same answer
      // `validateForm` gives, and for the same reason.
      if (rows.length > MAX_ROWS) return

      into[key] = rows.map((row, index) => {
        const inner: EvalOptions = {
          ...scope,
          row: rowContext(pushRow(path, { key: dataKeyOf(node), index }), row),
        }
        const kept: FormData = Object.create(null) as FormData
        for (const child of childNodesOf(node)) collect(child, inner, kept, depth + 1)
        return { ...kept }
      })
      return
    }

    if (node.schema) {
      const key = dataKeyOf(node)
      const value = valueOf(held, key)
      if (value !== undefined) into[key] = value
    }
    for (const child of childNodesOf(node)) collect(child, scope, into, depth + 1)
  }

  const kept: FormData = Object.create(null) as FormData
  collect(root, options, kept)
  return { ...kept }
}

export function submittedAcross(
  root: ComponentNode,
  data: FormData,
  scopes: EvalOptions[],
): FormData {
  // No prototype, for the reason `submittedData` has none and `validateAcross`
  // has none: document keys are external input.
  const merged: FormData = Object.create(null) as FormData

  for (const scope of scopes) {
    for (const [key, value] of Object.entries(submittedData(root, data, scope))) {
      merged[key] ??= value
    }
  }

  return { ...merged }
}

/**
 * Validate one document under several evaluation environments, merged.
 *
 * A multi-step form needs two different answers from the same rules. While the
 * user is on step two, only step two should be checked, and that is
 * `validateForm(stepNode, data)` — it already takes any node as its root. At
 * submit, every step has to be checked, and `validateForm(root, data)` will not
 * do it: the other steps are hidden, hidden means not validated, and the form is
 * accepted with required answers missing from steps nobody is looking at.
 *
 * That is `isVisible` behaving exactly as specified, and wrong here, because an
 * earlier step is not *unwanted*, it is *already done*. `renderWhen` false means
 * the author excluded this; a step the user is not on means not yet. The two
 * need different treatment and this is where they get it.
 *
 * No new concept: run the existing walk once per environment and merge. Steps
 * partition the tree, so a key appears under at most one of them and the merge
 * has nothing to resolve. Where scopes do overlap the first answer wins, which
 * matches the first-failing-rule order everywhere else.
 *
 * **The server enumerates the environments from the document, never from the
 * request.** A `validateForm` that took a step would let a client name step one
 * and have the rest go unchecked, and unlike a blocked submit that failure is
 * invisible. `contextValues(root, 'step')` reads the flow out of the document,
 * which is the thing both sides already agree on.
 */
export function validateAcross(
  root: ComponentNode,
  data: FormData,
  scopes: EvalOptions[],
): FormErrors {
  /*
   * No prototype: `??=` reads before it writes, so on a plain object a field
   * keyed `toString` finds `Object.prototype.toString` and its message is
   * dropped. `validateDocument`'s `RESERVED_KEYS` is not on this path.
   */
  const merged: FormErrors = Object.create(null) as FormErrors

  for (const scope of scopes) {
    for (const [key, message] of Object.entries(validateForm(root, data, scope))) {
      merged[key] ??= message
    }
  }

  return merged
}
