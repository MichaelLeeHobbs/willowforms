/**
 * Frames are drawn in a sibling overlay, found by `data-fs-key` and measured,
 * never wrapped around a kit component, so the kit's layout is untouched.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { CSSProperties, ReactNode, RefObject } from 'react'
import type { FormDocument } from '@willowforms/core'

import { Icon } from '../Icon.js'
import { measureIn, nodeElement } from '../geometry.js'
import type { Rect } from '../geometry.js'
import { RemoveButton } from './RemoveButton.js'

/**
 * Undefined when the node has no element, as when its kit drops `nodeProps`. A node
 * styled `display: none` measures zero.
 */
function measure(surface: HTMLElement, key: string | undefined, row?: string): Rect | undefined {
  if (!key) return undefined
  const element = nodeElement(surface, key, row)
  if (!element) return undefined
  return measureIn(surface, element)
}

function samePlace(a: Rect | undefined, b: Rect | undefined): boolean {
  if (!a || !b) return a === b
  return a.top === b.top && a.left === b.left && a.width === b.width && a.height === b.height
}

/** Keeps the previous object so a scroll that moved nothing does not re-render the layer. */
function keepIfSame(previous: Rect | undefined, next: Rect | undefined): Rect | undefined {
  return samePlace(previous, next) ? previous : next
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
   * Which drawn copy was pointed at: a repeater repeats keys in the DOM. Absent
   * outside a repeater and for a selection made in the tree.
   */
  selectedRow?: string
  hoverRow?: string
  selectedType: string | undefined
  hoverKey: string | undefined
  /** Omitted for the root, which cannot be duplicated, removed, or given a sibling. */
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
  hoverRow,
  selectedType,
  hoverKey,
  actions,
}: SelectionLayerProps): ReactNode {
  const [selected, setSelected] = useState<Rect | undefined>(undefined)
  const [selectedHidden, setSelectedHidden] = useState(false)
  const [hover, setHover] = useState<Rect | undefined>(undefined)

  const what = useRef({ selectedKey, selectedRow, hoverKey, hoverRow })

  const remeasure = useCallback(() => {
    const surface = surfaceRef.current
    if (!surface) return
    const {
      selectedKey: key,
      selectedRow: row,
      hoverKey: hovered,
      hoverRow: hoveredRow,
    } = what.current
    const nextSelected = measure(surface, key, row)
    setSelectedHidden(
      Boolean(key && nodeElement(surface, key, row)?.closest('[data-fs-hidden="true"]')),
    )
    // Same copy, not just same node: another repeater row of the selection
    // still needs its own hover frame.
    const sameCopy = hovered === key && hoveredRow === row
    const nextHover = measure(surface, sameCopy ? undefined : hovered, hoveredRow)

    setSelected((current) => keepIfSame(current, nextSelected))
    setHover((current) => keepIfSame(current, nextHover))
  }, [surfaceRef])

  // The ref is written here, not in its own effect: a layout effect runs before
  // a plain one, so `remeasure` would read the previous selection.
  useLayoutEffect(() => {
    what.current = { selectedKey, selectedRow, hoverKey, hoverRow }
    remeasure()
  }, [remeasure, document, selectedKey, selectedRow, hoverKey, hoverRow])

  useEffect(() => {
    const surface = surfaceRef.current
    if (!surface) return

    const observer = new ResizeObserver(remeasure)
    observer.observe(surface)
    // The form root, not the frames: observing our own output would loop.
    // `document` is a dependency because React replaces this element when the
    // root's type or key changes.
    const root = surface.querySelector('[data-fs-key]')
    if (root) observer.observe(root)

    surface.addEventListener('scroll', remeasure, { passive: true })
    window.addEventListener('resize', remeasure)

    return () => {
      observer.disconnect()
      surface.removeEventListener('scroll', remeasure)
      window.removeEventListener('resize', remeasure)
    }
  }, [surfaceRef, remeasure, document])

  useLayoutEffect(() => {
    const surface = surfaceRef.current
    if (!surface || !selectedKey) return
    const element = nodeElement(surface, selectedKey, selectedRow)
    if (!element) return

    // Not `scrollIntoView`, which also scrolls every ancestor, the host page included.
    const box = element.getBoundingClientRect()
    const view = surface.getBoundingClientRect()

    if (box.top < view.top) surface.scrollTop -= view.top - box.top
    else if (box.bottom > view.bottom) surface.scrollTop += box.bottom - view.bottom

    if (box.left < view.left) surface.scrollLeft -= view.left - box.left
    else if (box.right > view.right) surface.scrollLeft += box.right - view.right
  }, [surfaceRef, selectedKey, selectedRow])

  return (
    <>
      {hover && <div className="fs-selection fs-selection--hover" style={frameStyle(hover)} />}
      {selected && (
        <div className="fs-selection fs-selection--active" style={frameStyle(selected)}>
          <span className="fs-selection__label">
            {selectedType ?? 'Component'}
            {selectedHidden ? ' · Hidden in preview' : ''}
          </span>

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
              <RemoveButton
                className="is-danger"
                name={selectedKey ?? 'component'}
                title="Remove"
                onClick={actions.onRemove}
              />
            </div>
          )}
        </div>
      )}
    </>
  )
}
