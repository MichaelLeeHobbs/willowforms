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
import { NO_ROWS, addressOf, pushRow, rowContext, rowsOf } from './rows.js'
import type { RowContext } from './rows.js'
import { dataKeyOf, flatten } from './tree.js'
import { unreadableTag } from './exhaustive.js'
import { isVisible } from './visibility.js'
import type {
  ComponentNode,
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
  /**
   * Which repeater row this evaluation is inside. Absent at the top level.
   *
   * Set by the walk that enters a row, never by a caller: a host passing one
   * would be claiming a position in data it does not control.
   */
  row?: RowContext | undefined
}

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
 * What a rule this code cannot read reports.
 *
 * Not in `DEFAULT_MESSAGES`, because it is not a rule's message — it is the
 * absence of one. A document holding `{ key: 'requird' }` is malformed and
 * `validateDocument` says so; this is what happens to the document that never
 * went through the gate.
 *
 * It reports rather than passing, and that direction is the whole point. A rule
 * the code cannot apply has not been satisfied, and a submit that goes through
 * because a tag was mistyped is the silent permissive failure this project is
 * organised against. Wrong and loud beats wrong and quiet.
 */
export const UNREADABLE_RULE = 'This field could not be checked. The form has an unreadable rule.'

/*
 * The rule keys that exist, taken from the message table rather than written
 * out again. `DEFAULT_MESSAGES` is typed as a total record over the union, so
 * adding a rule without a message does not compile and this set cannot drift
 * behind it.
 */
const KNOWN_RULES: ReadonlySet<string> = new Set(Object.keys(DEFAULT_MESSAGES))

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

/**
 * How long an answer is, for the two rules that ask.
 *
 * An array counts its items. Without this it went through `jsonToString`, which
 * returns `''` for anything that is not a string, number or boolean — so a
 * multi-select with two options chosen measured zero, `minLength: 2` failed
 * every time and `maxLength` passed every time. Silently: the value was there
 * on screen and the message said it was too short.
 *
 * Counting items is what an author writing "at least two" on a multi-select
 * means. A repeater may still want `minItems` and `maxItems` of its own, which
 * map onto the JSON Schema keywords of those names; this is not that, it is the
 * existing rule no longer being wrong about a value it already receives.
 */
function lengthOf(value: JsonValue | undefined): number {
  return Array.isArray(value) ? value.length : asString(value).length
}

function asString(value: JsonValue | undefined): string {
  return jsonToString(value)
}

function asNumber(value: JsonValue | undefined): number {
  return typeof value === 'number' ? value : Number(value)
}

