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

import { RE2JS } from 're2js'

import { evaluateCondition, same } from './condition.js'
import { isEmpty, jsonToString, safeHref, valueOf } from './json.js'
import { NO_ROWS, addressOf, pushRow, rowContext, rowsOf } from './rows.js'
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
 * A bag rather than two more positional arguments, because both are optional
 * and `validateForm(root, data, undefined, context)` is a call nobody should
 * have to write. Both are declared `| undefined` on purpose:
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

/*
 * The rule keys that exist, taken from the message table rather than written
 * out again. `DEFAULT_MESSAGES` is typed as a total record over the union, so
 * adding a rule without a message does not compile and this set cannot drift
 * behind it.
 */
const KNOWN_RULES: ReadonlySet<string> = new Set(Object.keys(DEFAULT_MESSAGES))

/** Maximum pattern and input sizes accepted by the validation engine. */
const PATTERN_SOURCE_LIMIT = 1024
const PATTERN_INPUT_LIMIT = 4096

function compiledPattern(pattern: string): RE2JS | undefined {
  if (pattern.length > PATTERN_SOURCE_LIMIT) return undefined

  try {
    return RE2JS.compile(pattern)
  } catch {
    return undefined
  }
}

/**
 * Explain why a pattern cannot be evaluated by the bounded matcher.
 *
 * WillowForms pattern rules use RE2 syntax. Backreferences, lookarounds, and other
 * constructs without a linear-time implementation are intentionally unsupported.
 */
export function patternProblem(pattern: string): string | undefined {
  if (pattern.length > PATTERN_SOURCE_LIMIT) {
    return `A pattern cannot be longer than ${String(PATTERN_SOURCE_LIMIT)} characters.`
  }
  if (!compiledPattern(pattern)) {
    return 'This pattern is invalid or uses syntax unsupported by the bounded matcher.'
  }
  return undefined
}

