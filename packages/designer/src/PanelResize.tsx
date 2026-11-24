import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'

type Side = 'left' | 'right'
type Widths = Partial<Record<Side, number>>
const STORAGE_KEY = 'willowforms.designer.panel-widths.v1'
const MIN_WIDTH = 240
const MAX_WIDTH = 560
const CANVAS_MIN = 320
const clamp = (width: number, max = MAX_WIDTH): number =>
  Math.round(Math.max(MIN_WIDTH, Math.min(max, width)))

function readWidths(): Widths {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
    return Object.fromEntries(
      Object.entries(raw).filter(
        ([side, width]) =>
          (side === 'left' || side === 'right') &&
          typeof width === 'number' &&
          Number.isFinite(width) &&
          width >= MIN_WIDTH &&
          width <= MAX_WIDTH,
      ),
    )
  } catch {
    return {}
  }
}

export function usePanelWidths(): {
  widths: Widths
  resize: (side: Side, width: number | undefined, save: boolean) => void
} {
  const [widths, setWidths] = useState(readWidths)
  const resize = useCallback(
    (side: Side, width: number | undefined, save: boolean) => {
      const next = { ...widths }
      if (width === undefined) delete next[side]
      else next[side] = clamp(width)
      setWidths(next)
      if (save) {
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
        } catch {
          // Resizing still works when browser storage is unavailable.
        }
      }
    },
    [widths],
  )
  return { widths, resize }
}

interface Size {
  width: number
  max: number
}

interface ResizeParts {
  panel: Element
  canvas: Element
}

function resizeParts(handle: HTMLElement | null, controls: string): ResizeParts | undefined {
  const panel = handle?.ownerDocument.getElementById(controls)
  const canvas = handle?.parentElement?.querySelector('.fs-canvas')
  return panel && canvas ? { panel, canvas } : undefined
}

/** Undefined while the panel has no layout. */
function measure({ panel, canvas }: ResizeParts): Size | undefined {
  const width = panel.getBoundingClientRect().width
  if (width <= 0) return undefined
  return {
    width: Math.round(width),
    max: clamp(width + canvas.getBoundingClientRect().width - CANVAS_MIN),
  }
}

export function PanelResize({
  side,
  controls,
  preferred,
  onResize,
}: {
  side: Side
  controls: string
  preferred: number | undefined
  onResize: (width: number | undefined, save: boolean) => void
}): ReactNode {
  const ref = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState<Size>({ width: 288, max: MAX_WIDTH })
  const drag = useRef<
    | { id: number; x: number; width: number; original: number | undefined; latest: number }
    | undefined
  >(undefined)
  const resize = useRef(onResize)
  useEffect(() => {
    resize.current = onResize
  }, [onResize])
  useEffect(() => {
    const parts = resizeParts(ref.current, controls)
    if (!parts) return
    const update = (): void => {
      const next = measure(parts)
      if (next) setSize(next)
    }
    update()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(update)
    observer.observe(parts.panel)
    observer.observe(parts.canvas)
    return () => observer.disconnect()
  }, [controls])
  // `size` trails the screen by a frame, so a resize that starts from it can repeat a step.
  const currentSize = (): Size => {
    const parts = resizeParts(ref.current, controls)
    return (parts && measure(parts)) ?? size
  }
  useEffect(
    () => () => {
      if (drag.current) resize.current(drag.current.original, false)
    },
    [],
  )
  const cancel = (): void => {
    const current = drag.current
    if (!current) return
    drag.current = undefined
    onResize(current.original, false)
    if (ref.current?.hasPointerCapture(current.id)) ref.current.releasePointerCapture(current.id)
  }
  return (
    <div
      ref={ref}
      className="fs-panel-resize"
      role="separator"
      tabIndex={0}
      aria-label={
        'Resize ' + (side === 'left' ? 'Components and structure' : 'Component properties')
      }
      aria-orientation="vertical"
      aria-controls={controls}
      aria-valuemin={MIN_WIDTH}
      aria-valuemax={size.max}
      aria-valuenow={size.width}
      aria-valuetext={String(size.width) + ' pixels'}
      title="Drag or use Left/Right arrows to resize. Enter or double-click resets width."
      onDoubleClick={() => onResize(undefined, true)}
      onPointerDown={(event) => {
        if (event.button !== 0 || drag.current) return
        event.preventDefault()
        event.currentTarget.focus()
        event.currentTarget.setPointerCapture(event.pointerId)
        const { width } = currentSize()
        drag.current = {
          id: event.pointerId,
          x: event.clientX,
          width,
          original: preferred,
          latest: width,
        }
      }}
      onPointerMove={(event) => {
        const current = drag.current
        if (!current || current.id !== event.pointerId) return
        const next = clamp(
          current.width + (event.clientX - current.x) * (side === 'left' ? 1 : -1),
          size.max,
        )
        if (next === current.latest) return
        current.latest = next
        onResize(current.latest, false)
      }}
      onPointerUp={(event) => {
        const current = drag.current
        if (!current || current.id !== event.pointerId) return
        drag.current = undefined
        onResize(
          current.latest === current.width ? current.original : current.latest,
          current.latest !== current.width,
        )
        event.currentTarget.releasePointerCapture(event.pointerId)
      }}
      onPointerCancel={cancel}
      onLostPointerCapture={cancel}
      onKeyDownCapture={(event) => {
        event.stopPropagation()
        if (event.key === 'Escape') {
          event.preventDefault()
          cancel()
          return
        }
        if (drag.current) return
        const direction = side === 'left' ? 1 : -1
        const delta = (event.shiftKey ? 40 : 10) * direction
        const { width, max } = currentSize()
        const next =
          event.key === 'ArrowLeft'
            ? width - delta
            : event.key === 'ArrowRight'
              ? width + delta
              : event.key === 'Home'
                ? MIN_WIDTH
                : event.key === 'End'
                  ? max
                  : undefined
        if (next !== undefined) {
          event.preventDefault()
          onResize(clamp(next, max), true)
        }
        if (event.key === 'Enter') {
          event.preventDefault()
          onResize(undefined, true)
        }
      }}
    />
  )
}
