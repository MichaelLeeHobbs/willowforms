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

function inOneRow(children: Candidate[], x: number, y: number): Candidate[] {
  const rows = new Map<string, Candidate[]>()
  for (const child of children) {
    const key = child.row ?? ''
    const held = rows.get(key)
    if (held) held.push(child)
    else rows.set(key, [child])
  }
  if (rows.size <= 1) return children

  const groups = [...rows.values()]
  const containing = groups.find((group) => group.some((child) => contains(child.rect, x, y)))
  if (containing) return containing

  let best = groups[0] as Candidate[]
  let bestDistance = Infinity
  for (const group of groups) {
    for (const child of group) {
      const distance =
        y < child.rect.top
          ? child.rect.top - y
          : y > child.rect.top + child.rect.height
            ? y - (child.rect.top + child.rect.height)
            : 0
      if (distance < bestDistance) {
        bestDistance = distance
        best = group
      }
    }
  }
  return best
}

/**
 * Children banded into the visual rows they occupy, in document order.
 *
 * Distinct from `inOneRow`, which groups by a repeater's *data* row address.
 * This one is geometry: a wrapping container puts siblings on several lines
 * with no data rows involved at all.
 *
 * Two children share a band when their vertical centres are within half the
 * shorter one's height of each other. Comparing centres rather than edges keeps
 * a tall child and a short one on the same line together, and the half-height
 * tolerance stops a column of stacked fields banding into one.
 */
function visualRows(children: Candidate[]): Candidate[][] {
  const bands: Candidate[][] = []

  for (const child of children) {
    const centre = child.rect.top + child.rect.height / 2
    const band = bands.find((each) =>
      each.some((held) => {
        const heldCentre = held.rect.top + held.rect.height / 2
        const tolerance = Math.min(held.rect.height, child.rect.height) / 2
        return Math.abs(heldCentre - centre) <= tolerance
      }),
    )
    if (band) band.push(child)
    else bands.push([child])
  }

  return bands
}

/**
 * The band a pointer is in, or the nearest one.
 *
 * Nearest by vertical distance for the reason `inOneRow` gives: a pointer in
 * the gap between two rows still has to get an answer, and the gap belongs to
 * whichever row it is closer to.
 */
function bandAt(bands: Candidate[][], y: number): Candidate[] {
  const containing = bands.find((band) =>
    band.some((child) => y >= child.rect.top && y <= child.rect.top + child.rect.height),
  )
  if (containing) return containing

  let best = bands[0] as Candidate[]
  let bestDistance = Infinity
  for (const band of bands) {
    for (const child of band) {
      const distance =
        y < child.rect.top
          ? child.rect.top - y
          : y > child.rect.top + child.rect.height
            ? y - (child.rect.top + child.rect.height)
            : 0
      if (distance < bestDistance) {
        bestDistance = distance
        best = band
      }
    }
  }
  return best
}

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
  const children = inOneRow(
    candidates.filter((c) => c.parentKey === parent.key && c.key !== draggedKey),
    x,
    y,
  ).sort((a, b) => a.index - b.index)

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
  const siblings = inOneRow(
    candidates.filter((c) => c.parentKey === parent.key),
    x,
    y,
  ).sort((a, b) => a.index - b.index)

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

  const bands = visualRows(children)
  const wrapping = bands.length > 1 && bands.some((band) => band.length > 1)

  const axis = wrapping ? 'row' : inferAxis(siblings)

  let slot = children.length
  /*
   * The bar, drawn in the band the pointer is in rather than across the whole
   * container.
   *
   * `barFor` averages the neighbours either side of the slot, so on the full
   * children list a slot at a band boundary averages the last child of one row
   * and the first of the next -- putting the bar between two columns, in the
   * gap between rows, nowhere near the pointer. The slot is right and the
   * drawing is wrong, which is the worst combination: the drop lands where the
   * author meant and the preview said somewhere else.
   *
   * A band is a row by construction, so it is measured as one whatever the
   * container's inferred axis is, and `spanOf` over the band gives the bar the
   * row's own height instead of the container's.
   */
  let indicator: Rect | undefined

  if (wrapping) {
    const band = bandAt(bands, y)
    const before = band.find((child) => x < child.rect.left + child.rect.width / 2)
    if (before) {
      slot = children.indexOf(before)
    } else {
      /*
       * Past every child in this band: the slot is after the band's last
       * member, which in reading order is where the next band begins.
       */
      const last = band[band.length - 1]
      slot = last ? children.indexOf(last) + 1 : children.length
    }

    const bandSlot = before ? band.indexOf(before) : band.length

    indicator = barFor({ ...parent, rect: boxOf(band) ?? parent.rect }, band, bandSlot, 'row')
  } else {
    const position = axis === 'row' ? x : y
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
  }

  return {
    parentKey: parent.key,
    // Index in the real children list, which still includes the dragged node.
    index: documentIndex(candidates, parent.key, children, slot, draggedKey),
    indicator: indicator ?? barFor(parent, children, slot, axis),
    orientation: axis,
    empty: false,
  }
}

function documentIndex(
  candidates: Candidate[],
  parentKey: string,
  filtered: Candidate[],
  slot: number,
  draggedKey: string | undefined,
): number {
  if (!draggedKey) return indexInParent(filtered, slot)

  const dragged = candidates.find((c) => c.key === draggedKey && c.parentKey === parentKey)
  if (!dragged) return indexInParent(filtered, slot)

  const target = indexInParent(filtered, slot)
  return dragged.index < target ? target - 1 : target
}

/** The document index a new node takes when inserted at `slot`. */
function indexInParent(filtered: Candidate[], slot: number): number {
  const before = filtered[slot - 1]
  if (!before) return 0
  return before.index + 1
}

/**
 * The extent the insertion bar runs across: the parent's rectangle, unless the
 * children sit in a different repeater row from the parent, in which case the
 * rectangle those children occupy.
 */
function spanOf(parent: Candidate, children: Candidate[]): Rect {
  const first = children[0]
  if (!first || first.row === parent.row) return parent.rect
  return boxOf(children) ?? parent.rect
}

/**
 * The rectangle a group of children occupies, or nothing for an empty group.
 *
 * `spanOf` cannot answer this: it short-circuits to the parent's rectangle when
 * the children share the parent's repeater row, which ordinary children always
 * do. This is the geometry question on its own.
 */
function boxOf(children: Candidate[]): Rect | undefined {
  const first = children[0]
  if (!first) return undefined

  let top = Infinity
  let bottom = -Infinity
  let left = Infinity
  let right = -Infinity
  for (const child of children) {
    top = Math.min(top, child.rect.top)
    bottom = Math.max(bottom, child.rect.top + child.rect.height)
    left = Math.min(left, child.rect.left)
    right = Math.max(right, child.rect.left + child.rect.width)
  }
  return { top, left, width: right - left, height: bottom - top }
}

/** The insertion bar: a thin rect on the boundary between two children. */
function barFor(parent: Candidate, children: Candidate[], slot: number, axis: Axis): Rect {
  const last = children[children.length - 1]
  const at = children[slot]
  const previous = children[slot - 1]
  const span = spanOf(parent, children)

  if (axis === 'row') {
    const top = span.top
    const height = span.height
    // Midway between the neighbours, so the bar sits in the gap rather than on
    // top of a component's edge.
    const left = at
      ? previous
        ? (previous.rect.left + previous.rect.width + at.rect.left) / 2
        : at.rect.left
      : (last?.rect.left ?? parent.rect.left) + (last?.rect.width ?? 0)
    return { top, left: left - BAR / 2, width: BAR, height }
  }

  const left = span.left
  const width = span.width
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
