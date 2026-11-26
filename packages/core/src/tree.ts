/*
 * Nothing here mutates its input: the designer's undo stack holds references to
 * prior trees.
 */

import { MAX_CONDITION_DEPTH } from './condition.js'
import { BUILTIN_ACTION_NAMES } from './actions.js'
import { isRecord } from './guards.js'
import { MAX_KEY_LENGTH, keyProblem } from './keys.js'
import { rowScopeProblems } from './rows.js'
import type {
  ActionRef,
  ComponentNode,
  Condition,
  Device,
  EventName,
  FieldSchema,
  Language,
  Operand,
  PropValue,
  ValidationRule,
} from './types.js'

/** Depth-first, parents before children. */
export function walk(
  node: ComponentNode,
  fn: (node: ComponentNode, parent?: ComponentNode) => void,
): void {
  const visit = (n: ComponentNode, parent: ComponentNode | undefined, depth: number): void => {
    if (!n || typeof n !== 'object' || depth > MAX_TREE_DEPTH) return
    fn(n, parent)
    if (!Array.isArray(n.children)) return
    for (const child of n.children) visit(child, n, depth + 1)
  }
  visit(node, undefined, 0)
}

export function isRowScope(node: ComponentNode): boolean {
  return node?.schema?.type === 'array' && Array.isArray(node.children)
}

export function childNodesOf(node: ComponentNode): ComponentNode[] {
  if (!Array.isArray(node.children)) return []
  return node.children.filter(
    (child): child is ComponentNode => Boolean(child) && typeof child === 'object',
  )
}

export function findNode(root: ComponentNode, key: string, depth = 0): ComponentNode | undefined {
  if (!root || typeof root !== 'object' || depth > MAX_TREE_DEPTH) return undefined
  if (root.key === key) return root
  for (const child of childNodesOf(root)) {
    const hit = findNode(child, key, depth + 1)
    if (hit) return hit
  }
  return undefined
}

export function findParent(root: ComponentNode, key: string, depth = 0): ComponentNode | undefined {
  if (!root || typeof root !== 'object' || depth > MAX_TREE_DEPTH) return undefined
  for (const child of childNodesOf(root)) {
    if (child.key === key) return root
    const hit = findParent(child, key, depth + 1)
    if (hit) return hit
  }
  return undefined
}

/** Root to target, inclusive. Empty if not found. */
export function pathTo(root: ComponentNode, key: string): string[] {
  const search = (n: ComponentNode, trail: string[], depth: number): string[] | undefined => {
    if (!n || typeof n !== 'object' || depth > MAX_TREE_DEPTH) return undefined
    const next = [...trail, n.key]
    if (n.key === key) return next
    for (const child of childNodesOf(n)) {
      const hit = search(child, next, depth + 1)
      if (hit) return hit
    }
    return undefined
  }
  return search(root, [], 0) ?? []
}

export interface FlatNode {
  node: ComponentNode
  parentKey: string | undefined
  index: number
  depth: number
}

/** Parents before children. Not through `walk`, which passes neither index nor depth. */
export function flatten(root: ComponentNode): FlatNode[] {
  const out: FlatNode[] = []
  const visit = (
    node: ComponentNode,
    parentKey: string | undefined,
    index: number,
    depth: number,
  ): void => {
    // Total and bounded, like `walk`: a host's tree may be unvalidated.
    if (!node || typeof node !== 'object' || depth > MAX_TREE_DEPTH) return
    out.push({ node, parentKey, index, depth })
    childNodesOf(node).forEach((child, i) => visit(child, node.key, i, depth + 1))
  }
  visit(root, undefined, 0, 0)
  return out
}

export function collectKeys(root: ComponentNode): string[] {
  const keys: string[] = []
  walk(root, (n) => keys.push(n.key))
  return keys
}

export function generateKey(root: ComponentNode, type: string): string {
  const camel = type.charAt(0).toLowerCase() + type.slice(1)

  /*
   * Held to the key grammar `validateDocument` applies, since a kit may name a
   * type `Date-Picker` or `2FA`. Stripped rather than refused, so adding the
   * component never fails.
   */
  const cleaned = camel.replace(/[^A-Za-z0-9_]/g, '')
  const base = keyProblem(cleaned) ? 'field' : cleaned

  return freeKey(new Set(collectKeys(root)), base)
}

