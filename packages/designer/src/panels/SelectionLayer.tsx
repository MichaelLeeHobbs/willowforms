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

import { Icon } from '../Icon.js'
import { measureIn, nodeElement } from '../geometry.js'
import type { Rect } from '../geometry.js'

/**
 * A node hidden by `renderWhen` is absent from the DOM, which is the only way a
 * selectable node currently goes invisible. If per-node CSS ever lands, a
 * `display: none` node would measure zero here and want a visibility check.
 */
function measure(surface: HTMLElement, key: string | undefined): Rect | undefined {
  if (!key) return undefined
  const element = nodeElement(surface, key)
  if (!element) return undefined
  return measureIn(surface, element)
}

function frameStyle(box: Rect): CSSProperties {
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
  /**
   * Actions for the selection frame's own toolbar. Omitted for the root, which
   * cannot be duplicated, removed, or given a sibling.
   */
  actions?: SelectionActions
}

export interface SelectionActions {
  onDuplicate: () => void
  onAddSibling: () => void
  onRemove: () => void
}

export function SelectionLayer({
  surfaceRef,
  document,
  selectedKey,
  selectedType,
  hoverKey,
  actions,
}: SelectionLayerProps): ReactNode {
  const [selected, setSelected] = useState<Rect | undefined>(undefined)
  const [hover, setHover] = useState<Rect | undefined>(undefined)

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

          {/*
           * The frame is pointer-events: none so it cannot swallow a click meant
           * for the component underneath. The toolbar has to opt back in, or its
           * own buttons would be unclickable.
           */}
          {actions && (
            <div className="fs-selection__toolbar">
              <button
                type="button"
                aria-label={'Duplicate ' + (selectedKey ?? 'component')}
                title="Duplicate"
                onClick={actions.onDuplicate}
              >
                <Icon name="copy" size={13} />
              </button>
              <button
                type="button"
                aria-label={'Add a sibling after ' + (selectedKey ?? 'component')}
                title="Add a sibling"
                onClick={actions.onAddSibling}
              >
                <Icon name="plus" size={13} />
              </button>
              <button
                type="button"
                className="is-danger"
                aria-label={'Remove ' + (selectedKey ?? 'component')}
                title="Remove"
                onClick={actions.onRemove}
              >
                <Icon name="trash" size={13} />
              </button>
            </div>
          )}
        </div>
      )}
    </>
  )
}
