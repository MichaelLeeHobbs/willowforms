import { useId, useState } from 'react'
import type { ReactNode } from 'react'
import type {
  ComponentNode,
  IconName,
  JsonValue,
  KeyScopes,
  Kit,
  Language,
  PropSchema,
  PropValue,
} from '@willowforms/core'
import { dataKeyOf, indexKit, jsonToString, keyScopesFor, optionValue } from '@willowforms/core'

import { ImageSource } from './ImageSource.js'
import { OptionsEditor } from './OptionsEditor.js'
import { Icon, ICON_NAMES } from '../Icon.js'
import { languagesOf } from '../language.js'
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
  const props = def?.props ?? []
  const main = props.filter((prop) => (prop.section ?? 'main') === 'main')
  const advanced = props.filter((prop) => prop.section === 'advanced')

  const scopes = keyScopesFor(api.document.root, node.key)

  return (
    <section className="fs-properties">
      <h2 className="fs-panel__heading">{def?.label ?? node.type}</h2>

      {}
      <KeyField value={node.key} onRename={(next) => api.renameKey(node.key, next)} />

      {/* A layout component submits nothing, so a data key there has no effect. */}
      {node.schema && (
        <DataKeyField
          key={node.key + ':dataKey'}
          nodeKey={node.key}
          value={node.dataKey ?? node.key}
          overridden={node.dataKey !== undefined}
          onCommit={(next) => api.setDataKey(node.key, next)}
        />
      )}

      <VisibilityRow
        key={node.key + ':renderWhen'}
        value={node.renderWhen}
        dataKeys={withoutOwn(scopes.form, node)}
        {...(scopes.row ? { rowDataKeys: withoutOwn(scopes.row, node) } : {})}
        onChange={(next) => api.setRenderWhen(node.key, next)}
      />

      {!def && <p className="fs-empty">Type {node.type} is not in the active kit.</p>}

      {/* `section: 'style'` props render on the Style tab, beside the CSS they compete with. */}
      <PropRows api={api} node={node} schemas={main} scopes={scopes} defaults={def?.defaultProps} />

      {advanced.length > 0 && (
        <details className="fs-advanced">
          <summary>Advanced</summary>
          <PropRows
            api={api}
            node={node}
            schemas={advanced}
            scopes={scopes}
            defaults={def?.defaultProps}
          />
        </details>
      )}
    </section>
  )
}

/**
 * Unlike the key, a data key may repeat: two fields behind opposite
 * `renderWhen` guards can write one value.
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
  onCommit: (next: string) => RenameResult
}): ReactNode {
  const idBase = useId()
  const [draft, setDraft] = useState(value)
  const [committed, setCommitted] = useState(value)
  const [error, setError] = useState('')

  if (value !== committed) {
    setCommitted(value)
    setDraft(value)
  }

  const commit = (): void => {
    const trimmed = draft.trim()
    if (trimmed !== draft) setDraft(trimmed)
    if (trimmed === value) return
    const result = onCommit(trimmed)
    if (!result.ok) {
      setError(result.reason)
      setDraft(value)
      return
    }
    setError('')
    setCommitted(trimmed)
  }

  return (
    <div className="fs-prop-row">
      <label htmlFor={idBase + '-fs-prop-datakey'}>Data key</label>
      <input
        id={idBase + '-fs-prop-datakey'}
        type="text"
        value={draft}
        placeholder={nodeKey}
        aria-invalid={error ? true : undefined}
        aria-describedby={
          error ? idBase + '-fs-prop-datakey-error' : idBase + '-fs-prop-datakey-hint'
        }
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
        <p id={idBase + '-fs-prop-datakey-error'} className="fs-prop-row__error" role="alert">
          {error}
        </p>
      )}
      <p id={idBase + '-fs-prop-datakey-hint'} className="fs-prop-row__hint">
        {overridden
          ? 'Submitted as ' + value + ' rather than ' + nodeKey + '.'
          : 'The name this answer takes in submitted data. Defaults to the key.'}
      </p>
    </div>
  )
}

/**
 * Committed on blur or Enter, not per keystroke: each rename is an undo entry,
 * and the store refuses the empty key a cleared field passes through.
 */
function KeyField({
  value,
  onRename,
}: {
  value: string
  onRename: (next: string) => RenameResult
}): ReactNode {
  const idBase = useId()
  const [draft, setDraft] = useState(value)
  const [committed, setCommitted] = useState(value)
  const [error, setError] = useState('')

  if (value !== committed) {
    setCommitted(value)
    setDraft(value)
    setError('')
  }

  const commit = (): void => {
    const trimmed = draft.trim()
    if (trimmed !== draft) setDraft(trimmed)
    if (trimmed === value) return
    const result = onRename(trimmed)
    if (result.ok) {
      setCommitted(trimmed)
      setError('')
      return
    }
    setError(result.reason)
    setDraft(value)
  }

  return (
    <div className="fs-prop-row">
      <label htmlFor={idBase + '-fs-prop-key'}>Key</label>
      <input
        id={idBase + '-fs-prop-key'}
        type="text"
        value={draft}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? idBase + '-fs-prop-key-error' : undefined}
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
        <p id={idBase + '-fs-prop-key-error'} className="fs-prop-row__error" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}

