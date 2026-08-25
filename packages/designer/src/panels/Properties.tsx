import type { ReactNode } from 'react'
import type { JsonValue, Kit, PropSchema, PropValue } from '@formsmith/core'
import { indexKit, jsonToString } from '@formsmith/core'

import type { DesignerApi } from '../store.js'

export interface PropertiesProps {
  api: DesignerApi
  kit: Kit
}

export function Properties({ api, kit }: PropertiesProps): ReactNode {
  const node = api.selectedNode

  if (!node) {
    return (
      <section className="fs-properties">
        <h2 className="fs-panel__heading">Properties</h2>
        <p className="fs-empty">Select a component on the canvas to edit its properties.</p>
      </section>
    )
  }

  const def = indexKit(kit).get(node.type)

  return (
    <section className="fs-properties">
      <h2 className="fs-panel__heading">{def?.label ?? node.type}</h2>

      <div className="fs-prop-row">
        <label htmlFor="fs-prop-key">Key</label>
        <input
          id="fs-prop-key"
          type="text"
          value={node.key}
          onChange={(e) => api.renameKey(node.key, e.target.value)}
        />
      </div>

      {!def && <p className="fs-empty">Type {node.type} is not in the active kit.</p>}

      {def?.props.map((schema) => (
        <PropRow
          key={schema.name}
          schema={schema}
          value={node.props[schema.name]}
          onChange={(next) => api.setProp(node.key, schema.name, next)}
        />
      ))}
    </section>
  )
}

interface PropRowProps {
  schema: PropSchema
  value: PropValue | undefined
  onChange: (value: PropValue | undefined) => void
}

function PropRow({ schema, value, onChange }: PropRowProps): ReactNode {
  const id = 'fs-prop-' + schema.name
  const isSet = value !== undefined
  const set = (v: JsonValue): void => onChange({ kind: 'static', value: v })

  // Bindings need their own editor; showing a text box would silently flatten them.
  if (value && value.kind !== 'static') {
    return (
      <div className="fs-prop-row">
        <label htmlFor={id}>{schema.label}</label>
        <output id={id} className="fs-prop-binding">
          {value.kind === 'computed' ? 'Computed expression' : 'Translation: ' + value.key}
        </output>
        <ClearButton label={schema.label} onClear={() => onChange(undefined)} />
      </div>
    )
  }

  const raw = value?.value

  return (
    <div className={'fs-prop-row' + (isSet ? ' is-set' : '')}>
      <label htmlFor={id}>
        {schema.label}
        {isSet && <span className="fs-prop-row__dot" aria-label="Modified" />}
      </label>

      {schema.editor === 'boolean' ? (
        <input
          id={id}
          type="checkbox"
          checked={raw === true}
          onChange={(e) => set(e.target.checked)}
        />
      ) : schema.editor === 'number' ? (
        <input
          id={id}
          type="number"
          value={typeof raw === 'number' ? raw : ''}
          onChange={(e) =>
            e.target.value === '' ? onChange(undefined) : set(Number(e.target.value))
          }
        />
      ) : schema.editor === 'select' ? (
        <select
          id={id}
          value={typeof raw === 'string' ? raw : ''}
          onChange={(e) => set(e.target.value)}
        >
          <option value="">(default)</option>
          {schema.options?.map((o) => (
            <option key={jsonToString(o.value)} value={jsonToString(o.value)}>
              {o.label}
            </option>
          ))}
        </select>
      ) : schema.editor === 'json' ? (
        <JsonEditor id={id} value={raw} onChange={set} />
      ) : (
        <input
          id={id}
          type="text"
          value={typeof raw === 'string' ? raw : ''}
          onChange={(e) => set(e.target.value)}
        />
      )}

      {isSet && <ClearButton label={schema.label} onClear={() => onChange(undefined)} />}
      {schema.hint && <p className="fs-prop-row__hint">{schema.hint}</p>}
    </div>
  )
}

function ClearButton({ label, onClear }: { label: string; onClear: () => void }): ReactNode {
  return (
    <button
      type="button"
      className="fs-prop-row__clear"
      aria-label={'Reset ' + label}
      onClick={onClear}
    >
      Reset
    </button>
  )
}

/** Only commits when the text parses, so a half-typed object cannot corrupt the document. */
function JsonEditor({
  id,
  value,
  onChange,
}: {
  id: string
  value: JsonValue | undefined
  onChange: (value: JsonValue) => void
}): ReactNode {
  return (
    <textarea
      id={id}
      rows={4}
      defaultValue={value === undefined ? '' : JSON.stringify(value, null, 2)}
      onBlur={(e) => {
        const text = e.target.value.trim()
        if (!text) return
        try {
          onChange(JSON.parse(text) as JsonValue)
          e.target.setCustomValidity('')
        } catch {
          e.target.setCustomValidity('Invalid JSON')
          e.target.reportValidity()
        }
      }}
    />
  )
}
