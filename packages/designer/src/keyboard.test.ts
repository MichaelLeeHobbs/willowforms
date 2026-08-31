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

/**
 * The fixture this file navigates, stated once.
 *
 * `flatten` is core's, and its contract -- document order, `parentKey`, `index`,
 * `depth` -- is now pinned in `packages/core/src/tree.test.ts`, where the
 * function lives. Three tests here asserted it under a `describe('flatten')` in
 * a file named for `keyboard.ts`, so core's traversal was described by a suite
 * in another package and this file claimed coverage it was not providing.
 *
 * What is left is the one thing this file needs from it: the order the keyboard
 * moves through, which every test below reads.
 */
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
  /*
   * The sentence a screen reader reads after a keyboard move, and the `down`
   * arm had no test: a switch whose arms differ by one word is exactly where a
   * copied line stays wrong, and the live region is the only feedback a
   * keyboard user gets that the move happened at all.
   */
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
 * Two nodes with the same key, which a document can hold.
 *
 * `validateDocument` reports a duplicate key and cannot prevent one, because a
 * host may render a document it never validated -- and `findNode`, `findParent`
 * and `pathTo` in core all deliberately answer about the *first*. `moveTarget`
 * matched siblings by `parentKey` string, so it collected the children of every
 * parent with that name and counted a position in a list the document does not
 * have.
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

  it('counts a position among this parent children, not every namesake parent', () => {
    const rows = flatten(twoStacks())

    /*
     * `d` is the last child of the second stack, so it cannot move down. With
     * the siblings gathered by key string the list held four entries and `d`
     * sat at position 3 of 4 -- which is not the end, so the move was offered
     * and landed the node at an index its parent does not have.
     */
    expect(moveTarget(rows, 'd', 'down', isContainer)).toBeUndefined()

    // And `c` is the first, so it cannot move up.
    expect(moveTarget(rows, 'c', 'up', isContainer)).toBeUndefined()
  })

  it('still reorders within one parent', () => {
    // The control. A sibling list that came back empty would refuse every move.
    const rows = flatten(twoStacks())
    expect(moveTarget(rows, 'a', 'down', isContainer)).toEqual({ parentKey: 'stack', index: 1 })
    expect(moveTarget(rows, 'd', 'up', isContainer)).toEqual({ parentKey: 'stack', index: 0 })
  })
})
