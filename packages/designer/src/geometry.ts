/**
 * Measuring rendered nodes against the canvas.
 *
 * Every rendered node carries `data-fs-key`, because each kit renderer spreads
 * `nodeProps` onto its root element. That attribute is the only thing tying a
 * DOM element back to a document node, and both the selection overlay and the
 * drop indicator are built on looking elements up by it.
 *
 * This module touches the DOM. The arithmetic that decides where a drop lands
 * lives in `dnd.ts` and touches nothing, so it can be tested without a browser.
 */

import type { ComponentNode } from '@formsmith/core'

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
  rect: Rect
}

/** The key of the nearest rendered node at or above an event target. */
export function keyFromEventTarget(target: EventTarget | null): string | undefined {
  if (!(target instanceof Element)) return undefined
  return target.closest<HTMLElement>('[data-fs-key]')?.dataset['fsKey']
}

export function nodeElement(surface: HTMLElement, key: string): HTMLElement | null {
  return surface.querySelector<HTMLElement>(`[data-fs-key="${CSS.escape(key)}"]`)
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

/**
 * Where a container's coordinate space starts, in client coordinates.
 *
 * Captured once when a drag begins and then used to convert pointer positions
 * without touching the DOM again. That matters for more than speed: with the
 * origin held in React state, the drop indicator becomes a pure function of
 * state, so it can be derived during render instead of set from an effect that
 * would re-render on every pointer move.
 */
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

/**
 * Walk the document and measure every node that actually rendered.
 *
 * Nodes hidden by `renderWhen` are absent from the DOM and are skipped, along
 * with their subtrees: nothing can be dropped into a container that is not on
 * screen. Measured once when a drag begins rather than on every pointer move,
 * because the layout cannot change mid-drag and per-move measurement would force
 * a layout pass for every node on every frame.
 */
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
    const element = nodeElement(surface, node.key)
    if (!element) return

    out.push({
      key: node.key,
      parentKey,
      index,
      container: isContainer(node.type),
      depth,
      rect: measureIn(surface, element),
    })

    node.children?.forEach((child, i) => visit(child, node.key, i, depth + 1))
  }

  visit(root, undefined, 0, 0)
  return out
}
