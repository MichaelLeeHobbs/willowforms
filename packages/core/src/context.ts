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

import { same } from './condition.js'
import { readPath } from './json.js'
import { validationsOf } from './tree.js'
import type {
  ComponentNode,
  Condition,
  FormContext,
  JsonValue,
  Operand,
  PropValue,
} from './types.js'

/**
 * How deep a condition may nest before a walk here stops reading it.
 *
 * The same bound `condition.ts` evaluates under, for the same reason: these
 * walks run over a document nobody has validated yet, and a hand-written
 * `{ and: [{ and: [ ... ] }] }` is a stack overflow in a function whose whole
 * job is to survive malformed input.
 */
const MAX_CONDITION_DEPTH = 200

/** Every context path a condition anywhere in this condition reads. */
function fromCondition(condition: Condition | undefined, out: Set<string>, depth = 0): void {
  if (depth > MAX_CONDITION_DEPTH) return
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
    for (const inner of shape['conditions'] as Condition[]) fromCondition(inner, out, depth + 1)
  }
  fromCondition(shape['condition'] as Condition | undefined, out, depth + 1)
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

  /*
   * Walked here rather than through `flatten`, which assumes `children` is an
   * array and throws when a document says otherwise. A host is told to call
   * this at startup, which is before anything has had a chance to refuse the
   * document — so throwing is the one thing it must not do.
   */
  const visit = (node: ComponentNode): void => {
    if (!node || typeof node !== 'object') return

    fromPropValue(node.renderWhen, keys)

    const props =
      node.props && typeof node.props === 'object' && !Array.isArray(node.props)
        ? Object.values(node.props)
        : []
    for (const value of props) fromPropValue(value, keys)

    const rules = validationsOf(node)
    for (const rule of rules) fromPropValue(rule?.when, keys)

    for (const child of Array.isArray(node.children) ? node.children : []) visit(child)
  }
  visit(root)

  return keys
}

/**
 * Every node in this document that cannot be evaluated without a sandbox.
 *
 * The sibling of `contextKeys`, and it exists for the same failure. A condition
 * reading a path the host never supplied hides its component and takes it out of
 * validation; a `computed` binding with no evaluator does exactly that —
 * `isVisible` answers false for one, so the node and its whole subtree leave
 * `validateForm`.
 *
 * It is the worse of the two, because a host can inject an evaluator in one
 * place and not the other. The browser then shows a section, validates it, and
 * submits; the server validates nothing beneath it and answers that the form is
 * fine. Nothing at evaluation time can notice, which is why this is a question
 * asked once at startup.
 *
 * Node keys rather than expressions, because the expression is the evaluator's
 * business and the node is what a host can go and look at.
 *
 * Total on a malformed document, like everything else here: a host is told to
 * call this at startup, which is before anything has refused the document.
 */
