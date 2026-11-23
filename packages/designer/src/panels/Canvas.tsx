import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import type {
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent,
  PointerEvent as ReactPointerEvent,
  ReactNode,
} from 'react'
import type {
  Device,
  Effect,
  FormContext,
  FormData,
  FormErrors,
  JsonValue,
  Kit,
} from '@willowforms/core'
import {
  applyChange,
  addressOf,
  autoValidateKeys,
  dataKeyOf,
  decodeAddress,
  contextValues,
  findNode,
  findParent,
  indexKit,
  jsonToString,
  same,
  validateForm,
} from '@willowforms/core'
import { FormRenderer } from '@willowforms/renderer'
import type { RendererKit } from '@willowforms/renderer'

import { resolveDrop } from '../dnd.js'
import type { DropTarget } from '../dnd.js'
import type { DragController } from '../drag.js'
import {
  keyFromEventTarget,
  measureTree,
  originOf,
  rowFromEventTarget,
  toLocal,
} from '../geometry.js'
import type { Candidate, Origin } from '../geometry.js'
import { useDragSnapshot } from '../snapshot.js'
import type { DesignerApi } from '../store.js'
import { SelectionLayer } from './SelectionLayer.js'
import { PreviewData } from './PreviewData.js'

/** Shared, so an unvalidated canvas does not allocate a new object per render. */
const NO_ERRORS: FormErrors = Object.freeze({})

/** Without `any`: that is the base CSS layer, not a device anyone can view. */
export type Viewport = Exclude<Device, 'any'>

export interface CanvasProps {
  preview: boolean
  onPreview: (preview: boolean) => void
  api: DesignerApi
  kit: Kit
  rendererKit: RendererKit
  drag: DragController
  /** A view preference, never stored in the document. */
  viewport: Viewport
  fixedSize?: { width: number; height: number }
  /** Language tag the canvas renders in. Omitted means the document's default. */
  language?: string
}

/**
 * Desktop has no width: the canvas is the viewport.
 *
 * Never clamped or scaled to fit; the canvas scrolls instead. A clamped frame
 * misstates the device, and a transform would make measured rectangles stop
 * matching pointer coordinates.
 */
const FRAME_WIDTH: Partial<Record<Viewport, number>> = {
  tablet: 768,
  mobile: 390,
}

/** Everything a drag needs to know about the canvas, frozen when it starts. */
interface Snapshot {
  dragId: number
  candidates: Candidate[]
  origin: Origin
}

// What the canvas renders and which events it swallows: docs/spec/05-canvas.md.

/**
 * The selection toolbar sits inside the surface, so it is exempt from the
 * capture-phase handlers that make a click select rather than operate.
 */
const isOwnChrome = (target: EventTarget | null): boolean =>
  target instanceof Element && target.closest('.fs-selection') !== null

export const canvasSwallowsFocus = (target: EventTarget | null): boolean =>
  target instanceof Element &&
  target.closest('.fs-canvas__surface:not(.is-preview)') !== null &&
  !isOwnChrome(target)

