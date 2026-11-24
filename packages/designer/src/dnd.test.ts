import { describe, expect, it } from 'vitest'

import { forbiddenKeys, inferAxis, resolveDrop, resolveTreeDrop } from './dnd.js'
import type { TreeRow } from './dnd.js'
import type { Candidate } from './geometry.js'

function column(): Candidate[] {
  return [
    {
      key: 'root',
      parentKey: undefined,
      index: 0,
      container: true,
      depth: 0,
      row: undefined,
      rect: { top: 0, left: 0, width: 400, height: 300 },
    },
    {
      key: 'a',
      parentKey: 'root',
      index: 0,
      container: false,
      depth: 1,
      row: undefined,
      rect: { top: 10, left: 10, width: 380, height: 40 },
    },
    {
      key: 'b',
      parentKey: 'root',
      index: 1,
      container: false,
      depth: 1,
      row: undefined,
      rect: { top: 60, left: 10, width: 380, height: 40 },
    },
    {
      key: 'c',
      parentKey: 'root',
      index: 2,
      container: false,
      depth: 1,
      row: undefined,
      rect: { top: 110, left: 10, width: 380, height: 40 },
    },
  ]
}

function nested(): Candidate[] {
  return [
    {
      key: 'root',
      parentKey: undefined,
      index: 0,
      container: true,
      depth: 0,
      row: undefined,
      rect: { top: 0, left: 0, width: 400, height: 300 },
    },
    {
      key: 'stack',
      parentKey: 'root',
      index: 0,
      container: true,
      depth: 1,
      row: undefined,
      rect: { top: 10, left: 10, width: 380, height: 60 },
    },
    {
      key: 'left',
      parentKey: 'stack',
      index: 0,
      container: false,
      depth: 2,
      row: undefined,
      rect: { top: 20, left: 20, width: 160, height: 40 },
    },
    {
      key: 'right',
      parentKey: 'stack',
      index: 1,
      container: false,
      depth: 2,
      row: undefined,
      rect: { top: 20, left: 200, width: 160, height: 40 },
    },
    {
      key: 'below',
      parentKey: 'root',
      index: 1,
      container: false,
      depth: 1,
      row: undefined,
      rect: { top: 90, left: 10, width: 380, height: 40 },
    },
  ]
}

describe('inferAxis', () => {
  it('reads a stack of children as a column', () => {
    const children = column().filter((c) => c.parentKey === 'root')
    expect(inferAxis(children)).toBe('column')
  })

  it('reads side-by-side children as a row', () => {
    const children = nested().filter((c) => c.parentKey === 'stack')
    expect(inferAxis(children)).toBe('row')
  })

  it('defaults to column when there is nothing to infer from', () => {
    expect(inferAxis([])).toBe('column')
    expect(inferAxis(column().slice(1, 2))).toBe('column')
  })
})

