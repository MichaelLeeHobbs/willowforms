/**
 * WAI-ARIA has no pattern for rearranging by keyboard, so the structure tree
 * follows the outliner convention: arrows move focus, and the same arrows with a
 * modifier move the component.
 */

import type { FlatNode } from '@willowforms/core'

export type Direction = 'up' | 'down' | 'left' | 'right'

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

  // In depth-first order one parent's children are a contiguous same-depth run.
  // Keys can repeat, so siblings come from that run, never a `parentKey` match.
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
    // `moveNode` refuses a node with no children array whatever the kit says,
    // so both are asked.
    if (!isContainer(previous.node.type) || !Array.isArray(previous.node.children)) {
      return undefined
    }
    return { parentKey: previous.node.key, index: previous.node.children.length }
  }

  // The parent is the nearest row above at one less depth. Not a `parentKey`
  // match: keys can repeat.
  let parent: FlatNode | undefined
  for (let i = index - 1; i >= 0; i -= 1) {
    const each = rows[i]
    if (!each) continue
    if (each.depth === row.depth - 1) {
      parent = each
      break
    }
    if (each.depth < row.depth - 1) break
  }

  if (!parent?.parentKey) return undefined
  return { parentKey: parent.parentKey, index: parent.index + 1 }
}

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
