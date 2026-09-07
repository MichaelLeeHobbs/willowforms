import { useId, useMemo, useState } from 'react'
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react'
import type { ComponentDef, Kit, PaletteGroup } from '@willowforms/core'
import { groupKit } from '@willowforms/core'

import { Icon } from '../Icon.js'
import { availablePresets } from '../presets.js'
import type { AuthoringPreset } from '../presets.js'

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
  onAddPreset?: (preset: AuthoringPreset) => void
  /** Press and move. The drag controller decides which of the two happened. */
  onDragStart: (def: ComponentDef, event: ReactPointerEvent) => void

  consumeClick: () => boolean
  /** Held by the pane so switching tabs preserves the search. */
  query: string
  onQuery: (next: string) => void
}

export function Palette({
  kit,
  query,
  onQuery,
  onAdd,
  onAddPreset,
  onDragStart,
  consumeClick,
}: PaletteProps): ReactNode {
  const idBase = useId()
  const [presetsOpen, setPresetsOpen] = useState(false)
  const groups = useMemo(() => groupKit(kit), [kit])
  const presets = useMemo(() => availablePresets(kit), [kit])
  const matchingPresets = onAddPreset
    ? presets.filter((preset) =>
        (preset.label + ' ' + preset.description)
          .toLowerCase()
          .includes(query.trim().toLowerCase()),
      )
    : []

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return groups
    return groups
      .map((g) => ({
        ...g,
        components: g.components.filter(
          (c) => c.label.toLowerCase().includes(q) || c.type.toLowerCase().includes(q),
        ),
      }))
      .filter((g) => g.components.length > 0)
  }, [groups, query])

  return (
    <section className="fs-palette">
      <div className="fs-palette__search">
        <label className="fs-visually-hidden" htmlFor={idBase + '-fs-palette-search'}>
          Search components
        </label>
        <input
          id={idBase + '-fs-palette-search'}
          type="search"
          placeholder="Search components"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
        />
      </div>

      {matchingPresets.length > 0 && (
        <section aria-label="Starting layouts">
          {query.trim() ? (
            <h3 className="fs-palette__group-title">Starting layouts</h3>
          ) : (
            <button
              className="fs-palette__disclosure"
              type="button"
              aria-expanded={presetsOpen}
              aria-controls={idBase + '-presets'}
              onClick={() => setPresetsOpen((open) => !open)}
            >
              <Icon name="chevron" /> Starting layouts
              <span aria-hidden="true">{matchingPresets.length}</span>
            </button>
          )}
          <div
            id={idBase + '-presets'}
            className="fs-palette__presets"
            hidden={!presetsOpen && !query.trim()}
          >
            {matchingPresets.map((preset) => (
              <button
                key={preset.id}
                type="button"
                className="fs-palette__preset"
                aria-labelledby={idBase + '-' + preset.id}
                aria-describedby={idBase + '-' + preset.id + '-hint'}
                onClick={() => onAddPreset?.(preset)}
              >
                <Icon name={preset.icon} />
                <span>
                  <span id={idBase + '-' + preset.id}>{preset.label}</span>
                  <small id={idBase + '-' + preset.id + '-hint'}>{preset.description}</small>
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      {filtered.length === 0 && matchingPresets.length === 0 ? (
        <p className="fs-empty">
          {groups.length === 0
            ? 'This kit declares no components.'
            : 'No components match “' + query + '”.'}
        </p>
      ) : (
        filtered.map((group) => (
          <div key={group.group} className="fs-palette__group">
            <h3 className="fs-palette__group-title">{GROUP_LABELS[group.group] ?? group.group}</h3>
            <div className="fs-palette__items">
              {group.components.map((def) => (
                <button
                  key={def.type}
                  type="button"
                  className="fs-palette__item"
                  onClick={() => {
                    if (consumeClick()) return
                    onAdd(def)
                  }}
                  onPointerDown={(event) => {
                    if (event.button !== 0) return
                    onDragStart(def, event)
                  }}
                  title={'Add ' + def.label + ', or drag it onto the canvas'}
                >
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
