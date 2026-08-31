/**
 * Immutable operations over the component tree.
 *
 * Every mutation returns a new tree and leaves the input untouched, because the
 * designer's undo stack holds references to prior states. Nothing here mutates.
 */

import { MAX_CONDITION_DEPTH } from './condition.js'
import { keyProblem } from './keys.js'
import { rowScopeProblems } from './rows.js'
import type {
  ActionRef,
  ComponentNode,
  Condition,
  Device,
  EventName,
  FieldSchema,
  FormDocument,
  Language,
  Operand,
  PropValue,
  ValidationRule,
} from './types.js'

/** Depth-first walk, parents before children. */
export function walk(
  node: ComponentNode,
  fn: (node: ComponentNode, parent?: ComponentNode) => void,
): void {
  const visit = (n: ComponentNode, parent?: ComponentNode): void => {
    fn(n, parent)
    for (const child of n.children ?? []) visit(child, n)
  }
  visit(node)
}

/*
 * First match, in document order.
 *
 * Keys are unique — `validateDocument` reports a duplicate and the panel refuses
 * a rename that would make one — but reporting is not preventing, and a host can
 * render a document it never validated. These used to assign on every match with
 * no early exit, so they returned the *last* one while `pathTo` below returned
 * the first. Two functions in this file disagreeing about which node a key means
 * is a bug with no defensible reading, whichever answer is right.
 *
 * First, because that is what `pathTo` already does and what `querySelector`
 * does in `geometry.ts`, so all three now agree.
 */
export function findNode(root: ComponentNode, key: string): ComponentNode | undefined {
  if (root.key === key) return root
  for (const child of root.children ?? []) {
    const hit = findNode(child, key)
    if (hit) return hit
  }
  return undefined
}

export function findParent(root: ComponentNode, key: string): ComponentNode | undefined {
  for (const child of root.children ?? []) {
    if (child.key === key) return root
    const hit = findParent(child, key)
    if (hit) return hit
  }
  return undefined
}

/** Keys from the root down to the target, inclusive. Empty if not found. */
export function pathTo(root: ComponentNode, key: string): string[] {
  const search = (n: ComponentNode, trail: string[]): string[] | undefined => {
    const next = [...trail, n.key]
    if (n.key === key) return next
    for (const child of n.children ?? []) {
      const hit = search(child, next)
      if (hit) return hit
    }
    return undefined
  }
  return search(root, []) ?? []
}

/** One node's place in the tree, as a flat list in document order. */
export interface FlatNode {
  node: ComponentNode
  /** Undefined for the root. */
  parentKey: string | undefined
  /** Position among its parent's children. */
  index: number
  /** Root is 0; deeper nodes count up. */
  depth: number
}

/**
 * The tree as a flat list, parents before children.
 *
 * This is the order the structure panel draws and the order keyboard navigation
 * moves through, so both read it from here rather than each walking the tree and
 * disagreeing about what "the next row" means.
 */
export function flatten(root: ComponentNode): FlatNode[] {
  const out: FlatNode[] = []
  const visit = (
    node: ComponentNode,
    parentKey: string | undefined,
    index: number,
    depth: number,
  ): void => {
    out.push({ node, parentKey, index, depth })
    node.children?.forEach((child, i) => visit(child, node.key, i, depth + 1))
  }
  visit(root, undefined, 0, 0)
  return out
}

export function collectKeys(root: ComponentNode): string[] {
  const keys: string[] = []
  walk(root, (n) => keys.push(n.key))
  return keys
}

/**
 * Generate the next free key for a component type: textField, textField2,
 * textField3. Matches the convention users already expect from other builders.
 */
export function generateKey(root: ComponentNode, type: string): string {
  const camel = type.charAt(0).toLowerCase() + type.slice(1)

  /*
   * Held to the same grammar the document's own validator applies. A kit is free
   * to type a component `Date-Picker` or `2FA`, and the key minted from it went
   * straight into a document `validateDocument` then refused -- a component the
   * palette adds and the JSON dialog will not accept back.
   *
   * Stripping rather than refusing: dropping a component is not the answer to a
   * hyphen in a type name, and `field` is always a name.
   */
  const cleaned = camel.replace(/[^A-Za-z0-9_]/g, '')
  const base = keyProblem(cleaned) ? 'field' : cleaned

  return freeKey(new Set(collectKeys(root)), base)
}

