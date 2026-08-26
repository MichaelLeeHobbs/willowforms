/**
 * Immutable operations over the component tree.
 *
 * Every mutation returns a new tree and leaves the input untouched, because the
 * designer's undo stack holds references to prior states. Nothing here mutates.
 */

import type { ComponentNode, FormDocument } from './types.js'

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

export function findNode(root: ComponentNode, key: string): ComponentNode | undefined {
  let found: ComponentNode | undefined
  walk(root, (n) => {
    if (n.key === key) found = n
  })
  return found
}

export function findParent(root: ComponentNode, key: string): ComponentNode | undefined {
  let found: ComponentNode | undefined
  walk(root, (n, parent) => {
    if (n.key === key) found = parent
  })
  return found
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
  return freeKey(new Set(collectKeys(root)), type.charAt(0).toLowerCase() + type.slice(1))
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
export function duplicateNode(root: ComponentNode, key: string): ComponentNode | undefined {
  const source = findNode(root, key)
  if (!source) return undefined

  const taken = new Set(collectKeys(root))

  const copy = (node: ComponentNode): ComponentNode => {
    const nextKey = freeKey(taken, baseOf(node.key))
    taken.add(nextKey)

    const next: ComponentNode = { ...node, key: nextKey, props: { ...node.props } }
    if (node.schema) next.schema = { ...node.schema, validations: [...node.schema.validations] }
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

  let changed = false
  const children = root.children.map((child) => {
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

  let changed = false
  const children: ComponentNode[] = []

  for (const child of root.children) {
    if (child.key === key) {
      changed = true
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
  if (!findNode(root, newParentKey)) return root
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

export interface StructuralError {
  code:
    | 'duplicate-key'
    | 'unknown-action'
    | 'empty-key'
    | 'empty-data-key'
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

  const actions = isRecord(candidate['actions']) ? candidate['actions'] : undefined
  if (candidate['actions'] !== undefined && !actions) malformed('actions must be an object.')

  const visit = (value: unknown, path: string): void => {
    if (!isRecord(value)) {
      malformed(path + ' is not a component node.')
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
       * A present dataKey has to be usable as a name. It is not checked for
       * uniqueness: sharing one is legal, and it is what lets two guarded
       * fields write the same answer.
       */
      const dataKey = value['dataKey']
      if (dataKey !== undefined && (typeof dataKey !== 'string' || !dataKey.trim())) {
        errors.push({
          code: 'empty-data-key',
          message: 'Component ' + key + ' has an empty data key.',
          key,
        })
      }

      visitEvents(value['events'], key, path)
    }

    const children = value['children']
    if (children === undefined) return
    if (!Array.isArray(children)) {
      malformed(path + '.children must be an array.')
      return
    }
    children.forEach((child, index) => visit(child, path + '.children[' + String(index) + ']'))
  }

  const visitEvents = (events: unknown, key: string, path: string): void => {
    if (events === undefined) return
    if (!isRecord(events)) {
      malformed(path + '.events must be an object.')
      return
    }

    for (const refs of Object.values(events)) {
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
        if (ref['type'] !== 'code' || typeof name !== 'string') continue
        if (!actions || actions[name] === undefined) {
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

  const languages = candidate['languages']
  if (!Array.isArray(languages)) {
    malformed('languages must be an array.')
    return errors
  }

  const tags = languages.map((language) => {
    if (!isRecord(language) || typeof language['code'] !== 'string') return undefined
    // Same shape as languageTag, spelled out because the input is untrusted here.
    const dialect = language['dialect']
    return typeof dialect === 'string' ? language['code'] + '-' + dialect : language['code']
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
