/**
 * The designer shell.
 *
 * Chrome is plain CSS with custom properties, deliberately. The designer must
 * drop into a host app without dragging in a second component library or
 * fighting the host's theme, so it has no UI-library dependency at all. The only
 * component library in play is whichever kit renders the canvas.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { FormDocument, Kit } from '@formsmith/core'
import type { RendererKit } from '@formsmith/renderer'

import { dragLabel, useDrag } from './drag.js'
import type { DragSource, DropCommit } from './drag.js'
import { Canvas } from './panels/Canvas.js'
import { DocumentDialog } from './panels/DocumentDialog.js'
import { Inspector } from './panels/Inspector.js'
import { Palette } from './panels/Palette.js'
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

  const [jsonOpen, setJsonOpen] = useState(false)

  /*
   * A polite live region.
   *
   * Selecting, moving, adding, and removing all change the document without
   * changing what has focus, so a screen reader is told nothing unless the
   * change is announced. Polite rather than assertive: none of it is urgent
   * enough to interrupt whatever is being read.
   */
  const [announcement, setAnnouncement] = useState('')
  const announce = useCallback((message: string) => {
    // The zero-width space forces a change even when the same message repeats,
    // so moving a component twice is announced twice.
    setAnnouncement((previous) => (previous === message ? message + '​' : message))
  }, [])

  const commitDrop = useCallback(
    (source: DragSource, target: DropCommit) => {
      if (source.kind === 'new') {
        api.addComponent(source.def, target.parentKey, target.index)
        announce(source.def.label + ' added to ' + target.parentKey + '.')
      } else {
        api.moveComponent(source.key, target.parentKey, target.index)
        announce(source.key + ' moved into ' + target.parentKey + '.')
      }
    },
    [api, announce],
  )

  /*
   * Selecting on the canvas moves nothing into focus, so without this the
   * properties panel quietly changes to describe a different component and a
   * screen reader is told nothing at all. Tree navigation needs no equivalent:
   * focus lands on the row, which is read on arrival.
   */
  const selectFromCanvas = useCallback(
    (key: string | undefined) => {
      api.select(key)
      announce(key ? key + ' selected.' : 'Selection cleared.')
    },
    [api, announce],
  )

  const canvasApi = useMemo(() => ({ ...api, select: selectFromCanvas }), [api, selectFromCanvas])

  const drag = useDrag(commitDrop)

  return (
    <div className="fs-shell" data-testid="formsmith-designer">
      <Toolbar api={api} onOpenJson={() => setJsonOpen(true)} />
      <div className="fs-body">
        <aside className="fs-panel fs-panel--left" aria-label="Components and structure">
          <Palette
            kit={kit}
            onAdd={(def) => {
              api.addComponent(def, api.selectedKey)
              announce(def.label + ' added.')
            }}
            onDragStart={(def, event) => drag.begin({ kind: 'new', def }, event)}
          />
          <Tree
            root={api.document.root}
            kit={kit}
            selectedKey={api.selectedKey}
            onSelect={api.select}
            onRemove={api.removeComponent}
            onDuplicate={api.duplicateComponent}
            onMove={api.moveComponent}
            announce={announce}
            drag={drag}
          />
        </aside>

        <main className="fs-canvas" aria-label="Form canvas">
          <Canvas api={canvasApi} kit={kit} rendererKit={rendererKit} drag={drag} />
        </main>

        <aside className="fs-panel fs-panel--right" aria-label="Component properties">
          <Inspector api={api} kit={kit} />
        </aside>
      </div>

      <div className="fs-visually-hidden" role="status" aria-live="polite" aria-atomic="true">
        {announcement}
      </div>

      <DocumentDialog
        open={jsonOpen}
        document={api.document}
        onClose={() => setJsonOpen(false)}
        onReplace={api.replaceDocument}
      />

      {drag.state && (
        <div
          className="fs-drag-label"
          style={{ top: drag.state.y, left: drag.state.x }}
          aria-hidden="true"
        >
          {dragLabel(drag.state.source)}
        </div>
      )}
    </div>
  )
}

function Toolbar({ api, onOpenJson }: { api: DesignerApi; onOpenJson: () => void }): ReactNode {
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
        <button type="button" onClick={onOpenJson}>
          JSON
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