describe('resolveDrop', () => {
  it('drops above the first child when the pointer is in its top half', () => {
    const target = resolveDrop(column(), 200, 20)
    expect(target?.parentKey).toBe('root')
    expect(target?.index).toBe(0)
  })

  it('drops between two children when the pointer is past the first midpoint', () => {
    const target = resolveDrop(column(), 200, 55)
    expect(target?.parentKey).toBe('root')
    expect(target?.index).toBe(1)
  })

  it('drops at the end when the pointer is below every child', () => {
    const target = resolveDrop(column(), 200, 280)
    expect(target?.parentKey).toBe('root')
    expect(target?.index).toBe(3)
  })

  it('picks the innermost container under the pointer', () => {
    const target = resolveDrop(nested(), 100, 40)
    expect(target?.parentKey).toBe('stack')
    expect(target?.orientation).toBe('row')
  })

  it('uses the horizontal axis inside a row container', () => {
    expect(resolveDrop(nested(), 150, 40)?.index).toBe(1)
    expect(resolveDrop(nested(), 50, 40)?.index).toBe(0)
    expect(resolveDrop(nested(), 350, 40)?.index).toBe(2)
  })

  it('falls back to the outer container below the inner one', () => {
    const target = resolveDrop(nested(), 200, 95)
    expect(target?.parentKey).toBe('root')
  })

  it('returns nothing when the pointer is outside every container', () => {
    expect(resolveDrop(column(), 900, 900)).toBeUndefined()
  })

  // BAR is 2, so a bar's top is the boundary it names minus 1.
  describe('the bar it draws', () => {
    it('sits in the gap between the two children it will land between', () => {
      const target = resolveDrop(column(), 200, 55)
      expect(target?.index).toBe(1)
      expect(target?.indicator).toEqual({ top: 54, left: 0, width: 400, height: 2 })
    })

    it('sits on the leading edge when the drop is above everything', () => {
      const target = resolveDrop(column(), 200, 20)
      expect(target?.index).toBe(0)
      // a's own top, not the parent's: the bar marks the child it lands before.
      expect(target?.indicator.top).toBe(9)
    })

    it('sits past the last child when the drop is below everything', () => {
      const target = resolveDrop(column(), 200, 280)
      expect(target?.index).toBe(3)
      expect(target?.indicator.top).toBe(149)
    })

    it('turns on its side inside a row', () => {
      const target = resolveDrop(nested(), 150, 40)
      expect(target?.orientation).toBe('row')
      expect(target?.indicator).toMatchObject({ left: 189, width: 2 })
      expect(target?.indicator.height).toBeGreaterThan(40)
    })
  })

  it('marks an empty container and outlines the whole box', () => {
    const empty: Candidate[] = [
      {
        key: 'root',
        parentKey: undefined,
        index: 0,
        container: true,
        depth: 0,
        row: undefined,
        rect: { top: 0, left: 0, width: 400, height: 300 },
      },
    ]
    const target = resolveDrop(empty, 200, 150)
    expect(target).toMatchObject({ parentKey: 'root', index: 0, empty: true })
    expect(target?.indicator.width).toBeGreaterThan(300)
  })

  /**
   * Drawn children at document indices 0, 3 and 4; the two between are hidden
   * by a condition. Only here do a drawn slot and a document index differ.
   */
  function withHidden(): Candidate[] {
    return [
      {
        key: 'root',
        parentKey: undefined,
        index: 0,
        container: true,
        depth: 0,
        row: undefined,
        rect: { top: 0, left: 0, width: 400, height: 300 },
      },
      {
        key: 'a',
        parentKey: 'root',
        index: 0,
        container: false,
        depth: 1,
        row: undefined,
        rect: { top: 10, left: 10, width: 380, height: 40 },
      },
      {
        key: 'd',
        parentKey: 'root',
        index: 3,
        container: false,
        depth: 1,
        row: undefined,
        rect: { top: 60, left: 10, width: 380, height: 40 },
      },
      {
        key: 'e',
        parentKey: 'root',
        index: 4,
        container: false,
        depth: 1,
        row: undefined,
        rect: { top: 110, left: 10, width: 380, height: 40 },
      },
    ]
  }

  it('places a node from elsewhere after the child it was dropped past, not after that many', () => {
    const target = resolveDrop(withHidden(), 200, 105, 'fromAnotherParent')
    expect(target?.parentKey).toBe('root')
    expect(target?.index).toBe(4)
  })

  it('translates a palette drop the same way as a move from elsewhere', () => {
    expect(resolveDrop(withHidden(), 200, 105)?.index).toBe(4)
    expect(resolveDrop(withHidden(), 200, 105, 'fromAnotherParent')?.index).toBe(4)
  })

  it('places it first when it is dropped above every drawn child', () => {
    const target = resolveDrop(withHidden(), 200, 15, 'fromAnotherParent')
    expect(target?.index).toBe(0)
  })

  it('translates a sibling move too, then accounts for the removal', () => {
    /*
     * Children are `[a, h1, h2, d, e]`, h1 and h2 drawing nothing, and y=105 is
     * between `d` and `e`. Moving `a` to each index gives:
     *
     *   2 -> h1, h2, a, d, e
     *   3 -> h1, h2, d, a, e   <- where the pointer was
     */
    const target = resolveDrop(withHidden(), 200, 105, 'a')
    expect(target?.index).toBe(3)
  })

  it('does not subtract for a sibling being moved forward', () => {
    // `e` (index 4) sits after the target, so removing it shifts nothing before
    // index 1.
    const target = resolveDrop(withHidden(), 200, 55, 'e')

    expect(target?.index).toBe(1)
  })

  describe('dragging an existing node', () => {
    it('ignores the dragged node when computing the index', () => {
      const target = resolveDrop(column(), 200, 95, 'a')
      expect(target?.parentKey).toBe('root')
      expect(target?.index).toBe(1)
    })

    it('reads the axis from every sibling, including the one being dragged', () => {
      const target = resolveDrop(nested(), 350, 40, 'left')
      expect(target?.parentKey).toBe('stack')
      expect(target?.orientation).toBe('row')
      expect(target?.index).toBe(1)
    })

    it('refuses to drop a container inside itself', () => {
      const target = resolveDrop(nested(), 100, 40, 'stack')
      expect(target?.parentKey).toBe('root')
    })

    it('refuses to drop a container inside its own descendant', () => {
      const withInner: Candidate[] = [
        ...nested(),
        {
          key: 'inner',
          parentKey: 'left',
          index: 0,
          container: true,
          depth: 3,
          row: undefined,
          rect: { top: 25, left: 25, width: 100, height: 30 },
        },
      ]
      const candidates = withInner.map((c) => (c.key === 'left' ? { ...c, container: true } : c))
      const target = resolveDrop(candidates, 70, 40, 'stack')
      expect(target?.parentKey).toBe('root')
    })
  })
})

