/**
 * The right-hand panel: the selected component's properties and rules.
 *
 * Form settings used to be a third tab here. It belongs to the document rather
 * than to the selection, so putting it beside per-component properties was a
 * convenience that made the panel mean two things; it lives in the left pane
 * now. See [04-shell.md](../../../docs/spec/04-shell.md).
 */

import { useState } from 'react'
import type { ReactNode } from 'react'
import type { Kit } from '@formsmith/core'

import type { DesignerApi } from '../store.js'
import { Properties } from './Properties.js'
import { Rules } from './Rules.js'
import { Tabs } from './Tabs.js'
import type { TabDef } from './Tabs.js'

type TabId = 'properties' | 'rules'

const TABS: TabDef<TabId>[] = [
  { id: 'properties', label: 'Properties' },
  { id: 'rules', label: 'Rules' },
]

export interface InspectorProps {
  api: DesignerApi
  kit: Kit
}

export function Inspector({ api, kit }: InspectorProps): ReactNode {
  const [active, setActive] = useState<TabId>('properties')

  return (
    <section className="fs-inspector">
      <Tabs label="Component inspector" tabs={TABS} active={active} onSelect={setActive}>
        {active === 'properties' && <Properties api={api} kit={kit} />}
        {active === 'rules' && <Rules api={api} />}
      </Tabs>
    </section>
  )
}