function freeKey(taken: Set<string>, base: string): string {
  if (!taken.has(base)) return base
  return numberedKey(taken, base, 2)
}

/**
 * Held to `MAX_KEY_LENGTH` so `validateDocument` accepts it. When the digits do
 * not fit, the base is shortened: the digits are what make the key unique.
 */
function numberedKey(taken: Set<string>, base: string, from: number): string {
  let n = from
  while (taken.has(base + String(n))) n += 1
  const minted = base + String(n)
  if (minted.length <= MAX_KEY_LENGTH) return minted

  const suffix = String(n)
  const room = MAX_KEY_LENGTH - suffix.length
  let trimmed = base.slice(0, Math.max(1, room)) + suffix
  let bump = n
  while (taken.has(trimmed)) {
    bump += 1
    const next = String(bump)
    trimmed = base.slice(0, Math.max(1, MAX_KEY_LENGTH - next.length)) + next
  }
  return trimmed
}

function baseOf(key: string): string {
  return key.replace(/\d+$/, '') || key
}

function copyKey(taken: Set<string>, key: string): string {
  const base = baseOf(key)
  const digits = /(\d+)$/.exec(key)?.[1]
  const from = digits === undefined ? 2 : Number(digits) + 1

  if (base === key && !taken.has(base)) return base

  return numberedKey(taken, base, from)
}

const SIDES = ['left', 'right', 'value'] as const

/**
 * A binding with every literal naming `from` changed to name `to`, shared by
 * `duplicateNode` and the designer's rename. A `Step`'s condition compares
 * `context.step` against its own key, so both must re-point it.
 *
 * Total: anything unreadable is returned as it stands. Only literals inside a
 * comparison that reads the context are rewritten: there a literal naming a key
 * means that node (`context.step == 'panel'`), elsewhere it is an answer's value
 * (`chosen == 'panel'`). A `ref` names a data key, which a copy shares.
 */
export function repointBinding(value: PropValue, from: string, to: string): PropValue {
  if (value.kind !== 'condition') return value

  const inCondition = (condition: Condition, depth = 0): Condition => {
    if (!condition || typeof condition !== 'object') return condition
    // The evaluator never reads past this depth, so leaving it as is changes nothing.
    if (depth > MAX_CONDITION_DEPTH) return condition

    const operand = (side: Operand | undefined): Operand | undefined =>
      side?.kind === 'literal' && side.value === from ? { kind: 'literal', value: to } : side

    const shape = condition as unknown as Record<string, unknown>
    const next: Record<string, unknown> = { ...shape }

    const readsContext = SIDES.some(
      (name) => (shape[name] as Operand | undefined)?.kind === 'context',
    )

    if (readsContext) {
      for (const name of SIDES) {
        if (shape[name] !== undefined) next[name] = operand(shape[name] as Operand)
      }
      if (Array.isArray(shape['options'])) {
        next['options'] = (shape['options'] as unknown[]).map((option) =>
          option === from ? to : option,
        )
      }
    }

    if (Array.isArray(shape['conditions'])) {
      next['conditions'] = (shape['conditions'] as Condition[]).map((each) =>
        inCondition(each, depth + 1),
      )
    }
    if (shape['condition'] !== undefined) {
      next['condition'] = inCondition(shape['condition'] as Condition, depth + 1)
    }

    return next as unknown as Condition
  }

  return { kind: 'condition', condition: inCondition(value.condition) }
}

export function repointDataKey(
  value: PropValue,
  from: string,
  to: string,
  scope?: 'form' | 'row',
): PropValue {
  if (!value || typeof value !== 'object' || value.kind !== 'condition') return value

  const inCondition = (condition: Condition, depth = 0): Condition => {
    if (!condition || typeof condition !== 'object') return condition
    if (depth > MAX_CONDITION_DEPTH) return condition

    const operand = (side: Operand | undefined): Operand | undefined =>
      side?.kind === 'ref' &&
      side.dataKey === from &&
      (scope === undefined || (side.scope ?? 'form') === scope)
        ? { ...side, dataKey: to }
        : side

    const shape = condition as unknown as Record<string, unknown>
    const next: Record<string, unknown> = { ...shape }

    // Every side, with no `readsContext` test: unlike a literal, a ref always names a data key.
    for (const name of SIDES) {
      if (shape[name] !== undefined) next[name] = operand(shape[name] as Operand)
    }

    if (Array.isArray(shape['conditions'])) {
      next['conditions'] = (shape['conditions'] as Condition[]).map((each) =>
        inCondition(each, depth + 1),
      )
    }
    if (shape['condition'] !== undefined) {
      next['condition'] = inCondition(shape['condition'] as Condition, depth + 1)
    }

    return next as unknown as Condition
  }

  return { ...value, condition: inCondition(value.condition) }
}