function matchesPattern(pattern: string, value: string): boolean {
  if (value.length > PATTERN_INPUT_LIMIT) return false
  return compiledPattern(pattern)?.test(value) ?? false
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

function lengthOf(value: JsonValue | undefined): number {
  return Array.isArray(value) ? value.length : asString(value).length
}

function asString(value: JsonValue | undefined): string {
  return jsonToString(value)
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

/** Is a rule's `when` guard satisfied? Unguarded rules always apply. */
function guardPasses(when: PropValue | undefined, data: FormData, options: EvalOptions): boolean {
  if (!when) return true
  switch (when.kind) {
    case 'static':
      return Boolean(when.value)
    case 'computed':
      // Without a sandbox we cannot know, so skip the rule rather than guess.
      if (!options.evaluate) return false

      try {
        return Boolean(options.evaluate(when.expression, data, options.context))
      } catch {
        return true
      }
    /*
     * A translation key is not a condition, so this reads as "no guard was
     * expressed" and the rule applies -- the same answer `isVisible` gives the
     * same kind, where "no condition expressed" means visible. Both directions
     * are the permissive one: a rule that still runs, and a component that is
     * still shown.
     */
    case 'i18n':
      return true
    // No sandbox needed, so a guarded rule works where an expression would not.
    case 'condition':
      return evaluateCondition(when.condition, data, options.context, options.row)

    /*
     * A guard this code cannot read has not said no, so the rule applies. The
     * other direction skips the rule, which is a required answer quietly
     * becoming optional — on the server, over a mistyped tag.
     */
    default:
      return unreadableTag(when, true)
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
  options: EvalOptions = {},
): string | undefined {
  if (!rule || typeof rule !== 'object') return UNREADABLE_RULE

  if (!guardPasses(rule.when, data, options)) return undefined

  /*
   * Before the empty short-circuit below, and that order is the point. "Every
   * rule but `required` passes on an empty value" is a statement about rules,
   * and a tag this code cannot read is not one. The case that matters is a
   * mistyped `required`, and it arrives with an empty value, so checking after
   * the short-circuit would let exactly that one through.
   */
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
        const scoped = options.row ? { ...data, ...options.row.values } : data
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
       * A pattern with no pattern fails rather than throwing. A document is
       * data, so `{ key: 'pattern' }` with no `value` reaches here from a paste,
       * and `nestedUnbounded(undefined)` reads `.length` off it -- out of
       * `validateForm`, which is a 500 on submit. The same answer a pattern this
       * refuses to run already gets: what cannot be checked has not been
       * satisfied.
       */
      if (typeof rule.value !== 'string') return fail()
      return matchesPattern(rule.value, asString(value)) ? undefined : fail()
    case 'email':
      return EMAIL.test(asString(value)) ? undefined : fail()
    case 'url':
      /*
       * `safeHref`, not `URL.canParse`. That one answers yes to any well-formed
       * URL, scheme included, so a `url` rule accepted `javascript:` and
       * `data:` — and `safeHref` exists in this same package, keeping an
       * allowlist, precisely because those are the schemes that matter. Telling
       * an author their field holds a link and then accepting one that runs
       * code is the two halves of this project disagreeing.
       */
      return isUrl(asString(value)) ? undefined : fail()
    case 'uuid':
      return UUID.test(asString(value)) ? undefined : fail()
    case 'custom':
      if (!options.evaluate) return undefined
      /*
       * A throw fails the rule, which is the answer `matchesPattern` gives a
       * pattern it refuses to run, in this file, for the same reason: a rule
       * that cannot be run has not been satisfied.
       *
       * Not the same as the line above it. No evaluator is a host that declined
       * to supply one, and failing every custom rule for that would make the
       * library unusable without a sandbox; a throw is one expression that is
       * broken, and letting the value through is the silent permissive failure.
       */
      try {
        const scoped = options.row ? { ...data, ...options.row.values } : data
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
  // A field inside a row holds its answer in that row, not at the top level.
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
   * No prototype, for the reason `submittedData` has none. A field keyed
   * `__proto__` is refused by `validateDocument` and reachable anyway, because
   * nothing on the render or validate path calls it — and on an object literal
   * `errors['__proto__'] = message` runs the inherited setter, creates no own
   * property, and hands back a form that reads as valid.
   */
  const errors: FormErrors = Object.create(null) as FormErrors

  const visit = (node: ComponentNode, scope: EvalOptions, depth = 0): void => {
    if (!isVisible(node, data, scope)) return

    const path = scope.row?.path ?? NO_ROWS

    /*
     * The bound this walk did not have. See `TOO_DEEP`: reported at the address
     * where the walk stopped, not returned silently, because a subtree nobody
     * checked is a subtree whose required fields all passed.
     */
    if (depth > MAX_TREE_DEPTH) {
      const at = addressOf(path, node.key)
      if (!Object.hasOwn(errors, at)) errors[at] = TOO_DEEP
      return
    }
    const error = validateField(node, data, scope)
    if (error) errors[addressOf(path, node.key)] = error

    /*
     * A repeater validates its children once per row, each under that row's
     * own scope, so a required answer missing from row two is reported against
     * row two rather than against the one authored node they share.
     *
     * The rows come out of the data. Nothing asks the browser how many there
     * are, which is the same discipline `validateAcross` follows for steps: a
     * count from the request would let a client submit one row and have the
     * rest go unchecked.
     */
    if (isRowScope(node)) {
      const stored = valueOf(rowData(data, scope), dataKeyOf(node))

      /*
       * An answer of the wrong shape is reported rather than read as no rows.
       * See `NOT_A_LIST`: reading it as empty turned every required field inside
       * the repeater optional.
       */
      if (stored !== undefined && stored !== null && !Array.isArray(stored)) {
        const at = addressOf(path, node.key)
        if (!Object.hasOwn(errors, at) || errors[at] === INVALID_TYPE) errors[at] = NOT_A_LIST
        return
      }

      const all = rowsOf(stored)

      /*
       * The row count comes out of the data, which is right: asking the browser
       * how many rows there are would let a client submit one and have the rest
       * go unchecked. But that makes the *request body* the thing deciding how
       * much work happens, with no cap, and rows nest multiplicatively — a
       * couple of hundred kilobytes of JSON is millions of rule evaluations.
       *
       * Over the cap the form fails rather than validating a prefix. A row
       * nobody checked passing silently is the permissive failure this whole
       * project is organised against, and refusing is the only answer that is
       * not one.
       */
      if (all.length > MAX_ROWS) {
        /*
         * Reported without overwriting the repeater's own failure.
         *
         * The rules on the repeater itself are checked a few lines up and write
         * to this same address, so a list that is both `required` and over the
         * cap reported only the cap -- losing the message a person can act on
         * for one about the size of a body they did not choose.
         */
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

/** The record a node's own value is read from: a row's object, or the form's data. */
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

    /*
     * A repeater keeps its rows, and each row keeps only the answers that row
     * still asks for. Row order is preserved and no row is dropped: a row the
     * user filled in is not a question the form stopped asking, it is one of
     * several answers to the same one.
     */
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
   * No prototype, for the reason `validateForm` has none, and this is the
   * function where it mattered more.
   *
   * `validateForm` assigns, so only `__proto__` bit there. This merge
   * *coalesces*: `merged[key] ??= message` reads before it writes, and on an
   * object literal that read finds `Object.prototype.toString` for a field keyed
   * `toString`. Not nullish, so the write never happens, so the message is
   * discarded and `Object.keys(merged)` comes back empty. Empty is what every
   * caller reads as a valid form, and this is the function a server calls at
   * submit. `toString`, `valueOf`, `hasOwnProperty`, `constructor` and
   * `isPrototypeOf` all pass `KEY_PATTERN`, so nothing has to be bypassed.
   *
   * `RESERVED_KEYS` now names them too, but that is the second lock rather than
   * this one: nothing on the render or validate path calls `validateDocument`,
   * so a document carrying such a key reaches here regardless.
   */
  const merged: FormErrors = Object.create(null) as FormErrors

  for (const scope of scopes) {
    for (const [key, message] of Object.entries(validateForm(root, data, scope))) {
      merged[key] ??= message
    }
  }

  return merged
}