describe('forbiddenKeys', () => {
  it('is empty when nothing is being dragged', () => {
    expect(forbiddenKeys(nested(), undefined).size).toBe(0)
  })

  it('covers the dragged node and its whole subtree', () => {
    expect(forbiddenKeys(nested(), 'stack')).toEqual(new Set(['stack', 'left', 'right']))
  })

  it('covers a leaf as just itself', () => {
    expect(forbiddenKeys(nested(), 'below')).toEqual(new Set(['below']))
  })

  it('covers a subtree measured out of document order', () => {
    /*
     * Children listed before their parents, as a kit may measure them. One pass would
     * still catch these, because the dragged key seeds the set; the test below is the
     * one a single pass fails.
     */
    const upsideDown = [...nested()].reverse()
    expect(upsideDown.map((candidate) => candidate.key)).toEqual([
      'below',
      'right',
      'left',
      'stack',
      'root',
    ])

    expect(forbiddenKeys(upsideDown, 'stack')).toEqual(new Set(['stack', 'left', 'right']))
  })

  it('covers a chain three deep, whatever order it arrives in', () => {
    /*
     * Two levels is one extra pass, which a loop that ran exactly twice would
     * also satisfy. Three levels, listed leaf first, needs the loop to keep
     * going until nothing changes.
     */
    const chain = [
      { key: 'leaf', parentKey: 'inner' },
      { key: 'inner', parentKey: 'outer' },
      { key: 'outer', parentKey: 'root' },
      { key: 'root', parentKey: undefined },
    ].map((node, index) => ({
      ...node,
      index,
      container: true,
      depth: 0,
      row: undefined,
      rect: { top: 0, left: 0, width: 10, height: 10 },
    })) as Candidate[]

    expect(forbiddenKeys(chain, 'outer')).toEqual(new Set(['outer', 'inner', 'leaf']))
  })
})

