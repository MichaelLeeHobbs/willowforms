import { useId, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode, RefObject } from 'react'
import { findLanguage, languageTag } from '@willowforms/core'
import { languagesOf } from './language.js'
import type { Device, FormDocument, IconName, Kit } from '@willowforms/core'
import type { RendererKit } from '@willowforms/renderer'

import { dragLabel, useDrag } from './drag.js'
import type { DragSource, DropCommit } from './drag.js'
import { Icon } from './Icon.js'
import {
  DEFAULT_FIXED_SIZE,
  FixedCanvasControls,
  deviceAtWidth,
  fixedDimensions,
} from './FixedCanvas.js'
import type { FixedCanvasSize } from './FixedCanvas.js'
import { ResponsivePanel, useNarrowShell } from './ResponsivePanel.js'
import { PanelResize, usePanelWidths } from './PanelResize.js'
import { Canvas, canvasSwallowsFocus } from './panels/Canvas.js'
import type { Viewport } from './panels/Canvas.js'
import { DocumentDialog } from './panels/DocumentDialog.js'
import { Inspector } from './panels/Inspector.js'
import { LeftPane } from './panels/LeftPane.js'
import { useDesigner } from './store.js'
import type { DesignerApi } from './store.js'

export interface DesignerProps {
  /** Read once at mount. To load another form, remount with a different React key. */
  initialDocument: FormDocument
  /** Palette metadata. */
  kit: Kit
  /** Canvas renderers for the same kit. */
  rendererKit: RendererKit
  onChange?: (document: FormDocument) => void
  /**
   * Save the current document. The toolbar shows a Save button only when this
   * is passed.
   *
   * WillowForms does not persist, so a Save button that appeared unconditionally
   * would promise something the designer cannot deliver. Its absence is the
   * honest default: `onChange` already emits every version, and many hosts save
   * from that.
   */
  onSave?: (document: FormDocument) => void
  /**
   * Controlled colour mode for the designer chrome.
   *
   * A renderer kit owns its own theme, so a host that wants the canvas to
   * follow this choice can mirror it into that theme from `onThemeChange`.
   */
  theme?: DesignerTheme
  /** Reports a colour-mode choice made in the toolbar. */
  onThemeChange?: (theme: DesignerTheme) => void
}

/**
 * How the designer's chrome is themed.
 *
 * `system` is the absence of the attribute, not a third palette: the stylesheet
 * already answers `prefers-color-scheme`, and the two explicit values exist so a
 * host managing its own theme can force either. See
 * [11-theming.md](../../../docs/spec/11-theming.md).
 */
export type DesignerTheme = 'system' | 'light' | 'dark'