/**
 * The first key starting from `base` that nothing has taken.
 *
 * Shared, so the two callers cannot drift on how a numbered key is formed. What
 * they differ on is the base, and deliberately: a new component has only its
 * type to be named after, while a copy has the original's name, which is worth
 * far more. Duplicating `emailAddress` should not produce `textField7`.
 */
function freeKey(taken: Set<string>, base: string): string {
  if (!taken.has(base)) return base
  let n = 2
  while (taken.has(base + String(n))) n += 1
  return base + String(n)
}

/** A key's name with any trailing number removed, so `website2` copies to `website3`. */
function baseOf(key: string): string {
  return key.replace(/\d+$/, '') || key
}

/**
 * A copy of the subtree at `key`, with every key in it replaced by a free one.
 *
 * Keys are unique within a document, so a copy cannot keep the originals. Each
 * is re-keyed from the original's own name rather than its type, because the
 * name is the part worth keeping: `website` copies to `website2`, not to
 * `textField7`.
 *
 * Every key generated is reserved before the next is chosen. Without that, a
 * container holding two `textField` children produces a copy whose children are
 * both named `textField3`, and the document fails its own validation.
 *
 * The copy is returned rather than inserted. Where a duplicate belongs is a
 * question about the tree the caller is holding, not about the node.
 *
 * Property values and rules are shared by reference, not cloned. Tree operations
 * are immutable, so an edit to either copy replaces the value rather than
 * writing through to the other.
 */
/**
 * A binding with every literal naming `from` changed to name `to`.
 *
 * Exported because two callers need the same rule: `duplicateNode` below, which
 * re-points a copy's own condition at its new key, and the designer's rename,
 * which has the same problem arriving from the other direction. A `Step` ships
 * with a condition comparing `context.step` against its own key, so either
 * operation leaves it naming a component that is not there.
 *
 * Structural and total, because a document is data: anything unreadable is
 * returned as it stands rather than throwing. Only literals are touched, and
 * only ones equal to the old key — a `ref` names a data key, which the copy
 * shares deliberately.
 *
 * And only inside a comparison that reads the host context, which is the part
 * this got wrong. A literal equal to a node key means "this node" when it is
 * being compared against `context.step`; in `chosen == 'panel'` the same string
 * is an answer's value, and rewriting it changed which answer reveals the copy.
 * `duplicateNode` said as much in a comment while calling a function that did
 * the opposite, and `renameKey` in the designer inherited it: renaming a
 * component silently rewrote every condition comparing an answer to a value
 * that happened to match the old key.
 */
/** The three places an operand can sit in a condition. */
const SIDES = ['left', 'right', 'value'] as const