function rows(): TreeRow[] {
  const row = (
    key: string,
    parentKey: string | undefined,
    index: number,
    container: boolean,
    top: number,
  ): TreeRow => ({
    key,
    parentKey,
    index,
    container,
    rect: { top, left: 0, width: 200, height: 20 },
  })

  return [
    row('root', undefined, 0, true, 0),
    row('stack', 'root', 0, true, 20),
    row('left', 'stack', 0, false, 40),
    row('right', 'stack', 1, false, 60),
    row('below', 'root', 1, false, 80),
  ]
}

describe('resolveTreeDrop', () => {
  it('drops before a row when the pointer is near its top edge', () => {
    expect(resolveTreeDrop(rows(), 82)).toMatchObject({
      parentKey: 'root',
      index: 1,
      mode: 'before',
    })
  })

  it('drops after a row when the pointer is near its bottom edge', () => {
    expect(resolveTreeDrop(rows(), 98)).toMatchObject({
      parentKey: 'root',
      index: 2,
      mode: 'after',
    })
  })

  it('drops inside a container row when the pointer is in the middle band', () => {
    expect(resolveTreeDrop(rows(), 30)).toMatchObject({
      parentKey: 'stack',
      index: 0,
      mode: 'inside',
    })
  })

  it('never drops inside a leaf row', () => {
    const target = resolveTreeDrop(rows(), 50)
    expect(target?.mode).not.toBe('inside')
    expect(target?.parentKey).toBe('stack')
  })

  it('always drops inside the root, which has no siblings', () => {
    expect(resolveTreeDrop(rows(), 2)).toMatchObject({ parentKey: 'root', mode: 'inside' })
    expect(resolveTreeDrop(rows(), 18)).toMatchObject({ parentKey: 'root', mode: 'inside' })
  })

  it('returns nothing past the last row', () => {
    expect(resolveTreeDrop(rows(), 500)).toBeUndefined()
  })

  it('refuses to drop a row onto itself or its subtree', () => {
    expect(resolveTreeDrop(rows(), 30, 'stack')).toBeUndefined()
    expect(resolveTreeDrop(rows(), 50, 'stack')).toBeUndefined()
    expect(resolveTreeDrop(rows(), 65, 'stack')).toBeUndefined()
    expect(resolveTreeDrop(rows(), 98, 'stack')).toMatchObject({ parentKey: 'root' })
  })
})

describe('resolveTreeDrop index against moveNode', () => {
  const siblingRows = (): TreeRow[] => {
    const row = (key: string, index: number, top: number): TreeRow => ({
      key,
      parentKey: 'root',
      index,
      container: false,
      rect: { top, left: 0, width: 200, height: 20 },
    })
    return [
      {
        key: 'root',
        parentKey: undefined,
        index: 0,
        container: true,
        rect: { top: 0, left: 0, width: 200, height: 20 },
      },
      row('a', 0, 20),
      row('b', 1, 40),
      row('c', 2, 60),
    ]
  }

  it('moves a node down to exactly where the indicator showed', () => {
    const target = resolveTreeDrop(siblingRows(), 58, 'a')
    expect(target).toMatchObject({ parentKey: 'root', mode: 'after', index: 1 })
  })

  it('moves a node up to exactly where the indicator showed', () => {
    const target = resolveTreeDrop(siblingRows(), 22, 'c')
    expect(target).toMatchObject({ parentKey: 'root', mode: 'before', index: 0 })
  })

  it('is unaffected when the dragged node is not a sibling', () => {
    const target = resolveTreeDrop(siblingRows(), 58, 'elsewhere')
    expect(target).toMatchObject({ index: 2 })
  })

  it('places a new component by position among the existing siblings', () => {
    const target = resolveTreeDrop(siblingRows(), 58)
    expect(target).toMatchObject({ index: 2 })
  })
})

/**
 * A repeater's children arrive as every row's copies interleaved, sharing key
 * and index and differing only in rectangle.
 *
 * Keys differ from data keys on purpose (write-tests Trap 11): the repeater is
 * keyed `addressList` and holds `addresses`.
 */
