/**
 * The designer shell.
 *
 * Chrome is plain CSS with custom properties, deliberately. The designer must
 * drop into a host app without dragging in a second component library or
 * fighting the host's theme, so it has no UI-library dependency at all. The only
 * component library in play is whichever kit renders the canvas.
 */

import { useCallback, useEffect } from 'react'
import type { ReactNode } from 'react'
import type { FormDocument, Kit } from '@formsmith/core'
import type { RendererKit } from '@formsmith/renderer'

import { Canvas } from './panels/Canvas.js'
import { Palette } from './panels/Palette.js'
import { Properties } from './panels/Properties.js'
import { Tree } from './panels/Tree.js'
import { useDesigner } from './store.js'
import type { DesignerApi } from './store.js'

export interface DesignerProps {
  /** Starting document. The designer owns it from here; use onChange to observe. */
  initialDocument: FormDocument
  /** Palette metadata. */
  kit: Kit
  /** Canvas renderers for the same kit. */
  rendererKit: RendererKit
  onChange?: (document: FormDocument) => void
}

export function Designer({
  initialDocument,
  kit,
  rendererKit,
  onChange,
}: DesignerProps): ReactNode {
  const api = useDesigner(initialDocument)

  useEffect(() => {
    onChange?.(api.document)
  }, [api.document, onChange])

  useKeyboardShortcuts(api)

  return (
    <div className="fs-shell" data-testid="formsmith-designer">
      <Toolbar api={api} />
      <div className="fs-body">
        <aside className="fs-panel fs-panel--left" aria-label="Components and structure">
          <Palette kit={kit} onAdd={(def) => api.addComponent(def, api.selectedKey)} />
          <Tree
            root={api.document.root}
            selectedKey={api.selectedKey}
            onSelect={api.select}
            onRemove={api.removeComponent}
          />
        </aside>

        <main className="fs-canvas" aria-label="Form canvas">
          <Canvas api={api} rendererKit={rendererKit} />
        </main>

        <aside className="fs-panel fs-panel--right" aria-label="Component properties">
          <Properties api={api} kit={kit} />
        </aside>
      </div>
    </div>
  )
}

function Toolbar({ api }: { api: DesignerApi }): ReactNode {
  return (
    <header className="fs-toolbar">
      <h1 className="fs-toolbar__title">{api.document.name}</h1>
      <div className="fs-toolbar__actions">
        <button type="button" onClick={api.undo} disabled={!api.canUndo} aria-label="Undo">
          Undo
        </button>
        <button type="button" onClick={api.redo} disabled={!api.canRedo} aria-label="Redo">
          Redo
        </button>
      </div>
    </header>
  )
}

/**
 * Global shortcuts. Ignored while focus is in a text field, so typing "z" in a
 * label does not undo the document.
 */
function useKeyboardShortcuts(api: DesignerApi): void {
  const { undo, redo, removeComponent, select, selectedKey } = api

  const onKeyDown = useCallback(
    (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const tag = target?.tagName
      const typing =
        tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target?.isContentEditable
      if (typing) return

      const mod = event.ctrlKey || event.metaKey

      if (mod && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        if (event.shiftKey) redo()
        else undo()
        return
      }
      if (mod && event.key.toLowerCase() === 'y') {
        event.preventDefault()
        redo()
        return
      }
      if ((event.key === 'Delete' || event.key === 'Backspace') && selectedKey) {
        event.preventDefault()
        removeComponent(selectedKey)
        return
      }
      if (event.key === 'Escape' && selectedKey) {
        event.preventDefault()
        select(undefined)
      }
    },
    [undo, redo, removeComponent, select, selectedKey],
  )

  useEffect(() => {
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onKeyDown])
}