export function Designer({
  initialDocument,
  kit,
  rendererKit,
  onChange,
  onSave,
  theme: controlledTheme,
  onThemeChange,
}: DesignerProps): ReactNode {
  const idBase = useId()
  const api = useDesigner(initialDocument)

  const emit = useRef(onChange)
  useEffect(() => {
    emit.current = onChange
  }, [onChange])

  useEffect(() => {
    emit.current?.(api.document)
  }, [api.document])

  const shellRef = useRef<HTMLDivElement>(null)
  const narrow = useNarrowShell(shellRef)
  const [preview, setPreview] = useState(false)
  const [drawer, setDrawer] = useState<'left' | 'right' | undefined>()

  const [jsonOpen, setJsonOpen] = useState(false)

  /*
   * Selecting, moving, adding and removing do not move focus, so a screen reader
   * hears them only if they are announced. Polite: none of it is urgent.
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
        if (api.addComponent(source.def, target.parentKey, target.index)) {
          announce(source.def.label + ' added to ' + target.parentKey + '.')
        }
      } else if (api.moveComponent(source.key, target.parentKey, target.index)) {
        announce(source.key + ' moved into ' + target.parentKey + '.')
      }
    },
    [api, announce],
  )

  /*
   * Canvas selection moves no focus, so it is announced. Tree selection needs
   * no announcement: focus lands on the row.
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

  // Below `useDrag`: Escape abandons a drag or clears the selection, not both.
  useKeyboardShortcuts(api, shellRef, announce, drag.state !== undefined)

  // View state, never written to the document.
  const [viewport, setViewport] = useState<Viewport>('desktop')
  const [fixed, setFixed] = useState(false)
  const [fixedSize, setFixedSize] = useState(DEFAULT_FIXED_SIZE)
  const dimensions = fixedDimensions(fixedSize)
  const [uncontrolledTheme, setUncontrolledTheme] = useState<DesignerTheme>('system')
  const theme = controlledTheme ?? uncontrolledTheme
  const chooseTheme = useCallback(
    (next: DesignerTheme) => {
      if (controlledTheme === undefined) setUncontrolledTheme(next)
      onThemeChange?.(next)
    },
    [controlledTheme, onThemeChange],
  )

  const [styleDevice, setStyleDevice] = useState<Device>('any')

  const [collapsed, setCollapsed] = useState({ left: false, right: false })
  const { widths, resize } = usePanelWidths()
  const toggle = useCallback((side: 'left' | 'right') => {
    setCollapsed((current) => ({ ...current, [side]: !current[side] }))
  }, [])

  // Undefined renders the document's default language.
  const [language, setLanguage] = useState<string | undefined>(undefined)

  /*
   * A removed language would render every translation as its raw key. Derived
   * rather than corrected in an effect, so no frame shows that.
   */
  const languages = languagesOf(api.document)
  const stillThere = language !== undefined && findLanguage(languages, language) !== undefined
  const activeLanguage = stillThere ? language : undefined

  /*
   * Forgotten as well as masked, or re-adding the language later jumps the
   * canvas back to it. Set during render: an effect would paint the stale frame
   * first.
   */
  if (language !== undefined && !stillThere) setLanguage(undefined)

  return (
    <div
      ref={shellRef}
      // Focusable for the shortcuts, but a container, so not in the tab order.
      tabIndex={-1}
      onPointerDown={(event) => {
        const target = event.target
        /*
         * Leave focus with anything that takes it itself, except canvas
         * elements, which the canvas stops from focusing while editing. Without
         * that exception the shell never gets focus and the shortcuts go dead
         * after a canvas click.
         */
        if (
          target instanceof Element &&
          !canvasSwallowsFocus(target) &&
          target.closest(
            'input, textarea, select, button, a[href], [tabindex]:not([tabindex="-1"])',
          )
        ) {
          return
        }
        shellRef.current?.focus({ preventScroll: true })
      }}
      className="fs-shell"
      data-fs-preview={preview || undefined}
      data-testid="willowforms-designer"
      {...(theme === 'system' ? {} : { 'data-fs-theme': theme })}
    >
      <Toolbar
        api={api}
        onOpenJson={() => setJsonOpen(true)}
        viewport={fixed ? 'fixed' : viewport}
        fixedSize={fixedSize}
        onFixedSize={(next) => {
          setFixedSize(next)
          setStyleDevice(deviceAtWidth(fixedDimensions(next).width))
        }}
        onViewport={(next) => {
          setFixed(next === 'fixed')
          if (next !== 'fixed') setViewport(next)
          setStyleDevice(next === 'fixed' ? deviceAtWidth(dimensions.width) : next)
        }}
        theme={theme}
        onTheme={chooseTheme}
        language={activeLanguage}
        onLanguage={setLanguage}
        {...(onSave ? { onSave: () => onSave(api.document) } : {})}
      />
      {narrow && !preview && (
        <nav className="fs-mobile-panels" aria-label="Authoring panels">
          <button
            type="button"
            aria-haspopup="dialog"
            aria-controls={idBase + '-left'}
            onClick={() => setDrawer('left')}
          >
            Components and structure
          </button>
          <button
            type="button"
            aria-haspopup="dialog"
            aria-controls={idBase + '-right'}
            onClick={() => setDrawer('right')}
          >
            Component properties
          </button>
        </nav>
      )}
      <div className="fs-body" data-fs-desktop-editing={(!narrow && !preview) || undefined}>
        {!preview && !narrow && (
          <PaneHandle
            side="left"
            controls={idBase + '-left'}
            collapsed={collapsed.left}
            onToggle={() => toggle('left')}
          />
        )}

        <ResponsivePanel
          id={idBase + '-left'}
          side="left"
          narrow={narrow}
          width={widths.left}
          onClose={() => setDrawer(undefined)}
          hidden={preview || (narrow ? drawer !== 'left' : collapsed.left)}
        >
          <LeftPane
            api={api}
            kit={kit}
            drag={drag}
            announce={announce}
            onAdd={(def) => {
              if (api.addComponent(def, api.selectedKey)) {
                announce(def.label + ' added.')
                setDrawer(undefined)
              }
            }}
            onAddPreset={(preset) => {
              if (api.addPreset(preset.id, kit, api.selectedKey)) {
                announce(preset.label + ' added.')
                setDrawer(undefined)
              }
            }}
            onDragStart={(def, event) => {
              if (!narrow) drag.begin({ kind: 'new', def }, event)
            }}
          />
        </ResponsivePanel>

        {!preview && !narrow && !collapsed.left && (
          <PanelResize
            side="left"
            controls={idBase + '-left'}
            preferred={widths.left}
            onResize={(width, save) => resize('left', width, save)}
          />
        )}

        <main className="fs-canvas" aria-label="Form canvas">
          <Canvas
            api={canvasApi}
            kit={kit}
            rendererKit={rendererKit}
            drag={drag}
            viewport={fixed ? deviceAtWidth(dimensions.width) : viewport}
            {...(fixed ? { fixedSize: dimensions } : {})}
            preview={preview}
            onPreview={setPreview}
            {...(activeLanguage ? { language: activeLanguage } : {})}
          />
        </main>

        {!preview && !narrow && !collapsed.right && (
          <PanelResize
            side="right"
            controls={idBase + '-right'}
            preferred={widths.right}
            onResize={(width, save) => resize('right', width, save)}
          />
        )}

        <ResponsivePanel
          id={idBase + '-right'}
          side="right"
          narrow={narrow}
          width={widths.right}
          onClose={() => setDrawer(undefined)}
          hidden={preview || (narrow ? drawer !== 'right' : collapsed.right)}
        >
          <Inspector
            api={api}
            kit={kit}
            device={styleDevice}
            onDevice={(next) => {
              // `any` is the base layer, not a device, so it leaves the canvas
              // alone. A device moves the canvas so the author sees that width.
              if (next !== 'any') {
                setViewport(next)
                setFixed(false)
              }
              setStyleDevice(next)
            }}
          />
        </ResponsivePanel>

        {!preview && !narrow && (
          <PaneHandle
            side="right"
            controls={idBase + '-right'}
            collapsed={collapsed.right}
            onToggle={() => toggle('right')}
          />
        )}
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

function PaneHandle({
  side,
  controls,
  collapsed,
  onToggle,
}: {
  side: 'left' | 'right'
  controls: string
  collapsed: boolean
  onToggle: () => void
}): ReactNode {
  const label = side === 'left' ? 'Components and structure' : 'Component properties'
  const pointsStart = side === 'left' ? collapsed : !collapsed
  return (
    <button
      type="button"
      className={'fs-pane-handle fs-pane-handle--' + side}
      aria-expanded={!collapsed}
      // Resolves while collapsed only because the pane is `hidden`, not unmounted.
      aria-controls={controls}
      aria-label={(collapsed ? 'Show ' : 'Hide ') + label}
      title={(collapsed ? 'Show ' : 'Hide ') + label}
      onClick={onToggle}
    >
      <span className={'fs-pane-handle__glyph' + (pointsStart ? ' is-flipped' : '')}>
        <Icon name="chevron" size={14} />
      </span>
    </button>
  )
}

/**
 * No `any`: it is the base CSS layer, not a viewport. See
 * [06-inspector.md](../../../docs/spec/06-inspector.md).
 */
const VIEWPORTS: { id: Viewport | 'fixed'; label: string; icon: IconName }[] = [
  { id: 'desktop', label: 'Desktop', icon: 'screen' },
  { id: 'tablet', label: 'Tablet', icon: 'tablet' },
  { id: 'mobile', label: 'Mobile', icon: 'mobile' },
  { id: 'fixed', label: 'Fixed size', icon: 'file' },
]

function Toolbar({
  api,
  onOpenJson,
  onSave,
  viewport,
  onViewport,
  fixedSize,
  onFixedSize,
  theme,
  onTheme,
  language,
  onLanguage,
}: {
  api: DesignerApi
  onOpenJson: () => void
  onSave?: () => void
  viewport: Viewport | 'fixed'
  onViewport: (next: Viewport | 'fixed') => void
  fixedSize: FixedCanvasSize
  onFixedSize: (size: FixedCanvasSize) => void
  theme: DesignerTheme
  onTheme: (next: DesignerTheme) => void
  language: string | undefined
  onLanguage: (next: string | undefined) => void
}): ReactNode {
  const idBase = useId()
  const languages = languagesOf(api.document)
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

        {onSave && (
          <button type="button" onClick={onSave}>
            Save
          </button>
        )}

        {languages.length > 1 && (
          <div className="fs-toolbar__field">
            <label className="fs-visually-hidden" htmlFor={idBase + '-fs-toolbar-language'}>
              Canvas language
            </label>
            <select
              id={idBase + '-fs-toolbar-language'}
              value={language ?? ''}
              onChange={(e) => onLanguage(e.target.value || undefined)}
            >
              <option value="">Default language</option>
              {/* Keyed by position too: nothing dedupes `languages` by tag. */}
              {languages.map((entry, at) => (
                <option key={String(at) + ':' + languageTag(entry)} value={languageTag(entry)}>
                  {entry.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="fs-toolbar__field">
          <label className="fs-visually-hidden" htmlFor={idBase + '-fs-toolbar-theme'}>
            Designer theme
          </label>
          <select
            id={idBase + '-fs-toolbar-theme'}
            value={theme}
            onChange={(e) => {
              // Checked, not cast: the value is whatever string the DOM holds.
              const chosen = e.target.value
              if (chosen === 'system' || chosen === 'light' || chosen === 'dark') onTheme(chosen)
            }}
          >
            <option value="system">System theme</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </div>

        <div className="fs-toolbar__group" role="group" aria-label="Viewport">
          {VIEWPORTS.map((option) => (
            <button
              key={option.id}
              type="button"
              className={'fs-toolbar__toggle' + (viewport === option.id ? ' is-active' : '')}
              aria-pressed={viewport === option.id}
              title={option.label}
              onClick={() => onViewport(option.id)}
            >
              <Icon name={option.icon} />
              <span className="fs-visually-hidden">{option.label}</span>
            </button>
          ))}
        </div>
      </div>
      {viewport === 'fixed' && <FixedCanvasControls size={fixedSize} onChange={onFixedSize} />}
    </header>
  )
}

/**
 * Global shortcuts. Ignored while focus is in a text field, so typing "z" in a
 * label does not undo the document.
 */
function useKeyboardShortcuts(
  api: DesignerApi,
  shell: RefObject<HTMLDivElement | null>,
  announce: (message: string) => void,

  isDragging: boolean,
): void {
  const { undo, redo, removeComponent, select, selectedKey } = api

  // A ref, so a drag state change does not re-register the listener mid-gesture.
  const dragging = useRef(isDragging)
  useEffect(() => {
    dragging.current = isDragging
  }, [isDragging])

  const onKeyDown = useCallback(
    (event: KeyboardEvent) => {
      const target = event.target instanceof Element ? event.target : null
      const editable = event.target instanceof HTMLElement ? event.target : null
      const tag = target?.tagName
      const typing =
        tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || editable?.isContentEditable
      if (typing) return

      if (target?.closest('dialog[open]')) return
      if (target?.closest('.fs-shell[data-fs-preview="true"]')) return

      if (!target) return

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

      const backspaceIsSafe =
        target?.classList.contains('fs-shell') === true ||
        Boolean(target?.closest('[data-fs-tree-row]'))

      if (event.key === 'Backspace' && !backspaceIsSafe) return

      if ((event.key === 'Delete' || event.key === 'Backspace') && selectedKey) {
        event.preventDefault()
        removeComponent(selectedKey)
        announce(selectedKey + ' removed.')
        return
      }
      if (event.key === 'Escape' && selectedKey) {
        if (dragging.current) return

        event.preventDefault()
        select(undefined)
        announce('Selection cleared.')
      }
    },
    [undo, redo, removeComponent, select, selectedKey, announce],
  )

  /*
   * Bound to the shell, not `window`, so the host page keeps its own Ctrl+Z,
   * Delete, Backspace and Escape. The shell takes focus on pointerdown so keys
   * still arrive after a canvas click.
   */
  useEffect(() => {
    const element = shell.current
    if (!element) return
    element.addEventListener('keydown', onKeyDown)
    return () => element.removeEventListener('keydown', onKeyDown)
  }, [onKeyDown, shell])
}
