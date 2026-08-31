/**
 * Where a drop lands.
 *
 * Deliberately pure: it takes measured rectangles and a point, and returns a
 * parent key and an index. No DOM, no React, no events. That is not tidiness for
 * its own sake, it is the only way this logic gets tested at all, because jsdom
 * has no layout engine and every `getBoundingClientRect` there returns zeros.
 * The DOM half stays thin enough to check by eye in a browser; the arithmetic
 * that decides where a component actually goes is checked here.
 */

import type { Candidate, Rect } from './geometry.js'

export type Axis = 'row' | 'column'

export interface DropTarget {
  parentKey: string
  index: number
  /** Thin rectangle marking the insertion point, in surface coordinates. */
  indicator: Rect
  /** A horizontal bar sits between stacked children; a vertical one between columns. */
  orientation: Axis
  /** True when the parent has no children yet and the whole box is the target. */
  empty: boolean
}

const contains = (rect: Rect, x: number, y: number): boolean =>
  x >= rect.left && x <= rect.left + rect.width && y >= rect.top && y <= rect.top + rect.height

/** Thickness of the insertion bar, and the inset of an empty-container outline. */
const BAR = 2
const EMPTY_INSET = 4

/**
 * Which way a container lays its children out, inferred from where they ended up
 * rather than from a prop name.
 *
 * A kit is free to call its direction prop anything, or to lay out with a grid
 * and no prop at all, so reading geometry keeps this working for kits that do not
 * exist yet. With fewer than two children there is nothing to infer and stacked
 * is the safe default, because that is what a column of form fields is.
 */
export function inferAxis(children: Candidate[]): Axis {
  if (children.length < 2) return 'column'

  let horizontal = 0
  let vertical = 0
  for (let i = 1; i < children.length; i++) {
    const previous = children[i - 1]
    const current = children[i]
    if (!previous || !current) continue
    horizontal += Math.abs(current.rect.left - previous.rect.left)
    vertical += Math.abs(current.rect.top - previous.rect.top)
  }
  return horizontal > vertical ? 'row' : 'column'
}

/**
 * The keys that a drag of `key` must not land inside: itself and everything
 * below it. Dropping a subtree into its own descendant detaches the tree.
 */
export function forbiddenKeys(candidates: Candidate[], key: string | undefined): Set<string> {
  return closure(candidates, key)
}

/**
 * A key and everything under it, from a flat list of `{key, parentKey}`.
 *
 * Shared by the canvas and the tree, which had the same loop written twice --
 * and the copies had drifted in their comments rather than their behaviour,
 * which is the drift that is hardest to notice.
 *
 * Repeated until nothing new is added, not a single pass. The comment on the
 * canvas copy claimed one pass was enough because candidates arrive
 * parent-before-child; the loop it sat above did not rely on that, and a
 * measurement that is not in document order -- a repeater's rows, a kit that
 * renders children before their container -- would have made a single pass
 * wrong. The loop is right and the comment was not.
 */
function closure(
  nodes: readonly { key: string; parentKey?: string | undefined }[],
  key: string | undefined,
): Set<string> {
  const forbidden = new Set<string>()
  if (!key) return forbidden

  forbidden.add(key)
  let grew = true
  while (grew) {
    grew = false
    for (const node of nodes) {
      if (node.parentKey && forbidden.has(node.parentKey) && !forbidden.has(node.key)) {
        forbidden.add(node.key)
        grew = true
      }
    }
  }
  return forbidden
}

/** The innermost container under the point that the drag is allowed to enter. */
function parentAt(
  candidates: Candidate[],
  x: number,
  y: number,
  forbidden: Set<string>,
): Candidate | undefined {
  let best: Candidate | undefined
  for (const candidate of candidates) {
    if (!candidate.container) continue
    if (forbidden.has(candidate.key)) continue
    if (!contains(candidate.rect, x, y)) continue
    if (!best || candidate.depth > best.depth) best = candidate
  }
  return best
}