/**
 * Keys of the nodes that answer under one data key. Two fields behind opposite `renderWhen`
 * guards may write one answer: while another in the same row scope still writes the name,
 * every ref to it still resolves, and a rename must leave them.
 */
export function writersOf(root: ComponentNode, dataKey: string): string[] {
  const keys: string[] = []
  walk(root, (node) => {
    if (node.schema && dataKeyOf(node) === dataKey) keys.push(node.key)
  })
  return keys
}

/** Returns the re-keyed copy of the subtree at `key`, inserted nowhere. */
export function duplicateNode(root: ComponentNode, key: string): ComponentNode | undefined {
  const source = findNode(root, key)
  if (!source) return undefined

  const taken = new Set(collectKeys(root))

  const copy = (node: ComponentNode): ComponentNode => {
    const nextKey = copyKey(taken, node.key)
    taken.add(nextKey)

    const next: ComponentNode = { ...node, key: nextKey, props: { ...node.props } }

    if (node.renderWhen) next.renderWhen = repointBinding(node.renderWhen, node.key, nextKey)

    if (node.schema) {
      next.schema = Array.isArray(node.schema.validations)
        ? { ...node.schema, validations: [...node.schema.validations] }
        : { ...node.schema }
    }
    if (node.css) next.css = { ...node.css }
    if (node.events) {
      next.events = Object.fromEntries(
        Object.entries(node.events).map(([event, actions]) => [
          event,
          Array.isArray(actions) ? [...actions] : actions,
        ]),
      )
    }

    if (Array.isArray(node.children)) next.children = childNodesOf(node).map(copy)
    else if (node.children !== undefined) next.children = node.children
    return next
  }

  return copy(source)
}

export function updateNode(
  root: ComponentNode,
  key: string,
  update: (node: ComponentNode) => ComponentNode,
  depth = 0,
): ComponentNode {
  // Total and bounded, like `walk`: a host's tree may be unvalidated.
  if (!root || typeof root !== 'object' || depth > MAX_TREE_DEPTH) return root
  if (root.key === key) return update(root)
  if (!Array.isArray(root.children)) return root

  let found = false
  let changed = false
  const children = childNodesOf(root).map((child) => {
    if (found) return child
    if (findNode(child, key)) found = true
    const next = updateNode(child, key, update, depth + 1)
    if (next !== child) changed = true
    return next
  })

  return changed ? { ...root, children } : root
}

/** Appends when `index` is omitted. */
export function insertNode(
  root: ComponentNode,
  parentKey: string,
  node: ComponentNode,
  index?: number,
): ComponentNode {
  return updateNode(root, parentKey, (parent) => {
    /*
     * A leaf (no `children` array) is never given children: no renderer draws
     * them, but `validateForm` and `toJsonSchema` still walk them.
     */
    if (!Array.isArray(parent.children)) return parent

    const children = [...parent.children]

    // `splice` reads NaN as 0, so a non-finite index would prepend. It appends instead.
    const at = Number.isFinite(index) ? (index as number) : children.length
    children.splice(Math.max(0, Math.min(at, children.length)), 0, node)
    return { ...parent, children }
  })
}

/** Removing the root is a no-op. */
export function removeNode(root: ComponentNode, key: string, depth = 0): ComponentNode {
  // Total and bounded, for the reason `updateNode` gives.
  if (!root || typeof root !== 'object' || depth > MAX_TREE_DEPTH) return root
  if (root.key === key) return root
  if (!Array.isArray(root.children)) return root

  // The first match only, like every lookup.
  let changed = false
  const children: ComponentNode[] = []

  for (const child of childNodesOf(root)) {
    if (!changed && child.key === key) {
      changed = true
      continue
    }
    if (changed) {
      children.push(child)
      continue
    }
    const next = removeNode(child, key, depth + 1)
    if (next !== child) changed = true
    children.push(next)
  }

  // A remove that finds nothing returns `root` itself, so undo does not record it.
  return changed ? { ...root, children } : root
}

