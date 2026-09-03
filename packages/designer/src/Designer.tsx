/**
 * The designer shell.
 *
 * Chrome is plain CSS with custom properties, deliberately. The designer must
 * drop into a host app without dragging in a second component library or
 * fighting the host's theme, so it has no UI-library dependency at all. The only
 * component library in play is whichever kit renders the canvas.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode, RefObject } from 'react'
import { findLanguage, languageTag } from '@formsmith/core'
import { languagesOf } from './language.js'
import type { Device, FormDocument, IconName, Kit } from '@formsmith/core'
import type { RendererKit } from '@formsmith/renderer'

import { dragLabel, useDrag } from './drag.js'
import type { DragSource, DropCommit } from './drag.js'
import { Icon } from './Icon.js'
import { Canvas, canvasSwallowsFocus } from './panels/Canvas.js'
import type { Viewport } from './panels/Canvas.js'
import { DocumentDialog } from './panels/DocumentDialog.js'
import { Inspector } from './panels/Inspector.js'
import { LeftPane } from './panels/LeftPane.js'
import { useDesigner } from './store.js'
import type { DesignerApi } from './store.js'

export interface DesignerProps {
  /** Starting document. The designer owns it from here; use onChange to observe. */
  /**
   * The document to start from, read once at mount.
   *
   * The designer owns it afterwards: passing a different one has no effect,
   * deliberately, because replacing the content under an author's hands throws
   * away their undo stack with no way to get it back. To load another form,
   * remount with a different React `key`.
   */
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
   * Formsmith does not persist, so a Save button that appeared unconditionally
   * would promise something the designer cannot deliver. Its absence is the
   * honest default: `onChange` already emits every version, and many hosts save
   * from that.
   */
  onSave?: (document: FormDocument) => void
}

/**
 * How the designer's chrome is themed.
 *
 * `system` is the absence of the attribute, not a third palette: the stylesheet
 * already answers `prefers-color-scheme`, and the two explicit values exist so a
 * host managing its own theme can force either. See
 * [11-theming.md](../../../docs/spec/11-theming.md).
 */
type Theme = 'system' | 'light' | 'dark'

