/**
 * Pure arithmetic over measured rectangles, with no DOM access: jsdom has no
 * layout engine, so this is the only way drop placement can be tested. See
 * docs/spec/05-canvas.md, "Resolving a drop on the canvas".
 */

import type { Candidate, Rect } from './geometry.js'

export type Axis = 'row' | 'column'

export interface DropTarget {
  parentKey: string
  index: number
  /** In surface coordinates. */
  indicator: Rect
  /** A horizontal bar sits between stacked children; a vertical one between columns. */
  orientation: Axis
  /** The parent has no children, and `indicator` outlines the whole box. */
  empty: boolean
}

const contains = (rect: Rect, x: number, y: number): boolean =>
  x >= rect.left && x <= rect.left + rect.width && y >= rect.top && y <= rect.top + rect.height

const BAR = 2
const EMPTY_INSET = 4

/**
 * Read from geometry rather than a prop: a kit may name its direction prop
 * anything, or lay out with a grid and no prop. Fewer than two children default
 * to 'column', the shape of a stack of form fields.
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
 * Children grouped into the visual lines a wrapping container puts them on.
 * Unlike `inOneRow`, which groups by repeater data row, this is pure geometry.
 *
 * Centres within half the shorter child's height share a line: comparing centres
 * keeps a tall and a short child together, and the half-height tolerance keeps
 * stacked fields apart.
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

/** A pointer in the gap between lines belongs to the nearer one. */
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
 * Undefined when nothing droppable is under the pointer: show no indicator and
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

  // The axis is read from every child, including the dragged one: without it, a
  // two-child row leaves one child and `inferAxis` falls back to 'column'.
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
   * When wrapping, the bar is drawn within the pointer's line: across the full
   * list, a slot at a line boundary averages the last child of one line and the
   * first of the next, and draws the bar nowhere near the pointer.
   */
  let indicator: Rect | undefined

  if (wrapping) {
    const band = bandAt(bands, y)
    const before = band.find((child) => x < child.rect.left + child.rect.width / 2)
    if (before) {
      slot = children.indexOf(before)
    } else {
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

function indexInParent(filtered: Candidate[], slot: number): number {
  const before = filtered[slot - 1]
  if (!before) return 0
  return before.index + 1
}

function spanOf(parent: Candidate, children: Candidate[]): Rect {
  const first = children[0]
  if (!first || first.row === parent.row) return parent.rect
  return boxOf(children) ?? parent.rect
}

/** Unlike `spanOf`, never falls back to the parent's rectangle. */
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

function barFor(parent: Candidate, children: Candidate[], slot: number, axis: Axis): Rect {
  const last = children[children.length - 1]
  const at = children[slot]
  const previous = children[slot - 1]
  const span = spanOf(parent, children)

  if (axis === 'row') {
    const top = span.top
    const height = span.height
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
 * A tree row's rectangle never covers its descendants, so the canvas's
 * innermost-container rule cannot apply here.
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
  mode: 'before' | 'after' | 'inside'
  rowKey: string
}

/** Fraction of a row's height that counts as its before/after edge. */
const EDGE = 0.3

/**
 * A leaf row's middle band falls back to the nearer edge rather than refusing
 * the drop. See docs/spec/05-canvas.md, "Resolving a drop on the tree".
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

  if (!row.parentKey) {
    return { parentKey: row.key, index: 0, mode: 'inside', rowKey: row.key }
  }

  if (offset >= EDGE && offset <= 1 - EDGE && row.container) {
    return { parentKey: row.key, index: 0, mode: 'inside', rowKey: row.key }
  }

  const after = offset > 0.5

  // `moveNode` removes before inserting, so the index counts only the siblings
  // that remain.
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

function treeForbidden(rows: TreeRow[], key: string | undefined): Set<string> {
  return closure(rows, key)
}
