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

import {
  keyFromEventTarget,
  measureTree,
  nodeElement,
  rowFromEventTarget,
  toLocal,
} from './geometry.js'

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

/**
 * Which node a click landed on, and which of its drawn copies.
 *
 * Both functions are pure DOM traversal, need no layout engine, and had no test
 * of their own -- they were exercised only through Canvas tests that never
 * varied where the attributes sit. `Canvas.tsx` feeds `rowFromEventTarget`
 * straight into `selectedRow`, so what it answers is what the selection frame,
 * the label and the row toolbar are drawn around.
 */
describe('reading a click', () => {
  const clicked = (html: string, selector: string): Element => {
    const surface = document.createElement('div')
    surface.innerHTML = html
    const target = surface.querySelector(selector)
    if (!target) throw new Error('no ' + selector + ' in the fixture')
    return target
  }

  const ROW = [
    '<div data-fs-key="addressList" data-fs-type="Repeater">',
    '  <div data-fs-key="street" data-fs-row="addresses[1]">',
    '    <label><span class="inner">Street</span><input /></label>',
    '  </div>',
    '</div>',
  ].join('')

  it('reads the key off the nearest keyed ancestor, not the element hit', () => {
    // A click lands on whatever the kit drew innermost -- a span inside a label
    // inside the field -- and the node it belongs to is above it.
    expect(keyFromEventTarget(clicked(ROW, '.inner'))).toBe('street')
    expect(keyFromEventTarget(clicked(ROW, 'input'))).toBe('street')
  })

  it('reads the row off that same ancestor', () => {
    expect(rowFromEventTarget(clicked(ROW, '.inner'))).toBe('addresses[1]')
  })

  it('answers nothing for a click outside every rendered node', () => {
    expect(keyFromEventTarget(clicked('<div class="bare"></div>', '.bare'))).toBeUndefined()
    expect(rowFromEventTarget(clicked('<div class="bare"></div>', '.bare'))).toBeUndefined()
  })

  it('answers nothing for a target that is not an element at all', () => {
    // An event target can be the document, the window, or a text node picked up
    // by a synthetic event. All three reach here from real handlers.
    for (const target of [null, document, window]) {
      expect(keyFromEventTarget(target as EventTarget | null)).toBeUndefined()
      expect(rowFromEventTarget(target as EventTarget | null)).toBeUndefined()
    }
  })

  it('answers no row when the row attribute is on a wrapper that is not the node', () => {
    /*
     * The shape worth knowing about. Both functions look at the nearest
     * `[data-fs-key]` and read `data-fs-row` off *that* element, so a kit that
     * puts the row marker on an unkeyed wrapper gets `undefined` -- the click
     * knows which row it was in and the answer is thrown away, which is the bug
     * `rowFromEventTarget` was written to fix, in a new spelling.
     *
     * Written down rather than fixed by widening the search: the renderer emits
     * `data-fs-row` on the same element as `data-fs-key` (`renderer/index.tsx`,
     * the node boundary), so this is a contract between the two, and a guard
     * that quietly accepted either placement would hide the day it broke.
     */
    const stray = [
      '<div data-fs-row="addresses[1]">',
      '  <div data-fs-key="street"><input /></div>',
      '</div>',
    ].join('')

    expect(keyFromEventTarget(clicked(stray, 'input'))).toBe('street')
    expect(rowFromEventTarget(clicked(stray, 'input'))).toBeUndefined()
  })
})

/**
 * Client coordinates into surface coordinates.
 *
 * Pure arithmetic over two numbers, no test in any environment, and every drop
 * position in the designer passes through it: the canvas and the tree both
 * subtract the surface's origin before asking `resolveDrop` anything, so a sign
 * error here moves every drop by the surface's offset and nothing else would
 * say where it came from.
 */
describe('toLocal', () => {
  it('subtracts the origin from the pointer', () => {
    expect(toLocal({ x: 10, y: 20 }, 40, 50)).toEqual([30, 30])
  })

  it('answers zero at the origin, and negatives above and left of it', () => {
    // A release above or left of the surface is outside it, and the callers
    // decide that by the sign -- so it has to be a sign rather than a clamp.
    expect(toLocal({ x: 10, y: 20 }, 10, 20)).toEqual([0, 0])
    expect(toLocal({ x: 10, y: 20 }, 4, 8)).toEqual([-6, -12])
  })

  it('carries a scrolled origin through unchanged', () => {
    // The origin already accounts for the surface's scroll, which is why this
    // is a subtraction and not a `getBoundingClientRect` of its own.
    expect(toLocal({ x: -120, y: -45 }, 0, 0)).toEqual([120, 45])
  })
})
