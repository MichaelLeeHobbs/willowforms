import { describe, expect, it } from 'vitest'
import type { ComponentNode } from '@willowforms/core'
import { flatten } from '@willowforms/core'

import { describeMove, focusTarget, moveTarget } from './keyboard.js'

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

describe('the flattened tree these tests move through', () => {
  it('is the document order the arrows follow', () => {
    expect(rows().map((r) => r.node.key)).toEqual([
      'root',
      'heading',
      'stack',
      'first',
      'second',
      'footer',
    ])
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
  it.each([
    ['up', 'email moved up.'],
    ['down', 'email moved down.'],
    ['right', 'email moved into the component above it.'],
    ['left', 'email moved out one level.'],
  ] as const)('describes a %s move', (direction, sentence) => {
    expect(describeMove('email', direction)).toBe(sentence)
  })
})

/**
 * A document can hold duplicate keys: `validateDocument` reports them, but a
 * host may render a document it never validated.
 */
describe('moveTarget when two parents share a key', () => {
  const leaf = (key: string): ComponentNode => ({ key, type: 'Field', props: {} })

  const twoStacks = (): ComponentNode => ({
    key: 'root',
    type: 'Screen',
    props: {},
    children: [
      { key: 'stack', type: 'Stack', props: {}, children: [leaf('a'), leaf('b')] },
      { key: 'stack', type: 'Stack', props: {}, children: [leaf('c'), leaf('d')] },
    ],
  })

  const isContainer = (type: string): boolean => type === 'Stack' || type === 'Screen'

  it('moves out to the grandparent past the right parent, not the first namesake', () => {
    // The second stack sits at index 1 of the root, so a child moving out of it
    // lands at index 2.
    const rows = flatten(twoStacks())

    expect(moveTarget(rows, 'c', 'left', isContainer)).toEqual({ parentKey: 'root', index: 2 })
  })

  it('still moves out of the first namesake correctly', () => {
    // The first stack is at index 0, so its children move out to index 1.
    const rows = flatten(twoStacks())

    expect(moveTarget(rows, 'a', 'left', isContainer)).toEqual({ parentKey: 'root', index: 1 })
  })

  it('does not offer a move into a container that cannot hold children', () => {
    const hollow: ComponentNode = {
      key: 'root',
      type: 'Screen',
      props: {},
      children: [
        // The kit calls Stack a container; this one has no children array.
        { key: 'hollow', type: 'Stack', props: {} },
        leaf('after'),
      ],
    }

    expect(moveTarget(flatten(hollow), 'after', 'right', isContainer)).toBeUndefined()
  })

  it('still offers a move into a container that can', () => {
    const rows = flatten(twoStacks())

    expect(moveTarget(rows, 'd', 'right', isContainer)).toBeUndefined()

    const nested: ComponentNode = {
      key: 'root',
      type: 'Screen',
      props: {},
      children: [{ key: 'box', type: 'Stack', props: {}, children: [] }, leaf('after')],
    }

    expect(moveTarget(flatten(nested), 'after', 'right', isContainer)).toEqual({
      parentKey: 'box',
      index: 0,
    })
  })

  it('counts a position among this parent children, not every namesake parent', () => {
    const rows = flatten(twoStacks())

    // `d` is the last child of the second stack, so it cannot move down.
    expect(moveTarget(rows, 'd', 'down', isContainer)).toBeUndefined()

    // And `c` is the first, so it cannot move up.
    expect(moveTarget(rows, 'c', 'up', isContainer)).toBeUndefined()
  })

  it('still reorders within one parent', () => {
    const rows = flatten(twoStacks())
    expect(moveTarget(rows, 'a', 'down', isContainer)).toEqual({ parentKey: 'stack', index: 1 })
    expect(moveTarget(rows, 'd', 'up', isContainer)).toEqual({ parentKey: 'stack', index: 0 })
  })
})