/** Is a rule's `when` guard satisfied? Unguarded rules always apply. */
function guardPasses(when: PropValue | undefined, data: FormData, options: EvalOptions): boolean {
  if (!when) return true
  switch (when.kind) {
    case 'static':
      return Boolean(when.value)
    case 'computed':
      // Without a sandbox we cannot know, so skip the rule rather than guess.
      return options.evaluate
        ? Boolean(options.evaluate(when.expression, data, options.context))
        : false
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
  if (!guardPasses(rule.when, data, options)) return undefined

  /*
   * Before the empty short-circuit below, and that order is the point. "Every
   * rule but `required` passes on an empty value" is a statement about rules,
   * and a tag this code cannot read is not one. The case that matters is a
   * mistyped `required`, and it arrives with an empty value, so checking after
   * the short-circuit would let exactly that one through.
   */
  if (!KNOWN_RULES.has(rule.key)) return UNREADABLE_RULE

  const fail = (): string => rule.message ?? DEFAULT_MESSAGES[rule.key]

  if (rule.key === 'required') return isMissing(value) ? fail() : undefined
  if (isEmpty(value)) return undefined

  switch (rule.key) {
    case 'minLength':
      return lengthOf(value) < rule.value ? fail() : undefined
    case 'maxLength':
      return lengthOf(value) > rule.value ? fail() : undefined
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
      if (!options.evaluate) return undefined
      return options.evaluate(rule.expression, data, options.context) ? undefined : fail()

    /*
     * Unreachable: the `KNOWN_RULES` check above has already answered for a key
     * that is not in the union. It stays because it is what keeps the compiler
     * checking this switch for exhaustiveness — adding a rule key without a
     * case here stops compiling, which the missing tail return used to do and
     * a bare `default` would throw away.
     */
    default:
      return unreadableTag(rule, UNREADABLE_RULE)
  }
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
  for (const rule of node.schema.validations) {
    const error = applyRule(rule, held, data, options)
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
  options: EvalOptions = {},
): FormErrors {
  const errors: FormErrors = {}

  const visit = (node: ComponentNode, scope: EvalOptions): void => {
    if (!isVisible(node, data, scope)) return

    const path = scope.row?.path ?? NO_ROWS
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
      const rows = rowsOf(valueOf(rowData(data, scope), dataKeyOf(node)))
      rows.forEach((row, index) => {
        const inner: EvalOptions = {
          ...scope,
          row: rowContext(pushRow(path, { key: dataKeyOf(node), index }), row),
        }
        for (const child of node.children ?? []) visit(child, inner)
      })
      return
    }

    for (const child of node.children ?? []) visit(child, scope)
  }

  visit(root, options)
  return errors
}

/**
 * A node whose children are drawn once per row.
 *
 * Recognised from the node rather than from a type string, because component
 * types are kit-scoped and core must not learn the word `Repeater`. A
 * data-bound container holding a list is the only thing that shape can mean.
 */
export function isRowScope(node: ComponentNode): boolean {
  return node.schema?.type === 'array' && node.children !== undefined
}

/** The record a node's own value is read from: a row's object, or the form's data. */
function rowData(data: FormData, scope: EvalOptions): FormData {
  return scope.row?.values ?? data
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
export function submittedData(
  root: ComponentNode,
  data: FormData,
  options: EvalOptions = {},
): FormData {
  /*
   * The same `EvalOptions` the renderer and `validateForm` were given, and it has
   * to be: this decides which answers leave, using `isVisible`, so handing it a
   * different context than the renderer had would strip answers to questions the
   * user was actually asked. That is the disagreement `isVisible` exists to
   * prevent, arriving through an argument list instead of a second code path.
   *
   * Built on a null prototype, then copied into a plain object.
   *
   * `kept[key] = value` for a key of `__proto__` does not add a property to an
   * object literal, it runs the setter and changes the object's prototype: the
   * answer vanishes from the payload and the payload acquires whatever it was
   * pointed at. Data keys come out of a document and the grammar for them is
   * still only planned, so this is reachable today.
   *
   * The spread at the end is what makes the result ordinary. Spreading copies
   * properties rather than assigning them, so `__proto__` arrives as a plain
   * key on a plain object, and a host does not receive something surprising
   * back from a function it will hand straight to `JSON.stringify`.
   */
  const collect = (node: ComponentNode, scope: EvalOptions, into: FormData): void => {
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
      const rows = rowsOf(valueOf(held, key))
      const path = scope.row?.path ?? NO_ROWS

      into[key] = rows.map((row, index) => {
        const inner: EvalOptions = {
          ...scope,
          row: rowContext(pushRow(path, { key: dataKeyOf(node), index }), row),
        }
        const kept: FormData = Object.create(null) as FormData
        for (const child of node.children ?? []) collect(child, inner, kept)
        return { ...kept }
      })
      return
    }

    if (node.schema) {
      const key = dataKeyOf(node)
      const value = valueOf(held, key)
      if (value !== undefined) into[key] = value
    }
    for (const child of node.children ?? []) collect(child, scope, into)
  }

  const kept: FormData = Object.create(null) as FormData
  collect(root, options, kept)
  return { ...kept }
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
  const merged: FormErrors = {}

  for (const scope of scopes) {
    for (const [key, message] of Object.entries(validateForm(root, data, scope))) {
      merged[key] ??= message
    }
  }

  return merged
}
