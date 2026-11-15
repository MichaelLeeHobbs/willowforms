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

/** Root screen containing a row-laid-out stack, which itself holds two fields. */
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
        row: undefined,
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

  it('translates a palette drop the same way as a move from elsewhere', () => {
    // A palette drop passes no dragged key and used to take the raw slot, so the
    // same gesture put a component in two different places depending on whether
    // it came from the palette or from another container.
    expect(resolveDrop(withHidden(), 200, 105)?.index).toBe(4)
    expect(resolveDrop(withHidden(), 200, 105, 'fromAnotherParent')?.index).toBe(4)
  })

  it('places it first when it is dropped above every drawn child', () => {
    const target = resolveDrop(withHidden(), 200, 15, 'fromAnotherParent')
    expect(target?.index).toBe(0)
  })

  it('translates a sibling move too, then accounts for the removal', () => {
    /*
     * This pinned 1 and asserted the wrong thing, under a name that described
     * the defect as the design: "reads a slot as a slot when the dragged node
     * is a sibling". `moveNode` does remove before it inserts -- but the index
     * it removes from is the *document's* list, and the slot is a position in
     * the drawn one. Those agree only when every sibling drew an element, and
     * this fixture is the one built to separate them.
     *
     * Worked by hand and then confirmed by running `removeNode` and
     * `insertNode` for every candidate index. Children are `[a, ?, ?, d, e]`
     * with two drawing nothing; the pointer at y=105 is below `d`'s midpoint
     * (80) and above `e`'s (130), so the author is placing `a` between them:
     *
     *   1 -> h1, a, h2, d, e
     *   2 -> h1, h2, a, d, e
     *   3 -> h1, h2, d, a, e   <- where the pointer was
     *   4 -> h1, h2, d, e, a
     *
     * The old code answered 2 and this test pinned 1. Both put the component
     * somewhere the author did not aim, silently.
     */
    const target = resolveDrop(withHidden(), 200, 105, 'a')
    expect(target?.index).toBe(3)
  })

  it('does not subtract for a sibling being moved forward', () => {
    /*
     * The other half of the removal adjustment, and the reason it is
     * conditional: when the dragged node sits *after* the target position,
     * removing it shifts nothing before that position, so there is nothing to
     * subtract.
     *
     * `e` is last in the document and is dropped between `a` and `d`. Slot 1
     * translates to document index 1, and `e`'s own index (4) is not before it,
     * so the answer stands. Confirmed by running the operation: the children
     * become `a, e, h1, h2, d`, whose drawn list is `a, e, d` -- `e` between the
     * two the pointer was between.
     *
     * My first expectation here was 3, by analogy with the row above rather
     * than by computing this case. The analogy is exactly what the conditional
     * exists to break.
     */
    const target = resolveDrop(withHidden(), 200, 55, 'e')

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

    it('reads the axis from every sibling, including the one being dragged', () => {
      /*
       * A row with exactly two children is the smallest row anybody builds, and
       * moving one of them left a single child behind: `inferAxis` has nothing to
       * infer from one rectangle and falls back to `column`, so the drop compared
       * the pointer's Y against a row and every attempt to move the left field
       * past the right one landed it back where it started.
       *
       * The axis is a fact about the container, so it is read from the container's
       * children rather than from what is left of them.
       */
      const target = resolveDrop(nested(), 350, 40, 'left')
      expect(target?.parentKey).toBe('stack')
      expect(target?.orientation).toBe('row')
      // Past `right`, which is the only sibling left, so index 1 in the filtered
      // list -- and that is the answer the old reading could not reach.
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
          row: undefined,
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

  it('covers a subtree measured out of document order', () => {
    /*
     * Every fixture in this file lists parents before children, and `dnd.ts`
     * says in as many words that the loop exists because "a measurement that is
     * not in document order -- a repeater's rows, a kit that renders children
     * before their container -- would have made a single pass wrong".
     *
     * This is that order, and on its own it is not enough to prove the loop:
     * the dragged key seeds the set, so one pass still catches its direct
     * children whichever way round they are listed. What it does pin is that
     * order does not matter, which is the claim being made. The test below is
     * the one a single pass fails.
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

/**
 * A repeater drawing two rows, and the drop that has to tell them apart.
 *
 * `measureTree` emits one candidate per drawn *element*, and a repeater draws
 * its subtree once per row -- so the children of a repeater arrive at
 * `resolveDrop` as every row's children interleaved, each carrying the same key
 * and the same `index` and differing only in the rectangle. Scanning that list
 * for a midpoint compared the pointer against whichever row sorted first, so a
 * drop aimed at row 1 was placed by row 0's geometry.
 *
 * Trap 11 applies and is the reason for the names below. The repeater is keyed
 * `addressList` and holds `addresses`; its field is keyed `street` and holds
 * `line1`. A fixture whose two names are the same string cannot see a defect
 * about which of them is used, and every repeater fixture in this repository set
 * `key === dataKey` until that was fixed once already.
 */
describe('a drop into the second row of a repeater', () => {
  /*
   * Two rows, stacked, each holding two fields side by side. The rows are
   * `addresses[0]` at the top and `addresses[1]` below it -- the strings the
   * renderer writes into `data-fs-row`, not invented ones.
   */
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
    // Row 0
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
    // Row 1, the same two authored nodes drawn again, lower down.
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
    /*
     * The same X in both, so only the row differs. Left of `street`'s midpoint
     * in row 0 gives index 0; right of `town`'s midpoint in row 1 gives index 2.
     * Interleaved, the two rows' rectangles produce neither.
     */
    const inRowZero = resolveDrop(twoRows(), 20, 30)
    const inRowOne = resolveDrop(twoRows(), 380, 130)

    expect(inRowZero?.parentKey).toBe('addressList')
    expect(inRowOne?.parentKey).toBe('addressList')
    expect(inRowZero?.index).toBe(0)
    expect(inRowOne?.index).toBe(2)
    expect(inRowOne?.index).not.toBe(inRowZero?.index)
  })

  it('draws the bar in the row the pointer is in', () => {
    /*
     * The index alone would pass if the bar were still measured from row 0, and
     * an indicator a hundred pixels from the pointer is the visible half of this
     * defect.
     */
    const inRowOne = resolveDrop(twoRows(), 20, 130)
    expect(inRowOne?.indicator.top).toBeGreaterThanOrEqual(100)
  })

  it('still resolves a form with no repeater in it', () => {
    // The control. Grouping by row must be a no-op where every child shares one
    // row, which is most of a form.
    const flat = twoRows().filter((c) => c.row !== 'addresses[1]')
    expect(resolveDrop(flat, 20, 30)?.index).toBe(0)
    expect(resolveDrop(flat, 380, 30)?.index).toBe(2)
  })

  /*
   * The extent the bar runs across. Children in the parent's own row use the
   * parent's rectangle; children in a repeater row the parent is not in use the
   * rectangle those children cover. An empty container never draws a bar, so
   * that case is the empty outline asserted under `resolveDrop`.
   */
  describe('the span of the bar', () => {
    it("spans the parent for one child in the parent's row", () => {
      const single = column().filter((c) => c.key === 'root' || c.key === 'a')
      // Below a's midpoint (30), so the bar sits past a, which ends at 50.
      expect(resolveDrop(single, 200, 40)?.indicator).toEqual({
        top: 49,
        left: 0,
        width: 400,
        height: 2,
      })
    })

    it('spans only the child for one child in a repeater row', () => {
      const single = twoRows().filter((c) => c.key !== 'town')
      // Row 1's street runs from left 10, 180 wide, and ends at 150.
      expect(resolveDrop(single, 100, 130)?.indicator).toEqual({
        top: 149,
        left: 10,
        width: 180,
        height: 2,
      })
    })

    it('spans the union of several children in a repeater row', () => {
      // Row 1 is a row of two fields from top 110, 40 tall; the bar sits before street.
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
   * `resolveDrop` compared the pointer against child midpoints on ONE axis, so
   * most of a wrapping container's slots were unreachable.
   *
   * `inferAxis` collapses a layout to 'row' | 'column' by summing the deltas
   * between adjacent children, and both kits render `Grid` as
   * `gridTemplateColumns: repeat(auto-fit, minmax(...))` -- a genuinely 2-D
   * wrapping layout, `container: true`, with a palette entry in each. A default
   * `Grid` (columns: 2) holding four children lays them out 2x2; `inferAxis`
   * answered 'row', and a drop into the bottom-right cell resolved to slot 1 --
   * between the two children of the TOP row -- with the drop bar drawn a row
   * away from the pointer.
   *
   * `05-canvas.md` promises this case explicitly, and it is covered by neither
   * jsdom nor e2e/: jsdom has no layout engine, so the geometry is supplied
   * here as rectangles, which is what `resolveDrop` takes.
   *
   * A 2x2 grid, 100 wide and 50 tall per cell, at (0,0):
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
    /*
     * The half of the original report the index assertions above do not cover:
     * "with the drop bar drawn a row away from the pointer". The slot can be
     * right while the drawing is wrong, which is the worse combination -- the
     * drop lands where the author meant and the preview said somewhere else, so
     * they aim again.
     *
     * `barFor` averages the neighbours either side of the slot, and on the full
     * children list the slot for "before c" sits between `b` (the top row's
     * last) and `c` (the bottom row's first). Averaging those puts the bar at
     * x = 50 -- between the two columns of the top row -- when the pointer is at
     * the start of the bottom row.
     */
    const drop = resolveDrop(grid(), 10, 60)

    expect(drop?.index, 'the slot itself moved').toBe(2)

    const bar = drop?.indicator
    expect(bar, 'no indicator was returned').toBeDefined()

    // At the left edge of the bottom row, where the pointer is.
    expect(bar?.left).toBeLessThan(50)
    // And spanning the bottom row rather than the whole container: the row is
    // 50 tall and starts at 50.
    expect(bar?.top).toBe(50)
    expect(bar?.height).toBe(50)
  })

  it('draws the bar between two children of the same band', () => {
    // The ordinary case in a band, so the fix is not "always draw at the left".
    const bar = resolveDrop(grid(), 110, 60)?.indicator

    expect(bar?.left).toBeGreaterThan(50)
    expect(bar?.top).toBe(50)
    expect(bar?.height).toBe(50)
  })

  it('draws the bar in the top row when the pointer is there', () => {
    // The control for both rows above: a band-local bar has to follow the band.
    const bar = resolveDrop(grid(), 110, 10)?.indicator

    expect(bar?.top).toBe(0)
    expect(bar?.height).toBe(50)
  })

  it('reaches every slot, which one axis could not', () => {
    /*
     * The point of the row above, stated as the property: on one axis the
     * pointer could only ever produce slots 0 and 1, so half the grid was
     * unreachable however carefully somebody aimed.
     */
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
    // The control. One band holding several children is a row, and the original
    // path handles it -- the wrapping branch must not take it over.
    const oneRow = grid().filter((c) => c.key === 'root' || c.key === 'a' || c.key === 'b')

    expect(resolveDrop(oneRow, 10, 10)?.index).toBe(0)
    expect(resolveDrop(oneRow, 110, 10)?.index).toBe(1)
    expect(resolveDrop(oneRow, 190, 10)?.index).toBe(2)
  })

  it('still reads a stacked column as a column', () => {
    /*
     * The other control: several bands each holding one child is a column.
     *
     * Built rather than filtered from `grid()`. Filtering left `c` carrying
     * document index 2 with nothing at 1, so the answers were 0, 1 and 3 --
     * correct for that document and nothing to do with the axis, which is
     * exactly the sort of fixture that makes a test say something other than
     * what it is named for.
     */
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
