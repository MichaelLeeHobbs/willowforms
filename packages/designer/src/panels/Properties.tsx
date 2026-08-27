import { useState } from 'react'
import type { ReactNode } from 'react'
import type { IconName, JsonValue, Kit, Language, PropSchema, PropValue } from '@formsmith/core'
import { dataKeyOf, flatten, indexKit, jsonToString } from '@formsmith/core'

import { Icon, ICON_NAMES } from '../Icon.js'
import { BindingMode, ComputedEditor, TranslationEditor } from './Binding.js'
import { ConditionEditor, emptyCondition } from './ConditionEditor.js'
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

  /*
   * Every data key in the document, so a condition can only name a field that
   * exists. Taken from the tree rather than the kit, because a data key is a
   * property of the document and may have been renamed away from its node key.
   */
  const dataKeys = flatten(api.document.root)
    .filter((row) => row.node.schema)
    .map((row) => dataKeyOf(row.node))

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

      {/*
       * Visibility is a property of the node rather than an entry in `props`,
       * so it gets its own row rather than coming from the kit's schema. It was
       * authorable only by editing the document JSON until the condition
       * vocabulary existed to give it a picker.
       */}
      <VisibilityRow
        key={node.key + ':renderWhen'}
        value={node.renderWhen}
        dataKeys={dataKeys.filter((key) => key !== dataKeyOf(node))}
        onChange={(next) => api.setRenderWhen(node.key, next)}
      />

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
          dataKeys={dataKeys}
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

/**
 * When a component is shown.
 *
 * Three modes rather than the usual four: a condition, an expression for what a
 * condition cannot say, and nothing at all. There is no static or translated
 * mode, because "always show this unless it says false" is what an absent
 * `renderWhen` already means, and a translation key is not a condition.
 *
 * A component cannot test its own field. Hiding a component when its own value
 * is empty hides the only control that could fill it, which reads as the form
 * being broken.
 */
function VisibilityRow({
  value,
  dataKeys,
  onChange,
}: {
  value: PropValue | undefined
  dataKeys: string[]
  onChange: (next: PropValue | undefined) => void
}): ReactNode {
  const mode = value?.kind === 'computed' ? 'computed' : value ? 'condition' : 'always'

  return (
    <div className={'fs-prop-row' + (value ? ' is-set is-binding' : '')}>
      <label htmlFor="fs-prop-renderwhen-mode">Show when</label>
      <div className="fs-prop-row__control">
        <select
          id="fs-prop-renderwhen-mode"
          className="fs-binding__mode"
          value={mode}
          onChange={(e) => {
            if (e.target.value === 'always') return onChange(undefined)
            if (e.target.value === 'computed') return onChange({ kind: 'computed', expression: '' })
            onChange({ kind: 'condition', condition: emptyCondition(dataKeys[0] ?? '') })
          }}
        >
          <option value="always">Always</option>
          <option value="condition">A condition</option>
          <option value="computed">An expression</option>
        </select>

        {value?.kind === 'condition' && (
          <ConditionEditor
            id="fs-prop-renderwhen"
            value={value.condition}
            dataKeys={dataKeys}
            onChange={(condition) => onChange({ kind: 'condition', condition })}
          />
        )}

        {value?.kind === 'computed' && (
          <ComputedEditor id="fs-prop-renderwhen" value={value} onChange={onChange} />
        )}
      </div>

      {dataKeys.length === 0 && value?.kind === 'condition' && (
        <p className="fs-prop-row__hint">
          No other component holds data yet, so there is nothing to test against.
        </p>
      )}
    </div>
  )
}