export function repointBinding(value: PropValue, from: string, to: string): PropValue {
  if (value.kind !== 'condition') return value

  const inCondition = (condition: Condition, depth = 0): Condition => {
    if (!condition || typeof condition !== 'object') return condition
    /*
     * Returned as it stands past the bound, which is what "total, and anything
     * unreadable is returned as it stands" above already promised for every
     * other malformed shape. It had no bound at all, so a document nested deep
     * enough turned a duplicate or a rename into a `RangeError` in the store.
     *
     * The same number the evaluator stops at: a condition deeper than that is
     * one nothing will ever read, so leaving it unrewritten changes no
     * behaviour a form can observe.
     */
    if (depth > MAX_CONDITION_DEPTH) return condition

    const operand = (side: Operand | undefined): Operand | undefined =>
      side?.kind === 'literal' && side.value === from ? { kind: 'literal', value: to } : side

    const shape = condition as unknown as Record<string, unknown>
    const next: Record<string, unknown> = { ...shape }

    /*
     * Does this comparison read the context? That is what tells a key from a
     * value: `context.step == 'welcome'` is about the component named `welcome`,
     * `chosen == 'welcome'` is about an answer that happens to spell the same
     * string, and only the first should follow a copy or a rename.
     */
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
      /*
       * `(each) => inCondition(each, depth + 1)`, never a bare `.map(inCondition)`.
       * `map` hands its callback the index as a second argument, so passing the
       * function directly would feed the array position in as the depth and
       * bound nothing.
       */
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

export function duplicateNode(root: ComponentNode, key: string): ComponentNode | undefined {
  const source = findNode(root, key)
  if (!source) return undefined

  const taken = new Set(collectKeys(root))

  const copy = (node: ComponentNode): ComponentNode => {
    const nextKey = freeKey(taken, baseOf(node.key))
    taken.add(nextKey)

    const next: ComponentNode = { ...node, key: nextKey, props: { ...node.props } }

    /*
     * A condition that names this node's own key follows the copy.
     *
     * `Step` ships with a `renderWhen` comparing `context.step` against its own
     * key — that is what makes it a step. Copied by reference, the duplicate was
     * shown by the *original's* name: two steps render at once and the copy can
     * never be reached by its own. `factory.ts` applies `defaultRenderWhen`
     * after the key for exactly this reason, and duplication is the same moment
     * arriving by a different route.
     *
     * Only a literal equal to the old key, only in `renderWhen`, and only where
     * the comparison reads the context. Rewriting every literal that happens to
     * match corrupts a condition testing an answer whose value is the copied
     * key, which is what it used to do: this comment described the rule the
     * function did not have until a test asked it for one.
     */
    if (node.renderWhen) next.renderWhen = repointBinding(node.renderWhen, node.key, nextKey)
    /*
     * The rules are copied, and only if the document has any.
     *
     * `[...node.schema.validations]` threw on a schema without them, which
     * `validateDocument` accepts. Defaulting to `[]` would fix the throw and
     * quietly give the copy a field the original did not have -- a duplicate
     * should be the same document twice, including where it is silent.
     */
    if (node.schema) {
      next.schema = Array.isArray(node.schema.validations)
        ? { ...node.schema, validations: [...node.schema.validations] }
        : { ...node.schema }
    }
    /*
     * `css` and `events` too. Both are records a panel writes into, and the copy
     * shared them by reference: styling the duplicate restyled the original,
     * and every event handler wired on one appeared on the other. Tree
     * operations are immutable, so the panels replace rather than mutate and
     * nothing has gone wrong yet -- which is exactly when this is cheap.
     */
    if (node.css) next.css = { ...node.css }
    if (node.events) {
      next.events = Object.fromEntries(
        Object.entries(node.events).map(([event, actions]) => [
          event,
          Array.isArray(actions) ? [...actions] : actions,
        ]),
      )
    }
    if (node.children) next.children = node.children.map(copy)
    return next
  }

  return copy(source)
}

/** Replace the node matching key, returning a new tree. */
/**
 * Replace one node, sharing structure with everything that did not change.
 *
 * The identity checks matter as much as the result. `.map` over the children
 * allocated a new object for every node on every edit, so an untouched sibling
 * subtree came back new, `React.memo` could never skip anything, and a no-op
 * edit produced a whole new tree that the undo stack then recorded as a version.
 * ARCHITECTURE.md has always claimed otherwise; now it is true.
 */
export function updateNode(
  root: ComponentNode,
  key: string,
  update: (node: ComponentNode) => ComponentNode,
): ComponentNode {
  if (root.key === key) return update(root)
  if (!root.children) return root

  /*
   * The first match, and only the first.
   *
   * `findNode`, `findParent` and `pathTo` all deliberately take the first, with
   * a comment above them saying why: two functions disagreeing about which node
   * a key means is a bug whichever answer is right. This one edited *every*
   * match, so with duplicate keys — which `validateDocument` reports but cannot
   * prevent, because a host can render a document it never validated — one edit
   * landed twice, and `moveNode` composes remove and insert, so a single node
   * ended up at two places in the tree.
   */
  /*
   * `found`, not `changed`, and the difference is a real case.
   *
   * This stopped at the first child whose subtree came back a *different
   * object*, so an update that returns its input unchanged -- setting a property
   * to the value it already holds, which every controlled editor in the panel
   * does on a no-op edit -- left the flag down and the walk carried on into the
   * next sibling. With a duplicate key, which `validateDocument` reports and
   * cannot prevent, the second match was then edited instead.
   *
   * Whether the node was found and whether the result differs are two questions,
   * and each decides a different thing: `found` decides where to stop walking,
   * `changed` decides whether to rebuild this level at all. Structural sharing
   * depends on the second and correctness on the first, which is why the one
   * flag could not serve both.
   */
  let found = false
  let changed = false
  const children = root.children.map((child) => {
    if (found) return child
    if (findNode(child, key)) found = true
    const next = updateNode(child, key, update)
    if (next !== child) changed = true
    return next
  })

  return changed ? { ...root, children } : root
}

/** Insert a node into the given parent's children at index, appended if omitted. */
export function insertNode(
  root: ComponentNode,
  parentKey: string,
  node: ComponentNode,
  index?: number,
): ComponentNode {
  return updateNode(root, parentKey, (parent) => {
    const children = [...(parent.children ?? [])]
    const at = index ?? children.length
    children.splice(Math.max(0, Math.min(at, children.length)), 0, node)
    return { ...parent, children }
  })
}

/** Remove the node matching key. Removing the root is a no-op. */
export function removeNode(root: ComponentNode, key: string): ComponentNode {
  if (root.key === key) return root
  if (!root.children) return root

  // The first match only, for the reason `updateNode` gives.
  let changed = false
  const children: ComponentNode[] = []

  for (const child of root.children) {
    if (!changed && child.key === key) {
      changed = true
      continue
    }
    if (changed) {
      children.push(child)
      continue
    }
    const next = removeNode(child, key)
    if (next !== child) changed = true
    children.push(next)
  }

  // Removing a key that is not in this subtree returns the subtree itself, so a
  // remove that finds nothing is not recorded as an edit.
  return changed ? { ...root, children } : root
}

/**
 * Move a node to a new parent and index. Returns the tree unchanged if the move
 * is illegal: unknown keys, moving the root, or dropping a node inside itself.
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

  /*
   * And the target has to be able to hold children.
   *
   * `insertNode` will happily give a leaf a `children` array, which produces a
   * subtree no renderer draws -- a text field with a field inside it -- while
   * `validateForm` and `toJsonSchema` keep walking it, so the document asks for
   * an answer nobody can give. The designer's own drop paths refuse this, so it
   * was unreachable from the UI and reachable from the API, which is the worse
   * of the two places to leave it.
   *
   * Asked of the node, the way `isRowScope` asks: a container is instantiated
   * with a `children` array and a leaf is not, so no kit is needed here.
   */
  if (!Array.isArray(parent.children)) return root

  // Dropping a subtree into its own descendant would detach the tree.
  if (pathTo(node, newParentKey).length > 0) return root
  return insertNode(removeNode(root, key), newParentKey, node, index)
}

/**
 * The name a node's value is stored under.
 *
 * One helper, used everywhere data is read or written, so `key` and `dataKey`
 * cannot be used interchangeably by accident. That mistake has been made once
 * already in this codebase, between a language's code and its tag, and it was
 * invisible in both directions: the writer and the reader each looked correct
 * on their own.
 */
export function dataKeyOf(node: ComponentNode): string {
  return node.dataKey ?? node.key
}

/**
 * A node's validation rules, whatever the document actually holds there.
 *
 * One helper for the same reason `dataKeyOf` is one: the alternative is thirteen
 * call sites each deciding for itself, and ten of them had already decided the
 * same way while three had not. `duplicateNode` spread it, `validateField`
 * iterated it and `toJsonSchema` iterated it, so a document `validateDocument`
 * accepts -- a schema with no `validations` at all, which its own check allows
 * by returning early -- threw a `TypeError` out of the duplicate action, out of
 * `validateForm`, and out of the schema export.
 *
 * `Array.isArray` rather than `?? []`, because absent is not the only thing it
 * can be. A document is data: `validations` can arrive as a string, and `?? []`
 * would hand that straight to a `for...of`.
 */
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

/**
 * Structural checks that do not need a kit registry.
 *
 * Total by design: this is the gate untrusted documents pass through, both in
 * the designer's JSON editor and in `apps/demo-server`, so it reports malformed
 * structure as an error and never throws. It used to assume its argument really
 * was a `FormDocument`, which meant a pasted `"children": 5` took the builder
 * down and the same body reached the server as an unhandled 500.
 *
 * The type says `FormDocument` because that is what callers should have. The
 * checks assume nothing.
 */
/**
 * Every tag the two closed unions in a document actually have.
 *
 * Written out rather than derived, because these are the strings a *document*
 * may hold and the whole job is comparing an untrusted one against them. A type
 * cannot do that: by the time a value is typed as `PropValue`, the question has
 * been assumed away.
 *
 * Written out is how a guard goes stale, so both directions are checked by the
 * compiler below. `satisfies` refuses a string that is not in the union, and
 * `Covers` refuses a union member that is not in the list — so adding a kind or
 * a rule without adding it here stops the build rather than silently widening
 * what this gate accepts.
 *
 * The rule keys are not taken from `DEFAULT_MESSAGES`, which is the same list
 * and is already total over the union: `validation.ts` imports this file, so
 * reading it back would be a cycle.
 */
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
  'min',
  'max',
  'pattern',
  'email',
  'url',
  'uuid',
  'custom',
] as const satisfies readonly ValidationRule['key'][]

