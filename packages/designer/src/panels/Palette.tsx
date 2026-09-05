import { useId, useMemo } from 'react'
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

  consumeClick: () => boolean
  /**
   * The search text, held by the pane rather than here.
   *
   * The pane unmounts this panel when another tab is chosen, so a query kept in
   * local state disappeared the moment somebody looked at the tree.
   */
  query: string
  onQuery: (next: string) => void
}

export function Palette({
  kit,
  query,
  onQuery,
  onAdd,
  onDragStart,
  consumeClick,
}: PaletteProps): ReactNode {
  const idBase = useId()
  const groups = useMemo(() => groupKit(kit), [kit])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return groups
    return groups
      .map((g) => ({
        ...g,
        components: g.components.filter(
          // The type as well as the label. A document names components by type,
          // so somebody reading one and looking for `RadioGroup` in the palette
          // searched for the string the document uses and found nothing.
          (c) => c.label.toLowerCase().includes(q) || c.type.toLowerCase().includes(q),
        ),
      }))
      .filter((g) => g.components.length > 0)
  }, [groups, query])

  return (
    <section className="fs-palette">
      {/*
        The tab above says Components, and the panel is labelled by it. A
        heading here repeated the word directly under itself.
      */}
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

      {filtered.length === 0 ? (
        /*
         * Two different empty states. A kit with no components at all is a
         * broken kit, and telling its author that nothing matches the empty
         * search sends them looking at the search box.
         */
        <p className="fs-empty">
          {groups.length === 0
            ? 'This kit declares no components.'
            : 'No components match “' + query + '”.'}
        </p>
      ) : (
        filtered.map((group) => (
          <div key={group.group} className="fs-palette__group">
            {/*
             * The group's own name when the vocabulary does not know it.
             *
             * `groupKit` copies `component.group` through from the kit, so a
             * third-party kit naming a group this designer has never heard of
             * rendered an empty `<h3>` -- a heading with no text above a row of
             * components, which is the same third-party-kit case `Icon.tsx`
             * defends against by name in this package.
             */}
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
