import { useCallback, useId, useRef } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'

export interface TabDef<Id extends string> {
  id: Id
  label: string
}

export interface TabsProps<Id extends string> {
  label: string
  tabs: TabDef<Id>[]
  active: Id
  onSelect: (id: Id) => void
  /** The active panel's contents. Only the active panel is rendered. */
  children: ReactNode
  /** Drawn beside the strip, not in it: a `tablist` may hold only tabs. */
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

  const tabId = (id: Id): string => base + '-tab-' + id
  const panelId = (id: Id): string => base + '-panel-' + id

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
      const keys = ['ArrowLeft', 'ArrowRight', 'Home', 'End']
      if (!keys.includes(event.key)) return

      // Before `preventDefault`: a one-tab strip leaves Home and End to the page.
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

      const buttons = strip.current?.children
      const element = buttons?.[next]
      if (element instanceof HTMLButtonElement) element.focus()
    },
    [tabs, onSelect],
  )

  const tablist = (
    <div className="fs-tabs" role="tablist" aria-label={label} ref={strip}>
      {tabs.map((tab, index) => (
        <button
          key={tab.id}
          id={tabId(tab.id)}
          type="button"
          role="tab"
          aria-selected={active === tab.id}
          // Only the active panel exists, so only the active tab may name one.
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

      {/* No `tabIndex`: every panel has focusable content, so a panel tab stop would be empty. */}
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
