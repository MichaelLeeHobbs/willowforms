import { useCallback, useState } from 'react'

export interface DragSnapshot<T> {
  snapshot: T | undefined
  /** A failed measurement keeps the previous snapshot. */
  takeSnapshot: (dragId: number) => void
  clearSnapshot: () => void
}

/**
 * Positions frozen when a drag begins, so a drop target can be derived during
 * render as a pure function of state. `measureNow` reads the DOM and is only
 * called from event handlers, never from render or an effect body.
 */
export function useDragSnapshot<T>(measureNow: (dragId: number) => T | undefined): DragSnapshot<T> {
  const [snapshot, setSnapshot] = useState<T | undefined>(undefined)

  const takeSnapshot = useCallback(
    (dragId: number) => {
      const next = measureNow(dragId)
      if (next) setSnapshot(next)
    },
    [measureNow],
  )

  const clearSnapshot = useCallback(() => setSnapshot(undefined), [])

  return { snapshot, takeSnapshot, clearSnapshot }
}