/**
 * Returns the tree unchanged if the move is illegal, such as an unknown key, the root, or a
 * node into itself.
 */
export function moveNode(
  root: ComponentNode,
  key: string,
  newParentKey: string,
  index?: number,
): ComponentNode {
  if (key === root.key) return root
  const node = findNode(root, key)
  if (!node) return root

  const parent = findNode(root, newParentKey)
  if (!parent) return root

  if (!Array.isArray(parent.children)) return root

  if (pathTo(node, newParentKey).length > 0) return root
  return insertNode(removeNode(root, key), newParentKey, node, index)
}

/** Form data is keyed by this, never by `node.key`. */
export function dataKeyOf(node: ComponentNode): string {
  return node.dataKey ?? node.key
}

export function validationsOf(node: ComponentNode): ValidationRule[] {
  const rules = node.schema?.validations
  return Array.isArray(rules) ? rules : []
}

export interface StructuralError {
  code:
    | 'duplicate-key'
    | 'unknown-action'
    | 'empty-key'
    | 'empty-data-key'
    | 'invalid-key'
    | 'invalid-data-key'
    | 'row-scope'
    | 'unknown-language'
    | 'malformed'
  message: string
  key?: string
}

// `RULE_KEY_LIST` is not read from `DEFAULT_MESSAGES`: `validation.ts` imports this file, so
// that is a cycle.
const BINDING_KIND_LIST = [
  'static',
  'computed',
  'i18n',
  'condition',
] as const satisfies readonly PropValue['kind'][]

const RULE_KEY_LIST = [
  'required',
  'minLength',
  'maxLength',
  'minItems',
  'maxItems',
  'min',
  'max',
  'matches',
  'after',
  'pattern',
  'email',
  'url',
  'uuid',
  'custom',
] as const satisfies readonly ValidationRule['key'][]

type Covers<Union extends string, Listed extends string> = [Exclude<Union, Listed>] extends [never]
  ? true
  : ['missing from the list:', Exclude<Union, Listed>]

const BINDING_KINDS_COVER_THE_UNION: Covers<PropValue['kind'], (typeof BINDING_KIND_LIST)[number]> =
  true

const RULE_KEYS_COVER_THE_UNION: Covers<ValidationRule['key'], (typeof RULE_KEY_LIST)[number]> =
  true

// Read once each, so the assertions above are not dead code to the linter.
void BINDING_KINDS_COVER_THE_UNION
void RULE_KEYS_COVER_THE_UNION

const BINDING_KINDS: ReadonlySet<string> = new Set(BINDING_KIND_LIST)
const RULE_KEYS: ReadonlySet<string> = new Set(RULE_KEY_LIST)

const FIELD_TYPE_LIST = [
  'string',
  'number',
  'boolean',
  'date',
  'array',
  'object',
  'file',
] as const satisfies readonly FieldSchema['type'][]

const DEVICE_LIST = ['any', 'desktop', 'tablet', 'mobile'] as const satisfies readonly Device[]

const EVENT_NAME_LIST = [
  'onChange',
  'onClick',
  'onBlur',
  'onFocus',
  'onMount',
  'onUnmount',
] as const satisfies readonly EventName[]

const CONDITION_OP_LIST = [
  'eq',
  'ne',
  'gt',
  'gte',
  'lt',
  'lte',
  'empty',
  'notEmpty',
  'truthy',
  'falsy',
  'in',
  'notIn',
  'and',
  'or',
  'not',
] as const satisfies readonly Condition['op'][]

const OPERAND_KIND_LIST = [
  'literal',
  'ref',
  'context',
] as const satisfies readonly Operand['kind'][]

const ACTION_REF_TYPE_LIST = ['code', 'builtin'] as const satisfies readonly ActionRef['type'][]

const BIDI_LIST = ['ltr', 'rtl'] as const satisfies readonly Language['bidi'][]

type RefScope = NonNullable<Extract<Operand, { kind: 'ref' }>['scope']>

const ROW_SCOPE_LIST = ['form', 'row'] as const satisfies readonly RefScope[]

const FIELD_TYPES_COVER_THE_UNION: Covers<FieldSchema['type'], (typeof FIELD_TYPE_LIST)[number]> =
  true
