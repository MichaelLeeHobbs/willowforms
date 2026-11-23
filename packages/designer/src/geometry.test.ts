/**
 * @vitest-environment jsdom
 */

// jsdom gives every element a zero rectangle, so positions are tested in `e2e/`.
// This file covers which elements are found.

import { describe, expect, it } from 'vitest'
import type { ComponentNode } from '@willowforms/core'

import {
  keyFromEventTarget,
  measureTree,
  nodeElement,
  rowFromEventTarget,
  toLocal,
} from './geometry.js'

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
    for (const target of [null, document, window]) {
      expect(keyFromEventTarget(target as EventTarget | null)).toBeUndefined()
      expect(rowFromEventTarget(target as EventTarget | null)).toBeUndefined()
    }
  })

  it('answers no row when the row attribute is on a wrapper that is not the node', () => {
    /*
     * Not widened on purpose: the renderer puts `data-fs-row` on the same element
     * as `data-fs-key` (`renderer/index.tsx`), and accepting either placement
     * would hide the day that contract broke.
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