/**
 * When a component is shown.
 *
 * Always stores nothing, which is what an absent `renderWhen` means, and Never stores
 * static false. There is no translated mode, because a translation key is not a
 * condition.
 *
 * A component cannot test its own field. Hiding a component when its own value is empty
 * hides the only control that could fill it, which reads as the form being broken.
 */
function VisibilityRow({
  value,
  dataKeys,
  rowDataKeys,
  onChange,
}: {
  value: PropValue | undefined
  dataKeys: string[]
  rowDataKeys?: string[] | undefined
  onChange: (next: PropValue | undefined) => void
}): ReactNode {
  const idBase = useId()
  // Seeded on the row, as in `seedProps`.
  const inRow = rowDataKeys?.[0]
  const testable = (rowDataKeys?.length ?? 0) + dataKeys.length
  /*
   * A translation key or static truthy `renderWhen` behaves as Always but gets
   * its own option: shown as Always, choosing Always would fire no change and
   * the stray value could not be cleared.
   */
  const stray =
    value !== undefined &&
    value.kind !== 'computed' &&
    value.kind !== 'condition' &&
    !(value.kind === 'static' && !value.value)

  const mode = stray
    ? 'other'
    : value?.kind === 'computed'
      ? 'computed'
      : value?.kind === 'condition'
        ? 'condition'
        : value?.kind === 'static' && !value.value
          ? 'never'
          : 'always'

  return (
    <div className={'fs-prop-row' + (value ? ' is-set is-binding' : '')}>
      <label htmlFor={idBase + '-fs-prop-renderwhen-mode'}>Show when</label>
      <div className="fs-prop-row__control">
        <select
          id={idBase + '-fs-prop-renderwhen-mode'}
          className="fs-binding__mode"
          value={mode}
          onChange={(e) => {
            const chosen = e.target.value
            if (chosen === 'always') return onChange(undefined)
            if (chosen === 'never') return onChange({ kind: 'static', value: false })
            if (chosen === 'computed') return onChange({ kind: 'computed', expression: '' })
            if (chosen !== 'condition') return

            if (inRow !== undefined) {
              return onChange({ kind: 'condition', condition: emptyCondition(inRow, 'row') })
            }
            const first = dataKeys[0]
            if (first) onChange({ kind: 'condition', condition: emptyCondition(first) })
          }}
        >
          <option value="always">Always</option>
          <option value="never">Never</option>
          {stray && <option value="other">Always (unrecognised rule)</option>}
          {/* A condition naming no field is false and would hide the component for good. */}
          <option value="condition" disabled={testable === 0}>
            A condition
          </option>
          <option value="computed">An expression</option>
        </select>

        {value?.kind === 'condition' && (
          <ConditionEditor
            id={idBase + '-fs-prop-renderwhen'}
            value={value.condition}
            dataKeys={dataKeys}
            rowDataKeys={rowDataKeys}
            onChange={(condition) => onChange({ kind: 'condition', condition })}
          />
        )}

        {value?.kind === 'computed' && (
          <ComputedEditor
            id={idBase + '-fs-prop-renderwhen'}
            label="Show when"
            value={value}
            onChange={onChange}
          />
        )}
      </div>

      {testable === 0 && (
        <p className="fs-prop-row__hint">
          No other component holds data yet, so there is nothing to test against.
        </p>
      )}
    </div>
  )
}

export function PropRows({
  api,
  node,
  schemas,
  scopes,
  defaults,
}: {
  api: DesignerApi
  node: ComponentNode
  schemas: PropSchema[]
  scopes: KeyScopes
  defaults?: Record<string, JsonValue> | undefined
}): ReactNode {
  // Not `withoutOwn`: disabling a component on its own value is a real need.
  const dataKeys = scopes.form

  return (
    <>
      {schemas.map((schema) => (
        <PropRow
          // Keyed by component too, or an uncontrolled editor carries one
          // component's value onto another of the same type.
          key={node.key + ':' + schema.name}
          schema={schema}
          value={node.props[schema.name]}
          defaultValue={defaults?.[schema.name]}
          componentKey={node.key}
          dataKeys={dataKeys}
          {...(scopes.row ? { rowDataKeys: scopes.row } : {})}

          languages={languagesOf(api.document)}
          defaultLanguage={api.document.defaultLanguage}
          translations={api.document.translations}
          onChange={(next) => api.setProp(node.key, schema.name, next)}
          onTranslate={api.setTranslation}
        />
      ))}
    </>
  )
}

/**
 * A component cannot test its own field: hiding it on its own emptiness removes
 * the control that fills it. Only filtered when the node has a field, because
 * `dataKeyOf` falls back to the node key, which a container may share.
 */