/** `true` only when the list names every member of the union. */
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

/*
 * `scope` has no name of its own in the type, so this one is spelled from the
 * member rather than from an alias. It is two strings and it is checked the
 * same way.
 */
const ROW_SCOPE_LIST = ['form', 'row'] as const satisfies readonly ('form' | 'row')[]

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

void FIELD_TYPES_COVER_THE_UNION
void DEVICES_COVER_THE_UNION
void EVENTS_COVER_THE_UNION
void OPS_COVER_THE_UNION
void OPERANDS_COVER_THE_UNION
void ACTION_TYPES_COVER_THE_UNION
void BIDI_COVERS_THE_UNION

const FIELD_TYPES: ReadonlySet<string> = new Set(FIELD_TYPE_LIST)
const DEVICES: ReadonlySet<string> = new Set(DEVICE_LIST)
const EVENT_NAMES: ReadonlySet<string> = new Set(EVENT_NAME_LIST)
const CONDITION_OPS: ReadonlySet<string> = new Set(CONDITION_OP_LIST)
const OPERAND_KINDS: ReadonlySet<string> = new Set(OPERAND_KIND_LIST)
const ACTION_REF_TYPES: ReadonlySet<string> = new Set(ACTION_REF_TYPE_LIST)
const BIDI: ReadonlySet<string> = new Set(BIDI_LIST)
const ROW_SCOPES: ReadonlySet<string> = new Set(ROW_SCOPE_LIST)