export function evaluatorKeys(root: ComponentNode): string[] {
  const keys = new Set<string>()

  const walkNode = (node: ComponentNode): void => {
    if (!node || typeof node !== 'object') return

    const needs = (value: PropValue | undefined): boolean => value?.kind === 'computed'

    const props =
      node.props && typeof node.props === 'object' && !Array.isArray(node.props)
        ? Object.values(node.props)
        : []

    const rules = validationsOf(node)

    const expression =
      needs(node.renderWhen) ||
      props.some(needs) ||
      rules.some((rule) => needs(rule?.when) || rule?.key === 'custom')

    if (expression && typeof node.key === 'string') keys.add(node.key)

    for (const child of Array.isArray(node.children) ? node.children : []) walkNode(child)
  }
  walkNode(root)

  return [...keys]
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

/**
 * Every value a document compares one context path against.
 *
 * The primitive a multi-step form needs, without core learning what a step is.
 * A step is a container shown when `context.step` equals its own name, so the
 * set of steps is the set of names the document compares that path against:
 * `contextValues(root, 'step')` is the flow.
 *
 * It matters that this reads the document rather than taking a list. A server
 * validating a submit has to check every step, and asking the browser which
 * steps exist would let a client that names one step have the other steps go
 * unchecked. The document is the thing both sides already agree on.
 *
 * Structural, like `contextKeys`, and for the same reason: a document is data.
 * Any comparison contributes the literal on its other side, and `in`/`notIn`
 * contribute their options. That deliberately includes operators nobody would
 * write against a step name — `gt` on one is meaningless, and it is still
 * collected.
 *
 * Collecting too much is the safe direction and collecting too little is not.
 * The caller is `validateAcross`, so a name that turns out not to be a step
 * costs one extra pass over a tree in which nothing matches it, while a name
 * this missed is a step whose required fields never get checked. The same
 * reasoning as reading structurally rather than by `op`: a new operator must
 * not fall silently out of a check that exists to catch omissions.
 *
 * An operator comparing a context path to a field contributes nothing, because
 * there is no name there to collect.
 */
/**
 * How many distinct values this will collect for one path.
 *
 * `contextValues(root, 'step')` is how a host discovers a form's steps, and the
 * reference server runs one full validation pass per value it gets back. A
 * hundred thousand distinct literals is a few seconds to author in the JSON
 * editor and a hundred thousand passes to submit against.
 *
 * Far past any real flow: a wizard with more than a thousand steps is not a
 * wizard. The `add` below also compares with `===`, so structurally equal object
 * literals each count, and a document can reach the cap faster than the number
 * suggests — which is an argument for the cap rather than against it.
 */
const MAX_CONTEXT_VALUES = 1000

export function contextValues(root: ComponentNode, path: string): JsonValue[] {
  /*
   * An empty path reads nothing, so it names no flow. `contextKeys` already
   * skips one for that reason, and answering here anyway told a host that a
   * document declares steps under a path `readPath` refuses to walk -- steps it
   * would then run a validation pass for, each of them against a condition that
   * can never be true.
   */
  if (path === '') return []

  const seen: JsonValue[] = []

  const add = (value: JsonValue | undefined): void => {
    if (value === undefined || seen.length >= MAX_CONTEXT_VALUES) return
    /*
     * Structural, the same comparison a condition itself uses. With `===` two
     * literals spelling the same object each counted as a step, so a host asking
     * for a form's steps got duplicates -- and the reference server runs a full
     * validation pass per step it is given.
     */
    if (!seen.some((held) => same(held, value))) seen.push(value)
  }

  const reads = (operand: unknown): boolean =>
    typeof operand === 'object' &&
    operand !== null &&
    (operand as Operand).kind === 'context' &&
    (operand as { path?: unknown }).path === path

  const literal = (operand: unknown): JsonValue | undefined =>
    typeof operand === 'object' && operand !== null && (operand as Operand).kind === 'literal'
      ? (operand as { value: JsonValue }).value
      : undefined

  const visit = (condition: Condition | undefined, depth = 0): void => {
    // Bounded like every other walk over a document, because a document is data
    // and `and: [{ and: [...] }]` can nest as deeply as somebody types.
    if (!condition || typeof condition !== 'object' || depth > MAX_CONDITION_DEPTH) return
    const shape = condition as Partial<Record<string, unknown>>

    // Either side may be the one reading the context.
    if (reads(shape['left'])) add(literal(shape['right']))
    if (reads(shape['right'])) add(literal(shape['left']))

    if (reads(shape['value']) && Array.isArray(shape['options'])) {
      for (const option of shape['options'] as JsonValue[]) add(option)
    }

    if (Array.isArray(shape['conditions'])) {
      for (const inner of shape['conditions'] as Condition[]) visit(inner, depth + 1)
    }
    visit(shape['condition'] as Condition | undefined, depth + 1)
  }

  /*
   * The same defensive walk `contextKeys` does, and for the same reason: this is
   * called at a host's startup, before anything has refused the document, so
   * `flatten` assuming `children` is an array is an assumption it cannot make.
   */
  const walkNode = (node: ComponentNode): void => {
    if (!node || typeof node !== 'object') return

    const collect = (value: PropValue | undefined): void => {
      if (value && typeof value === 'object' && value.kind === 'condition') visit(value.condition)
    }

    collect(node.renderWhen)

    const props =
      node.props && typeof node.props === 'object' && !Array.isArray(node.props)
        ? Object.values(node.props)
        : []
    for (const value of props) collect(value)

    const rules = validationsOf(node)
    for (const rule of rules) collect(rule?.when)

    for (const child of Array.isArray(node.children) ? node.children : []) walkNode(child)
  }
  walkNode(root)

  return seen
}