const DEVICES_COVER_THE_UNION: Covers<Device, (typeof DEVICE_LIST)[number]> = true
const EVENTS_COVER_THE_UNION: Covers<EventName, (typeof EVENT_NAME_LIST)[number]> = true
const OPS_COVER_THE_UNION: Covers<Condition['op'], (typeof CONDITION_OP_LIST)[number]> = true
const OPERANDS_COVER_THE_UNION: Covers<Operand['kind'], (typeof OPERAND_KIND_LIST)[number]> = true
const ACTION_TYPES_COVER_THE_UNION: Covers<
  ActionRef['type'],
  (typeof ACTION_REF_TYPE_LIST)[number]
> = true
const BIDI_COVERS_THE_UNION: Covers<Language['bidi'], (typeof BIDI_LIST)[number]> = true
const ROW_SCOPES_COVER_THE_UNION: Covers<RefScope, (typeof ROW_SCOPE_LIST)[number]> = true

void FIELD_TYPES_COVER_THE_UNION
void DEVICES_COVER_THE_UNION
void EVENTS_COVER_THE_UNION
void OPS_COVER_THE_UNION
void OPERANDS_COVER_THE_UNION
void ACTION_TYPES_COVER_THE_UNION
void BIDI_COVERS_THE_UNION
void ROW_SCOPES_COVER_THE_UNION

const FIELD_TYPES: ReadonlySet<string> = new Set(FIELD_TYPE_LIST)
const DEVICES: ReadonlySet<string> = new Set(DEVICE_LIST)
const EVENT_NAMES: ReadonlySet<string> = new Set(EVENT_NAME_LIST)
const CONDITION_OPS: ReadonlySet<string> = new Set(CONDITION_OP_LIST)
const OPERAND_KINDS: ReadonlySet<string> = new Set(OPERAND_KIND_LIST)
const ACTION_REF_TYPES: ReadonlySet<string> = new Set(ACTION_REF_TYPE_LIST)
const BUILTIN_ACTIONS: ReadonlySet<string> = new Set(BUILTIN_ACTION_NAMES)
const BIDI: ReadonlySet<string> = new Set(BIDI_LIST)
const ROW_SCOPES: ReadonlySet<string> = new Set(ROW_SCOPE_LIST)

/** How deep a document this gate will walk before refusing it. */
export const MAX_TREE_DEPTH = 500

