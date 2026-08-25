import { describe, expect, it } from 'vitest'
import type { ComponentNode } from '@formsmith/core'
import { flatten } from '@formsmith/core'

import { describeMove, focusTarget, moveTarget } from './keyboard.js'

/**
 * root
 *   heading
 *   stack        (container)
 *     first
 *     second
 *   footer
 */
function tree(): ComponentNode {
  return {
    key: 'root',
    type: 'Screen',
    props: {},
    children: [
      { key: 'heading', type: 'Heading', props: {} },
      {
        key: 'stack',
        type: 'Stack',
        props: {},
        children: [
          { key: 'first', type: 'Field', props: {} },
          { key: 'second', type: 'Field', props: {} },
        ],
      },
      { key: 'footer', type: 'Field', props: {} },
    ],
  }
}

const rows = (): ReturnType<typeof flatten> => flatten(tree())
const isContainer = (type: string): boolean => type === 'Screen' || type === 'Stack'

describe('flatten', () => {
  it('lists the tree in document order, parents before children', () => {
    expect(rows().map((r) => r.node.key)).toEqual([
      'root',
      'heading',
      'stack',
      'first',
      'second',
      'footer',
    ])
  })

  it('records the parent, index, and depth of each node', () => {
    const second = rows().find((r) => r.node.key === 'second')
    expect(second).toMatchObject({ parentKey: 'stack', index: 1, depth: 2 })
  })

  it('gives the root no parent', () => {
    expect(rows()[0]).toMatchObject({ parentKey: undefined, depth: 0 })
  })
})

describe('focusTarget', () => {
  it('moves down through the flattened order, into children as it goes', () => {
    expect(focusTarget(rows(), 'stack', 'down')).toBe('first')
    expect(focusTarget(rows(), 'second', 'down')).toBe('footer')
  })

  it('moves up through the same order', () => {
    expect(focusTarget(rows(), 'footer', 'up')).toBe('second')
    expect(focusTarget(rows(), 'first', 'up')).toBe('stack')
  })

  it('stops at the ends rather than wrapping', () => {
    expect(focusTarget(rows(), 'root', 'up')).toBeUndefined()
    expect(focusTarget(rows(), 'footer', 'down')).toBeUndefined()
  })

  it('steps right into the first child', () => {
    expect(focusTarget(rows(), 'stack', 'right')).toBe('first')
  })

  it('has nowhere to step right from a leaf', () => {
    expect(focusTarget(rows(), 'heading', 'right')).toBeUndefined()
  })

  it('steps left out to the parent', () => {
    expect(focusTarget(rows(), 'second', 'left')).toBe('stack')
    expect(focusTarget(rows(), 'stack', 'left')).toBe('root')
  })

  it('has nowhere to step left from the root', () => {
    expect(focusTarget(rows(), 'root', 'left')).toBeUndefined()
  })

  it('returns nothing for a key that is not in the tree', () => {
    expect(focusTarget(rows(), 'ghost', 'down')).toBeUndefined()
  })
})

describe('moveTarget', () => {
  it('reorders among siblings', () => {
    expect(moveTarget(rows(), 'footer', 'up', isContainer)).toEqual({
      parentKey: 'root',
      index: 1,
    })
    expect(moveTarget(rows(), 'heading', 'down', isContainer)).toEqual({
      parentKey: 'root',
      index: 1,
    })
  })

  it('will not move past the first or last sibling', () => {
    expect(moveTarget(rows(), 'heading', 'up', isContainer)).toBeUndefined()
    expect(moveTarget(rows(), 'footer', 'down', isContainer)).toBeUndefined()
    expect(moveTarget(rows(), 'first', 'up', isContainer)).toBeUndefined()
    expect(moveTarget(rows(), 'second', 'down', isContainer)).toBeUndefined()
  })

  it('moves right into the container above it, at the end', () => {
    // `footer` sits after `stack`, which already holds two children.
    expect(moveTarget(rows(), 'footer', 'right', isContainer)).toEqual({
      parentKey: 'stack',
      index: 2,
    })
  })

  it('refuses to move right into a sibling that takes no children', () => {
    // `stack` sits after `heading`, which is not a container.
    expect(moveTarget(rows(), 'stack', 'right', isContainer)).toBeUndefined()
  })

  it('refuses to move right with no sibling above', () => {
    expect(moveTarget(rows(), 'heading', 'right', isContainer)).toBeUndefined()
    expect(moveTarget(rows(), 'first', 'right', isContainer)).toBeUndefined()
  })

  it('moves left out to the grandparent, just after the parent', () => {
    // `first` leaves `stack`, which is root's child 1, so it lands at root 2.
    expect(moveTarget(rows(), 'first', 'left', isContainer)).toEqual({
      parentKey: 'root',
      index: 2,
    })
  })

  it('refuses to move left when the parent is the root', () => {
    expect(moveTarget(rows(), 'heading', 'left', isContainer)).toBeUndefined()
  })

  it('never moves the root', () => {
    for (const direction of ['up', 'down', 'left', 'right'] as const) {
      expect(moveTarget(rows(), 'root', direction, isContainer)).toBeUndefined()
    }
  })

  it('returns nothing for a key that is not in the tree', () => {
    expect(moveTarget(rows(), 'ghost', 'up', isContainer)).toBeUndefined()
  })
})

describe('describeMove', () => {
  it('names the component and what happened to it', () => {
    expect(describeMove('email', 'up')).toBe('email moved up.')
    expect(describeMove('email', 'right')).toBe('email moved into the component above it.')
    expect(describeMove('email', 'left')).toBe('email moved out one level.')
  })
})