describe('a drop into the second row of a repeater', () => {
  // Row strings match what the renderer writes into `data-fs-row`.
  const twoRows = (): Candidate[] => [
    {
      key: 'root',
      parentKey: undefined,
      index: 0,
      container: true,
      depth: 0,
      row: undefined,
      rect: { top: 0, left: 0, width: 400, height: 300 },
    },
    {
      key: 'addressList',
      parentKey: 'root',
      index: 0,
      container: true,
      depth: 1,
      row: undefined,
      rect: { top: 0, left: 0, width: 400, height: 200 },
    },
    {
      key: 'street',
      parentKey: 'addressList',
      index: 0,
      container: false,
      depth: 2,
      row: 'addresses[0]',
      rect: { top: 10, left: 10, width: 180, height: 40 },
    },
    {
      key: 'town',
      parentKey: 'addressList',
      index: 1,
      container: false,
      depth: 2,
      row: 'addresses[0]',
      rect: { top: 10, left: 210, width: 180, height: 40 },
    },
    {
      key: 'street',
      parentKey: 'addressList',
      index: 0,
      container: false,
      depth: 2,
      row: 'addresses[1]',
      rect: { top: 110, left: 10, width: 180, height: 40 },
    },
    {
      key: 'town',
      parentKey: 'addressList',
      index: 1,
      container: false,
      depth: 2,
      row: 'addresses[1]',
      rect: { top: 110, left: 210, width: 180, height: 40 },
    },
  ]

  it('places by the row the pointer is in, not by the first row measured', () => {
    // Left of `street`'s midpoint in row 0 gives index 0; right of `town`'s midpoint in
    // row 1 gives index 2. Interleaved, the two rows' rectangles produce neither.
    const inRowZero = resolveDrop(twoRows(), 20, 30)
    const inRowOne = resolveDrop(twoRows(), 380, 130)

    expect(inRowZero?.parentKey).toBe('addressList')
    expect(inRowOne?.parentKey).toBe('addressList')
    expect(inRowZero?.index).toBe(0)
    expect(inRowOne?.index).toBe(2)
    expect(inRowOne?.index).not.toBe(inRowZero?.index)
  })

  it('draws the bar in the row the pointer is in', () => {
    const inRowOne = resolveDrop(twoRows(), 20, 130)
    expect(inRowOne?.indicator.top).toBeGreaterThanOrEqual(100)
  })

  it('still resolves a form with no repeater in it', () => {
    const flat = twoRows().filter((c) => c.row !== 'addresses[1]')
    expect(resolveDrop(flat, 20, 30)?.index).toBe(0)
    expect(resolveDrop(flat, 380, 30)?.index).toBe(2)
  })

  describe('the span of the bar', () => {
    it("spans the parent for one child in the parent's row", () => {
      const single = column().filter((c) => c.key === 'root' || c.key === 'a')
      expect(resolveDrop(single, 200, 40)?.indicator).toEqual({
        top: 49,
        left: 0,
        width: 400,
        height: 2,
      })
    })

    it('spans only the child for one child in a repeater row', () => {
      const single = twoRows().filter((c) => c.key !== 'town')
      expect(resolveDrop(single, 100, 130)?.indicator).toEqual({
        top: 149,
        left: 10,
        width: 180,
        height: 2,
      })
    })

    it('spans the union of several children in a repeater row', () => {
      expect(resolveDrop(twoRows(), 20, 130)?.indicator).toEqual({
        top: 110,
        left: 9,
        width: 2,
        height: 40,
      })
    })
  })
})