function inspectDocument(doc: unknown): StructuralError[] {
  const errors: StructuralError[] = []
  const seen = new Set<string>()

  const malformed = (message: string): void => {
    errors.push({ code: 'malformed', message })
  }

  const candidate: unknown = doc
  if (!isRecord(candidate)) {
    malformed('A form document must be an object.')
    return errors
  }

  if (candidate['version'] !== '1') {
    malformed(
      'version is ' +
        JSON.stringify(candidate['version']) +
        ', and this library writes version "1".',
    )
  }
  if (typeof candidate['id'] !== 'string') malformed('id must be text.')
  if (typeof candidate['name'] !== 'string') malformed('name must be text.')

  const settings = candidate['settings']
  if (settings !== undefined) {
    if (!isRecord(settings)) {
      malformed('settings must be an object.')
    } else if (Object.keys(settings).length > 0) {
      malformed('version 1 does not define document settings.')
    }
  }

  const actions = isRecord(candidate['actions']) ? candidate['actions'] : undefined
  if (candidate['actions'] !== undefined && !actions) malformed('actions must be an object.')

  /*
   * An action is JavaScript the host will run in its sandbox. A `body` that is
   * not a string reaches that sandbox as whatever it is.
   */
  for (const [name, action] of Object.entries(actions ?? {})) {
    if (!isRecord(action)) {
      malformed('actions.' + name + ' is not an action.')
      continue
    }
    if (typeof action['name'] !== 'string') malformed('actions.' + name + ' needs a name.')
    if (typeof action['body'] !== 'string') malformed('actions.' + name + ' needs a body.')
    if (action['params'] !== undefined && !isRecord(action['params'])) {
      malformed('actions.' + name + ' has params that are not an object.')
    }
  }

  const translations = candidate['translations']
  if (!isRecord(translations)) {
    malformed('translations must be an object mapping each language tag to its bundle.')
  } else {
    for (const [tag, bundle] of Object.entries(translations)) {
      if (!isRecord(bundle)) {
        malformed('translations.' + tag + ' must be an object.')
        continue
      }
      for (const [key, text] of Object.entries(bundle)) {
        if (typeof text !== 'string') {
          malformed('translations.' + tag + '.' + key + ' must be a string.')
        }
      }
    }
  }

  const visit = (value: unknown, path: string, depth = 0): void => {
    if (!isRecord(value)) {
      malformed(path + ' is not a component node.')
      return
    }
    if (depth > MAX_TREE_DEPTH) {
      malformed(path + ' is nested deeper than this library will walk.')
      return
    }

    const key = value['key']
    const type = value['type']

    if (typeof type !== 'string') malformed(path + ' needs a string type.')

    if (typeof key !== 'string') {
      malformed(path + ' needs a string key.')
    } else if (!key.trim()) {
      errors.push({
        code: 'empty-key',
        message:
          'Component of type ' +
          (typeof type === 'string' ? type : 'unknown') +
          ' has an empty key.',
      })
    } else {
      if (seen.has(key)) {
        errors.push({ code: 'duplicate-key', message: 'Duplicate key: ' + key, key })
      }
      seen.add(key)

      const problem = keyProblem(key)
      if (problem) {
        errors.push({ code: 'invalid-key', message: 'Component ' + key + ': ' + problem, key })
      }

      // Not checked for uniqueness: two guarded fields may write one answer.
      const dataKey = value['dataKey']
      if (dataKey !== undefined && typeof dataKey !== 'string') {
        errors.push({
          code: 'invalid-data-key',
          message:
            'Component ' + key + ' has a data key that is not text: ' + JSON.stringify(dataKey),
          key,
        })
      } else if (dataKey !== undefined && !dataKey.trim()) {
        errors.push({
          code: 'empty-data-key',
          message: 'Component ' + key + ' has an empty data key.',
          key,
        })
      } else if (dataKey !== undefined) {
        // A data key becomes a JSON Schema property name and a submitted payload key.
        const problem = keyProblem(dataKey)
        if (problem) {
          errors.push({
            code: 'invalid-data-key',
            message: 'Component ' + key + ' has an invalid data key: ' + problem,
            key,
          })
        }
      }

      visitEvents(value['events'], key, path)
    }

    visitShape(value, typeof key === 'string' && key.trim() ? key : path, path)

    const children = value['children']
    if (children === undefined) return
    if (!Array.isArray(children)) {
      malformed(path + '.children must be an array.')
      return
    }
    children.forEach((child, index) =>
      visit(child, path + '.children[' + String(index) + ']', depth + 1),
    )
  }

  const visitShape = (node: Record<string, unknown>, key: string, path: string): void => {
    const where = (what: string): string => what + ' on ' + key

    const oneOf = (value: unknown, allowed: ReadonlySet<string>, what: string): boolean => {
      if (typeof value === 'string' && allowed.has(value)) return true
      malformed(
        where(what) +
          ' is ' +
          JSON.stringify(value) +
          ', which is not one of ' +
          [...allowed].join(', ') +
          '.',
      )
      return false
    }

    const text = (value: unknown, what: string): void => {
      if (typeof value !== 'string') malformed(where(what) + ' must be text.')
    }

    const binding = (value: unknown, what: string): void => {
      if (value === undefined) return
      if (!isRecord(value)) {
        malformed(where(what) + ' must be an object.')
        return
      }
      if (!oneOf(value['kind'], BINDING_KINDS, what + "'s kind")) return

      switch (value['kind']) {
        case 'static':
          // Unconstrained on purpose: the kit decides what a static value means.
          if (!('value' in value)) malformed(where(what) + ' is static with no value.')
          return
        case 'computed':
          text(value['expression'], what + "'s expression")
          return
        case 'i18n':
          text(value['key'], what + "'s key")
          return
        case 'condition':
          condition(value['condition'], what + "'s condition")
          return
        /*
         * `condition` stays its own case: a new kind added to the union passes
         * `oneOf` and lands here, and must not be validated as a condition.
         */
        default:
          return
      }
    }

    const operand = (value: unknown, what: string): void => {
      if (!isRecord(value)) {
        malformed(where(what) + ' must be an object.')
        return
      }
      if (!oneOf(value['kind'], OPERAND_KINDS, what + "'s kind")) return

      if (value['kind'] === 'ref') {
        text(value['dataKey'], what + "'s data key")
        if (value['scope'] !== undefined) oneOf(value['scope'], ROW_SCOPES, what + "'s scope")
        return
      }
      if (value['kind'] === 'context') {
        /*
         * Non-empty, unlike other strings here: `readPath(context, '')` is always
         * undefined, so the condition is always false, and `contextKeys` skips it.
         */
        const path = value['path']
        if (typeof path !== 'string' || path === '') {
          malformed(where(what + "'s path") + ' must be a path the host can hold.')
        }
      }
      // A literal holds any JSON, including none: `{ kind: 'literal' }` reads as
      // undefined, which is what an unanswered field reads as too.
    }

    const condition = (value: unknown, what: string, depth = 0): void => {
      if (!isRecord(value)) {
        malformed(where(what) + ' must be an object.')
        return
      }

      if (depth > MAX_CONDITION_DEPTH) {
        malformed(where(what) + ' is nested deeper than this library will walk.')
        return
      }
      const op = value['op']
      if (!oneOf(op, CONDITION_OPS, what + "'s operator")) return

      if (op === 'and' || op === 'or') {
        const inner = value['conditions']
        if (!Array.isArray(inner)) {
          malformed(where(what) + ' must hold a list of conditions.')
          return
        }
        inner.forEach((each, i) => condition(each, what + '[' + String(i) + ']', depth + 1))
        return
      }
      if (op === 'not') {
        condition(value['condition'], what + "'s inner condition", depth + 1)
        return
      }
      if (op === 'in' || op === 'notIn') {
        operand(value['value'], what + "'s subject")
        if (!Array.isArray(value['options'])) {
          malformed(where(what) + ' must hold a list of options.')
        }
        return
      }
      if (
        op === 'eq' ||
        op === 'ne' ||
        op === 'gt' ||
        op === 'gte' ||
        op === 'lt' ||
        op === 'lte'
      ) {
        operand(value['left'], what + "'s left side")
        operand(value['right'], what + "'s right side")
        return
      }
      operand(value['value'], what + "'s subject")
    }

    const props = node['props']
    if (!isRecord(props)) {
      malformed(path + '.props must be an object.')
    } else {
      for (const [name, value] of Object.entries(props)) binding(value, 'property ' + name)
    }

    binding(node['renderWhen'], 'renderWhen')

    const css = node['css']
    if (css !== undefined) {
      if (!isRecord(css)) {
        malformed(where('css') + ' must be an object keyed by breakpoint.')
      } else {
        for (const [device, declarations] of Object.entries(css)) {
          oneOf(device, DEVICES, 'a css breakpoint')
          /*
           * Text only. Safety is `safeDeclarations`' job at render time: refusing
           * unsafe CSS here would stop the Style tab opening the document to fix it.
           */
          text(declarations, 'the css for ' + device)
        }
      }
    }

    const schema = node['schema']
    if (schema === undefined) return
    if (!isRecord(schema)) {
      malformed(path + '.schema must be an object.')
      return
    }

    oneOf(schema['type'], FIELD_TYPES, "the field's data type")
    if (schema['autoValidate'] !== undefined && typeof schema['autoValidate'] !== 'boolean') {
      malformed(where('autoValidate') + ' must be true or false.')
    }

    const validations = schema['validations']
    if (validations === undefined) return
    if (!Array.isArray(validations)) {
      malformed(path + '.schema.validations must be an array.')
      return
    }

    for (const rule of validations) {
      if (!isRecord(rule)) {
        malformed(path + '.schema.validations holds an entry that is not a rule.')
        continue
      }

      const named = 'rule ' + JSON.stringify(rule['key'])
      if (!oneOf(rule['key'], RULE_KEYS, 'a rule key')) continue

      /*
       * A wrong parameter type fails quietly: a string bound compares
       * lexicographically, and `pattern` goes to `RegExp`.
       */
      const k = rule['key']
      if (
        k === 'minLength' ||
        k === 'maxLength' ||
        k === 'minItems' ||
        k === 'maxItems' ||
        k === 'min' ||
        k === 'max'
      ) {
        if (typeof rule['value'] !== 'number') malformed(where(named) + ' needs a number.')
      } else if (k === 'pattern') {
        text(rule['value'], named + "'s pattern")
      } else if (k === 'matches' || k === 'after') {
        text(rule['field'], named + "'s field")
        if (rule['scope'] !== undefined && rule['scope'] !== 'form' && rule['scope'] !== 'row') {
          malformed(where(named) + "'s scope must be form or row.")
        }
      } else if (k === 'custom') {
        text(rule['expression'], named + "'s expression")
      }

      if (rule['message'] !== undefined) {
        if (typeof rule['message'] === 'string') text(rule['message'], named + "'s message")
        else binding(rule['message'], named + "'s message")
      }
      binding(rule['when'], named + "'s guard")
    }
  }

  const visitEvents = (events: unknown, key: string, path: string): void => {
    if (events === undefined) return
    if (!isRecord(events)) {
      malformed(path + '.events must be an object.')
      return
    }

    for (const [event, refs] of Object.entries(events)) {
      if (!EVENT_NAMES.has(event)) {
        malformed(
          'Component ' +
            key +
            ' subscribes to ' +
            JSON.stringify(event) +
            ', which is not an event this library raises.',
        )
        continue
      }
      if (!Array.isArray(refs)) {
        malformed(path + '.events must map each event to an array.')
        continue
      }
      for (const ref of refs) {
        if (!isRecord(ref)) {
          malformed(path + '.events contains an entry that is not an action reference.')
          continue
        }
        const name = ref['name']
        if (typeof name !== 'string') {
          malformed(path + '.events holds an action reference with no name.')
          continue
        }
        if (ref['params'] !== undefined && !isRecord(ref['params'])) {
          malformed(path + '.events contains an action reference whose params are not an object.')
        }
        if (!ACTION_REF_TYPES.has(ref['type'] as string)) {
          malformed(
            'Component ' +
              key +
              ' references ' +
              name +
              ' as ' +
              JSON.stringify(ref['type']) +
              ', which is neither code nor builtin.',
          )
          continue
        }
        if (ref['type'] === 'builtin') {
          if (!BUILTIN_ACTIONS.has(name)) {
            malformed('Component ' + key + ' references unknown built-in action ' + name + '.')
          }
          continue
        }
        // Own keys only: a plain lookup finds `Object.prototype.toString`.
        if (!actions || !Object.hasOwn(actions, name)) {
          errors.push({
            code: 'unknown-action',
            message: 'Component ' + key + ' references undefined action ' + name + '.',
            key,
          })
        }
      }
    }
  }

  visit(candidate['root'], 'root')

  const rootNode = candidate['root']
  if (isRecord(rootNode)) {
    for (const found of rowScopeProblems(rootNode as unknown as ComponentNode)) {
      errors.push({ code: 'row-scope', message: found.problem, key: found.key })
    }
  }

  const languages = candidate['languages']
  if (!Array.isArray(languages)) {
    malformed('languages must be an array.')
    return errors
  }

  const tags = languages.map((language) => {
    if (!isRecord(language) || typeof language['code'] !== 'string') return undefined

    if (typeof language['name'] !== 'string') malformed('every language needs a name.')
    if (!BIDI.has(language['bidi'] as string)) {
      malformed(
        'language ' +
          String(language['code']) +
          ' is ' +
          JSON.stringify(language['bidi']) +
          ', and a language reads left to right or right to left.',
      )
    }
    /*
     * Must match `languageTag`: an empty dialect is no dialect. Spelled out
     * because that function takes a typed `Language`.
     */
    const dialect = language['dialect']
    return typeof dialect === 'string' && dialect
      ? language['code'] + '-' + dialect
      : language['code']
  })

  if (tags.some((tag) => tag === undefined)) malformed('every language needs a string code.')

  const named = tags.filter((tag): tag is string => tag !== undefined)

  if (!named.includes(candidate['defaultLanguage'] as string)) {
    errors.push({
      code: 'unknown-language',
      message: 'defaultLanguage ' + String(candidate['defaultLanguage']) + ' is not in languages.',
    })
  }

  return errors
}

/** Never throws, even on unreadable objects. */
export function validateDocument(doc: unknown): StructuralError[] {
  try {
    return inspectDocument(doc)
  } catch {
    return [{ code: 'malformed', message: 'The form document could not be read safely.' }]
  }
}
