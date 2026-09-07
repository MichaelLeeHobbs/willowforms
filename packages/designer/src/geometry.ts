/**
 * Measuring rendered nodes against the canvas.
 *
 * Every rendered node carries `data-fs-key`, because each kit renderer spreads
 * `nodeProps` onto its root element. That attribute is what ties a DOM element
 * back to a document node, and both the selection overlay and the drop indicator
 * are built on looking elements up by it.
 *
 * It is not unique. A repeater draws its subtree once per row, so a key names
 * one authored node and any number of elements, and `data-fs-row` says which
 * row each of them is in -- the two attributes together identify an element, and
 * the key alone identifies the node. Every function below that takes a `row` is
 * making that distinction; every `querySelector` without one is deliberately
 * answering "any of them will do".
 *
 * This module touches the DOM. The arithmetic that decides where a drop lands
 * lives in `dnd.ts` and touches nothing, so it can be tested without a browser.
 */

import type { ComponentNode } from '@willowforms/core'

export interface Rect {
  top: number
  left: number
  width: number
  height: number
}

/** A node, measured, with the document facts needed to place a drop near it. */
export interface Candidate {
  key: string
  /** Undefined for the root. */
  parentKey: string | undefined
  /** Position among its parent's children. */
  index: number
  /** Whether the component accepts children, from its ComponentDef. */
  container: boolean
  /** Root is 0; deeper nodes count up. Used to pick the innermost hit. */
  depth: number
  /**
   * Which drawn row this element is, when it is inside a repeater.
   *
   * `measureTree` emits one candidate per drawn element and a repeater draws its
   * subtree once per row, so without this every consumer conflated elements from
   * different rows: `resolveDrop` scanned a children list interleaving all of
   * them and computed an insertion index against whichever rectangle happened to
   * come first. One missing field, and the review counted four symptoms.
   *
   * Geometry, not identity, like `rowFromEventTarget` above. The node a drop
   * names is the authored one, which is the only thing a document has; this says
   * which of its drawn copies the pointer is over.
   *
   * Undefined outside every repeater, which is most of a form.
   */
  row: string | undefined
  rect: Rect
}

/** The key of the nearest rendered node at or above an event target. */
export function keyFromEventTarget(target: EventTarget | null): string | undefined {
  if (!(target instanceof Element)) return undefined
  return target.closest<HTMLElement>('[data-fs-key]')?.dataset['fsKey']
}

export function rowFromEventTarget(target: EventTarget | null): string | undefined {
  if (!(target instanceof Element)) return undefined
  return target.closest<HTMLElement>('[data-fs-key]')?.dataset['fsRow']
}

export function nodeElement(surface: HTMLElement, key: string, row?: string): HTMLElement | null {
  const selector = `[data-fs-key="${CSS.escape(key)}"]`
  if (row !== undefined) {
    const inRow = surface.querySelector<HTMLElement>(
      `${selector}[data-fs-row="${CSS.escape(row)}"]`,
    )
    if (inRow) return inRow
  }
  return surface.querySelector<HTMLElement>(selector)
}

/** Every element drawing this node — one per row of every repeater above it. */
export function nodeElements(surface: HTMLElement, key: string): HTMLElement[] {
  return [...surface.querySelectorAll<HTMLElement>(`[data-fs-key="${CSS.escape(key)}"]`)]
}

/**
 * Measure an element in the surface's own coordinate space.
 *
 * Overlays are absolutely positioned children of the surface, which resolves
 * them against its padding box, so the surface's border comes off and its scroll
 * offset goes back on. Skip either and the frame drifts the moment the canvas
 * scrolls.
 */
export function measureIn(surface: HTMLElement, element: Element): Rect {
  const s = surface.getBoundingClientRect()
  const r = element.getBoundingClientRect()
  return {
    top: r.top - s.top - surface.clientTop + surface.scrollTop,
    left: r.left - s.left - surface.clientLeft + surface.scrollLeft,
    width: r.width,
    height: r.height,
  }
}

export interface Origin {
  x: number
  y: number
}

export function originOf(element: HTMLElement): Origin {
  const box = element.getBoundingClientRect()
  return {
    x: box.left + element.clientLeft - element.scrollLeft,
    y: box.top + element.clientTop - element.scrollTop,
  }
}

/** Convert a client-space pointer position into the container's own space. */
export function toLocal(origin: Origin, clientX: number, clientY: number): [number, number] {
  return [clientX - origin.x, clientY - origin.y]
}

export function measureTree(
  surface: HTMLElement,
  root: ComponentNode,
  isContainer: (type: string) => boolean,
): Candidate[] {
  const out: Candidate[] = []

  const visit = (
    node: ComponentNode,
    parentKey: string | undefined,
    index: number,
    depth: number,
  ): void => {
    const elements = nodeElements(surface, node.key)
    if (elements.length === 0) return

    for (const element of elements) {
      out.push({
        key: node.key,
        parentKey,
        index,
        container: isContainer(node.type),
        depth,
        // The element knows which row it is; it carries `data-fs-row`. This was
        // read nowhere and thrown away here.
        row: element.dataset['fsRow'],
        rect: measureIn(surface, element),
      })
    }

    node.children?.forEach((child, i) => visit(child, node.key, i, depth + 1))
  }

  visit(root, undefined, 0, 0)
  return out
}
