import { MAX_CONDITION_DEPTH, same } from './condition.js'
import { readPath } from './json.js'
import { MAX_TREE_DEPTH, validationsOf } from './tree.js'
import type {
  ComponentNode,
  Condition,
  FormContext,
  JsonValue,
  Operand,
  PropValue,
} from './types.js'

function fromCondition(condition: Condition | undefined, out: Set<string>, depth = 0): void {
  if (depth > MAX_CONDITION_DEPTH) return
  if (!condition || typeof condition !== 'object') return

  const operand = (value: Operand | undefined): void => {
    if (value && typeof value === 'object' && value.kind === 'context') {
      if (typeof value.path === 'string' && value.path !== '') out.add(value.path)
    }
  }

  /*
   * Read by shape, not by `op`, so neither a malformed document nor a new
   * operator drops out of the check that exists to catch omissions.
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

/** Does not cover what an expression reads: core does not parse it. */
export function contextKeys(root: ComponentNode): Set<string> {
  const keys = new Set<string>()

  // A host calls this at startup, before anything has refused the document, so it must
  // not throw.
  const visit = (node: ComponentNode, depth = 0): void => {
    if (depth > MAX_TREE_DEPTH) return
    if (!node || typeof node !== 'object') return

    fromPropValue(node.renderWhen, keys)

    const props =
      node.props && typeof node.props === 'object' && !Array.isArray(node.props)
        ? Object.values(node.props)
        : []
    for (const value of props) fromPropValue(value, keys)

    const rules = validationsOf(node)
    for (const rule of rules) fromPropValue(rule?.when, keys)

    for (const child of Array.isArray(node.children) ? node.children : []) visit(child, depth + 1)
  }
  visit(root)

  return keys
}

/**
 * Keys of the nodes that cannot be evaluated without a sandbox. Ask once at startup; total,
 * because nothing has refused the document by then.
 *
 * Without an evaluator a `computed` `renderWhen`, for one, takes its node and its whole
 * subtree out of `validateForm`: a host that injects one only in the browser has a server
 * that calls an unchecked form fine.
 */
export function evaluatorKeys(root: ComponentNode): string[] {
  const keys = new Set<string>()

  const walkNode = (node: ComponentNode, depth = 0): void => {
    if (!node || typeof node !== 'object') return
    if (depth > MAX_TREE_DEPTH) return

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

    if (expression) keys.add(typeof node.key === 'string' ? node.key : '(a node with no key)')

    for (const child of Array.isArray(node.children) ? node.children : [])
      walkNode(child, depth + 1)
  }
  walkNode(root)

  return [...keys]
}

/**
 * Call once at startup and accept only an empty result: every path in it is a rule that
 * will quietly not apply. A path is missing when it cannot be read at all, not when it
 * holds a falsy value.
 */
export function missingContext(root: ComponentNode, context: FormContext): string[] {
  const missing: string[] = []
  for (const path of contextKeys(root)) {
    if (readPath(context, path) === undefined) missing.push(path)
  }
  return missing.sort()
}

export const MAX_CONTEXT_VALUES = 1000

/**
 * The literals this document compares a context path with, and the options of its `in` and
 * `notIn`. A comparison with a field contributes nothing.
 *
 * A server takes the steps of a form from this, `contextValues(root, 'step')`, never from
 * the request: a client that names one step would leave the others unchecked. Any
 * comparison with a literal counts, even `gt`: a name this missed is a step whose required
 * fields never get checked. It stops at `MAX_CONTEXT_VALUES`, so a server refuses a document
 * whose list is that long rather than leave the steps past it unchecked.
 */
export function contextValues(root: ComponentNode, path: string): JsonValue[] {
  if (path === '') return []

  const seen: JsonValue[] = []

  const add = (value: JsonValue | undefined): void => {
    if (value === undefined || seen.length >= MAX_CONTEXT_VALUES) return
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
    if (!condition || typeof condition !== 'object' || depth > MAX_CONDITION_DEPTH) return
    const shape = condition as Partial<Record<string, unknown>>

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

  // Called at a host's startup like `contextKeys`, so it must not throw either.
  const walkNode = (node: ComponentNode, depth = 0): void => {
    if (!node || typeof node !== 'object') return
    if (depth > MAX_TREE_DEPTH) return

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

    for (const child of Array.isArray(node.children) ? node.children : [])
      walkNode(child, depth + 1)
  }
  walkNode(root)

  return seen
}
