/**
 * A real tablist, in one place.
 *
 * `role="tablist"`, roving tabindex, arrow keys, Home and End, and panels that
 * name their tab. The whole pattern costs about fifteen lines and is commonly
 * shipped as a row of styled buttons instead, which leaves a screen reader
 * announcing unrelated controls.
 *
 * Extracted when the left pane needed the same thing the inspector already had.
 * Two copies would have been two places to get the roving tabindex wrong, and
 * the inspector's copy had already been wrong once: every tab carried
 * `aria-controls` while only the selected panel was rendered, so two of the
 * three named an id that was not in the document.
 */

import { useCallback, useEffect, useId, useRef } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'

export interface TabDef<Id extends string> {
  id: Id
  label: string
}

export interface TabsProps<Id extends string> {
  /** Names the tablist for assistive technology. */
  label: string
  tabs: TabDef<Id>[]
  active: Id
  onSelect: (id: Id) => void
  /** The active panel's contents. Only the active panel is rendered. */
  children: ReactNode
  /**
   * Something to sit beside the strip, on the same row.
   *
   * The JSON dialog puts its close button there. It cannot go *inside* the
   * strip, which is the `tablist` and may hold nothing but tabs, and the dialog
   * having its own tab implementation to get that layout is what left its
   * second view unreachable from the keyboard.
   *
   * Absent for every other caller, and then the markup is exactly what it was.
   */
  aside?: ReactNode
}

export function Tabs<Id extends string>({
  label,
  tabs,
  active,
  onSelect,
  children,
  aside,
}: TabsProps<Id>): ReactNode {
  const base = useId()
  const strip = useRef<HTMLDivElement>(null)

  /** The tab a keypress asked for, until the parent has honoured the request. */
  const wanted = useRef<Id | null>(null)

  const tabId = (id: Id): string => base + '-tab-' + id
  const panelId = (id: Id): string => base + '-panel-' + id

  /**
   * Left and right move between tabs; Home and End jump to the ends. Bound to
   * each tab rather than the strip, because only the tabs take focus and a
   * keydown handler on a non-focusable wrapper never fires from the keyboard.
   */
  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
      const keys = ['ArrowLeft', 'ArrowRight', 'Home', 'End']
      if (!keys.includes(event.key)) return

      /*
       * Before `preventDefault`, not after.
       *
       * With one tab there is nowhere to go -- and swallowing the key anyway
       * meant Home and End did nothing at all on a one-tab strip, rather than
       * scrolling the panel the way they would anywhere else on the page. A
       * component that takes a key and declines to act on it has to give it
       * back.
       */
      if (tabs.length < 2) return

      event.preventDefault()

      const last = tabs.length - 1
      const next =
        event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? last
            : event.key === 'ArrowLeft'
              ? (index + last) % tabs.length
              : (index + 1) % tabs.length

      const target = tabs[next]
      if (!target) return
      onSelect(target.id)

      /*
       * Focus follows selection, the expected behaviour for tabs whose panels
       * are cheap to render.
       *
       * By position in the strip rather than by re-querying an id: the id route
       * depended on `CSS.escape` and on two optional chains, either of which
       * would leave focus where it was with nothing to say so -- keyboard
       * navigation that looks like it worked because the panel changed. The
       * buttons are the strip's element children, in the order they are
       * rendered, so `next` indexes them directly.
       */
      /*
       * Asked for, then moved to once the parent has honoured it.
       *
       * The parent owns the selection: `onSelect` is a request, and this used
       * to move focus straight away on the assumption it was granted. A parent
       * that ignores or remaps the request left focus on a tab rendered with
       * `tabIndex={-1}` and `aria-selected={false}` -- a roving tabindex whose
       * rove and selection point at different tabs, which the next arrow key
       * steps out of the strip entirely.
       *
       * The effect below runs when `active` really changes, so a request that
       * went nowhere leaves focus where it was, which is the honest answer.
       */
      wanted.current = target.id
    },
    [tabs, onSelect],
  )

  useEffect(() => {
    if (wanted.current === null || wanted.current !== active) return
    wanted.current = null

    /*
     * By position in the strip rather than by re-querying an id: the id route
     * depended on `CSS.escape` and on two optional chains, either of which
     * would leave focus where it was with nothing to say so -- keyboard
     * navigation that looks like it worked because the panel changed.
     */
    const at = tabs.findIndex((tab) => tab.id === active)
    const element = strip.current?.children[at]
    if (element instanceof HTMLButtonElement) element.focus()
  }, [active, tabs])

  const tablist = (
    <div className="fs-tabs" role="tablist" aria-label={label} ref={strip}>
      {tabs.map((tab, index) => (
        <button
          key={tab.id}
          id={tabId(tab.id)}
          type="button"
          role="tab"
          aria-selected={active === tab.id}
          /*
           * Only the selected tab's panel is in the DOM, so only the selected
           * tab can name one. An unresolved IDREF is not an axe violation,
           * which is how the inspector shipped two of them for months.
           */
          {...(active === tab.id ? { 'aria-controls': panelId(tab.id) } : {})}
          tabIndex={active === tab.id ? 0 : -1}
          className={'fs-tabs__tab' + (active === tab.id ? ' is-active' : '')}
          onClick={() => onSelect(tab.id)}
          onKeyDown={(event) => onKeyDown(event, index)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )

  return (
    <>
      {aside === undefined ? (
        tablist
      ) : (
        <div className="fs-tabs__row">
          {tablist}
          {aside}
        </div>
      )}

      {/*
       * No `tabIndex` on the panel.
       *
       * A tabpanel takes focus so a keyboard user can reach content that has
       * none of its own; every panel here is a palette of buttons, a tree, or a
       * form. Making it focusable anyway adds a tab stop that announces the
       * panel's name and does nothing, between the tab strip and the first
       * control, on every one of the five panels.
       */}
      <div
        id={panelId(active)}
        role="tabpanel"
        aria-labelledby={tabId(active)}
        className="fs-tabs__panel"
      >
        {children}
      </div>
    </>
  )
}
