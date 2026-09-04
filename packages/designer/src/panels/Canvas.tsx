import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent,
  PointerEvent as ReactPointerEvent,
  ReactNode,
} from 'react'
import type { Device, FormContext, FormData, FormErrors, JsonValue, Kit } from '@formsmith/core'
import {
  applyChange,
  autoValidateKeys,
  decodeAddress,
  contextValues,
  findParent,
  indexKit,
  jsonToString,
  validateForm,
} from '@formsmith/core'
import { FormRenderer } from '@formsmith/renderer'
import type { RendererKit } from '@formsmith/renderer'

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
import type { DesignerApi } from '../store.js'
import { SelectionLayer } from './SelectionLayer.js'

/** Shared, so an unvalidated canvas does not allocate a new object per render. */
const NO_ERRORS: FormErrors = Object.freeze({})

/**
 * A device the canvas can pretend to be.
 *
 * `Device` from core also has `any`, which is the base layer per-breakpoint CSS
 * falls back to rather than something anyone can look at. Excluding it here
 * means the viewport control cannot offer it and the Style tab cannot ask the
 * canvas to show it.
 */
export type Viewport = Exclude<Device, 'any'>

export interface CanvasProps {
  api: DesignerApi
  kit: Kit
  rendererKit: RendererKit
  drag: DragController
  /**
   * Which device the canvas is pretending to be. A view preference, not part of
   * the document: two people editing one form must not disagree about what it
   * is, and nobody wants a form whose stored shape depends on the last window
   * someone had open.
   */
  viewport: Viewport
  /** Language tag the canvas renders in. Omitted means the document's default. */
  language?: string
}

/**
 * How wide the frame is at each viewport.
 *
 * Desktop has no width because it is not a simulation: the canvas is the
 * viewport, and constraining it would be inventing a device nobody asked for.
 * The other two are the widths the common breakpoints are written against.
 *
 * Not clamped to the canvas. A 768px frame in a 656px canvas would be 656px
 * wide while claiming to be a tablet, which is the one thing a simulation must
 * not do. It overflows and the canvas scrolls instead. Scaling it down with a
 * transform would be worse still: every rectangle the drop arithmetic measures
 * would stop matching the coordinates the pointer arrives in.
 */
const FRAME_WIDTH: Partial<Record<Viewport, number>> = {
  tablet: 768,
  mobile: 390,
}

/** Everything a drag needs to know about the canvas, frozen when it starts. */
interface Snapshot {
  /** Which drag this was measured for. A mismatch means it is stale. */
  dragId: number
  candidates: Candidate[]
  origin: Origin
}

/*
 * The canvas renders the real runtime renderer, not a design-time approximation.
 * What you see is literally what ships, which is the only way a WYSIWYG builder
 * stays honest as the kit evolves.
 *
 * While editing, a click is a selection gesture, so pointer events are swallowed
 * in the capture phase before the kit's components see them. Preview mode hands
 * the form back its own events untouched.
 *
 * (Written as a plain block, not a doc comment: it sat as one directly above
 * `isOwnChrome`'s, so the paragraph about the canvas attached to nothing and
 * `isOwnChrome` appeared to carry a description of the canvas. The `Canvas`
 * component's own summary is at its declaration.)
 */
