/**
 * The drag controller.
 *
 * Pointer events rather than HTML5 drag-and-drop, and rather than a library.
 * The HTML5 API gives almost no control over the drag image, fires `dragover`
 * constantly, and is close to unusable on touch. A library would work, but the
 * designer ships with no runtime dependencies at all, and that is worth more to
 * a consumer than the few hundred lines saved here.
 *
 * The one subtlety is the threshold. Palette entries add on click and canvas
 * components select on click, so a drag must not begin until the pointer has
 * actually moved. Below the threshold this does nothing and the click handler
 * runs as before; above it the click is swallowed.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import type { ComponentDef } from '@formsmith/core'

/** Pixels the pointer must travel before a press becomes a drag. */
const THRESHOLD = 4

export type DragSource =
  { kind: 'new'; def: ComponentDef } | { kind: 'move'; key: string; label: string }

export interface DropCommit {
  parentKey: string
  index: number
}

/**
 * Where a release at this client position would land in the document, or
 * undefined if this zone does not want it. The canvas and the tree cannot both
 * be under the pointer, so the first zone that claims a release wins.
 */
export type DropResolver = (
  clientX: number,
  clientY: number,
  /**
   * The component being dragged, or undefined for a new one from the palette.
   *
   * Passed in rather than read from React state inside the zone. A zone's
   * resolver is registered from an effect, so the state it closes over can be a
   * render behind, and a resolver that thought nothing was being dragged failed
   * to exclude the dragged node from its own sibling list and placed a downward
   * reorder one position too far.
   */
  draggedKey: string | undefined,
) => DropCommit | undefined

export interface DragState {
  /**
   * Increments once per drag. Drop zones measure lazily on the first pointer
   * move they see, and compare this against the id their snapshot was taken
   * under; a mismatch means the snapshot belongs to a previous drag and the
   * layout must be read again. It replaces an effect that would otherwise have
   * to clear stale measurements when a drag ends.
   */
  id: number
  source: DragSource
  /** Client coordinates, for the label that follows the pointer. */
  x: number
  y: number
}

export interface DragController {
  /** Present only once the threshold has been passed. */
  state: DragState | undefined
  /** Call from `onPointerDown`. Does not start a drag on its own. */
  begin: (source: DragSource, event: ReactPointerEvent) => void
  /**
   * A drop zone registers how to turn a release position into an insertion
   * point, and gets back a function that unregisters it.
   *
   * Asking the zones at release time, rather than having them publish a target
   * as it changes, removes a race that was losing drops. Publishing meant an
   * effect, and an effect runs after the render that computed the target; a
   * release arriving in between saw no target at all and silently did nothing.
   */
  registerZone: (name: string, resolve: DropResolver) => () => void
  /**
   * True once per completed drag, for a click handler to skip its own work.
   * Reading it clears it, so a plain click still selects.
   */
  consumeClick: () => boolean
}