describe('a wrapping container, which both shipped kits have', () => {
  /*
   * Both kits render `Grid` with `repeat(auto-fit, minmax(...))` columns, so its
   * children wrap onto several lines. A 2x2 grid, 100 x 50 per cell:
   *
   *     a (0,0)      b (100,0)
   *     c (0,50)     d (100,50)
   */
  function grid(): Candidate[] {
    const cell = (key: string, index: number, left: number, top: number): Candidate => ({
      key,
      parentKey: 'root',
      index,
      container: false,
      depth: 1,
      row: undefined,
      rect: { top, left, width: 100, height: 50 },
    })

    return [
      {
        key: 'root',
        parentKey: undefined,
        index: 0,
        container: true,
        depth: 0,
        row: undefined,
        rect: { top: 0, left: 0, width: 200, height: 100 },
      },
      cell('a', 0, 0, 0),
      cell('b', 1, 100, 0),
      cell('c', 2, 0, 50),
      cell('d', 3, 100, 50),
    ]
  }

  it.each([
    ['before a, top-left', 10, 10, 0],
    ['between a and b', 110, 10, 1],
    ['after b, end of the top row', 190, 10, 2],
    ['before c, start of the bottom row', 10, 60, 2],
    ['between c and d', 110, 60, 3],
    ['after d, the end', 190, 60, 4],
  ])('resolves %s', (_what, x, y, index) => {
    expect(resolveDrop(grid(), x, y)?.index).toBe(index)
  })

  it('draws the bar in the band the pointer is in', () => {
    const drop = resolveDrop(grid(), 10, 60)

    expect(drop?.index, 'the slot itself moved').toBe(2)

    const bar = drop?.indicator
    expect(bar, 'no indicator was returned').toBeDefined()

    expect(bar?.left).toBeLessThan(50)
    expect(bar?.top).toBe(50)
    expect(bar?.height).toBe(50)
  })

  it('draws the bar between two children of the same band', () => {
    const bar = resolveDrop(grid(), 110, 60)?.indicator

    expect(bar?.left).toBeGreaterThan(50)
    expect(bar?.top).toBe(50)
    expect(bar?.height).toBe(50)
  })

  it('draws the bar in the top row when the pointer is there', () => {
    const bar = resolveDrop(grid(), 110, 10)?.indicator

    expect(bar?.top).toBe(0)
    expect(bar?.height).toBe(50)
  })

  it('reaches every slot, which one axis could not', () => {
    const reached = new Set(
      [
        [10, 10],
        [110, 10],
        [190, 10],
        [10, 60],
        [110, 60],
        [190, 60],
      ].map(([x, y]) => resolveDrop(grid(), x as number, y as number)?.index),
    )

    expect([...reached].sort((l, r) => (l ?? 0) - (r ?? 0))).toEqual([0, 1, 2, 3, 4])
  })

  it('still reads a single row as a row', () => {
    const oneRow = grid().filter((c) => c.key === 'root' || c.key === 'a' || c.key === 'b')

    expect(resolveDrop(oneRow, 10, 10)?.index).toBe(0)
    expect(resolveDrop(oneRow, 110, 10)?.index).toBe(1)
    expect(resolveDrop(oneRow, 190, 10)?.index).toBe(2)
  })

  it('still reads a stacked column as a column', () => {
    // Built, not filtered from `grid()`: filtering leaves a gap in the document
    // indices, which tests something other than the axis.
    const stacked: Candidate[] = [
      {
        key: 'root',
        parentKey: undefined,
        index: 0,
        container: true,
        depth: 0,
        row: undefined,
        rect: { top: 0, left: 0, width: 200, height: 100 },
      },
      {
        key: 'a',
        parentKey: 'root',
        index: 0,
        container: false,
        depth: 1,
        row: undefined,
        rect: { top: 0, left: 0, width: 200, height: 50 },
      },
      {
        key: 'b',
        parentKey: 'root',
        index: 1,
        container: false,
        depth: 1,
        row: undefined,
        rect: { top: 50, left: 0, width: 200, height: 50 },
      },
    ]

    expect(resolveDrop(stacked, 50, 10)?.index).toBe(0)
    expect(resolveDrop(stacked, 50, 60)?.index).toBe(1)
    expect(resolveDrop(stacked, 50, 95)?.index).toBe(2)
  })
})
