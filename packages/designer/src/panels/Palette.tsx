import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { ComponentDef, Kit, PaletteGroup } from '@formsmith/core'
import { groupKit } from '@formsmith/core'

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
  onAdd: (def: ComponentDef) => void
}

export function Palette({ kit, onAdd }: PaletteProps): ReactNode {
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
                  title={'Add ' + def.label}
                >
                  {def.label}
                </button>
              ))}
            </div>
          </div>
        ))
      )}
    </section>
  )
}
