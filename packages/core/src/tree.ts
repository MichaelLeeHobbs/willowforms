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
  const base = type.charAt(0).toLowerCase() + type.slice(1)
  const taken = new Set(collectKeys(root))
  if (!taken.has(base)) return base
  let n = 2
  while (taken.has(base + String(n))) n += 1
  return base + String(n)
}

/** Replace the node matching key, returning a new tree. */
export function updateNode(
  root: ComponentNode,
  key: string,
  update: (node: ComponentNode) => ComponentNode,
): ComponentNode {
  if (root.key === key) return update(root)
  if (!root.children) return root
  return { ...root, children: root.children.map((c) => updateNode(c, key, update)) }
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
  return {
    ...root,
    children: root.children.filter((c) => c.key !== key).map((c) => removeNode(c, key)),
  }
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

export interface StructuralError {
  code: 'duplicate-key' | 'unknown-action' | 'empty-key' | 'unknown-language'
  message: string
  key?: string
}

/** Structural checks that do not need a kit registry. */
export function validateDocument(doc: FormDocument): StructuralError[] {
  const errors: StructuralError[] = []
  const seen = new Set<string>()

  walk(doc.root, (n) => {
    if (!n.key.trim()) {
      errors.push({
        code: 'empty-key',
        message: 'Component of type ' + n.type + ' has an empty key.',
      })
      return
    }
    if (seen.has(n.key)) {
      errors.push({ code: 'duplicate-key', message: 'Duplicate key: ' + n.key, key: n.key })
    }
    seen.add(n.key)

    for (const refs of Object.values(n.events ?? {})) {
      for (const ref of refs) {
        if (ref.type === 'code' && !doc.actions[ref.name]) {
          errors.push({
            code: 'unknown-action',
            message: 'Component ' + n.key + ' references undefined action ' + ref.name + '.',
            key: n.key,
          })
        }
      }
    }
  })

  const tags = doc.languages.map((l) => (l.dialect ? l.code + '-' + l.dialect : l.code))
  if (!tags.includes(doc.defaultLanguage)) {
    errors.push({
      code: 'unknown-language',
      message: 'defaultLanguage ' + doc.defaultLanguage + ' is not in languages.',
    })
  }

  return errors
}