/**
 * Resolve a pointer position to an insertion point.
 *
 * The innermost container under the pointer becomes the parent. The index comes
 * from comparing the pointer against the midpoints of that container's children
 * along whichever axis they are laid out on. Returns undefined when the pointer
 * is over nothing droppable, which is the caller's cue to show no indicator and
 * treat a release as a cancel.
 */
export function resolveDrop(
  candidates: Candidate[],
  x: number,
  y: number,
  draggedKey?: string,
): DropTarget | undefined {
  const forbidden = forbiddenKeys(candidates, draggedKey)
  const parent = parentAt(candidates, x, y, forbidden)
  if (!parent) return undefined

  // A dragged node is leaving its slot, so it must not act as its own landmark.
  const children = candidates
    .filter((c) => c.parentKey === parent.key && c.key !== draggedKey)
    .sort((a, b) => a.index - b.index)

  /*
   * The axis is read from every child, including the one being dragged.
   *
   * How a container lays out is a fact about the container. Reading it from the
   * remainder meant that moving one of exactly two children of a row left a
   * single child, `inferAxis` fell back to `column`, and the drop then compared
   * the pointer's Y against a row of components -- so dragging the left field of
   * a two-field row past its neighbour landed it back where it started, every
   * time, in the smallest row anybody builds.
   */
  const siblings = candidates
    .filter((c) => c.parentKey === parent.key)
    .sort((a, b) => a.index - b.index)

  if (children.length === 0) {
    return {
      parentKey: parent.key,
      index: 0,
      indicator: {
        top: parent.rect.top + EMPTY_INSET,
        left: parent.rect.left + EMPTY_INSET,
        width: Math.max(0, parent.rect.width - EMPTY_INSET * 2),
        height: Math.max(0, parent.rect.height - EMPTY_INSET * 2),
      },
      orientation: 'column',
      empty: true,
    }
  }

  const axis = inferAxis(siblings)
  const position = axis === 'row' ? x : y

  let slot = children.length
  for (let i = 0; i < children.length; i++) {
    const child = children[i]
    if (!child) continue
    const middle =
      axis === 'row'
        ? child.rect.left + child.rect.width / 2
        : child.rect.top + child.rect.height / 2
    if (position < middle) {
      slot = i
      break
    }
  }

  return {
    parentKey: parent.key,
    // Index in the real children list, which still includes the dragged node.
    index: documentIndex(candidates, parent.key, children, slot, draggedKey),
    indicator: barFor(parent, children, slot, axis),
    orientation: axis,
    empty: false,
  }
}

/**
 * Translate a slot in the filtered list back to an index in the real children.
 *
 * `moveNode` removes the node before inserting it, so an index measured in a
 * list that already excludes the dragged node is exactly what it wants. For any
 * other drag the dragged node was never in this parent, and the two agree.
 */
function documentIndex(
  candidates: Candidate[],
  parentKey: string,
  filtered: Candidate[],
  slot: number,
  draggedKey: string | undefined,
): number {
  /*
   * A palette drop is an insertion, like a move from another parent, so it takes
   * the same translation. It used to return the raw slot: in a container holding
   * a node that drew nothing -- a component the kit does not implement, or one
   * whose renderer returned null -- the drawn list is shorter than the real one,
   * so dropping from the palette and dragging in from elsewhere put a component
   * in two different places for the same gesture.
   */
  if (!draggedKey) return indexInParent(filtered, slot)

  const draggedIsSibling = candidates.some((c) => c.key === draggedKey && c.parentKey === parentKey)
  return draggedIsSibling ? slot : indexInParent(filtered, slot)
}

/** The document index a new node takes when inserted at `slot`. */
function indexInParent(filtered: Candidate[], slot: number): number {
  const before = filtered[slot - 1]
  if (!before) return 0
  return before.index + 1
}

