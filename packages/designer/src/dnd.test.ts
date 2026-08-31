import { describe, expect, it } from 'vitest'

import { forbiddenKeys, inferAxis, resolveDrop, resolveTreeDrop } from './dnd.js'
import type { TreeRow } from './dnd.js'
import type { Candidate } from './geometry.js'

/**
 * A column of three fields inside a root screen, laid out the way a browser
 * would: root spans the canvas, children stack down it with a gap.
 *
 *   root      (0,0)   400 x 300, container
 *     a       (10,10)  380 x 40
 *     b       (10,60)  380 x 40
 *     c       (10,110) 380 x 40
 */
function column(): Candidate[] {
  return [
    {
      key: 'root',
      parentKey: undefined,
      index: 0,
      container: true,
      depth: 0,
      rect: { top: 0, left: 0, width: 400, height: 300 },
    },
    {
      key: 'a',
      parentKey: 'root',
      index: 0,
      container: false,
      depth: 1,
      rect: { top: 10, left: 10, width: 380, height: 40 },
    },
    {
      key: 'b',
      parentKey: 'root',
      index: 1,
      container: false,
      depth: 1,
      rect: { top: 60, left: 10, width: 380, height: 40 },
    },
    {
      key: 'c',
      parentKey: 'root',
      index: 2,
      container: false,
      depth: 1,
      rect: { top: 110, left: 10, width: 380, height: 40 },
    },
  ]
}

