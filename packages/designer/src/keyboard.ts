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

/**
 * Where this key is in the flattened tree — the first place, if it is in two.
 *
 * `validateDocument` reports a duplicate key and the panel refuses a rename
 * that would make one, but reporting is not preventing and a host can render a
 * document it never validated. So this answers the first, which is what
 * `findNode`, `findParent` and `pathTo` in core all deliberately answer and
 * what the three tree mutators were changed to answer. Focus, the move and the
 * announcement then agree with each other and with the rest of the project,
 * which is the property that matters — whichever of the two the user meant, all
 * four say the same thing about it.
 */
const at = (rows: FlatNode[], key: string): number => rows.findIndex((r) => r.node.key === key)

/**
 * The next row focus should move to.
 *
 * Every node is expanded, so down is simply the next row and up the previous.
 * Right steps into the first child, left steps out to the parent. Returns
 * undefined at the ends rather than wrapping: a tree is not a carousel, and
 * wrapping loses the sense of where the boundaries are.
 */
export function focusTarget(
  rows: FlatNode[],
  key: string,
  direction: Direction,
): string | undefined {
  const index = at(rows, key)
  if (index === -1) return undefined
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

  const siblings = rows.filter((r) => r.parentKey === row.parentKey)
  const position = siblings.findIndex((r) => r.node.key === key)

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
    if (!previous || !isContainer(previous.node.type)) return undefined
    // Onto the end of that container's existing children.
    return { parentKey: previous.node.key, index: previous.node.children?.length ?? 0 }
  }

  // Left: out to the grandparent, immediately after the parent.
  const parent = rows.find((r) => r.node.key === row.parentKey)
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