export function useDrag(
  onCommit: (source: DragSource, target: DropCommit) => void,
): DragController {
  const [state, setState] = useState<DragState | undefined>(undefined)

  const pending = useRef<{ source: DragSource; x: number; y: number } | undefined>(undefined)
  const zones = useRef(new Map<string, DropResolver>())
  const at = useRef({ x: 0, y: 0 })
  const nextId = useRef(0)
  const moved = useRef(false)
  const swallowClick = useRef(false)
  /*
   * Whether the drag now ending was abandoned rather than dropped.
   *
   * Escape raised the swallow flag and then `cancel()` cleared the state the
   * flag was about — so the `pointerup` that inevitably followed found nothing
   * dragging, lowered the flag again, and the click selected whatever was under
   * the pointer. Exactly the behaviour the comment beside Escape says it
   * prevents.
   */
  const abandoned = useRef(false)
  /*
   * Held in a ref so the window listeners below never need reattaching, and
   * written in an effect rather than during render.
   *
   * Writing it during render is the shape React's own documentation warns
   * about: a render that is thrown away still mutates the ref, so under
   * concurrent rendering the ref can end up holding a handler from a render
   * that never committed. Nothing here read it during render — the listeners
   * are installed from an effect and fire long afterwards — so this is the same
   * behaviour, expressed somewhere it is also correct.
   *
   * The test below it pins what the ref is for: a release calls the handler the
   * hook was last given, not the one the listeners were attached with.
   */
  const commit = useRef(onCommit)
  useEffect(() => {
    commit.current = onCommit
  }, [onCommit])

  const begin = useCallback((source: DragSource, event: ReactPointerEvent) => {
    pending.current = { source, x: event.clientX, y: event.clientY }
    moved.current = false
    abandoned.current = false
  }, [])

  const registerZone = useCallback((name: string, resolve: DropResolver) => {
    zones.current.set(name, resolve)
    return () => {
      zones.current.delete(name)
    }
  }, [])

  const consumeClick = useCallback(() => {
    const swallow = swallowClick.current
    swallowClick.current = false
    return swallow
  }, [])

  useEffect(() => {
    const cancel = (): void => {
      pending.current = undefined
      moved.current = false
      setState(undefined)
    }

    const onMove = (event: PointerEvent): void => {
      const press = pending.current
      if (!press) return

      if (!moved.current) {
        const travelled = Math.hypot(event.clientX - press.x, event.clientY - press.y)
        if (travelled < THRESHOLD) return
        moved.current = true
        nextId.current += 1
      }
      at.current = { x: event.clientX, y: event.clientY }
      setState({ id: nextId.current, source: press.source, x: event.clientX, y: event.clientY })
    }

    const onUp = (event: PointerEvent): void => {
      const press = pending.current
      const dragged = moved.current

      // Ask each zone where this release lands, now, rather than reading a
      // target some earlier effect may or may not have published yet.
      // Not `||`: a release at the very left or top edge has a clientX of 0,
      // which is a real position rather than a missing one.
      const x = Number.isFinite(event.clientX) ? event.clientX : at.current.x
      const y = Number.isFinite(event.clientY) ? event.clientY : at.current.y

      const draggedKey = press?.source.kind === 'move' ? press.source.key : undefined

      let landed: DropCommit | undefined
      if (dragged) {
        for (const resolve of zones.current.values()) {
          landed = resolve(x, y, draggedKey)
          if (landed) break
        }
      }

      if (dragged && press && landed) commit.current(press.source, landed)
      /*
       * A release that moved is never also a click, whether or not it landed —
       * and neither is the release after an abandoned drag, which is why the
       * abandonment has to survive until the button actually comes up.
       */
      swallowClick.current = dragged || abandoned.current
      abandoned.current = false
      cancel()
    }

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || !pending.current) return
      // Abandoning mid-drag must not then read as a click on whatever is under
      // the pointer when the button finally comes up.
      swallowClick.current = moved.current
      abandoned.current = moved.current
      cancel()
    }

    /*
     * Losing the window ends the drag.
     *
     * These are bare window listeners with no `setPointerCapture`, so a release
     * outside the window is never seen: the drag label stayed glued to the
     * cursor, and the next click anywhere in the page committed a drop nobody
     * asked for. Losing focus or visibility is the closest thing to a release
     * this can observe.
     */
    const lost = (): void => {
      if (!pending.current) return
      abandoned.current = moved.current
      cancel()
    }

    /*
     * The flag lowers itself once the click it was raised for has been and gone.
     *
     * It used to be lowered only by a `consumeClick()` caller, and there are
     * exactly two of those — the canvas and the tree. A palette drag starts on a
     * button in the left pane and ends on the canvas, so the `click` the browser
     * dispatches goes to their nearest common ancestor, above both readers.
     * Nobody lowered it, it stayed up, and it ate the next unrelated click:
     * after every drop from the palette, the first click on a component
     * silently failed to select it.
     *
     * On `window` and in the bubble phase, so it runs after every element
     * handler that might want to read it — lowering it in the capture phase
     * would take the flag away before the canvas got to ask.
     *
     * `pointerdown` as well, for the click whose propagation something stopped
     * and which therefore never reached the window. A new press is a new
     * interaction whatever happened to the last one.
     */
    const lowerSwallow = (): void => {
      swallowClick.current = false
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', cancel)
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('click', lowerSwallow)
    window.addEventListener('pointerdown', lowerSwallow)
    window.addEventListener('blur', lost)
    document.addEventListener('visibilitychange', lost)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', cancel)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('click', lowerSwallow)
      window.removeEventListener('pointerdown', lowerSwallow)
      window.removeEventListener('blur', lost)
      document.removeEventListener('visibilitychange', lost)
    }
  }, [])

  return { state, begin, registerZone, consumeClick }
}

/** What the label following the pointer should say. */
export function dragLabel(source: DragSource): string {
  return source.kind === 'new' ? source.def.label : source.label
}
