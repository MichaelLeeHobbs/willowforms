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
 *
 * "Every node is expanded" is a premise, not a guarantee: `rows` is whatever the
 * panel flattened, and nothing enforces that it holds the whole tree. Adding a
 * collapse affordance to the tree without revisiting this makes Right a silent
 * no-op -- the child it names is not in `rows`, `at` returns -1 for it, and
 * focus stays where it was with nothing to explain why. `Tree.tsx` says
 * `aria-expanded="true"` on every row for the same reason, which is the other
 * half of this promise.
 */
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
