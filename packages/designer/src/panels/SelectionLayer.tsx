/**
 * The canvas selection overlay.
 *
 * The canvas draws real kit components, so there is no designer-owned DOM to
 * hang a selection frame on. Instead every renderer spreads `nodeProps` onto its
 * root element, which puts `data-fs-key` in the DOM; this layer looks the
 * element up by key, measures it, and draws a frame in a sibling div. The frames
 * are `pointer-events: none` and never wrap the component, so nothing here can
 * disturb the kit's layout.
 */

import { useCallback, useLayoutEffect, useState } from 'react'
import type { CSSProperties, ReactNode, RefObject } from 'react'
import type { FormDocument } from '@formsmith/core'

interface Box {
  top: number
  left: number
  width: number
  height: number
}

/** The key of the nearest rendered node at or above an event target. */
export function keyFromEventTarget(target: EventTarget | null): string | undefined {
  if (!(target instanceof Element)) return undefined
  return target.closest<HTMLElement>('[data-fs-key]')?.dataset['fsKey']
}

function nodeElement(surface: HTMLElement, key: string): HTMLElement | null {
  return surface.querySelector<HTMLElement>(`[data-fs-key="${CSS.escape(key)}"]`)
}

/**
 * Measure in the surface's own coordinate space. Absolutely positioned children
 * resolve against the padding box, so client borders come off and scroll goes
 * back on; otherwise the frame drifts as soon as the canvas scrolls.
 */
function measure(surface: HTMLElement, key: string | undefined): Box | undefined {
  if (!key) return undefined
  // A node hidden by `renderWhen` is absent from the DOM, which is the only way
  // a selectable node currently goes invisible. If per-node CSS ever lands, a
  // `display: none` node would measure zero here and want a visibility check.
  const element = nodeElement(surface, key)
  if (!element) return undefined

  const s = surface.getBoundingClientRect()
  const r = element.getBoundingClientRect()

  return {
    top: r.top - s.top - surface.clientTop + surface.scrollTop,
    left: r.left - s.left - surface.clientLeft + surface.scrollLeft,
    width: r.width,
    height: r.height,
  }
}

function frameStyle(box: Box): CSSProperties {
  return { top: box.top, left: box.left, width: box.width, height: box.height }
}

export interface SelectionLayerProps {
  surfaceRef: RefObject<HTMLDivElement | null>
  /** Only used to re-measure after an edit changes a component's size. */
  document: FormDocument
  selectedKey: string | undefined
  /** Component type of the selection, shown on the frame's label. */
  selectedType: string | undefined
  hoverKey: string | undefined
}

export function SelectionLayer({
  surfaceRef,
  document,
  selectedKey,
  selectedType,
  hoverKey,
}: SelectionLayerProps): ReactNode {
  const [selected, setSelected] = useState<Box | undefined>(undefined)
  const [hover, setHover] = useState<Box | undefined>(undefined)

  const remeasure = useCallback(() => {
    const surface = surfaceRef.current
    if (!surface) return
    setSelected(measure(surface, selectedKey))
    // One frame is enough when the pointer is over the selection already.
    setHover(measure(surface, hoverKey === selectedKey ? undefined : hoverKey))
  }, [surfaceRef, selectedKey, hoverKey])

  useLayoutEffect(remeasure, [remeasure, document])

  useLayoutEffect(() => {
    const surface = surfaceRef.current
    if (!surface) return

    const observer = new ResizeObserver(remeasure)
    observer.observe(surface)
    // The form root, not every frame: observing our own output would loop.
    const root = surface.querySelector('[data-fs-key]')
    if (root) observer.observe(root)

    surface.addEventListener('scroll', remeasure, { passive: true })
    window.addEventListener('resize', remeasure)

    return () => {
      observer.disconnect()
      surface.removeEventListener('scroll', remeasure)
      window.removeEventListener('resize', remeasure)
    }
  }, [surfaceRef, remeasure])

  // Selecting in the tree should bring the component into view on the canvas.
  useLayoutEffect(() => {
    const surface = surfaceRef.current
    if (!surface || !selectedKey) return
    nodeElement(surface, selectedKey)?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [surfaceRef, selectedKey])

  return (
    <>
      {hover && <div className="fs-selection fs-selection--hover" style={frameStyle(hover)} />}
      {selected && (
        <div className="fs-selection fs-selection--active" style={frameStyle(selected)}>
          <span className="fs-selection__label">{selectedType ?? 'Component'}</span>
        </div>
      )}
    </>
  )
}