export function Designer({
  initialDocument,
  kit,
  rendererKit,
  onChange,
  onSave,
}: DesignerProps): ReactNode {
  /*
   * `initialDocument` is read once, at mount, and the name says so: the designer
   * owns the document after that, because a builder whose content can be
   * replaced underneath an edit has no undo stack worth the name. A host that
   * wants to load a different form remounts with a new `key`, which is the
   * React idiom for exactly this and what the playground does when it switches
   * kits. Documented on the prop as well.
   */
  const api = useDesigner(initialDocument)

  /*
   * The host is told when the *document* changes, and only then.
   *
   * `onChange` was in the dependency list, so a host passing an inline arrow —
   * which is what a host writes — re-emitted on every one of its own renders.
   * If the host then stores what it is given, that is a render loop, and if it
   * bails on identical values it is merely wasted work it cannot see.
   *
   * Held in a ref for the same reason `drag.ts` holds its own callback, with
   * the same note there about writing it in an effect rather than during
   * render.
   */
  const emit = useRef(onChange)
  useEffect(() => {
    emit.current = onChange
  }, [onChange])

  useEffect(() => {
    emit.current?.(api.document)
  }, [api.document])

  const shellRef = useRef<HTMLDivElement>(null)

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
      /*
       * Announced only if it happened.
       *
       * Both of these reported unconditionally, and both have refusal paths:
       * `addComponent` declines a definition a kit got wrong, and an insert the
       * tree refuses because the target cannot hold children; `moveNode`
       * returns the identical root for an illegal move. So a screen-reader user
       * was told a component moved into a container that will not hold it,
       * which is worse than silence -- it is the only feedback they get, and it
       * was wrong.
       *
       * Not "an insert that matched no parent": `containerFor` falls back to
       * the root for an unknown key, so that insert lands.
       */
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

  /*
   * Below `useDrag`, because Escape has to know whether a drag is in progress:
   * the spec says it clears the selection *or* abandons a drag, and both
   * handlers were running. Still unconditional and still in a fixed order, so
   * the hook rules hold.
   */
  useKeyboardShortcuts(api, shellRef, announce, drag.state !== undefined)

  /*
   * A view preference, so it lives here and never in the document. Two people
   * editing one form must not disagree about what the form is because one of
   * them last looked at it on a phone.
   */
  const [viewport, setViewport] = useState<Viewport>('desktop')
  const [theme, setTheme] = useState<Theme>('system')

  /*
   * Which breakpoint the Style tab edits. It follows the viewport, because
   * authoring a tablet rule with no way to see a tablet is writing blind, and
   * it can also be `any`, which is the base layer and not a viewport at all.
   */
  const [styleDevice, setStyleDevice] = useState<Device>('any')

  /*
   * Which panes are collapsed. A view preference like the two above, and per
   * pane rather than one shared flag: hiding the palette to see a wide form and
   * hiding the inspector to see the tree are different intentions.
   */
  const [collapsed, setCollapsed] = useState({ left: false, right: false })
  const toggle = useCallback((side: 'left' | 'right') => {
    setCollapsed((current) => ({ ...current, [side]: !current[side] }))
  }, [])

  /*
   * Which language the canvas renders in. Undefined means the document's own
   * default, which is what the renderer already falls back to, so this stays out
   * of the way until someone picks a language.
   */
  const [language, setLanguage] = useState<string | undefined>(undefined)

  /*
   * A language can be removed while the canvas is showing it, which would leave
   * the canvas rendering every translation as its raw key. Derived rather than
   * corrected in an effect, so there is no frame where that is on screen.
   */
  const languages = languagesOf(api.document)
  /*
   * `findLanguage`, not a fourth inline re-spelling of the tag rule.
   *
   * Core exports it for exactly this question and nothing outside its own test
   * called it, while three places here compared `languageTag(l)` by hand -- and
   * the whole reason that function exists is that the two spellings of a
   * language drifted apart once already.
   */
  const stillThere = language !== undefined && findLanguage(languages, language) !== undefined
  const activeLanguage = stillThere ? language : undefined

  /*
   * And forgotten once it is gone, rather than masked.
   *
   * The line above hides a language the document no longer has, which is right
   * for the frame it is removed in. Holding on to the name is what is wrong: add
   * the same language back an hour later and the canvas jumps to it, because a
   * choice nobody remembers making is still sitting in this state.
   *
   * Adjusted during render rather than in an effect. React re-runs this
   * component immediately with the new state and paints once, where an effect
   * would paint the stale frame first and then correct it -- and the compiler
   * rule against `setState` in an effect is pointing at exactly that.
   */
  if (language !== undefined && !stillThere) setLanguage(undefined)

  return (
    <div
      ref={shellRef}
      /*
       * Focusable, so the shortcuts below can be bound here rather than to the
       * whole page. Not in the tab order — this is a container, not a control.
       */
      tabIndex={-1}
      onPointerDown={(event) => {
        const target = event.target
        /*
         * Anything that takes focus itself keeps it: a click in a text field
         * must not be stolen by the container it happens to be inside.
         *
         * Except on the canvas while editing, where nothing takes focus at all.
         * The canvas cancels mousedown's default in the capture phase so a click
         * selects rather than types, and this exemption then fired on the very
         * elements that had just been prevented from focusing -- so the shell
         * stayed unfocused, its key handler never ran, and Delete, Ctrl+Z and
         * Escape did nothing after clicking a field. Two guards, opposite
         * assumptions about the same click; `canvasSwallowsFocus` is the one
         * they share.
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
      data-testid="formsmith-designer"
      {...(theme === 'system' ? {} : { 'data-fs-theme': theme })}
    >
      <Toolbar
        api={api}
        onOpenJson={() => setJsonOpen(true)}
        viewport={viewport}
        onViewport={(next) => {
          setViewport(next)
          // The Style tab edits the breakpoint the canvas is showing, so
          // choosing a device in the toolbar moves what a style rule applies
          // to. Otherwise an author sizes the canvas to a phone and edits the
          // desktop rule.
          setStyleDevice(next)
        }}
        theme={theme}
        onTheme={setTheme}
        language={activeLanguage}
        onLanguage={setLanguage}
        {...(onSave ? { onSave: () => onSave(api.document) } : {})}
      />
      <div className="fs-body">
        <PaneHandle
          side="left"
          controls={LEFT_PANE_ID}
          collapsed={collapsed.left}
          onToggle={() => toggle('left')}
        />

        <aside
          id={LEFT_PANE_ID}
          className="fs-panel fs-panel--left"
          aria-label="Components and structure"
          hidden={collapsed.left}
        >
          <LeftPane
            api={api}
            kit={kit}
            drag={drag}
            announce={announce}
            onAdd={(def) => {
              if (api.addComponent(def, api.selectedKey)) announce(def.label + ' added.')
            }}
            onDragStart={(def, event) => drag.begin({ kind: 'new', def }, event)}
          />
        </aside>

        <main className="fs-canvas" aria-label="Form canvas">
          <Canvas
            api={canvasApi}
            kit={kit}
            rendererKit={rendererKit}
            drag={drag}
            viewport={viewport}
            {...(activeLanguage ? { language: activeLanguage } : {})}
          />
        </main>

        <aside
          id={RIGHT_PANE_ID}
          className="fs-panel fs-panel--right"
          aria-label="Component properties"
          hidden={collapsed.right}
        >
          <Inspector
            api={api}
            kit={kit}
            device={styleDevice}
            onDevice={(next) => {
              // `any` is the base layer rather than a device, so choosing it
              // leaves the canvas where it is; a device moves the canvas too,
              // because a rule for a width you cannot see is written blind.
              if (next !== 'any') setViewport(next)
              setStyleDevice(next)
            }}
          />
        </aside>

        <PaneHandle
          side="right"
          controls={RIGHT_PANE_ID}
          collapsed={collapsed.right}
          onToggle={() => toggle('right')}
        />
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

/*
 * Fixed ids rather than useId, because only one Designer is ever on a page: it
 * is a whole-screen application, and two would fight over the window-level
 * keyboard shortcuts long before they collided over an id.
 */
const LEFT_PANE_ID = 'fs-pane-left'
const RIGHT_PANE_ID = 'fs-pane-right'

/**
 * The grip that collapses a pane.
 *
 * It sits outside the pane it controls rather than inside it, because a control
 * inside a collapsed pane is a control nobody can reach. The chevron points the
 * way the pane will move, which is the only thing about it worth learning.
 */
function PaneHandle({
  side,
  controls,
  collapsed,
  onToggle,
}: {
  side: 'left' | 'right'
  /** Id of the pane this opens and closes. */
  controls: string
  collapsed: boolean
  onToggle: () => void
}): ReactNode {
  const label = side === 'left' ? 'Components and structure' : 'Component properties'
  // Collapsed points inward, expanded points outward, in both directions.
  const pointsStart = side === 'left' ? collapsed : !collapsed
  return (
    <button
      type="button"
      className={'fs-pane-handle fs-pane-handle--' + side}
      aria-expanded={!collapsed}
      /*
       * The pane is `hidden` rather than unmounted, so this always resolves.
       * Together with aria-expanded it is the disclosure pattern: without it a
       * screen reader is told something is expanded and not what.
       */
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
 * The viewports the canvas can pretend to be.
 *
 * `Device` also has `any`, which is the base layer per-breakpoint CSS falls back
 * to rather than a device anyone can look at. It is deliberately not offered
 * here. See [06-inspector.md](../../../docs/spec/06-inspector.md).
 */
const VIEWPORTS: { id: Viewport; label: string; icon: IconName }[] = [
  { id: 'desktop', label: 'Desktop', icon: 'screen' },
  { id: 'tablet', label: 'Tablet', icon: 'tablet' },
  { id: 'mobile', label: 'Mobile', icon: 'mobile' },
]

function Toolbar({
  api,
  onOpenJson,
  onSave,
  viewport,
  onViewport,
  theme,
  onTheme,
  language,
  onLanguage,
}: {
  api: DesignerApi
  onOpenJson: () => void
  onSave?: () => void
  viewport: Viewport
  onViewport: (next: Viewport) => void
  theme: Theme
  onTheme: (next: Theme) => void
  language: string | undefined
  onLanguage: (next: string | undefined) => void
}): ReactNode {
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

        {/*
         * Only when the host can honour it. A Save button the designer cannot
         * deliver on is worse than none, and onChange already emits every
         * version for hosts that save from that.
         */}
        {onSave && (
          <button type="button" onClick={onSave}>
            Save
          </button>
        )}

        {/*
         * Selects rather than toggle groups. Both of these are set once and
         * left, unlike the viewport, and the language list is as long as the
         * document says it is.
         */}
        {languages.length > 1 && (
          <div className="fs-toolbar__field">
            <label className="fs-visually-hidden" htmlFor="fs-toolbar-language">
              Canvas language
            </label>
            <select
              id="fs-toolbar-language"
              value={language ?? ''}
              onChange={(e) => onLanguage(e.target.value || undefined)}
            >
              <option value="">Default language</option>
              {/*
               * Keyed by position and tag, not by tag.
               *
               * Two languages can carry the same tag: nothing dedupes
               * `languages`, and `validateDocument` checks only that
               * `defaultLanguage` is present. A document with `en` twice made
               * React see two children with one key here, which it warns about
               * and then reconciles by guessing. `FormSettings` already keys
               * this list the same way; this picker and `Binding`'s did not.
               */}
              {languages.map((entry, at) => (
                <option key={String(at) + ':' + languageTag(entry)} value={languageTag(entry)}>
                  {entry.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="fs-toolbar__field">
          <label className="fs-visually-hidden" htmlFor="fs-toolbar-theme">
            Designer theme
          </label>
          <select
            id="fs-toolbar-theme"
            value={theme}
            onChange={(e) => {
              /*
               * Checked rather than asserted. `e.target.value` is a DOM string,
               * and `as Theme` is a promise about markup made by the code that
               * reads it -- a promise this component keeps today and an
               * extension's autofill, a userscript or a future option does not
               * have to.
               */
              const chosen = e.target.value
              if (chosen === 'system' || chosen === 'light' || chosen === 'dark') onTheme(chosen)
            }}
          >
            <option value="system">System theme</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </div>

        {/*
         * A group of toggles rather than a select: three options that are set
         * and re-set constantly, where seeing which one is active matters more
         * than saving the width.
         */}
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
  /**
   * Whether a drag is in progress right now.
   *
   * Passed in rather than read here, because the drag module owns the answer
   * and a second one in this file is the shape this run keeps finding. Escape
   * is the only shortcut that needs it: the spec says it clears the selection
   * *or* abandons a drag, and both handlers were running.
   */
  isDragging: boolean,
): void {
  const { undo, redo, removeComponent, select, selectedKey } = api

  /*
   * Whether a drag is in progress, readable from the handler without listing it
   * as a dependency.
   *
   * A ref because `onKeyDown` is memoised and re-creating it on every drag state
   * change would re-register the native listener mid-gesture, which is the
   * thing the listener's own comment says it is bound to the shell to avoid.
   */
  const dragging = useRef(isDragging)
  useEffect(() => {
    dragging.current = isDragging
  }, [isDragging])

  const onKeyDown = useCallback(
    (event: KeyboardEvent) => {
      /*
       * Narrowed, not asserted. A keydown target is any `EventTarget` -- the
       * document, the window, a text node from a synthetic event -- and the
       * cast bought nothing the optional chains below did not already do.
       */
      /*
       * `Element`, not `HTMLElement`, and the difference is what closed three
       * guards at once.
       *
       * `closest` and `tagName` live on `Element`; only `isContentEditable` is
       * `HTMLElement`-only. Narrowing to `HTMLElement` made `target` null for
       * anything else -- and `Icon` renders SVG, whose elements are
       * `SVGElement` -- so with focus on one, `target?.closest('dialog[open]')`
       * was undefined and the modal guard did not fire, and
       * `backspaceIsSafe`'s `!== null` read undefined as *safe* and deleted the
       * selected component.
       *
       * The three guards failed open together, and the destructive one failed
       * open in the direction that destroys work.
       */
      const target = event.target instanceof Element ? event.target : null
      const editable = event.target instanceof HTMLElement ? event.target : null
      const tag = target?.tagName
      const typing =
        tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || editable?.isContentEditable
      if (typing) return

      /*
       * An event from inside an open dialog belongs to that dialog.
       *
       * `showModal()` makes the background inert to *pointers* and says nothing
       * about keys, so these shortcuts stayed armed over a modal: Backspace on
       * the JSON dialog's Apply button deleted the component selected behind it
       * while the textarea in front of you still showed the JSON from before.
       * The `typing` guard above does not help — a button is not a text field.
       *
       * It is also what lets Escape close the dialog. This handler called
       * `preventDefault()` on Escape whenever anything was selected, which
       * cancels the native close request, so the dialog took two presses.
       */
      if (target?.closest('dialog[open]')) return

      /*
       * A keystroke this handler cannot attribute to an element is not one it
       * should act on. Every guard above reads the target, so with none there is
       * nothing to say the key was not aimed at a dialog, a text field or
       * something else with a claim on it -- and the branches below are
       * destructive.
       */
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
      /*
       * `Backspace` only when nothing else has a claim on it.
       *
       * Delete is unambiguous. Backspace is not: on a button it is the browser's
       * back gesture in some settings, and on any control it is what somebody
       * presses expecting to correct a typo. This fired whenever focus was on
       * *any* chrome button -- so tabbing to Undo and pressing Backspace deleted
       * the selected component, which is a destructive edit from a key nobody
       * aimed at the canvas.
       *
       * The shell itself and the tree rows are the two places where Backspace
       * can only mean "remove what is selected", because neither takes text and
       * both are about the selection. Anywhere else it is left alone; Delete
       * still works from everywhere.
       *
       * Asked of the element rather than compared with the ref, because a ref is
       * stable and listing one as a dependency is what
       * `react-hooks/preserve-manual-memoization` refuses. `fs-shell` is the
       * class the container carries and nothing else does.
       */
      /*
       * `Boolean`, not `!== null`.
       *
       * `target?.closest(...)` is `undefined` when there is no target to ask,
       * and `undefined !== null` is `true` -- so a keystroke this handler could
       * not attribute to anything was read as *safe* and removed the selected
       * component. The clause on the line above guards the same case correctly
       * with `=== true`, which is what made this one easy to miss.
       */
      const backspaceIsSafe =
        target?.classList.contains('fs-shell') === true ||
        Boolean(target?.closest('[data-fs-tree-row]'))

      if (event.key === 'Backspace' && !backspaceIsSafe) return

      if ((event.key === 'Delete' || event.key === 'Backspace') && selectedKey) {
        event.preventDefault()
        removeComponent(selectedKey)
        // Announced, like every other addition and removal. These two were the
        // only shell mutations that said nothing, against the shell spec.
        announce(selectedKey + ' removed.')
        return
      }
      if (event.key === 'Escape' && selectedKey) {
        /*
         * "Escape clears the selection, *or* abandons a drag if one is in
         * progress" -- `04-shell.md:159`, and it did both.
         *
         * `drag.ts` registers its own `keydown` on `window` and this one is on
         * `.fs-shell`, which is below `window` in the bubble path, so both ran:
         * the drag was abandoned *and* the selection was cleared, in one press.
         * A drag is the more recent gesture and the one the key is aimed at, so
         * it wins and this does nothing.
         *
         * Read from `drag.state` rather than duplicated: the drag module owns
         * whether a drag is in progress, and a second answer here is the shape
         * this run keeps finding.
         */
        if (dragging.current) return

        event.preventDefault()
        select(undefined)
        announce('Selection cleared.')
      }
    },
    [undo, redo, removeComponent, select, selectedKey, announce],
  )

  /*
   * Bound to the shell, not to `window`.
   *
   * On `window` the designer claimed Ctrl+Z, Delete, Backspace and Escape for
   * the entire host page — a form builder embedded in an admin panel took that
   * page's undo away from it, and gave it back nothing.
   *
   * The shell carries `tabIndex={-1}` and takes focus when a click lands on
   * something that will not take it itself, so a keystroke after selecting a
   * component on the canvas still arrives. That is also what makes the
   * behaviour honest: the shortcuts belong to the designer when the designer
   * has focus, which is what a person would guess.
   */
  useEffect(() => {
    const element = shell.current
    if (!element) return
    element.addEventListener('keydown', onKeyDown)
    return () => element.removeEventListener('keydown', onKeyDown)
  }, [onKeyDown, shell])
}