/** The insertion bar: a thin rect on the boundary between two children. */
function barFor(parent: Candidate, children: Candidate[], slot: number, axis: Axis): Rect {
  const last = children[children.length - 1]
  const at = children[slot]
  const previous = children[slot - 1]

  if (axis === 'row') {
    /*
     * The parent's own span. A child's rectangle is inside its parent's, so the
     * `min` and the `max` this used to compute could only ever answer the
     * parent -- arithmetic that reads as though it handles an overflowing child
     * and does not. If a child ever does overflow, the bar should still be the
     * parent's height: it marks a position in the parent, not in the child.
     */
    const top = parent.rect.top
    const height = parent.rect.height
    // Midway between the neighbours, so the bar sits in the gap rather than on
    // top of a component's edge.
    const left = at
      ? previous
        ? (previous.rect.left + previous.rect.width + at.rect.left) / 2
        : at.rect.left
      : (last?.rect.left ?? parent.rect.left) + (last?.rect.width ?? 0)
    return { top, left: left - BAR / 2, width: BAR, height }
  }

  const left = parent.rect.left
  const width = parent.rect.width
  const top = at
    ? previous
      ? (previous.rect.top + previous.rect.height + at.rect.top) / 2
      : at.rect.top
    : (last?.rect.top ?? parent.rect.top) + (last?.rect.height ?? 0)
  return { top: top - BAR / 2, left, width, height: BAR }
}

/**
 * A visible tree row. Unlike a canvas box, a row's rectangle covers only the row
 * itself, never its descendants, so "innermost container under the pointer" does
 * not work here and the tree needs its own resolution.
 */
export interface TreeRow {
  key: string
  parentKey: string | undefined
  index: number
  container: boolean
  rect: Rect
}

export interface TreeDropTarget {
  parentKey: string
  index: number
  /** Draw a line between rows, or outline the row itself when dropping inside. */
  mode: 'before' | 'after' | 'inside'
  /** The row the indicator attaches to. */
  rowKey: string
}

/** Fraction of a row's height that counts as its before/after edge. */
const EDGE = 0.3

/**
 * Resolve a pointer position over the tree to an insertion point.
 *
 * A row's top and bottom bands reorder it among its siblings. The middle band
 * drops into the row when it is a container, and otherwise falls back to the
 * nearer edge, so a leaf row never swallows a drop and leaves the user with no
 * feedback about where the component went.
 */
export function resolveTreeDrop(
  rows: TreeRow[],
  y: number,
  draggedKey?: string,
): TreeDropTarget | undefined {
  const forbidden = treeForbidden(rows, draggedKey)

  const row = rows.find((r) => y >= r.rect.top && y <= r.rect.top + r.rect.height)
  if (!row || forbidden.has(row.key)) return undefined

  const offset = (y - row.rect.top) / Math.max(1, row.rect.height)

  // The root has no siblings to sit beside, so every drop on it goes inside.
  if (!row.parentKey) {
    return { parentKey: row.key, index: 0, mode: 'inside', rowKey: row.key }
  }

  if (offset >= EDGE && offset <= 1 - EDGE && row.container) {
    return { parentKey: row.key, index: 0, mode: 'inside', rowKey: row.key }
  }

  const after = offset > 0.5

  /*
   * `moveNode` removes the node before inserting it, so the index has to be
   * measured against the siblings that remain. Measuring it against the list
   * that still contains the dragged node put a downward reorder one place too
   * far: dragging the first of [a, b, c] below b produced [b, c, a].
   */
  const siblings = rows.filter((r) => r.parentKey === row.parentKey && r.key !== draggedKey)
  const anchor = siblings.findIndex((r) => r.key === row.key)
  const slot = anchor === -1 ? row.index : anchor + (after ? 1 : 0)

  return {
    parentKey: row.parentKey,
    index: slot,
    mode: after ? 'after' : 'before',
    rowKey: row.key,
  }
}

/** The dragged row and everything under it, which it cannot be dropped into. */
function treeForbidden(rows: TreeRow[], key: string | undefined): Set<string> {
  return closure(rows, key)
}