/**
 * How deep a document this gate will walk before refusing it.
 *
 * Its own walk recursed over `children` with no bound, in the function whose
 * entire job is to be the thing that never throws on a document — so a deep
 * enough one produced a `RangeError` out of the gate itself.
 *
 * Far past anything a form has: a hundred levels of nesting is a layout nobody
 * can use, and the panel draws depth by indentation in a 288px pane.
 */
export const MAX_TREE_DEPTH = 500

export function validateDocument(doc: FormDocument): StructuralError[] {
  const errors: StructuralError[] = []
  const seen = new Set<string>()

  const malformed = (message: string): void => {
    errors.push({ code: 'malformed', message })
  }

  const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value)

  const candidate: unknown = doc
  if (!isRecord(candidate)) {
    malformed('A form document must be an object.')
    return errors
  }

  /*
   * The envelope. Everything outside the tree that something reads without
   * asking whether it is there — `version` decides how the rest is interpreted,
   * `settings.errorType` is looked up in a kit, `name` is rendered.
   *
   * `id` and `name` have to be text and `name` may be empty: a form nobody has
   * titled yet is a real state, and refusing it would make the panel unable to
   * open the document you were about to name.
   */
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
    } else {
      for (const field of ['errorType', 'tooltipType'] as const) {
        const value = settings[field]
        if (value !== undefined && typeof value !== 'string') {
          malformed('settings.' + field + ' must be a component type.')
        }
      }
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

  /*
   * The bundles a translation is looked up in, checked all the way down.
   *
   * The renderer reads `document.translations[tag]` on every render, so a
   * document that is missing the field entirely throws during render rather
   * than rendering wrong — and a throw during render in React 19 unmounts the
   * whole tree, not the one node. Required rather than optional, because
   * `createDocument` writes `{}` and an absent field is what a hand-edited
   * document looks like when a key was deleted.
   *
   * The leaves are checked too. `resolveProp` hands a translation straight to a
   * kit as a label, so a number renders as a number and an object renders as
   * `[object Object]` — wrong in a way nobody reports, which is the failure
   * this project treats as worse than a crash.
   *
   * Which languages the bundles name is deliberately not checked: a bundle for
   * an undeclared language is a half-finished translation, and deleting a
   * language should not make the document invalid.
   */
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

      /*
       * The same rule a rename is judged by, so a pasted document cannot hold a
       * key the panel would have refused. Reported after the emptiness check
       * above, which says something more specific about the same failure.
       */
      const problem = keyProblem(key)
      if (problem) {
        errors.push({ code: 'invalid-key', message: 'Component ' + key + ': ' + problem, key })
      }

      /*
       * A present dataKey has to be usable as a name. It is not checked for
       * uniqueness: sharing one is legal, and it is what lets two guarded
       * fields write the same answer.
       */
      const dataKey = value['dataKey']
      if (dataKey !== undefined && typeof dataKey !== 'string') {
        /*
         * Told apart from an empty one, because "has an empty data key" is not
         * what is wrong with `dataKey: 42` and the message is what somebody
         * reads before deciding what to fix.
         */
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
        /*
         * Held to the same grammar, and it matters more here: a data key is a
         * property name in the exported JSON Schema and a key in the submitted
         * payload, so it leaves the document in a way a node key never does.
         */
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
      visitShape(value, key, path)
    }

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

  /**
   * Tags nothing can read, refused before anything has to guess.
   *
   * `PropValue` and `ValidationRule` are closed unions, so every `switch` over
   * one is exhaustive and TypeScript allows it to have no tail. That proof holds
   * for a value the compiler made. A document is data, so `kind: 'conditon'` is
   * one keystroke away, and it used to fall off two of those switches and come
   * back `undefined` — read as *hidden* and as *the guard did not pass*. Both
   * take the field out of validation, which on the server is a required answer
   * quietly becoming optional.
   *
   * The runtime readings are fixed too, in `visibility.ts` and `validation.ts`.
   * This is the answer that means nobody has to rely on them.
   */
  /**
   * Everything on a node that is read at render time without a guard.
   *
   * `PropValue`, `ValidationRule`, `Condition` and `Operand` are closed unions,
   * so every consumer switches over one exhaustively and TypeScript proves the
   * switch total. That proof is about values the compiler made. A document is
   * data — hand-editable JSON, a paste, a row out of a database — so the tag can
   * be anything and the payload can be missing.
   *
   * The line this draws: refuse what is **malformed**, meaning a shape no
   * version of this library ever wrote. Do not refuse what is merely unusual. A
   * gate that rejects a document somebody is holding is worse than the render it
   * was protecting, and the panel is where a broken document goes to be fixed.
   */
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

    /** One `PropValue`: the tag, and the single field that tag promises. */
    const binding = (value: unknown, what: string): void => {
      if (value === undefined) return
      if (!isRecord(value)) {
        malformed(where(what) + ' must be an object.')
        return
      }
      if (!oneOf(value['kind'], BINDING_KINDS, what + "'s kind")) return

      switch (value['kind']) {
        case 'static':
          /*
           * The one payload left unconstrained, deliberately. A prop can be a
           * list of options or a nested object and the kit decides what it
           * means, so there is nothing here to check beyond its presence.
           */
          if (!('value' in value)) malformed(where(what) + ' is static with no value.')
          return
        case 'computed':
          text(value['expression'], what + "'s expression")
          return
        case 'i18n':
          text(value['key'], what + "'s key")
          return
        default:
          condition(value['condition'], what + "'s condition")
      }
    }

    /** One side of a comparison. */
    const operand = (value: unknown, what: string): void => {
      if (!isRecord(value)) {
        malformed(where(what) + ' must be an object.')
        return
      }
      if (!oneOf(value['kind'], OPERAND_KINDS, what + "'s kind")) return

      if (value['kind'] === 'ref') {
        text(value['dataKey'], what + "'s data key")
        // Absent means the form, which is what every ref written before
        // repeaters existed already meant.
        if (value['scope'] !== undefined) oneOf(value['scope'], ROW_SCOPES, what + "'s scope")
        return
      }
      if (value['kind'] === 'context') {
        /*
         * Non-empty, unlike every other string here. `readPath(context, '')` is
         * `undefined` forever, so a condition reading it is permanently false
         * and its component permanently unvalidated — and `contextKeys` skips
         * it, correctly, because it is not a path. Skipping it meant nothing
         * reported it at all.
         */
        const path = value['path']
        if (typeof path !== 'string' || path === '') {
          malformed(where(what + "'s path") + ' must be a path the host can hold.')
        }
      }
      // A literal holds any JSON, including none: `{ kind: 'literal' }` reads as
      // undefined, which is what an unanswered field reads as too.
    }

    /**
     * One condition, and everything under it.
     *
     * Recursive, because a malformed condition three levels down is exactly as
     * reachable at render time as one at the top, and `evaluateCondition`
     * descends into every one of them.
     */
    const condition = (value: unknown, what: string, depth = 0): void => {
      if (!isRecord(value)) {
        malformed(where(what) + ' must be an object.')
        return
      }
      /*
       * The same bound the evaluator uses, imported rather than restated. The
       * outer `visit` was given `MAX_TREE_DEPTH` and this walker, nested inside
       * the function documented as total, was not -- so a condition nested deep
       * enough threw a `RangeError` out of the gate whose whole job is to be the
       * thing that never throws on a document.
       *
       * `MAX_CONDITION_DEPTH`, not `MAX_TREE_DEPTH`: a condition this gate
       * accepted at 500 is one `evaluate` reads as unreadable at 200, and a gate
       * that passes what the renderer cannot answer is saying the opposite of
       * what it exists to say.
       */
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
           * Only that it is text. Whether the text is *safe* is a different
           * judgement and a later one: `safeDeclarations` drops a block that
           * could escape its rule, and the Style tab says so. Refusing it here
           * would make the panel that exists to repair such a document the one
           * place it cannot be opened.
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
       * The parameter each rule promises. `minLength` compares with `<`, so a
       * string bound compares lexicographically and reports nothing; `pattern`
       * goes to `RegExp`. Both are wrong quietly, which is the failure this
       * whole gate exists for.
       */
      const k = rule['key']
      if (k === 'minLength' || k === 'maxLength' || k === 'min' || k === 'max') {
        if (typeof rule['value'] !== 'number') malformed(where(named) + ' needs a number.')
      } else if (k === 'pattern') {
        text(rule['value'], named + "'s pattern")
      } else if (k === 'custom') {
        text(rule['expression'], named + "'s expression")
      }

      if (rule['message'] !== undefined) text(rule['message'], named + "'s message")
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
        /*
         * Only a `code` reference names something on the document. A `builtin`
         * names something the host supplies, which core deliberately knows
         * nothing about.
         */
        if (ref['type'] !== 'code') continue
        /*
         * `Object.hasOwn`, not a plain lookup. `actions['toString']` finds
         * `Object.prototype.toString`, so an event referencing `toString`
         * passed the unknown-action check and named an action the document does
         * not have — the same own-property rule `valueOf` and `readPath` follow
         * everywhere else in this package.
         */
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

  /*
   * A condition inside a repeater that reads a row's field at form scope reads
   * nothing, hides its component, and takes it out of validation. Decidable
   * from the tree, so it is reported here rather than discovered per submit.
   */
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

    /*
     * The other two fields are read as well: `name` is what the language
     * selector draws, and `bidi` becomes the `dir` attribute. A language with
     * neither is a language the toolbar renders as a blank option.
     */
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
     * The same rule `languageTag` uses, and it has to be the same rule. That one
     * is truthiness, so an empty dialect is no dialect and the tag is `en`; this
     * copy said `typeof dialect === 'string'`, which is true for `''`, so the
     * gate computed `en-` and compared *that* against `defaultLanguage`. A
     * document with an empty dialect validated clean and then had no resolvable
     * default language at runtime.
     *
     * Spelled out rather than calling `languageTag`, because the input here is
     * untrusted and that function takes a `Language`.
     */
    const dialect = language['dialect']
    return typeof dialect === 'string' && dialect
      ? language['code'] + '-' + dialect
      : language['code']
  })

  if (tags.some((tag) => tag === undefined)) malformed('every language needs a string code.')

  if (!tags.includes(candidate['defaultLanguage'] as string)) {
    errors.push({
      code: 'unknown-language',
      message: 'defaultLanguage ' + String(candidate['defaultLanguage']) + ' is not in languages.',
    })
  }

  return errors
}
