import { useState } from 'react'
import type { ReactNode } from 'react'
import type { Device, Kit } from '@formsmith/core'

import type { DesignerApi } from '../store.js'
import { Properties } from './Properties.js'
import { Rules } from './Rules.js'
import { Actions } from './Actions.js'
import { StyleTab } from './StyleTab.js'
import { Tabs } from './Tabs.js'
import type { TabDef } from './Tabs.js'

type TabId = 'properties' | 'style' | 'actions' | 'rules'

const TABS: TabDef<TabId>[] = [
  { id: 'properties', label: 'Properties' },
  { id: 'style', label: 'Style' },
  { id: 'actions', label: 'Actions' },
  { id: 'rules', label: 'Rules' },
]

export interface InspectorProps {
  api: DesignerApi
  kit: Kit
  /**
   * The breakpoint the Style tab edits, which is the device the canvas is
   * simulating. Authoring a tablet rule with no way to see a tablet is writing
   * blind, so the two are the same choice made in one place.
   */
  device: Device
  onDevice: (next: Device) => void
}

export function Inspector({ api, kit, device, onDevice }: InspectorProps): ReactNode {
  const [active, setActive] = useState<TabId>('properties')

  return (
    <section className="fs-inspector">
      <Tabs label="Component inspector" tabs={TABS} active={active} onSelect={setActive}>
        {active === 'properties' && <Properties api={api} kit={kit} />}
        {active === 'style' && <StyleTab api={api} kit={kit} device={device} onDevice={onDevice} />}
        {active === 'actions' && <Actions api={api} kit={kit} />}
        {active === 'rules' && <Rules api={api} />}
      </Tabs>
    </section>
  )
}
