import { useState } from 'react'
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
} from '@formsmith/core'
import { dataKeyOf, indexKit, jsonToString, keyScopesFor, optionValue } from '@formsmith/core'

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

  /*
   * Every data key a condition on this node may name, split by where it lives.
   * Taken from the tree rather than the kit, because a data key is a property of
   * the document and may have been renamed away from its node key.
   *
   * `form` and `row` are separate lists because the same name can be two
   * different answers, and a ref that names the wrong one fails silently. Core
   * owns the split — the panel only draws it.
   */
  const scopes = keyScopesFor(api.document.root, node.key)

  return (
    <section className="fs-properties">
      <h2 className="fs-panel__heading">{def?.label ?? node.type}</h2>

      {}
      <KeyField value={node.key} onRename={(next) => api.renameKey(node.key, next)} />

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
        /*
         * A component cannot test its own field, because hiding it on its own
         * emptiness removes the control that would fill it. Only a component
         * that has a field, though: `dataKeyOf` falls back to the node key, so
         * filtering unconditionally hid a real field from a container that
         * happened to share its name.
         */
        dataKeys={withoutOwn(scopes.form, node)}
        {...(scopes.row ? { rowDataKeys: withoutOwn(scopes.row, node) } : {})}
        onChange={(next) => api.setRenderWhen(node.key, next)}
      />

      {!def && <p className="fs-empty">Type {node.type} is not in the active kit.</p>}

      {/*
       * `section` routes a property to where it belongs. `style` is not here at
       * all: it lives on the Style tab, beside the CSS it competes with, so an
       * author choosing between a Stack's gap and a hand-written margin sees
       * both at once.
       */}
      <PropRows api={api} node={node} schemas={main} scopes={scopes} />

      {advanced.length > 0 && (
        <details className="fs-advanced">
          <summary>Advanced</summary>
          <PropRows api={api} node={node} schemas={advanced} scopes={scopes} />
        </details>
      )}
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
  onCommit: (next: string) => RenameResult
}): ReactNode {
  const [draft, setDraft] = useState(value)
  const [committed, setCommitted] = useState(value)
  const [error, setError] = useState('')

  if (value !== committed) {
    setCommitted(value)
    setDraft(value)
  }

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
    /*
     * Refused rather than stored, and the reason shown, which is the bargain
     * `KeyField` below already makes. A data key is judged by the same grammar
     * as a key, and this field applied none of it.
     */
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
      <label htmlFor="fs-prop-datakey">Data key</label>
      <input
        id="fs-prop-datakey"
        type="text"
        value={draft}
        placeholder={nodeKey}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? 'fs-prop-datakey-error' : 'fs-prop-datakey-hint'}
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
        <p id="fs-prop-datakey-error" className="fs-prop-row__error" role="alert">
          {error}
        </p>
      )}
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
  rowDataKeys,
  onChange,
}: {
  value: PropValue | undefined
  dataKeys: string[]
  rowDataKeys?: string[] | undefined
  onChange: (next: PropValue | undefined) => void
}): ReactNode {
  /*
   * Inside a row, a fresh condition starts on the row. Seeded on the form it
   * would name a key the top level does not hold, so it would be false from the
   * moment it was created and would hide the component it was authored on.
   */
  const inRow = rowDataKeys?.[0]
  const testable = (rowDataKeys?.length ?? 0) + dataKeys.length
  /*
   * `renderWhen` is a `PropValue`, so a hand-edited document can hold a static
   * boolean or a translation key as well as the two this row authors. Reading
   * anything truthy as "a condition" left the select saying so while rendering
   * no editor, which made those documents unfixable from the panel.
   *
   * A static false is the one that means something on its own: never shown.
   * `isVisible` treats a static truthy and a translation key alike as no
   * condition expressed, so both read as Always, which is what they do.
   */
  /*
   * A `renderWhen` this row cannot author -- a translation key, or a static
   * `true` -- reads as Always, because that is what it does. Naming it Always in
   * the select made it unremovable: the select already showed Always, so
   * choosing Always fired no change, and the stray value sat in the document
   * with no way to clear it from the panel that displays it.
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
      <label htmlFor="fs-prop-renderwhen-mode">Show when</label>
      <div className="fs-prop-row__control">
        <select
          id="fs-prop-renderwhen-mode"
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
          {stray && (
            // Only when the document holds one. Choosing anything else replaces
            // it, which is the point: the row can now let go of it.
            <option value="other">Always (unrecognised rule)</option>
          )}
          {/*
            Disabled when there is nothing to test. A condition naming no field
            evaluates to false, so choosing it would hide the component
            immediately and offer no field that could bring it back.
          */}
          <option value="condition" disabled={testable === 0}>
            A condition
          </option>
          <option value="computed">An expression</option>
        </select>

        {value?.kind === 'condition' && (
          <ConditionEditor
            id="fs-prop-renderwhen"
            value={value.condition}
            dataKeys={dataKeys}
            rowDataKeys={rowDataKeys}
            onChange={(condition) => onChange({ kind: 'condition', condition })}
          />
        )}

        {value?.kind === 'computed' && (
          <ComputedEditor
            id="fs-prop-renderwhen"
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

/**
 * The rows for a set of property schemas.
 *
 * Shared, because the Style tab renders the same rows for the properties whose
 * section says they are styling. Two copies would drift on the binding modes,
 * the modified marker, and the row layout, all of which took several goes.
 */
export function PropRows({
  api,
  node,
  schemas,
  scopes,
}: {
  api: DesignerApi
  node: ComponentNode
  schemas: PropSchema[]
  scopes: KeyScopes
}): ReactNode {
  /*
   * Unlike `renderWhen`, a property may test its own field: hiding a component
   * on its own emptiness removes the control that would fill it, but disabling
   * one on its own value is a real thing to want.
   */
  const dataKeys = scopes.form

  return (
    <>
      {schemas.map((schema) => (
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
 * A list without the component's own answer.
 *
 * A component cannot test its own field: hiding it when its own value is empty
 * removes the only control that could fill it. Only where there is a field to
 * exclude, though — `dataKeyOf` falls back to the node key, so filtering
 * unconditionally hid a real field from a container that happened to share its
 * name.
 */
function withoutOwn(keys: string[], node: ComponentNode): string[] {
  return node.schema ? keys.filter((key) => key !== dataKeyOf(node)) : keys
}

/**
 * The field a fresh condition starts on, and the scope that goes with it.
 *
 * The row wins wherever there is one. A seed at form scope inside a row names a
 * key the top level does not hold, so the condition is false from the moment it
 * exists and hides the component it was authored on.
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
  componentKey: string
  /** Every data key in the document, so a condition can only name a real field. */
  dataKeys: string[]
  /** The enclosing row's data keys, when this component sits inside a row. */
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
  componentKey,
  dataKeys,
  rowDataKeys,
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
      {...(seedProps(dataKeys, rowDataKeys) ?? {})}
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
        {/*
         * A caption, not a label. It pointed at the operator select inside the
         * condition editor, which already has a hidden label of its own -- so
         * that select announced itself as "Helper text Comparison", two labels
         * concatenated, and the row's own name pointed at a control three levels
         * down that it does not describe.
         */}
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

      <div className="fs-prop-row__control">
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
              /*
               * A number, or nothing. `Number('1e999')` is `Infinity` and
               * `Number('-')` is `NaN`, and neither is JSON -- so the document
               * held a value `JSON.stringify` writes as `null` and the export
               * and the payload disagreed about what the author typed. The
               * Rules tab's own number field already refuses both.
               */
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
                : /*
                   * The declared options, not their values.
                   *
                   * `optionValue` reads `option['value']` off each entry, so
                   * `.map((o) => o.value)` unwrapped them before it could: the
                   * declared-value pass matched nothing, the position pass
                   * matched nothing, and the raw string fell out of the end. The
                   * comment above this editor described the fix; the argument
                   * stopped it happening.
                   */
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

        {...(error ? { 'aria-describedby': id + '-error' } : {})}
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
