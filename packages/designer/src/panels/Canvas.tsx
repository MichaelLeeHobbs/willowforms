import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { MouseEvent, PointerEvent as ReactPointerEvent, ReactNode } from 'react'
import type { FormData, FormErrors, JsonValue, Kit } from '@formsmith/core'
import { indexKit, validateForm } from '@formsmith/core'
import { FormRenderer } from '@formsmith/renderer'
import type { RendererKit } from '@formsmith/renderer'

import { resolveDrop } from '../dnd.js'
import type { DropTarget } from '../dnd.js'
import type { DragController } from '../drag.js'
import { keyFromEventTarget, measureTree, originOf, toLocal } from '../geometry.js'
import type { Candidate, Origin } from '../geometry.js'
import type { DesignerApi } from '../store.js'
import { SelectionLayer } from './SelectionLayer.js'

/** Shared, so an unvalidated canvas does not allocate a new object per render. */
const NO_ERRORS: FormErrors = Object.freeze({})

export interface CanvasProps {
  api: DesignerApi
  kit: Kit
  rendererKit: RendererKit
  drag: DragController
}

/** Everything a drag needs to know about the canvas, frozen when it starts. */
interface Snapshot {
  /** Which drag this was measured for. A mismatch means it is stale. */
  dragId: number
  candidates: Candidate[]
  origin: Origin
}

/**
 * The canvas renders the real runtime renderer, not a design-time approximation.
 * What you see is literally what ships, which is the only way a WYSIWYG builder
 * stays honest as the kit evolves.
 *
 * While editing, a click is a selection gesture, so pointer events are swallowed
 * in the capture phase before the kit's components see them. Preview mode hands
 * the form back its own events untouched.
 */
