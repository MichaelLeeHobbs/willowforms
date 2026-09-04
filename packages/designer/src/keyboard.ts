/**
 * Keyboard navigation and keyboard-driven moves for the structure tree.
 *
 * Drag and drop is a pointer gesture with no keyboard equivalent, which makes
 * every rearrangement in this builder impossible without a mouse. WAI-ARIA has
 * no standard pattern for that, so this uses the outliner convention: arrows
 * move focus, and the same arrows with a modifier move the component.
 *
 * All of it is pure. Given a flattened tree and a key, these return where focus
 * or the node should end up, which is why the arithmetic is tested rather than
 * clicked through.
 */

import type { FlatNode } from '@formsmith/core'

export type Direction = 'up' | 'down' | 'left' | 'right'

/** Where a move would put the node, or undefined when the move is impossible. */
export interface MoveTarget {
  parentKey: string
  index: number
}

const at = (rows: FlatNode[], key: string): number => rows.findIndex((r) => r.node.key === key)

export function focusTarget(
  rows: FlatNode[],
  key: string,
  direction: Direction,
): string | undefined {
  const index = at(rows, key)
  if (index === -1) return undefined
  // `noUncheckedIndexedAccess` asks for this, and it cannot fire: `at` returned
  // an index it found in this same array. It stays because the alternative is a
  // non-null assertion, which is the same claim with no check behind it.
  const row = rows[index]
  if (!row) return undefined

  if (direction === 'down') return rows[index + 1]?.node.key
  if (direction === 'up') return rows[index - 1]?.node.key

  if (direction === 'right') {
    const first = row.node.children?.[0]
    return first?.key
  }

  return row.parentKey
}

/**
 * Where the node lands if moved in `direction`.
 *
 * Up and down reorder among siblings. Right moves the node into the sibling
 * above it, which must be a container. Left moves it out to its grandparent,
 * landing just after the parent it left, which is where an outliner puts it and
 * where the eye expects to find it.
 *
 * The root never moves, and a node cannot enter a container that is not one.
 */
export function moveTarget(
  rows: FlatNode[],
  key: string,
  direction: Direction,
  isContainer: (type: string) => boolean,
): MoveTarget | undefined {
  const index = at(rows, key)
  if (index === -1) return undefined

  const row = rows[index]
  if (!row?.parentKey) return undefined

  /*
   * Siblings of *this* node, taken from the run it sits in rather than by
   * matching a key string.
   *
   * `flatten` is depth-first, so one parent's children are a contiguous run at
   * the same depth, broken by any row shallower than they are. Two nodes can
   * share a key -- `validateDocument` reports that and cannot prevent it,
   * because a host may render a document it never validated -- and matching on
   * `parentKey` alone collected the children of *every* parent with that name,
   * so an Alt+Arrow move counted a position in a list the document does not
   * have and landed the node somewhere else entirely.
   *
   * The run is what identifies this parent, and it needs no key at all.
   */
  const siblings: FlatNode[] = []
  for (let i = index; i >= 0; i -= 1) {
    const each = rows[i]
    if (!each || each.depth < row.depth) break
    if (each.depth === row.depth) siblings.unshift(each)
  }
  for (let i = index + 1; i < rows.length; i += 1) {
    const each = rows[i]
    if (!each || each.depth < row.depth) break
    if (each.depth === row.depth) siblings.push(each)
  }
  const position = siblings.indexOf(row)

  if (direction === 'up') {
    if (position <= 0) return undefined
    return { parentKey: row.parentKey, index: position - 1 }
  }

  if (direction === 'down') {
    if (position === -1 || position >= siblings.length - 1) return undefined
    return { parentKey: row.parentKey, index: position + 1 }
  }

  if (direction === 'right') {
    const previous = siblings[position - 1]
    if (!previous) return undefined
    /*
     * Asked of the node as well as of the kit, because `moveNode` asks the
     * node.
     *
     * This asked only `isContainer(type)`, which is the *kit's* answer. A node
     * whose type the kit marks `container: true` but which carries no
     * `children` array yields a `MoveTarget` that `moveNode` then silently
     * refuses -- and `Tree.tsx` announces a move that did not happen.
     * `store.ts` already uses the node-shaped test for the same question.
     *
     * Both, not one: the kit's answer is what decides whether a container
     * *should* accept children, and the array is what decides whether this
     * particular node can.
     */
    if (!isContainer(previous.node.type) || !Array.isArray(previous.node.children)) {
      return undefined
    }
    // Onto the end of that container's existing children.
    return { parentKey: previous.node.key, index: previous.node.children.length }
  }

  /*
   * Left: out to the grandparent, immediately after the parent -- and the
   * parent is found the way the sibling run above is found, not by a key match.
   *
   * This was `rows.find((r) => r.node.key === row.parentKey)`, which is exactly
   * the mistake the block twelve lines up goes out of its way to avoid. That
   * comment states the premise plainly: "Two nodes can share a key ... matching
   * on `parentKey` alone collected the children of *every* parent with that
   * name". `find` answers the *first* row carrying the name, and both fields
   * read off it here are positional -- `parent.parentKey` and `parent.index`.
   *
   * Traced on this repo's own `twoStacks()` fixture:
   * `moveTarget(flatten(twoStacks()), 'c', 'left', isContainer)` answered
   * `index: 1` where `c` lives in the second stack and the correct answer is
   * `2`. `moveNode` performs that happily and `describeMove` announces "moved
   * out one level."
   *
   * `flatten` is depth-first, so this node's parent is the nearest row above it
   * at one less depth. Scanning backwards finds that row and no other.
   */
  let parent: FlatNode | undefined
  for (let i = index - 1; i >= 0; i -= 1) {
    const each = rows[i]
    if (!each) continue
    if (each.depth === row.depth - 1) {
      parent = each
      break
    }
    // Past the parent's own depth without meeting it: the tree is malformed or
    // this row is at the top, and there is nothing to move out to.
    if (each.depth < row.depth - 1) break
  }

  if (!parent?.parentKey) return undefined
  return { parentKey: parent.parentKey, index: parent.index + 1 }
}

/** How a completed move should be described to a screen reader. */
export function describeMove(key: string, direction: Direction): string {
  switch (direction) {
    case 'up':
      return key + ' moved up.'
    case 'down':
      return key + ' moved down.'
    case 'right':
      return key + ' moved into the component above it.'
    case 'left':
      return key + ' moved out one level.'
  }
}
