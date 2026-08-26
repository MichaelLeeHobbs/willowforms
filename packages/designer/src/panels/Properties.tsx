import { useState } from 'react'
import type { ReactNode } from 'react'
import type { JsonValue, Kit, Language, PropSchema, PropValue } from '@formsmith/core'
import { indexKit, jsonToString } from '@formsmith/core'

import { BindingMode, ComputedEditor, TranslationEditor } from './Binding.js'
import type { DesignerApi, RenameResult } from '../store.js'

export interface PropertiesProps {
  api: DesignerApi
  kit: Kit
}

export function Properties({ api, kit }: PropertiesProps): ReactNode {
  const node = api.selectedNode

  if (!node) {
    return (
      <section className="fs-properties">
        <p className="fs-empty">Select a component on the canvas to edit its properties.</p>
      </section>
    )
  }

  const def = indexKit(kit).get(node.type)

  return (
    <section className="fs-properties">
      <h2 className="fs-panel__heading">{def?.label ?? node.type}</h2>

      <KeyField
        key={node.key}
        value={node.key}
        onRename={(next) => api.renameKey(node.key, next)}
      />

      {/*
       * Only where there is a value to name. A layout component submits
       * nothing, so a data key on one would be a control with no effect.
       */}
      {node.schema && (
        <DataKeyField
          key={node.key + ':dataKey'}
          nodeKey={node.key}
          value={node.dataKey ?? node.key}
          overridden={node.dataKey !== undefined}
          onCommit={(next) => api.setDataKey(node.key, next)}
        />
      )}

      {!def && <p className="fs-empty">Type {node.type} is not in the active kit.</p>}

      {def?.props.map((schema) => (
        <PropRow
          // Keyed by component as well as property. Keyed by property alone,
          // two components of the same type shared one instance, so an
          // uncontrolled editor kept the previous component's value and could
          // write it onto the new one.
          key={node.key + ':' + schema.name}
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

/**
 * The name the component's value is submitted under.
 *
 * Separate from the key because the two answer different questions: the key is
 * identity and has to be unique, while this is what the payload calls the
 * answer and is allowed to repeat. Two fields behind opposite `renderWhen`
 * guards writing one value is the case that needs it.
 *
 * Clearing it, or typing the component's own key, removes the override rather
 * than storing a second copy of the key that then has to be kept in step.
 */
function DataKeyField({
  nodeKey,
  value,
  overridden,
  onCommit,
}: {
  nodeKey: string
  value: string
  overridden: boolean
  onCommit: (next: string) => void
}): ReactNode {
  const [draft, setDraft] = useState(value)

  const commit = (): void => {
    /*
     * Normalised first, then compared. Comparing the trimmed draft while
     * leaving the field untrimmed meant typing " email " over `email` stored
     * nothing and displayed the padded string, so the panel showed a value the
     * document did not have.
     */
    const trimmed = draft.trim()
    if (trimmed !== draft) setDraft(trimmed)
    if (trimmed === value) return
    onCommit(trimmed)
  }

  return (
    <div className="fs-prop-row">
      <label htmlFor="fs-prop-datakey">Data key</label>
      <input
        id="fs-prop-datakey"
        type="text"
        value={draft}
        placeholder={nodeKey}
        aria-describedby="fs-prop-datakey-hint"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            commit()
          }
          if (e.key === 'Escape') setDraft(value)
        }}
      />
      <p id="fs-prop-datakey-hint" className="fs-prop-row__hint">
        {overridden
          ? 'Submitted as ' + value + ' rather than ' + nodeKey + '.'
          : 'The name this answer takes in submitted data. Defaults to the key.'}
      </p>
    </div>
  )
}

/**
 * The component key, committed on blur or Enter rather than on every keystroke.
 *
 * Renaming per character made every intermediate prefix a real document key with
 * its own undo entry, and made the field impossible to clear: the store refuses
 * an empty key, so the controlled input snapped straight back and you could
 * never backspace far enough to retype. A refusal now says why instead of
 * silently reverting.
 */
function KeyField({
  value,
  onRename,
}: {
  value: string
  onRename: (next: string) => RenameResult
}): ReactNode {
  const [draft, setDraft] = useState(value)
  const [error, setError] = useState('')

  const commit = (): void => {
    if (draft === value) return
    const result = onRename(draft)
    if (result.ok) {
      setError('')
      return
    }
    setError(result.reason)
    setDraft(value)
  }

  return (
    <div className="fs-prop-row">
      <label htmlFor="fs-prop-key">Key</label>
      <input
        id="fs-prop-key"
        type="text"
        value={draft}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? 'fs-prop-key-error' : undefined}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            commit()
          }
          if (e.key === 'Escape') {
            setDraft(value)
            setError('')
          }
        }}
      />
      {error && (
        <p id="fs-prop-key-error" className="fs-prop-row__error" role="alert">
          {error}
        </p>
      )}
    </div>
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

      {schema.editor === 'multiline' ? (
        /*
         * Declared in `PropEditor` from the first commit and never implemented,
         * so a kit asking for it got the single-line fallback and no warning.
         * Found by writing the specification down and checking it.
         */
        <textarea
          id={id}
          rows={3}
          value={typeof raw === 'string' ? raw : ''}
          onChange={(e) => set(e.target.value)}
        />
      ) : schema.editor === 'boolean' ? (
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
        <JsonEditor id={id} value={raw} onChange={set} onClear={() => onChange(undefined)} />
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

/**
 * A JSON property, committed on blur when it parses.
 *
 * Controlled rather than uncontrolled: reading the value once at mount meant the
 * textarea showed whatever was there before, so undo, an applied JSON import,
 * and switching between two components of the same type all left stale text on
 * screen that a blur would then write back.
 */
function JsonEditor({
  id,
  value,
  onChange,
  onClear,
}: {
  id: string
  value: JsonValue | undefined
  onChange: (value: JsonValue) => void
  onClear: () => void
}): ReactNode {
  const serialised = value === undefined ? '' : JSON.stringify(value, null, 2)
  const [draft, setDraft] = useState(serialised)
  const [committed, setCommitted] = useState(serialised)
  const [error, setError] = useState('')

  // Re-sync when the document changes underneath, without losing an in-progress
  // edit: only the version this editor last saw is replaced.
  if (serialised !== committed) {
    setCommitted(serialised)
    setDraft(serialised)
    if (error) setError('')
  }

  return (
    <>
      <textarea
        id={id}
        rows={4}
        spellCheck={false}
        value={draft}
        aria-invalid={error ? true : undefined}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          const text = draft.trim()
          if (!text) {
            // Clearing the box clears the property, rather than doing nothing.
            setError('')
            onClear()
            return
          }
          try {
            onChange(JSON.parse(text) as JsonValue)
            setError('')
          } catch (problem) {
            setError(problem instanceof Error ? problem.message : 'That is not valid JSON.')
          }
        }}
      />
      {error && (
        <p className="fs-prop-row__error" role="alert">
          {error}
        </p>
      )}
    </>
  )
}
