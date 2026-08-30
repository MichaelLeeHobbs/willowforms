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

import { useCallback, useLayoutEffect, useRef, useState } from 'react'
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
function measure(surface: HTMLElement, key: string | undefined, row?: string): Rect | undefined {
  if (!key) return undefined
  const element = nodeElement(surface, key, row)
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
  /**
   * Which drawn copy of the selected node the author pointed at.
   *
   * A repeater draws one subtree per row, so a key is not unique in the DOM and
   * the first match is row 0. Absent outside a repeater, and absent for a
   * selection made from the tree, which names a node and no row.
   */
  selectedRow?: string
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
  selectedRow,
  selectedType,
  hoverKey,
  actions,
}: SelectionLayerProps): ReactNode {
  const [selected, setSelected] = useState<Rect | undefined>(undefined)
  const [hover, setHover] = useState<Rect | undefined>(undefined)

  /*
   * What to measure, held in a ref so the observer does not care that it
   * changed.
   *
   * `remeasure` used to close over the selection and the hover, so it was a new
   * function every time either moved — and the effect below lists it, so the
   * `ResizeObserver` and both listeners were torn down and rebuilt on every
   * hover move. `observe()` delivers an immediate callback, so a sweep across
   * thirty components cost thirty observer cycles and thirty extra renders on
   * top of the thirty it was actually asked for.
   */
  const what = useRef({ selectedKey, selectedRow, hoverKey })

  const remeasure = useCallback(() => {
    const surface = surfaceRef.current
    if (!surface) return
    const { selectedKey: key, selectedRow: row, hoverKey: hovered } = what.current
    setSelected(measure(surface, key, row))
    // One frame is enough when the pointer is over the selection already.
    setHover(measure(surface, hovered === key ? undefined : hovered))
  }, [surfaceRef])

  /*
   * On every change to what is selected or hovered, as well as to the document.
   * The ref is written here rather than in its own effect, because a layout
   * effect runs before an ordinary one — so the first measure after a selection
   * would have read the previous one and drawn no frame at all.
   */
  useLayoutEffect(() => {
    what.current = { selectedKey, selectedRow, hoverKey }
    remeasure()
  }, [remeasure, document, selectedKey, selectedRow, hoverKey])

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
    nodeElement(surface, selectedKey, selectedRow)?.scrollIntoView({
      block: 'nearest',
      inline: 'nearest',
    })
  }, [surfaceRef, selectedKey, selectedRow])

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
