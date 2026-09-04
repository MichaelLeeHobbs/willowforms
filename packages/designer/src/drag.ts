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

  draggedKey: string | undefined,
) => DropCommit | undefined

export interface DragState {
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

  registerZone: (name: string, resolve: DropResolver) => () => void
  /**
   * True once per completed drag, for a click handler to skip its own work.
   * Reading it clears it, so a plain click still selects.
   */
  consumeClick: () => boolean
}

/**
 * Which pointer an event belongs to.
 *
 * `?? 0` because a synthesised event -- jsdom's, and any fixture that builds
 * one by hand -- carries no `pointerId`, and the spec's own primary pointer is
 * the one a mouse reports. Normalising both sides keeps the identity check real
 * (two different ids still differ) without demanding that every caller model a
 * field the browser fills in for them.
 */
const pointerOf = (event: { pointerId?: number }): number => event.pointerId ?? 0

export function useDrag(
  onCommit: (source: DragSource, target: DropCommit) => void,
): DragController {
  const [state, setState] = useState<DragState | undefined>(undefined)

  /**
   * The press this drag belongs to, including which pointer made it.
   *
   * `pointerId` so a second pointer cannot move or end a drag it did not start.
   */
  const pending = useRef<
    { source: DragSource; pointerId: number; x: number; y: number } | undefined
  >(undefined)
  const zones = useRef(new Map<string, DropResolver>())
  /*
   * The last position a move reported, and the press before any move did.
   *
   * Only read when a release arrives with a non-finite coordinate, which is a
   * synthetic or malformed event rather than anything a mouse produces. It used
   * to start at `{0, 0}`, so in the one case it exists for -- a release with no
   * usable coordinates and no prior move -- it answered "the top-left corner of
   * the window", which is a position, and a wrong one. The press is where the
   * gesture started and is the honest answer.
   */
  const at = useRef({ x: 0, y: 0 })
  const nextId = useRef(0)
  const moved = useRef(false)
  const swallowClick = useRef(false)

  const abandoned = useRef(false)

  const commit = useRef(onCommit)
  useEffect(() => {
    commit.current = onCommit
  }, [onCommit])

  const begin = useCallback((source: DragSource, event: ReactPointerEvent) => {
    /*
     * One press at a time, and the drag remembers whose it is.
     *
     * Nothing filtered events by `pointerId`, so *any* pointer's `pointerup`
     * ended and committed a drag another pointer started -- at the second
     * pointer's coordinates. On touch, which `05-canvas.md` calls a supported
     * target: finger A drags a palette entry onto the canvas, finger B taps
     * Preview and lifts, and finger B's release resolves the zones at finger
     * B's position and commits an insertion there, while finger A is still down
     * and the drag label still follows it.
     *
     * `begin` also overwrote `pending.current` with no in-flight check, so a
     * second press mid-drag silently retargeted the drag -- the same root cause
     * reached from the other end. A drag in progress owns the gesture until it
     * ends.
     */
    if (pending.current) return

    pending.current = {
      source,
      pointerId: pointerOf(event),
      x: event.clientX,
      y: event.clientY,
    }
    // Seeded from the press, so the fallback above has a real position to give
    // even for a gesture that never moved.
    at.current = { x: event.clientX, y: event.clientY }
    moved.current = false
    abandoned.current = false
  }, [])

  /*
   * Zones answer in registration order, and that is a decision rather than a
   * detail: the first to claim a release wins, so a zone has to say "not mine"
   * for a point outside itself rather than resolving whatever geometry it
   * happens to have. The canvas checks its own bounds for exactly this reason.
   * `Map` preserves insertion order, which is what makes the order predictable
   * at all.
   */
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
      // Only the pointer that started this drag may move it. See `begin`.
      if (pointerOf(event) !== press.pointerId) return

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
      // Only the pointer that started this drag may end it. See `begin`.
      if (press && pointerOf(event) !== press.pointerId) return
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
          try {
            landed = resolve(x, y, draggedKey)
          } catch {
            landed = undefined
          }
          if (landed) break
        }
      }

      if (dragged && press && landed) {
        try {
          commit.current(press.source, landed)
        } catch (error) {
          setTimeout(() => {
            throw error
          })
        }
      }
      /*
       * A release that moved is never also a click, whether or not it landed —
       * and neither is the release after an abandoned drag, which is why the
       * abandonment has to survive until the button actually comes up.
       */
      swallowClick.current = dragged || abandoned.current
      abandoned.current = false
      cancel()
    }

    const abandon = (): void => {
      if (!pending.current) return
      swallowClick.current = moved.current
      abandoned.current = moved.current
      cancel()
    }

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      abandon()
    }

    const onCancel = (event: PointerEvent): void => {
      const press = pending.current
      if (press && pointerOf(event) !== press.pointerId) return
      abandon()
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

    const lowerSwallow = (): void => {
      swallowClick.current = false

      abandoned.current = false
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('click', lowerSwallow)
    window.addEventListener('pointerdown', lowerSwallow)
    window.addEventListener('blur', lost)
    document.addEventListener('visibilitychange', lost)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
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
