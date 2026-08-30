/**
 * @vitest-environment jsdom
 */

/**
 * What geometry can be checked without a layout engine.
 *
 * jsdom gives every element a zero rectangle, so anything about *where* things
 * are belongs in `e2e/`. What is checkable here is which elements are found at
 * all — and that is where the row bugs live: a key stopped being unique in the
 * DOM the moment a repeater drew its subtree more than once, and every one of
 * these functions was written when it was.
 */

import { describe, expect, it } from 'vitest'
import type { ComponentNode } from '@formsmith/core'

import { measureTree, nodeElement } from './geometry.js'

/** A canvas holding one repeater whose subtree is drawn twice. */
function surfaceWithRows(): HTMLElement {
  const surface = document.createElement('div')
  surface.innerHTML = [
    '<div data-fs-key="root" data-fs-type="Screen">',
    '  <div data-fs-key="addressList" data-fs-type="Repeater">',
    '    <div data-fs-key="street" data-fs-type="Field" data-fs-row="addresses[0]"></div>',
    '    <div data-fs-key="street" data-fs-type="Field" data-fs-row="addresses[1]"></div>',
    '  </div>',
    '</div>',
  ].join('')
  return surface
}

describe('finding a node in a canvas that repeats one', () => {
  it('finds the element in the row that was asked for', () => {
    /*
     * `querySelector` takes the first match, which was correct when a key was
     * unique in the DOM. A repeater draws its subtree once per row, so the
     * selection frame, `scrollIntoView` and the drop measurements all silently
     * got row 0 whichever row the user was working in.
     */
    const surface = surfaceWithRows()

    expect(nodeElement(surface, 'street', 'addresses[1]')?.dataset['fsRow']).toBe('addresses[1]')
    expect(nodeElement(surface, 'street', 'addresses[0]')?.dataset['fsRow']).toBe('addresses[0]')
  })

  it('still finds a node that is in no row', () => {
    const surface = surfaceWithRows()
    expect(nodeElement(surface, 'addressList')).toBeTruthy()
  })

  it('falls back to the first when the row it was given is gone', () => {
    // A row can be removed while it is selected. Drawing the frame around
    // another row is wrong; drawing it around nothing is worse.
    const surface = surfaceWithRows()
    expect(nodeElement(surface, 'street', 'addresses[9]')?.dataset['fsRow']).toBe('addresses[0]')
  })
})

describe('measuring a canvas that repeats a node', () => {
  const tree: ComponentNode = {
    key: 'root',
    type: 'Screen',
    props: {},
    children: [
      {
        key: 'addressList',
        type: 'Repeater',
        props: {},
        schema: { type: 'array', validations: [] },
        children: [{ key: 'street', type: 'Field', props: {} }],
      },
    ],
  }

  it('produces a candidate for every drawn element, not every authored node', () => {
    /*
     * It walked the *document* and measured one element per node, so rows 1..N
     * produced no candidates at all: hovering row 1 resolved against row 0's
     * children, and a container inside a row was invisible to the drop
     * resolver for every row but the first.
     *
     * The key stays the same across rows, and that is right — a drop names the
     * authored node, because that is the only thing a document has. What
     * differs per row is the rectangle.
     */
    const candidates = measureTree(surfaceWithRows(), tree, () => true)

    expect(candidates.filter((candidate) => candidate.key === 'street')).toHaveLength(2)
  })

  it('still produces exactly one for a node drawn once', () => {
    const candidates = measureTree(surfaceWithRows(), tree, () => true)

    expect(candidates.filter((candidate) => candidate.key === 'addressList')).toHaveLength(1)
    expect(candidates.filter((candidate) => candidate.key === 'root')).toHaveLength(1)
  })

  it('skips an authored node the canvas is not drawing', () => {
    // A node hidden by `renderWhen` is a row in the tree and no element here.
    const hidden: ComponentNode = {
      ...tree,
      children: [...(tree.children ?? []), { key: 'ghost', type: 'Field', props: {} }],
    }

    expect(measureTree(surfaceWithRows(), hidden, () => true).some((c) => c.key === 'ghost')).toBe(
      false,
    )
  })
})
