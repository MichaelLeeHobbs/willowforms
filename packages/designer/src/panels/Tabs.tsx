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

import { useCallback, useId, useRef } from 'react'
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
}

export function Tabs<Id extends string>({
  label,
  tabs,
  active,
  onSelect,
  children,
}: TabsProps<Id>): ReactNode {
  const base = useId()
  const strip = useRef<HTMLDivElement>(null)

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
      // Focus follows selection, the expected behaviour for tabs whose panels
      // are cheap to render.
      strip.current
        ?.querySelector<HTMLButtonElement>('#' + CSS.escape(base + '-tab-' + target.id))
        ?.focus()
    },
    [base, tabs, onSelect],
  )

  return (
    <>
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

      <div
        id={panelId(active)}
        role="tabpanel"
        aria-labelledby={tabId(active)}
        tabIndex={0}
        className="fs-tabs__panel"
      >
        {children}
      </div>
    </>
  )
}
