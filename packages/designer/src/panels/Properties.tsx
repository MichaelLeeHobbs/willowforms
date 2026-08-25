import type { ReactNode } from 'react'
import type { JsonValue, Kit, Language, PropSchema, PropValue } from '@formsmith/core'
import { indexKit, jsonToString } from '@formsmith/core'

import { BindingMode, ComputedEditor, TranslationEditor } from './Binding.js'
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
          componentKey={node.key}
          languages={api.document.languages}
          defaultLanguage={api.document.defaultLanguage}
          translations={api.document.translations}
          onChange={(next) => api.setProp(node.key, schema.name, next)}
          onTranslate={api.setTranslation}
        />
      ))}
    </section>
  )
}

interface PropRowProps {
  schema: PropSchema
  value: PropValue | undefined
  componentKey: string
  languages: Language[]
  defaultLanguage: string
  translations: Record<string, Record<string, string>>
  onChange: (value: PropValue | undefined) => void
  onTranslate: (language: string, key: string, text: string) => void
}

function PropRow({
  schema,
  value,
  componentKey,
  languages,
  defaultLanguage,
  translations,
  onChange,
  onTranslate,
}: PropRowProps): ReactNode {
  const id = 'fs-prop-' + schema.name
  const isSet = value !== undefined
  const set = (v: JsonValue): void => onChange({ kind: 'static', value: v })

  const mode = (
    <BindingMode
      id={id + '-mode'}
      schema={schema}
      value={value}
      componentKey={componentKey}
      onChange={onChange}
    />
  )

  // A binding is not text, so it gets its own editor rather than a box that
  // would silently flatten it back to a string.
  if (value?.kind === 'computed') {
    return (
      <div className="fs-prop-row is-set is-binding">
        <label htmlFor={id}>{schema.label}</label>
        {mode}
        <ComputedEditor id={id} value={value} onChange={onChange} />
        <ClearButton label={schema.label} onClear={() => onChange(undefined)} />
      </div>
    )
  }

  if (value?.kind === 'i18n') {
    return (
      <div className="fs-prop-row is-set is-binding">
        <label htmlFor={id}>{schema.label}</label>
        {mode}
        <TranslationEditor
          id={id}
          value={value}
          languages={languages}
          defaultLanguage={defaultLanguage}
          translations={translations}
          onChange={onChange}
          onTranslate={onTranslate}
        />
        <ClearButton label={schema.label} onClear={() => onChange(undefined)} />
      </div>
    )
  }

  const raw = value?.value

  return (
    <div className={'fs-prop-row' + (isSet ? ' is-set' : '')}>
      <label htmlFor={id}>
        {schema.label}
        {isSet && (
          <>
            {/*
              A bare span has no role, and ARIA prohibits aria-label there, so a
              screen reader ignored it entirely: the marker looked handled and
              announced nothing. The dot is decoration; the word is the message,
              and it reads as part of the label.
            */}
            <span className="fs-prop-row__dot" aria-hidden="true" />
            <span className="fs-visually-hidden"> (modified)</span>
          </>
        )}
      </label>
      {mode}

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
