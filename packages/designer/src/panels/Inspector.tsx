/**
 * The right-hand panel: properties and validation, behind tabs.
 *
 * Implemented as a real tablist rather than styled buttons. The study in
 * docs/prior-art records the product this project studied shipping tab strips
 * with no `role="tablist"` wrapper at all, which leaves a screen reader
 * announcing a row of unrelated buttons. Roving tabindex and arrow keys are the
 * rest of the pattern, and cost about fifteen lines.
 */

import { useCallback, useId, useRef, useState } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'
import type { Kit } from '@formsmith/core'

import type { DesignerApi } from '../store.js'
import { FormSettings } from './FormSettings.js'
import { Properties } from './Properties.js'
import { Rules } from './Rules.js'

type TabId = 'properties' | 'rules' | 'form'

const TABS: { id: TabId; label: string }[] = [
  { id: 'properties', label: 'Properties' },
  { id: 'rules', label: 'Rules' },
  { id: 'form', label: 'Form' },
]

export interface InspectorProps {
  api: DesignerApi
  kit: Kit
}

export function Inspector({ api, kit }: InspectorProps): ReactNode {
  const [active, setActive] = useState<TabId>('properties')
  const base = useId()
  const strip = useRef<HTMLDivElement>(null)

  const tabId = (id: TabId): string => base + '-tab-' + id
  const panelId = (id: TabId): string => base + '-panel-' + id

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

      const last = TABS.length - 1
      const next =
        event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? last
            : event.key === 'ArrowLeft'
              ? (index + last) % TABS.length
              : (index + 1) % TABS.length

      const target = TABS[next]
      if (!target) return
      setActive(target.id)
      // Focus follows selection, the expected behaviour for tabs whose panels
      // are cheap to render.
      strip.current
        ?.querySelector<HTMLButtonElement>('#' + CSS.escape(base + '-tab-' + target.id))
        ?.focus()
    },
    [base],
  )

  return (
    <section className="fs-inspector">
      <div className="fs-tabs" role="tablist" aria-label="Component inspector" ref={strip}>
        {TABS.map((tab, index) => (
          <button
            key={tab.id}
            id={tabId(tab.id)}
            type="button"
            role="tab"
            aria-selected={active === tab.id}
            /*
             * Only the selected tab's panel is in the DOM, so only the selected
             * tab can name one. Every tab carried this, which left two of the
             * three pointing aria-controls at an id that did not exist. axe does
             * not flag an unresolved IDREF, so nothing caught it.
             */
            {...(active === tab.id ? { 'aria-controls': panelId(tab.id) } : {})}
            tabIndex={active === tab.id ? 0 : -1}
            className={'fs-tabs__tab' + (active === tab.id ? ' is-active' : '')}
            onClick={() => setActive(tab.id)}
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
        {active === 'properties' && <Properties api={api} kit={kit} />}
        {active === 'rules' && <Rules api={api} />}
        {active === 'form' && <FormSettings api={api} />}
      </div>
    </section>
  )
}
