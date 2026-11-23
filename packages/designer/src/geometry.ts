/**
 * Elements are found by `data-fs-key`, which names an authored node rather than
 * an element: a repeater draws its subtree once per row, and `data-fs-row` says
 * which row. A lookup without a `row` deliberately accepts any copy.
 */

import type { ComponentNode } from '@willowforms/core'

export interface Rect {
  top: number
  left: number
  width: number
  height: number
}

export interface Candidate {
  key: string
  parentKey: string | undefined
  index: number
  container: boolean
  depth: number
  /**
   * The `data-fs-row` of this drawn copy; undefined outside every repeater.
   * Copies in different rows share `key`, which names the authored node.
   */
  row: string | undefined
  rect: Rect
}

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

export function nodeElements(surface: HTMLElement, key: string): HTMLElement[] {
  return [...surface.querySelectorAll<HTMLElement>(`[data-fs-key="${CSS.escape(key)}"]`)]
}

/**
 * In the surface's padding-box space, where its absolutely positioned overlays
 * live: border off and scroll offset back on, or the frame drifts on scroll.
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
        row: element.dataset['fsRow'],
        rect: measureIn(surface, element),
      })
    }

    node.children?.forEach((child, i) => visit(child, node.key, i, depth + 1))
  }

  visit(root, undefined, 0, 0)
  return out
}