/**
 * A click on the designer's own chrome inside the surface.
 *
 * The canvas cancels pointer events in the capture phase so a click selects a
 * component rather than operating it. That rule is about the kit's components,
 * and the selection toolbar sits inside the surface so it can be positioned
 * against the frame -- without this exemption the canvas swallowed its own
 * toolbar's clicks and the buttons read as dead rather than broken.
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
  language,
}: CanvasProps): ReactNode {
  const [preview, setPreview] = useState(false)

  /*
   * The steps this document declares, read out of it rather than configured.
   *
   * A step is a container shown when `context.step` equals its own name, so the
   * names the document compares that path against are the flow. Empty for a
   * form with no steps, which is why the switcher only appears when there is
   * something to switch between.
   */
  const steps = useMemo(
    () =>
      contextValues(api.document.root, 'step').filter(
        (name): name is string => typeof name === 'string',
      ),
    [api.document.root],
  )
  const [step, setStep] = useState<string | undefined>(undefined)

  /*
   * The canvas supplies the context, or a form whose visibility depends on the
   * host renders as nothing in preview and the author cannot check their work.
   * Only `step` for now: the rest of a host's context is not knowable here, and
   * inventing values would be worse than showing none.
   */
  const current = step !== undefined && steps.includes(step) ? step : steps[0]
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
  /** Fields the user has changed. A field validates while typing only after it is touched. */
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

  const frameWidth = FRAME_WIDTH[viewport]

  /*
   * Omitted for the root, which has no siblings to sit among and cannot be
   * removed. Passing handlers that refuse would put three dead buttons on the
   * frame, which is worse than no toolbar.
   */
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
      /*
       * A fresh component of the same type, not a copy. Duplicate is for "another
       * one configured like this"; this is for "another one of these", which is
       * the commoner intent and the one the palette makes you aim for.
       */
      onAddSibling: () => {
        const def = indexKit(kit).get(selected.type)
        if (def) addComponent(def, parent.key, index + 1)
      },
      onRemove: () => removeComponent(selectedKey),
    }
  }, [selected, selectedKey, parent, kit, addComponent, duplicateComponent, removeComponent])

  const surfaceRef = useRef<HTMLDivElement>(null)
  /*
   * Measured once when a drag begins, and held in state rather than a ref.
   *
   * Nothing edits the document mid-drag, so the tree cannot change under the
   * measurement. What can change is where it is on screen: scrolling the canvas
   * during a drag moves every rectangle and the indicator drawn from this
   * snapshot drifts, which `05-canvas.md` lists as a known gap. The release is
   * measured fresh, so the drop still lands where the pointer is -- it is only
   * the bar that lies, and only while the pointer is moving.
   *
   * In state rather than a ref because that is what lets the indicator be
   * derived during render as a pure function of state, instead of set from an
   * effect that fires on every pointer move.
   */
  const [snapshot, setSnapshot] = useState<Snapshot | undefined>(undefined)

  const errors = useMemo(() => {
    if (!preview) return NO_ERRORS

    const all = validateForm(api.document.root, data, { context, messages })
    if (validated) return all

    /*
     * Before a submit, only the fields that asked for it. A field validates
     * while typing when its schema says so and the user has actually touched
     * it: showing "This field is required" on a field nobody has reached yet
     * is how a form greets someone with a wall of red.
     */
    /*
     * `autoValidateKeys` answers in node keys, because that is all a document
     * can say — which row a field is in comes from the data. Errors are keyed by
     * address, so comparing the two directly meant no field inside a repeater
     * ever validated while typing: `addresses[1].street` is not `street`.
     *
     * The leaf of an address is the node key, so that is what is compared.
     */
    const eager = autoValidateKeys(api.document.root)
    let shown: FormErrors | undefined
    for (const address of Object.keys(all)) {
      const key = decodeAddress(address)?.name ?? address
      if (!eager.has(key) || !touched.has(address)) continue
      /*
       * Read, not asserted. `address` came from `Object.keys(all)`, so the
       * value is there -- but an assertion that happens to be true is still an
       * assertion, and `noUncheckedIndexedAccess` is on so that this file has
       * to say what it does with a miss.
       */
      const message = all[address]
      if (message === undefined) continue
      shown ??= {}
      shown[address] = message
    }
    return shown ?? NO_ERRORS
  }, [preview, validated, api.document.root, data, touched, context, messages])

  const onChange = useCallback((address: string, value: JsonValue) => {
    setData((d) => applyChange(d, address, value))
    setTouched((t) => (t.has(address) ? t : new Set(t).add(address)))
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

  /*
   * Capture-phase mousedown is what stops a click from focusing a text field,
   * toggling a checkbox, or opening a select.
   *
   * Both calls are needed and they do different jobs. `preventDefault` cancels
   * the browser's own action, which is what stops focus. `stopPropagation` keeps
   * the event from reaching the kit's own handlers, which is what stops MUI's
   * Select from opening: it opens from an onMouseDown on an element inside the
   * one carrying data-fs-key, and cancelling the default does nothing to a
   * React handler that has already been given the event.
   */
  // `isOwnChrome` is defined above the component, so the callbacks below are not
  // closing over a value their dependency lists do not name.
  const onMouseDownCapture = useCallback((event: MouseEvent) => {
    if (isOwnChrome(event.target)) return
    event.preventDefault()
    event.stopPropagation()
  }, [])

  const onPointerDownCapture = useCallback(
    (event: ReactPointerEvent) => {
      if (isOwnChrome(event.target)) return
      /*
       * The primary button only. It armed a drag for any of them, so a
       * right-press and a small movement relocated the component under its own
       * context menu — the menu opens, the component has already moved, and
       * nothing about the gesture said it would.
       */
      if (event.button !== 0) return

      event.preventDefault()

      const key = keyFromEventTarget(event.target)
      // The root is the canvas itself; dragging it has nowhere to go.
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
      // Which drawn copy was pointed at. Geometry only: the node selected is
      // the authored one, and there is only ever one of those.
      setClicked({ key, row: rowFromEventTarget(event.target) })
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
   *
   * No bounds check of its own. Whether the point is over the canvas is decided
   * by `resolveDrop`, which answers nothing when the point is outside every
   * container -- and the surface's client box is the wrong question anyway: the
   * canvas scrolls, so a legitimate drop onto the last component of a long form
   * is released below the visible box while sitting squarely inside the form.
   * Adding that check broke exactly that drop, which is how it earned this
   * comment instead of the code.
   */
  const resolveRelease = useCallback(
    (clientX: number, clientY: number, draggedKey: string | undefined) => {
      if (preview) return undefined

      // `-1`, a snapshot no drag can be holding: this one is measured for this
      // release and thrown away, and passing `0` claimed to be drag zero's.
      const snap = measureNow(-1)
      if (!snap) return undefined

      const [x, y] = toLocal(snap.origin, clientX, clientY)
      const resolved = resolveDrop(snap.candidates, x, y, draggedKey)

      setSnapshot(undefined)

      return resolved ? { parentKey: resolved.parentKey, index: resolved.index } : undefined
    },
    [measureNow, preview],
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
                onNavigate: (value: JsonValue) => setStep(jsonToString(value)),
              },
            }
          : {})}
        onChange={onChange}
        {...(language ? { language } : {})}
        // `Viewport` has no empty member, so the conditional this used to carry
        // could not be false. `language` really is optional and keeps its.
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
      language,
      viewport,
    ],
  )

  return (
    <div className="fs-canvas__inner">
      <div className="fs-canvas__bar">
        <button
          type="button"
          onClick={() => {
            setPreview((p) => !p)
            setValidated(false)
            setHover({ key: undefined, row: undefined })
          }}
          aria-pressed={preview}
        >
          {preview ? 'Back to editing' : 'Preview'}
        </button>

        {steps.length > 1 && (
          <label className="fs-canvas__step">
            Step
            <select value={current ?? ''} onChange={(e) => setStep(e.target.value)}>
              {steps.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
        )}

        {preview && (
          <>
            <button type="button" onClick={() => setValidated(true)}>
              Validate
            </button>
            <button
              type="button"
              onClick={() => {
                setData({})
                setTouched(new Set())
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
              onKeyDownCapture,
              // Measured on the first move of each drag that reaches the canvas,
              // including one that started in the palette and never touched it.
              // Doing this in an event handler rather than an effect is what
              // keeps render a pure function of state.
              onPointerMove: () => {
                if (dragState && snapshot?.dragId !== dragState.id) takeSnapshot(dragState.id)
              },
              /*
               * The row as well as the key. The hover frame measured with no
               * row, so `nodeElement` fell back to the first match and outlined
               * row 0 whichever row the pointer was over.
               */
              onPointerOver: (event: ReactPointerEvent) =>
                setHover({
                  key: keyFromEventTarget(event.target),
                  row: rowFromEventTarget(event.target),
                }),
              onPointerLeave: () => setHover({ key: undefined, row: undefined }),
            }
          : {})}
      >
        {/*
         * The form sits inside a frame the designer owns, never in a wrapper the
         * kit can see. Hit-testing is `closest('[data-fs-key]')` and the overlay
         * measures against the surface, so an element carrying neither is
         * invisible to both.
         */}
        <div
          className="fs-canvas__frame"
          data-fs-viewport={viewport}
          style={frameWidth === undefined ? undefined : { width: frameWidth }}
        >
          {}
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

      {/*
       * `tabIndex` on the dumps, because `designer.css` caps them at 180px and
       * scrolls. A scrollable box that nothing can focus is unreachable by
       * keyboard: a pointer user could read a long form's data, and a keyboard
       * user got the first few lines and no way to reach the rest.
       *
       * Named as well as focusable. A tab stop that announces nothing is its own
       * problem, and `aria-label` is what turns the stop into "Data, group".
       * axe's `scrollable-region-focusable` is one of three rules
       * `test/a11y.test.tsx` disables for want of a layout engine, so this is
       * asserted directly in `Canvas.test.tsx` instead of waited for.
       */}
      {preview && (
        <div className="fs-canvas__data">
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