/** Root screen containing a row-laid-out stack, which itself holds two fields. */
function nested(): Candidate[] {
  return [
    {
      key: 'root',
      parentKey: undefined,
      index: 0,
      container: true,
      depth: 0,
      rect: { top: 0, left: 0, width: 400, height: 300 },
    },
    {
      key: 'stack',
      parentKey: 'root',
      index: 0,
      container: true,
      depth: 1,
      rect: { top: 10, left: 10, width: 380, height: 60 },
    },
    {
      key: 'left',
      parentKey: 'stack',
      index: 0,
      container: false,
      depth: 2,
      rect: { top: 20, left: 20, width: 160, height: 40 },
    },
    {
      key: 'right',
      parentKey: 'stack',
      index: 1,
      container: false,
      depth: 2,
      rect: { top: 20, left: 200, width: 160, height: 40 },
    },
    {
      key: 'below',
      parentKey: 'root',
      index: 1,
      container: false,
      depth: 1,
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
    // (100, 40) is inside root, inside stack, and over `left`.
    const target = resolveDrop(nested(), 100, 40)
    expect(target?.parentKey).toBe('stack')
    expect(target?.orientation).toBe('row')
  })

  it('uses the horizontal axis inside a row container', () => {
    // Past the midpoint of `left` (x=100) but before `right` (x=280).
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

  /*
   * Where the bar is drawn, which no test had ever looked at.
   *
   * `resolveDrop`'s indicator was asserted for an empty container and nowhere
   * else, so the arithmetic that puts the bar in the gap between two components
   * was unchecked in every suite: replacing the midpoint with `rect.top` -- the
   * bar sitting on a component's edge rather than between two of them, which is
   * what tells somebody where the drop will land -- kept everything green.
   *
   * BAR is 2, so a bar is centred on the boundary it names: top = boundary - 1.
   */
  describe('the bar it draws', () => {
    it('sits in the gap between the two children it will land between', () => {
      // a ends at 50, b starts at 60, so the gap's middle is 55.
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
      // c runs 110 to 150.
      expect(target?.indicator.top).toBe(149)
    })

    it('turns on its side inside a row', () => {
      const target = resolveDrop(nested(), 150, 40)
      expect(target?.orientation).toBe('row')
      // left ends at 180, right starts at 200, so the gap's middle is 190.
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
        rect: { top: 0, left: 0, width: 400, height: 300 },
      },
    ]
    const target = resolveDrop(empty, 200, 150)
    expect(target).toMatchObject({ parentKey: 'root', index: 0, empty: true })
    expect(target?.indicator.width).toBeGreaterThan(300)
  })

  /**
   * A parent whose drawn children are not its only children.
   *
   * Three components on screen at document indices 0, 3 and 4: the two in
   * between are hidden by a condition, so they are in the document and not in
   * the measurement. This is the only shape in which a slot in the drawn list
   * and an index in the document are different numbers, and it is the shape
   * `indexInParent` exists for -- every fixture here had contiguous indices, so
   * `before.index + 1` never ran and "one position too far" was untestable.
   */
  function withHidden(): Candidate[] {
    return [
      {
        key: 'root',
        parentKey: undefined,
        index: 0,
        container: true,
        depth: 0,
        rect: { top: 0, left: 0, width: 400, height: 300 },
      },
      {
        key: 'a',
        parentKey: 'root',
        index: 0,
        container: false,
        depth: 1,
        rect: { top: 10, left: 10, width: 380, height: 40 },
      },
      {
        key: 'd',
        parentKey: 'root',
        index: 3,
        container: false,
        depth: 1,
        rect: { top: 60, left: 10, width: 380, height: 40 },
      },
      {
        key: 'e',
        parentKey: 'root',
        index: 4,
        container: false,
        depth: 1,
        rect: { top: 110, left: 10, width: 380, height: 40 },
      },
    ]
  }

  it('places a node from elsewhere after the child it was dropped past, not after that many', () => {
    /*
     * Dropped in the gap below `d`, whose document index is 3, so the answer is
     * 4 -- the slot in the drawn list is 2, and inserting there would put the
     * component before two hidden siblings the author cannot see. Same
     * arithmetic, and only this fixture can tell the two apart.
     */
    const target = resolveDrop(withHidden(), 200, 105, 'fromAnotherParent')
    expect(target?.parentKey).toBe('root')
    expect(target?.index).toBe(4)
  })

  it('places it first when it is dropped above every drawn child', () => {
    const target = resolveDrop(withHidden(), 200, 15, 'fromAnotherParent')
    expect(target?.index).toBe(0)
  })

  it('reads a slot as a slot when the dragged node is a sibling', () => {
    /*
     * The other branch, and the reason it is a branch: `moveNode` removes the
     * node before it inserts, so for a sibling the index is measured in the list
     * that already excludes it.
     */
    const target = resolveDrop(withHidden(), 200, 105, 'a')
    expect(target?.index).toBe(1)
  })

  describe('dragging an existing node', () => {
    it('ignores the dragged node when computing the index', () => {
      // Dragging `a` (index 0) and hovering just below `b`. With `a` removed the
      // remaining children are b, c, and the pointer lands after b.
      const target = resolveDrop(column(), 200, 95, 'a')
      expect(target?.parentKey).toBe('root')
      expect(target?.index).toBe(1)
    })

    it('refuses to drop a container inside itself', () => {
      const target = resolveDrop(nested(), 100, 40, 'stack')
      // The pointer is over `stack`, but `stack` is being dragged, so the drop
      // resolves to the nearest legal ancestor instead.
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
          rect: { top: 25, left: 25, width: 100, height: 30 },
        },
      ]
      // `left` is not a container in this fixture, so make it one.
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
})

/**
 * A tree with root > (stack > left, right), below. Rows are 20px tall and
 * stacked, which is how the structure panel actually lays them out.
 */
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
    // `below` spans 80..100, so 82 is in its top band.
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
    // `stack` spans 20..40; 30 is dead centre.
    expect(resolveTreeDrop(rows(), 30)).toMatchObject({
      parentKey: 'stack',
      index: 0,
      mode: 'inside',
    })
  })

  it('never drops inside a leaf row', () => {
    // `left` spans 40..60; 50 is its middle, but it takes no children.
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
    // Dragging `stack`: its own row, and both children's rows, are dead zones.
    expect(resolveTreeDrop(rows(), 30, 'stack')).toBeUndefined()
    expect(resolveTreeDrop(rows(), 50, 'stack')).toBeUndefined()
    expect(resolveTreeDrop(rows(), 65, 'stack')).toBeUndefined()
    // A row outside the subtree still accepts it.
    expect(resolveTreeDrop(rows(), 98, 'stack')).toMatchObject({ parentKey: 'root' })
  })
})

describe('resolveTreeDrop index against moveNode', () => {
  /**
   * `moveNode` removes the node before inserting it, so the index has to be
   * measured against the siblings that remain. Measuring it against the list
   * that still holds the dragged node put a downward reorder one place too far.
   */
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
    // Bottom band of `b`, dragging `a`: a lands between b and c.
    const target = resolveTreeDrop(siblingRows(), 58, 'a')
    expect(target).toMatchObject({ parentKey: 'root', mode: 'after', index: 1 })
  })

  it('moves a node up to exactly where the indicator showed', () => {
    // Top band of `a`, dragging `c`: c lands first.
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