function withoutOwn(keys: string[], node: ComponentNode): string[] {
  return node.schema ? keys.filter((key) => key !== dataKeyOf(node)) : keys
}

/**
 * The row wins: a form-scope seed inside a row names a key the top level does
 * not hold, so the new condition is false at once.
 */
function seedProps(
  dataKeys: string[],
  rowDataKeys: string[] | undefined,
): { firstDataKey: string; firstDataKeyScope?: 'form' | 'row' } | undefined {
  const inRow = rowDataKeys?.[0]
  if (inRow !== undefined) return { firstDataKey: inRow, firstDataKeyScope: 'row' }
  const first = dataKeys[0]
  return first === undefined ? undefined : { firstDataKey: first }
}

interface PropRowProps {
  schema: PropSchema
  value: PropValue | undefined
  defaultValue: JsonValue | undefined
  componentKey: string
  /** Form-scope data keys, so a condition can only name a real field. */
  dataKeys: string[]
  rowDataKeys?: string[] | undefined
  languages: Language[]
  defaultLanguage: string
  translations: Record<string, Record<string, string>>
  onChange: (value: PropValue | undefined) => void
  onTranslate: (language: string, key: string, text: string) => void
}

function PropRow({
  schema,
  value,
  defaultValue,
  componentKey,
  dataKeys,
  rowDataKeys,
  languages,
  defaultLanguage,
  translations,
  onChange,
  onTranslate,
}: PropRowProps): ReactNode {
  const idBase = useId()
  const id = idBase + '-fs-prop-' + schema.name
  const isSet = value !== undefined
  const set = (v: JsonValue): void => onChange({ kind: 'static', value: v })

  const mode = (
    <BindingMode
      id={id + '-mode'}
      schema={schema}
      value={value}
      componentKey={componentKey}
      {...(seedProps(dataKeys, rowDataKeys) ?? {})}
      onChange={onChange}
    />
  )

  if (value?.kind === 'computed') {
    return (
      <div className="fs-prop-row is-set is-binding">
        <label htmlFor={id}>{schema.label}</label>
        <div className="fs-prop-row__control">
          {mode}
          <ComputedEditor id={id} label={schema.label} value={value} onChange={onChange} />
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
        {/* Not a label: the condition editor's controls carry their own. */}
        <span className="fs-prop-row__caption">{schema.label}</span>
        <div className="fs-prop-row__control">
          {mode}
          <ConditionEditor
            id={id}
            value={value.condition}
            dataKeys={dataKeys}
            rowDataKeys={rowDataKeys}
            onChange={(condition) => onChange({ kind: 'condition', condition })}
          />
        </div>
        <ClearButton label={schema.label} onClear={() => onChange(undefined)} />
      </div>
    )
  }

  const raw = value?.kind === 'static' ? value.value : defaultValue

  return (
    <div
      className={
        'fs-prop-row' +
        (isSet ? ' is-set' : '') +
        (schema.editor === 'options' || schema.editor === 'image' ? ' fs-prop-row--wide' : '')
      }
    >
      <label htmlFor={id}>
        {schema.label}
        {isSet && (
          <>
            {/* ARIA prohibits aria-label on a span with no role, so the word is hidden text. */}
            <span className="fs-prop-row__dot" aria-hidden="true" />
            <span className="fs-visually-hidden"> (modified)</span>
          </>
        )}
      </label>

      <div className="fs-prop-row__control">
        {mode}

        {schema.editor === 'multiline' ? (
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
              // `Number('1e999')` is Infinity and `Number('-')` is NaN, and
              // neither is JSON, so both clear the property.
              e.target.value === '' || !Number.isFinite(Number(e.target.value))
                ? onChange(undefined)
                : set(Number(e.target.value))
            }
          />
        ) : schema.editor === 'select' ? (
          <select
            id={id}

            value={jsonToString(raw)}
            onChange={(e) =>
              e.target.value === ''
                ? onChange(undefined)
                : // The options, not their values: `optionValue` reads `value` off each.
                  set(optionValue(schema.options ?? [], e.target.value))
            }
          >
            <option value="">(default)</option>
            {schema.options?.map((o) => (
              <option key={jsonToString(o.value)} value={jsonToString(o.value)}>
                {o.label}
              </option>
            ))}
          </select>
        ) : schema.editor === 'image' ? (
          <ImageSource id={id} value={typeof raw === 'string' ? raw : ''} onChange={set} />
        ) : schema.editor === 'options' ? (
          <OptionsEditor id={id} value={raw} onChange={set} />
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

        {...(error ? { 'aria-describedby': id + '-error' } : {})}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          const text = draft.trim()
          if (!text) {
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
        <p id={id + '-error'} className="fs-prop-row__error" role="alert">
          {error}
        </p>
      )}
    </>
  )
}

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
 * Deliberately plain: no highlighting or language service in a 288px pane. The
 * line count shows how much of the short box is scrolled out of sight.
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
