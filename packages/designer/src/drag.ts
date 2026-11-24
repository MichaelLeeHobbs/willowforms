/**
 * Pointer events rather than HTML5 drag-and-drop or a library: see
 * docs/spec/05-canvas.md, "Drag and drop". Palette entries and canvas
 * components act on click, so a press becomes a drag only past the threshold;
 * below it the click runs, above it the click is swallowed.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import type { ComponentDef } from '@willowforms/core'

/** Pixels the pointer must travel before a press becomes a drag. */
const THRESHOLD = 4

export type DragSource =
  { kind: 'new'; def: ComponentDef } | { kind: 'move'; key: string; label: string }

export interface DropCommit {
  parentKey: string
  index: number
}

/** Client coordinates. Return undefined for a point outside this zone. */
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
  /** True once after a drag, for a click handler to skip its work. Reading it clears it. */
  consumeClick: () => boolean
}

/**
 * `?? 0` because a hand-built event may have no `pointerId`. Two different real ids
 * still differ.
 */
const pointerOf = (event: { pointerId?: number }): number => event.pointerId ?? 0

export function useDrag(
  onCommit: (source: DragSource, target: DropCommit) => void,
): DragController {
  const [state, setState] = useState<DragState | undefined>(undefined)

  const pending = useRef<
    { source: DragSource; pointerId: number; x: number; y: number } | undefined
  >(undefined)
  const zones = useRef(new Map<string, DropResolver>())
  // Fallback for a release with a non-finite coordinate, which only a synthetic
  // or malformed event sends.
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
    if (pending.current) return

    pending.current = {
      source,
      pointerId: pointerOf(event),
      x: event.clientX,
      y: event.clientY,
    }
    at.current = { x: event.clientX, y: event.clientY }
    moved.current = false
    abandoned.current = false
  }, [])

  /*
   * Registration order is a decision rather than a detail: the first zone to
   * claim a release wins, so a zone must decline a point outside itself. `Map`
   * keeps insertion order.
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
      if (press && pointerOf(event) !== press.pointerId) return
      const dragged = moved.current

      // Zones resolve at release rather than from a target an earlier effect
      // published. See docs/spec/05-canvas.md, "Release".
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
     * Without pointer capture, a release outside the window is never seen, so
     * losing focus or visibility is the nearest observable stand-in for one.
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

export function dragLabel(source: DragSource): string {
  return source.kind === 'new' ? source.def.label : source.label
}