export function Canvas({
  api,
  kit,
  rendererKit,
  drag,
  viewport,
  fixedSize,
  language,
  preview,
  onPreview,
}: CanvasProps): ReactNode {
  const diagnosticsId = useId()
  const [diagnostics, setDiagnostics] = useState(false)

  const steps = useMemo(() => contextValues(api.document.root, 'step'), [api.document.root])
  const [step, setStep] = useState<JsonValue | undefined>(undefined)

  const current = step !== undefined && steps.some((value) => same(value, step)) ? step : steps[0]
  const context = useMemo<FormContext | undefined>(
    () => (current === undefined ? undefined : { step: current }),
    [current],
  )
  const messages = useMemo(() => {
    const bundles: unknown = api.document.translations
    if (!bundles || typeof bundles !== 'object' || Array.isArray(bundles)) return undefined
    const bundle: unknown = (bundles as Record<string, unknown>)[
      language ?? api.document.defaultLanguage
    ]
    if (!bundle || typeof bundle !== 'object' || Array.isArray(bundle)) return undefined
    return Object.fromEntries(
      Object.entries(bundle).filter(
        (entry): entry is [string, string] => typeof entry[1] === 'string',
      ),
    )
  }, [api.document.defaultLanguage, api.document.translations, language])
  const [data, setData] = useState<FormData>({})
  const [validated, setValidated] = useState(false)
  const [actionNote, setActionNote] = useState('')
  const [touched, setTouched] = useState<ReadonlySet<string>>(() => new Set())
  const [hover, setHover] = useState<{ key: string | undefined; row: string | undefined }>({
    key: undefined,
    row: undefined,
  })

  const [clicked, setClicked] = useState<{ key: string | undefined; row: string | undefined }>({
    key: undefined,
    row: undefined,
  })
  const hoverKey = hover.key
  const selectedRow = clicked.key === api.selectedKey ? clicked.row : undefined

  const frameWidth = fixedSize?.width ?? FRAME_WIDTH[viewport]

  const selected = api.selectedNode
  const selectedKey = api.selectedKey

  const parent = useMemo(
    () =>
      selectedKey && selectedKey !== api.document.root.key
        ? findParent(api.document.root, selectedKey)
        : undefined,
    [api.document.root, selectedKey],
  )

  const { addComponent, duplicateComponent, removeComponent } = api
  const selectionActions = useMemo(() => {
    if (!selected || !selectedKey || !parent) return undefined
    const index = parent.children?.findIndex((child) => child.key === selectedKey) ?? -1
    if (index === -1) return undefined

    return {
      onDuplicate: () => duplicateComponent(selectedKey),
      // A fresh component of the same type, not a copy: copying is Duplicate's job.
      onAddSibling: () => {
        const def = indexKit(kit).get(selected.type)
        if (def) addComponent(def, parent.key, index + 1)
      },
      onRemove: () => removeComponent(selectedKey),
    }
  }, [selected, selectedKey, parent, kit, addComponent, duplicateComponent, removeComponent])

  const surfaceRef = useRef<HTMLDivElement>(null)
  const stepSelectRef = useRef<HTMLSelectElement>(null)
  useEffect(() => {
    if (!preview || current === undefined) return
    if (surfaceRef.current) surfaceRef.current.scrollTop = 0
    stepSelectRef.current?.focus({ preventScroll: true })
  }, [current, preview])

  const errors = useMemo(() => {
    if (!preview) return NO_ERRORS

    const all = validateForm(api.document.root, data, { context, messages })
    if (validated) return all

    // Before a submit, only touched `autoValidate` fields: docs/spec/06-inspector.md.
    // Errors use node keys; touched values use data keys in the same row path.
    const eager = autoValidateKeys(api.document.root)
    let shown: FormErrors | undefined
    for (const address of Object.keys(all)) {
      const decoded = decodeAddress(address)
      const key = decoded?.name ?? address
      const node = findNode(api.document.root, key)
      const dataAddress = node && decoded ? addressOf(decoded.path, dataKeyOf(node)) : address
      if (!eager.has(key) || !touched.has(dataAddress)) continue

      const message = all[address]
      if (message === undefined) continue
      shown ??= {}
      shown[address] = message
    }
    return shown ?? NO_ERRORS
  }, [preview, validated, api.document.root, data, touched, context, messages])

  const onChange = useCallback((address: string, value: JsonValue) => {
    setActionNote('')
    setData((d) => applyChange(d, address, value))
    setTouched((t) => (t.has(address) ? t : new Set(t).add(address)))
  }, [])

  const onEffects = useCallback(
    (effects: Effect[]) => {
      if (!preview) return
      const notes: string[] = []
      const submitting = effects.some(
        (effect) => effect.kind === 'emit' && effect.event === 'submit',
      )
      if (submitting || effects.some((effect) => effect.kind === 'validate')) {
        const scopes = steps.length ? steps.map((value) => ({ step: value })) : [context]
        const results = scopes.map((scope) =>
          validateForm(api.document.root, data, { context: scope, messages }),
        )
        const count = new Set(results.flatMap((result) => Object.keys(result))).size
        setValidated(true)
        if (count) {
          const first = results.findIndex((result) => Object.keys(result).length > 0)
          if (steps.length) setStep(steps[first])
          notes.push(`Check ${count} ${count === 1 ? 'field' : 'fields'} before submitting.`)
        } else {
          notes.push(
            submitting
              ? 'Form is valid. Submission simulated; no data was sent.'
              : 'All answers are valid.',
          )
        }
      }
      for (const effect of effects) {
        if (effect.kind === 'announce') notes.push(effect.message)
        else if (effect.kind === 'emit' && effect.event !== 'submit')
          notes.push(`Event “${effect.event}” requested. Preview only; no data was sent.`)
        else if (effect.kind !== 'emit' && effect.kind !== 'validate')
          notes.push(`Action “${effect.kind}” requires a host handler; Preview did not apply it.`)
      }
      setActionNote(notes.join(' '))
    },
    [preview, steps, context, api.document.root, data, messages],
  )

  const onActionError = useCallback((message: string) => {
    setActionNote('Action could not run: ' + message)
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

  const { snapshot, takeSnapshot, clearSnapshot } = useDragSnapshot(measureNow)

  // Only scroll and resize invalidate the measurement; pointer movement reuses it.
  const dragId = dragState?.id
  useEffect(() => {
    if (dragId === undefined || preview) return
    const refresh = (): void => takeSnapshot(dragId)
    window.addEventListener('scroll', refresh, true)
    window.addEventListener('resize', refresh)
    return () => {
      window.removeEventListener('scroll', refresh, true)
      window.removeEventListener('resize', refresh)
    }
  }, [dragId, preview, takeSnapshot])

  const onMouseDownCapture = useCallback((event: MouseEvent) => {
    if (isOwnChrome(event.target)) return
    event.preventDefault()
    event.stopPropagation()
  }, [])

  const onPointerDownCapture = useCallback(
    (event: ReactPointerEvent) => {
      if (isOwnChrome(event.target)) return
      // Primary button only: a drifting right-press would move the component
      // under its own context menu.
      if (event.button !== 0) return

      event.preventDefault()

      const key = keyFromEventTarget(event.target)
      if (!key || key === api.document.root.key) return
      begin({ kind: 'move', key, label: key }, event)
    },
    [api.document.root.key, begin],
  )

  const onKeyDownCapture = useCallback((event: ReactKeyboardEvent) => {
    if (isOwnChrome(event.target)) return

    const shellShortcut =
      (event.ctrlKey || event.metaKey) && ['z', 'y', 'd'].includes(event.key.toLowerCase())
    const navigational =
      event.key === 'Tab' ||
      event.key === 'Escape' ||
      event.key.startsWith('Arrow') ||
      shellShortcut
    if (navigational) return
    event.preventDefault()
    event.stopPropagation()
  }, [])

  const onClickCapture = useCallback(
    (event: MouseEvent) => {
      if (isOwnChrome(event.target)) return
      event.stopPropagation()
      if (consumeClick()) return
      const key = keyFromEventTarget(event.target)
      select(key)
      // The row only places the frame; the selection is the one authored node.
      setClicked({ key, row: rowFromEventTarget(event.target) })
    },
    [consumeClick, select],
  )

  // Derived during render: an effect would render twice for every pointer move.
  const dropTarget = useMemo<DropTarget | undefined>(() => {
    if (!dragState || preview || snapshot?.dragId !== dragState.id) return undefined

    const [x, y] = toLocal(snapshot.origin, dragState.x, dragState.y)
    const dragged = dragState.source.kind === 'move' ? dragState.source.key : undefined
    return resolveDrop(snapshot.candidates, x, y, dragged)
  }, [dragState, preview, snapshot])

  /*
   * Measures afresh on release: the indicator's snapshot can be one event
   * behind, and a quick flick would lose the drop.
   *
   * No bounds check against the surface's client box: the canvas scrolls, so a
   * valid drop can be released below the visible box. `resolveDrop` already
   * answers nothing outside every container.
   */
  const resolveRelease = useCallback(
    (clientX: number, clientY: number, draggedKey: string | undefined) => {
      if (preview) return undefined

      // `-1`: an id no drag holds, because this snapshot is used once and discarded.
      const snap = measureNow(-1)
      if (!snap) return undefined

      const [x, y] = toLocal(snap.origin, clientX, clientY)
      const resolved = resolveDrop(snap.candidates, x, y, draggedKey)

      clearSnapshot()

      return resolved ? { parentKey: resolved.parentKey, index: resolved.index } : undefined
    },
    [clearSnapshot, measureNow, preview],
  )

  useEffect(() => registerZone('canvas', resolveRelease), [registerZone, resolveRelease])

  const editing = !preview

  const form = useMemo(
    () => (
      <FormRenderer
        document={api.document}
        kit={rendererKit}
        data={data}
        errors={errors}
        revealHidden={editing}
        {...(context ? { context } : {})}
        {...(preview && current !== undefined
          ? {
              navigation: {
                path: 'step',
                onNavigate: setStep,
              },
            }
          : {})}
        onChange={onChange}
        {...(preview ? { onEffects, onActionError } : {})}
        {...(language ? { language } : {})}
        device={viewport}
      />
    ),
    [
      api.document,
      rendererKit,
      data,
      errors,
      editing,
      context,
      preview,
      current,
      onChange,
      onEffects,
      onActionError,
      language,
      viewport,
    ],
  )

  return (
    <div className="fs-canvas__inner">
      <div className="fs-canvas__bar">
        <button
          className="fs-canvas__preview"
          type="button"
          onClick={() => {
            onPreview(!preview)
            setDiagnostics(false)
            setValidated(false)
            setActionNote('')
            setHover({ key: undefined, row: undefined })
          }}
          aria-pressed={preview}
        >
          {preview ? 'Back to editing' : 'Preview'}
        </button>

        {steps.length > 1 && (
          <label className="fs-canvas__step">
            Step
            <select
              ref={stepSelectRef}
              value={JSON.stringify(current) ?? ''}
              onChange={(e) => setStep(steps[e.target.selectedIndex])}
            >
              {steps.map((name) => (
                <option key={JSON.stringify(name)} value={JSON.stringify(name)}>
                  {jsonToString(name)}
                </option>
              ))}
            </select>
          </label>
        )}

        {preview && (
          <>
            <PreviewData data={data} />
            <button type="button" onClick={() => setValidated(true)}>
              Validate
            </button>
            <button
              type="button"
              onClick={() => {
                setData({})
                setTouched(new Set())
                setValidated(false)
                setActionNote('')
              }}
            >
              Clear data
            </button>
            <button
              type="button"
              aria-expanded={diagnostics}
              aria-controls={diagnosticsId}
              onClick={() => setDiagnostics((shown) => !shown)}
            >
              Diagnostics
            </button>
          </>
        )}
      </div>

      {preview && (
        <div className="fs-canvas__notice" role="status">
          {actionNote}
        </div>
      )}

      {editing && api.document.root.children?.length === 0 && (
        <div className="fs-canvas__empty">
          <strong className="fs-empty__title">Start building your form</strong>
          <span>
            Click a component in the palette or drag it onto the canvas. Use the Tree tab to select
            and arrange components with your keyboard.
          </span>
        </div>
      )}

      <div
        ref={surfaceRef}
        className={'fs-canvas__surface' + (preview ? ' is-preview' : '')}
        {...(editing
          ? {
              onMouseDownCapture,
              onPointerDownCapture,
              onClickCapture,
              onKeyDownCapture,
              // Measured on a drag's first move over the canvas, palette drags
              // included; in a handler, not an effect, so render stays pure.
              onPointerMove: () => {
                if (dragState && snapshot?.dragId !== dragState.id) takeSnapshot(dragState.id)
              },
              // The row too: without it `nodeElement` outlines a repeater's row 0.
              onPointerOver: (event: ReactPointerEvent) =>
                setHover({
                  key: keyFromEventTarget(event.target),
                  row: rowFromEventTarget(event.target),
                }),
              onPointerLeave: () => setHover({ key: undefined, row: undefined }),
            }
          : {})}
      >
        {/* Designer-owned and keyless, so hit-testing and the overlay both ignore it. */}
        <div
          className="fs-canvas__frame"
          data-fs-viewport={fixedSize ? 'fixed' : viewport}
          style={
            frameWidth === undefined
              ? undefined
              : { width: frameWidth, minHeight: fixedSize?.height }
          }
        >
          {fixedSize && (
            <div
              className="fs-canvas__page-guide"
              aria-hidden="true"
              style={{ height: fixedSize.height }}
            />
          )}
          {form}
        </div>

        {editing && (
          <SelectionLayer
            surfaceRef={surfaceRef}
            document={api.document}
            selectedKey={api.selectedKey}
            {...(selectedRow ? { selectedRow } : {})}
            selectedType={api.selectedNode?.type}
            hoverKey={dragState ? undefined : hoverKey}
            {...(dragState || hover.row === undefined ? {} : { hoverRow: hover.row })}
            {...(selectionActions ? { actions: selectionActions } : {})}
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

      {/* Named tab stops let keyboard users scroll long diagnostics. */}
      {preview && (
        <div id={diagnosticsId} className="fs-canvas__data" hidden={!diagnostics}>
          <section>
            <h2 className="fs-panel__heading">Data</h2>
            <pre tabIndex={0} role="group" aria-label="Data">
              {JSON.stringify(data, null, 2)}
            </pre>
          </section>
          <section>
            <h2 className="fs-panel__heading">Errors</h2>
            <pre tabIndex={0} role="group" aria-label="Errors">
              {JSON.stringify(errors, null, 2)}
            </pre>
          </section>
        </div>
      )}
    </div>
  )
}
