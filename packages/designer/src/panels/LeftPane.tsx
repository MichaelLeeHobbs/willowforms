import { useState } from 'react'
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react'
import type { ComponentDef, Kit } from '@willowforms/core'

import type { DragController } from '../drag.js'
import type { DesignerApi } from '../store.js'
import type { AuthoringPreset } from '../presets.js'
import { FormSettings } from './FormSettings.js'
import { Palette } from './Palette.js'
import { Tabs } from './Tabs.js'
import type { TabDef } from './Tabs.js'
import { Tree } from './Tree.js'

type TabId = 'components' | 'tree' | 'settings'

const TABS: TabDef<TabId>[] = [
  { id: 'components', label: 'Components' },
  { id: 'tree', label: 'Tree' },
  { id: 'settings', label: 'Settings' },
]

export interface LeftPaneProps {
  api: DesignerApi
  kit: Kit
  drag: DragController
  announce: (message: string) => void
  onAdd: (def: ComponentDef) => void
  onAddPreset?: (preset: AuthoringPreset) => void
  onDragStart: (def: ComponentDef, event: ReactPointerEvent) => void
}

export function LeftPane({
  api,
  kit,
  drag,
  announce,
  onAdd,
  onAddPreset,
  onDragStart,
}: LeftPaneProps): ReactNode {
  const [active, setActive] = useState<TabId>('components')

  const [query, setQuery] = useState('')

  // Named for what the tabs are, not where they sit, and not the region's own
  // name: two elements with one accessible name make every query ambiguous.
  return (
    <Tabs label="Palette, structure and settings" tabs={TABS} active={active} onSelect={setActive}>
      {active === 'components' && (
        <Palette
          kit={kit}
          query={query}
          onQuery={setQuery}
          onAdd={onAdd}
          {...(onAddPreset ? { onAddPreset } : {})}
          onDragStart={onDragStart}
          consumeClick={drag.consumeClick}
        />
      )}
      {active === 'tree' && (
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
      )}
      {active === 'settings' && <FormSettings api={api} kit={kit} />}
    </Tabs>
  )
}
