/**
 * The left pane: components, structure, and the document's own settings.
 *
 * These were stacked in one scrolling column, so a form with thirty components
 * pushed the palette out of reach: the thing you reach for most often was the
 * thing furthest from the top. Tabs give each one the full height of the pane.
 *
 * Settings arrives here from the inspector, because it belongs to the document
 * rather than to whatever happens to be selected.
 */

import { useState } from 'react'
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react'
import type { ComponentDef, Kit } from '@formsmith/core'

import type { DragController } from '../drag.js'
import type { DesignerApi } from '../store.js'
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
  onDragStart: (def: ComponentDef, event: ReactPointerEvent) => void
}

export function LeftPane({
  api,
  kit,
  drag,
  announce,
  onAdd,
  onDragStart,
}: LeftPaneProps): ReactNode {
  const [active, setActive] = useState<TabId>('components')

  return (
    <Tabs label="Left pane" tabs={TABS} active={active} onSelect={setActive}>
      {active === 'components' && (
        <Palette
          kit={kit}
          onAdd={onAdd}
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
      {active === 'settings' && <FormSettings api={api} />}
    </Tabs>
  )
}
