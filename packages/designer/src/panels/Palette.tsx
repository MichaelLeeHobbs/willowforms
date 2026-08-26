import { useMemo, useState } from 'react'
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react'
import type { ComponentDef, Kit, PaletteGroup } from '@formsmith/core'
import { groupKit } from '@formsmith/core'

import { Icon } from '../Icon.js'

const GROUP_LABELS: Record<PaletteGroup, string> = {
  inputs: 'Inputs',
  selection: 'Selection',
  layout: 'Layout',
  display: 'Display',
  feedback: 'Feedback',
  navigation: 'Navigation',
  custom: 'Custom',
}

export interface PaletteProps {
  kit: Kit
  /** Click. Adds under the current selection, which is the no-aim path. */
  onAdd: (def: ComponentDef) => void
  /** Press and move. The drag controller decides which of the two happened. */
  onDragStart: (def: ComponentDef, event: ReactPointerEvent) => void
}

export function Palette({ kit, onAdd, onDragStart }: PaletteProps): ReactNode {
  const [query, setQuery] = useState('')
  const groups = useMemo(() => groupKit(kit), [kit])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return groups
    return groups
      .map((g) => ({
        ...g,
        components: g.components.filter((c) => c.label.toLowerCase().includes(q)),
      }))
      .filter((g) => g.components.length > 0)
  }, [groups, query])

  return (
    <section className="fs-palette">
      <h2 className="fs-panel__heading">Components</h2>

      <div className="fs-palette__search">
        <label className="fs-visually-hidden" htmlFor="fs-palette-search">
          Search components
        </label>
        <input
          id="fs-palette-search"
          type="search"
          placeholder="Search components"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {filtered.length === 0 ? (
        <p className="fs-empty">No components match “{query}”.</p>
      ) : (
        filtered.map((group) => (
          <div key={group.group} className="fs-palette__group">
            <h3 className="fs-palette__group-title">{GROUP_LABELS[group.group]}</h3>
            <div className="fs-palette__items">
              {group.components.map((def) => (
                <button
                  key={def.type}
                  type="button"
                  className="fs-palette__item"
                  onClick={() => onAdd(def)}
                  onPointerDown={(event) => onDragStart(def, event)}
                  title={'Add ' + def.label + ', or drag it onto the canvas'}
                >
                  {/*
                   * Decorative: the label it sits beside says the same thing, so
                   * naming it would have a screen reader read the entry twice.
                   * A kit that declares no icon simply gets none.
                   */}
                  {def.icon ? <Icon name={def.icon} /> : null}
                  <span>{def.label}</span>
                </button>
              ))}
            </div>
          </div>
        ))
      )}
    </section>
  )
}
