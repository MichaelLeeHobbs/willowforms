import { useEffect, useRef, useState } from 'react'
import type { ReactNode, RefObject } from 'react'

export function useNarrowShell(ref: RefObject<HTMLElement | null>): boolean {
  const [narrow, setNarrow] = useState(false)
  useEffect(() => {
    const shell = ref.current
    if (!shell || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(([entry]) => {
      if (entry && entry.contentRect.width > 0) setNarrow(entry.contentRect.width < 960)
    })
    observer.observe(shell)
    return () => observer.disconnect()
  }, [ref])
  return narrow
}

export function ResponsivePanel({
  id,
  side,
  narrow,
  hidden,
  onClose,
  children,
}: {
  id: string
  side: 'left' | 'right'
  narrow: boolean
  hidden: boolean
  onClose: () => void
  children: ReactNode
}): ReactNode {
  const ref = useRef<HTMLDialogElement>(null)
  const label = side === 'left' ? 'Components and structure' : 'Component properties'
  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (!hidden && !dialog.open) dialog.showModal()
    if (hidden && dialog.open) dialog.close()
  }, [hidden, narrow])

  const className = 'fs-panel fs-panel--' + side
  return narrow ? (
    <dialog
      ref={ref}
      id={id}
      className={className + ' fs-drawer'}
      aria-label={label}
      onClose={onClose}
    >
      <button type="button" onClick={onClose}>
        Close {label}
      </button>
      {children}
    </dialog>
  ) : (
    <aside id={id} className={className} aria-label={label} hidden={hidden}>
      {children}
    </aside>
  )
}