interface PropRowProps {
  schema: PropSchema
  value: PropValue | undefined
  componentKey: string
  /** Every data key in the document, so a condition can only name a real field. */
  dataKeys: string[]
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
  dataKeys,
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
        <div className="fs-prop-row__control">
          {mode}
          <ComputedEditor id={id} value={value} onChange={onChange} />
        </div>
        <ClearButton label={schema.label} onClear={() => onChange(undefined)} />
      </div>
    )
  }

  if (value?.kind === 'i18n') {
    return (
      <div className="fs-prop-row is-set is-binding">
        <label htmlFor={id}>{schema.label}</label>
        <div className="fs-prop-row__control">
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
        </div>
        <ClearButton label={schema.label} onClear={() => onChange(undefined)} />
      </div>
    )
  }

  if (value?.kind === 'condition') {
    return (
      <div className="fs-prop-row is-set is-binding">
        <label htmlFor={id + '-op'}>{schema.label}</label>
        <div className="fs-prop-row__control">
          {mode}
          <ConditionEditor
            id={id}
            value={value.condition}
            dataKeys={dataKeys}
            onChange={(condition) => onChange({ kind: 'condition', condition })}
          />
        </div>
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

      {/*
        A checkbox is small enough to sit beside the mode picker. Everything
        else needs the width, so it goes underneath.
      */}
      <div
        className={
          'fs-prop-row__control' +
          (schema.editor === 'boolean' ? ' fs-prop-row__control--inline' : '')
        }
      >
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
        ) : schema.editor === 'color' ? (
          <ColorEditor id={id} value={typeof raw === 'string' ? raw : ''} onChange={set} />
        ) : schema.editor === 'icon' ? (
          <IconEditor id={id} value={typeof raw === 'string' ? raw : ''} onChange={set} />
        ) : schema.editor === 'code' ? (
          <CodeEditor id={id} value={typeof raw === 'string' ? raw : ''} onChange={set} />
        ) : (
          <input
            id={id}
            type="text"
            value={typeof raw === 'string' ? raw : ''}
            onChange={(e) => set(e.target.value)}
          />
        )}
      </div>

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

/**
 * A colour, as a swatch beside a text field.
 *
 * The text is the value and the swatch is a convenience, never the other way
 * round. `<input type="color">` can only hold `#rrggbb`, and the useful things
 * to write here are `var(--brand)`, `transparent`, and `rgb(0 0 0 / 40%)`. A
 * swatch that owned the value would quietly rewrite every one of them into the
 * nearest hex the moment it was touched.
 */
function ColorEditor({
  id,
  value,
  onChange,
}: {
  id: string
  value: string
  onChange: (next: string) => void
}): ReactNode {
  const hex = /^#[0-9a-fA-F]{6}$/.test(value) ? value : '#000000'
  return (
    <div className="fs-color">
      <input
        id={id}
        type="text"
        className="fs-color__text"
        placeholder="var(--brand), #336699, transparent"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <input
        type="color"
        className="fs-color__swatch"
        // Named, because it is a second control on the same row and the label
        // above belongs to the text field.
        aria-label={'Pick a colour'}
        value={hex}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  )
}

/**
 * A name from the icon vocabulary, with the glyph beside it.
 *
 * A select rather than a grid of swatches: there are thirty names, the pane is
 * 288px wide, and a name is what actually gets stored. The preview is there so
 * the author does not have to know what `paragraph` looks like.
 */
function IconEditor({
  id,
  value,
  onChange,
}: {
  id: string
  value: string
  onChange: (next: string) => void
}): ReactNode {
  const known = (ICON_NAMES as string[]).includes(value)
  return (
    <div className="fs-icon-picker">
      <span className="fs-icon-picker__preview" aria-hidden="true">
        {known ? <Icon name={value as IconName} /> : null}
      </span>
      <select id={id} value={known ? value : ''} onChange={(e) => onChange(e.target.value)}>
        <option value="">(none)</option>
        {ICON_NAMES.map((name) => (
          <option key={name} value={name}>
            {name}
          </option>
        ))}
      </select>
    </div>
  )
}

/**
 * Source, in a monospace box that counts its lines.
 *
 * No syntax highlighting and no language service. This is a property editor in
 * a 288px pane, not an IDE, and a half-working editor that lies about what it
 * understands is worse than a plain one. The line count is there because the
 * box is short and it is otherwise impossible to tell how much is scrolled out
 * of sight.
 */
function CodeEditor({
  id,
  value,
  onChange,
}: {
  id: string
  value: string
  onChange: (next: string) => void
}): ReactNode {
  const lines = value === '' ? 0 : value.split('\n').length
  return (
    <div className="fs-code">
      <textarea
        id={id}
        className="fs-code__area"
        rows={5}
        spellCheck={false}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <p className="fs-code__count">
        {lines} {lines === 1 ? 'line' : 'lines'}
      </p>
    </div>
  )
}