export function Canvas({ api, kit, rendererKit, drag }: CanvasProps): ReactNode {
  const [preview, setPreview] = useState(false)
  const [data, setData] = useState<FormData>({})
  const [validated, setValidated] = useState(false)
  const [hoverKey, setHoverKey] = useState<string | undefined>(undefined)

  const surfaceRef = useRef<HTMLDivElement>(null)
  /*
   * Measured once when a drag begins, and held in state rather than a ref.
   * The layout cannot change mid-drag, so one snapshot is enough; keeping it in
   * state is what lets the indicator be derived during render as a pure function
   * of state, instead of set from an effect that fires on every pointer move.
   */
  const [snapshot, setSnapshot] = useState<Snapshot | undefined>(undefined)

  /*
   * Memoised, and a shared empty object when nothing is validated. A fresh `{}`
   * every render changed the renderer's context identity every render, which
   * defeated the memo the renderer keeps to avoid re-rendering every node in the
   * form. Validation also runs on the whole tree, so recomputing it per render
   * meant doing that on every keystroke in preview.
   */
  const errors = useMemo(
    () => (validated ? validateForm(api.document.root, data) : NO_ERRORS),
    [validated, api.document.root, data],
  )

  const onChange = useCallback((key: string, value: JsonValue) => {
    setData((d) => ({ ...d, [key]: value }))
  }, [])

  const { select } = api
  const { state: dragState, begin, registerZone, consumeClick } = drag

  const measureNow = useCallback(
    (dragId: number): Snapshot | undefined => {
      const surface = surfaceRef.current
      if (!surface) return undefined
      const defs = indexKit(kit)
      return {
        dragId,
        candidates: measureTree(
          surface,
          api.document.root,
          (type) => defs.get(type)?.container === true,
        ),
        origin: originOf(surface),
      }
    },
    [api.document.root, kit],
  )

  const takeSnapshot = useCallback(
    (dragId: number) => {
      const next = measureNow(dragId)
      if (next) setSnapshot(next)
    },
    [measureNow],
  )

  // Capture-phase mousedown is what actually stops a click from focusing a text
  // field, toggling a checkbox, or opening a select. Cancelling only the click
  // is too late for all three.
  const onMouseDownCapture = useCallback((event: MouseEvent) => {
    event.preventDefault()
  }, [])

  const onPointerDownCapture = useCallback(
    (event: ReactPointerEvent) => {
      const key = keyFromEventTarget(event.target)
      // The root is the canvas itself; dragging it has nowhere to go.
      if (!key || key === api.document.root.key) return
      begin({ kind: 'move', key, label: key }, event)
    },
    [api.document.root.key, begin],
  )

  const onClickCapture = useCallback(
    (event: MouseEvent) => {
      event.stopPropagation()
      if (consumeClick()) return
      select(keyFromEventTarget(event.target))
    },
    [consumeClick, select],
  )

  /*
   * Derived during render rather than in an effect. The pointer moves many times
   * a second, and setting state from an effect would render twice for every one
   * of them: once for the new pointer position, once for the target it implies.
   */
  const dropTarget = useMemo<DropTarget | undefined>(() => {
    if (!dragState || preview || snapshot?.dragId !== dragState.id) return undefined

    const [x, y] = toLocal(snapshot.origin, dragState.x, dragState.y)
    const dragged = dragState.source.kind === 'move' ? dragState.source.key : undefined
    return resolveDrop(snapshot.candidates, x, y, dragged)
  }, [dragState, preview, snapshot])

  /*
   * Asked by the controller when the pointer is released, and it measures afresh
   * rather than trusting the snapshot the indicator is drawn from.
   *
   * That snapshot is taken by a React pointer handler, which always runs before
   * the window listener that records the drag, so it is inherently one event
   * behind. A quick flick from the palette to the canvas can be released before
   * any of it has happened, and the drop would be silently lost. Measuring here
   * costs one layout pass per release and is never stale.
   */
  const resolveRelease = useCallback(
    (clientX: number, clientY: number, draggedKey: string | undefined) => {
      if (preview) return undefined
      const snap = measureNow(0)
      if (!snap) return undefined

      const [x, y] = toLocal(snap.origin, clientX, clientY)
      const resolved = resolveDrop(snap.candidates, x, y, draggedKey)
      return resolved ? { parentKey: resolved.parentKey, index: resolved.index } : undefined
    },
    [measureNow, preview],
  )

  useEffect(() => registerZone('canvas', resolveRelease), [registerZone, resolveRelease])

  const editing = !preview

  return (
    <div className="fs-canvas__inner">
      <div className="fs-canvas__bar">
        <button
          type="button"
          onClick={() => {
            setPreview((p) => !p)
            setValidated(false)
            setHoverKey(undefined)
          }}
          aria-pressed={preview}
        >
          {preview ? 'Back to editing' : 'Preview'}
        </button>

        {preview && (
          <>
            <button type="button" onClick={() => setValidated(true)}>
              Validate
            </button>
            <button
              type="button"
              onClick={() => {
                setData({})
                setValidated(false)
              }}
            >
              Clear data
            </button>
          </>
        )}
      </div>

      <div
        ref={surfaceRef}
        className={'fs-canvas__surface' + (preview ? ' is-preview' : '')}
        {...(editing
          ? {
              onMouseDownCapture,
              onPointerDownCapture,
              onClickCapture,
              // Measured on the first move of each drag that reaches the canvas,
              // including one that started in the palette and never touched it.
              // Doing this in an event handler rather than an effect is what
              // keeps render a pure function of state.
              onPointerMove: () => {
                if (dragState && snapshot?.dragId !== dragState.id) takeSnapshot(dragState.id)
              },
              onPointerOver: (event: ReactPointerEvent) =>
                setHoverKey(keyFromEventTarget(event.target)),
              onPointerLeave: () => setHoverKey(undefined),
            }
          : {})}
      >
        <FormRenderer
          document={api.document}
          kit={rendererKit}
          data={data}
          errors={errors}
          onChange={onChange}
        />

        {editing && (
          <SelectionLayer
            surfaceRef={surfaceRef}
            document={api.document}
            selectedKey={api.selectedKey}
            selectedType={api.selectedNode?.type}
            hoverKey={dragState ? undefined : hoverKey}
          />
        )}

        {editing && dropTarget && (
          <div
            className={'fs-drop' + (dropTarget.empty ? ' fs-drop--empty' : ' fs-drop--bar')}
            style={{
              top: dropTarget.indicator.top,
              left: dropTarget.indicator.left,
              width: dropTarget.indicator.width,
              height: dropTarget.indicator.height,
            }}
          />
        )}
      </div>

      {preview && (
        <div className="fs-canvas__data">
          <section>
            <h2 className="fs-panel__heading">Data</h2>
            <pre>{JSON.stringify(data, null, 2)}</pre>
          </section>
          <section>
            <h2 className="fs-panel__heading">Errors</h2>
            <pre>{JSON.stringify(errors, null, 2)}</pre>
          </section>
        </div>
      )}
    </div>
  )
}
