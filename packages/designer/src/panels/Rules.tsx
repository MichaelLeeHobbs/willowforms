import { useId, useState } from 'react'
import type { ReactNode } from 'react'
import type { FieldSchema, ValidationKey, ValidationRule } from '@willowforms/core'
import { DEFAULT_MESSAGES, keyScopesFor, patternProblem } from '@willowforms/core'

import { languagesOf } from '../language.js'
import type { DesignerApi } from '../store.js'
import { TranslationEditor, translationKey } from './Binding.js'
import { ConditionEditor, emptyCondition } from './ConditionEditor.js'

/** What each rule needs from the author beyond a message. */
type Parameter = 'none' | 'number' | 'text' | 'expression' | 'field'

interface RuleDef {
  key: ValidationKey
  label: string
  parameter: Parameter
  /** Placeholder or hint for the parameter input. */
  hint?: string
}

const RULES: RuleDef[] = [
  { key: 'required', label: 'Required', parameter: 'none' },
  { key: 'minLength', label: 'Minimum length', parameter: 'number' },
  { key: 'maxLength', label: 'Maximum length', parameter: 'number' },
  { key: 'minItems', label: 'Minimum items', parameter: 'number' },
  { key: 'maxItems', label: 'Maximum items', parameter: 'number' },
  { key: 'min', label: 'Minimum', parameter: 'number' },
  { key: 'max', label: 'Maximum', parameter: 'number' },
  { key: 'matches', label: 'Matches field', parameter: 'field' },
  { key: 'after', label: 'After field', parameter: 'field' },
  { key: 'pattern', label: 'Pattern', parameter: 'text', hint: 'Regular expression' },
  { key: 'email', label: 'Email', parameter: 'none' },
  { key: 'url', label: 'URL', parameter: 'none' },
  { key: 'uuid', label: 'UUID', parameter: 'none' },
  {
    key: 'custom',
    label: 'Custom expression',
    parameter: 'expression',
    hint: 'JavaScript returning true when the value is valid',
  },
]

const BY_KEY = new Map(RULES.map((r) => [r.key, r]))

const FIELD_TYPES: FieldSchema['type'][] = [
  'string',
  'number',
  'boolean',
  'date',
  'array',
  'object',
  'file',
]

/** A rule of this kind, with a parameter the type demands. */
function makeRule(key: ValidationKey): ValidationRule {
  switch (key) {
    case 'minLength':
    case 'maxLength':
    case 'minItems':
    case 'maxItems':
    case 'min':
    case 'max':
      return { key, value: 0 }
    case 'pattern':
      return { key, value: '' }
    case 'matches':
    case 'after':
      return { key, field: '' }
    case 'custom':
      return { key, expression: '' }
    default:
      return { key }
  }
}

export interface RulesProps {
  api: DesignerApi
}

/**
 * Every rule key this panel knows how to draw a row for.
 *
 * Taken from `DEFAULT_MESSAGES`, which is core's own list and the one
 * `validateForm` answers `UNREADABLE_RULE` against. Two lists would agree until
 * somebody added a rule to one.
 */
const KNOWN_RULES: ReadonlySet<string> = new Set(Object.keys(DEFAULT_MESSAGES))

function usable(rule: unknown): rule is ValidationRule {
  if (!rule || typeof rule !== 'object' || Array.isArray(rule)) return false

  const shape = rule as { key?: unknown; value?: unknown }
  if (typeof shape.key !== 'string' || !KNOWN_RULES.has(shape.key)) return false

  // The only row that reads the value as text. The numeric rules coerce, and
  // the valueless ones never look.
  if (shape.key === 'pattern') return typeof shape.value === 'string'

  return true
}

export function Rules({ api }: RulesProps): ReactNode {
  const idBase = useId()
  const node = api.selectedNode

  if (!node) {
    return <p className="fs-empty">Select a component to edit its validation.</p>
  }

  const schema = node.schema

  if (!schema) {
    return (
      <div className="fs-rules">
        <p className="fs-empty">
          <strong>{node.key}</strong> holds no form data, so it has nothing to validate. Layout and
          display components never appear in submitted data.
        </p>
      </div>
    )
  }

  /*
   * Guarded, because a document is data. `validateDocument` refuses a schema
   * with non-array validations now, and nothing on the path from a paste to
   * this panel runs it — a pasted `"schema": {"type":"string"}` rendered fine
   * on the canvas and took the whole designer down the moment this tab opened.
   * The panel is where somebody goes to repair such a document.
   */

  const rules = (Array.isArray(schema.validations) ? schema.validations : []).filter(usable)
  const write = (next: Partial<FieldSchema>): void =>
    api.setFieldSchema(node.key, { ...schema, ...next })

  /*
   * Whether changing the data type would stop this component repeating.
   *
   * Core recognises a repeater from the node — `schema.type === 'array'` plus
   * children — so this select quietly decides whether a container draws its
   * subtree once or once per row. Changing it away from `array` stops the rows
   * being drawn and makes every row-scoped condition inside read nothing, and
   * the control gives no sign that it does anything but name a type.
   */
  const repeats = schema.type === 'array' && Array.isArray(node.children)
  const scopes = keyScopesFor(api.document.root, node.key)

  const used = new Set(rules.map((r) => r.key))
  // Every rule but `custom` is idempotent, so offering a second one is noise.
  const addable = RULES.filter((r) => r.key === 'custom' || !used.has(r.key))

  return (
    <div className="fs-rules">
      <div className="fs-prop-row">
        <label htmlFor={idBase + '-fs-field-type'}>Data type</label>
        <select
          id={idBase + '-fs-field-type'}
          value={schema.type}
          onChange={(e) => write({ type: e.target.value as FieldSchema['type'] })}
          aria-describedby={repeats ? idBase + '-fs-field-type-note' : undefined}
        >
          {FIELD_TYPES.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
        {repeats && (
          <p id={idBase + '-fs-field-type-note'} className="fs-prop-row__hint">
            This component repeats its contents once per row because it holds a list. Changing the
            type away from <code>array</code> stops that, and any condition inside that reads
            &ldquo;this row&rdquo; will read nothing.
          </p>
        )}
      </div>

      <div className="fs-prop-row">
        <label htmlFor={idBase + '-fs-auto-validate'}>Validate while typing</label>
        <input
          id={idBase + '-fs-auto-validate'}
          type="checkbox"
          checked={schema.autoValidate === true}
          onChange={(e) => write({ autoValidate: e.target.checked })}
        />
      </div>

      <h3 className="fs-rules__heading">
        Rules <span className="fs-rules__count">{rules.length}</span>
      </h3>

      {rules.length === 0 ? (
        <p className="fs-empty">No rules yet. This field accepts any value.</p>
      ) : (
        <ul className="fs-rules__list">
          {rules.map((rule, index) => (
            <RuleRow
              key={rule.key + ':' + String(index)}
              rule={rule}
              index={index}
              onChange={(next) =>
                write({ validations: rules.map((r, i) => (i === index ? next : r)) })
              }
              onRemove={() => write({ validations: rules.filter((_, i) => i !== index) })}
              dataKeys={scopes.form}
              rowDataKeys={scopes.row}
              nodeKey={node.key}
              languages={languagesOf(api.document)}
              defaultLanguage={api.document.defaultLanguage}
              translations={api.document.translations}
              onTranslate={api.setTranslation}
            />
          ))}
        </ul>
      )}

      {!used.has('required') && rules.length > 0 && (
        <p className="fs-rules__note">
          Without a <strong>Required</strong> rule this field stays valid while empty. Every other
          rule passes on an empty value.
        </p>
      )}

      <div className="fs-rules__add">
        <label className="fs-visually-hidden" htmlFor={idBase + '-fs-add-rule'}>
          Add a rule
        </label>
        <select
          id={idBase + '-fs-add-rule'}
          value=""
          onChange={(e) => {
            const key = e.target.value as ValidationKey
            if (!key) return
            if (key === 'matches' || key === 'after') {
              const rowField = scopes.row?.[0]
              const formField = scopes.form[0] ?? ''
              write({
                validations: [
                  ...rules,
                  rowField ? { key, field: rowField, scope: 'row' } : { key, field: formField },
                ],
              })
              return
            }
            write({ validations: [...rules, makeRule(key)] })
          }}
        >
          <option value="">Add a rule…</option>
          {addable.map((r) => (
            <option key={r.key} value={r.key}>
              {r.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  )
}

type NumericRule = Extract<
  ValidationRule,
  { key: 'minLength' | 'maxLength' | 'minItems' | 'maxItems' | 'min' | 'max' }
>

function isNumeric(rule: ValidationRule): rule is NumericRule {
  return (
    rule.key === 'minLength' ||
    rule.key === 'maxLength' ||
    rule.key === 'minItems' ||
    rule.key === 'maxItems' ||
    rule.key === 'min' ||
    rule.key === 'max'
  )
}

interface RuleRowProps {
  rule: ValidationRule
  index: number
  onChange: (rule: ValidationRule) => void
  onRemove: () => void
  dataKeys: string[]
  rowDataKeys?: string[] | undefined
  nodeKey: string
  languages: ReturnType<typeof languagesOf>
  defaultLanguage: string
  translations: Record<string, Record<string, string>>
  onTranslate: (language: string, key: string, text: string) => void
}

/**
 * A rule's numeric parameter, held as a draft and committed on blur.
 *
 * Written straight through, `Number('')` is `0`: backspacing the last digit of a
 * `minLength` set the rule to 0 -- a rule that passes everything, written by
 * somebody halfway through typing a different number. Refusing the empty string
 * instead is no better, because the input is controlled: the old value snaps
 * back and the box cannot be cleared to retype at all, which is the same trap
 * `KeyField` documents.
 *
 * So: type freely, commit on blur or Enter, revert on Escape, and an empty box
 * or an unreadable one commits nothing. The fourth editor in this repository
 * with this shape, and the last of them.
 */
function NumberField({
  id,
  value,
  onCommit,
}: {
  id: string
  value: number
  onCommit: (next: number) => void
}): ReactNode {
  const text = String(value)
  const [draft, setDraft] = useState(text)
  const [committed, setCommitted] = useState(text)

  // Re-sync when the document changes underneath: undo, redo, or a document
  // swapped in from the JSON dialog.
  if (text !== committed) {
    setCommitted(text)
    setDraft(text)
  }

  const commit = (): void => {
    const next = Number(draft)
    if (draft.trim() === '' || !Number.isFinite(next)) {
      setDraft(text)
      return
    }

    setCommitted(String(next))
    setDraft(String(next))
    onCommit(next)
  }

  return (
    <input
      id={id}
      type="number"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          commit()
        }
        if (e.key === 'Escape') setDraft(text)
      }}
    />
  )
}

function RuleRow({
  rule,
  index,
  onChange,
  onRemove,
  dataKeys,
  rowDataKeys,
  nodeKey,
  languages,
  defaultLanguage,
  translations,
  onTranslate,
}: RuleRowProps): ReactNode {
  const idBase = useId()
  const def = BY_KEY.get(rule.key)
  const id = idBase + '-fs-rule-' + String(index)
  const label = def?.label ?? rule.key

  return (
    <li className="fs-rule">
      <div className="fs-rule__head">
        <span className="fs-rule__name">{label}</span>
        <button
          type="button"
          className="fs-rule__remove"
          aria-label={'Remove ' + label}
          onClick={onRemove}
        >
          &times;
        </button>
      </div>

      {/*
        Narrowed on `rule.key`, the union's discriminant, rather than on the
        descriptor's `parameter`. TypeScript cannot connect the two, so spreading
        a rule narrowed only by the descriptor would let a string land in a
        numeric `value`.
      */}
      {isNumeric(rule) && (
        <div className="fs-prop-row">
          <label htmlFor={id + '-value'}>Value</label>
          <NumberField
            id={id + '-value'}
            value={rule.value}
            onCommit={(next) => onChange({ ...rule, value: next })}
          />
        </div>
      )}

      {rule.key === 'pattern' && (
        <div className="fs-prop-row">
          {}
          <label htmlFor={id + '-value'}>{def?.hint ?? 'Value'}</label>
          <input
            id={id + '-value'}
            type="text"
            value={rule.value}
            aria-invalid={rule.key === 'pattern' && patternProblem(rule.value) ? true : undefined}
            aria-describedby={
              rule.key === 'pattern' && patternProblem(rule.value) ? id + '-value-error' : undefined
            }
            onChange={(e) => onChange({ ...rule, value: e.target.value })}
          />
          {}
          {rule.key === 'pattern' && patternProblem(rule.value) ? (
            <p id={id + '-value-error'} className="fs-prop-row__error" role="alert">
              {patternProblem(rule.value)}
            </p>
          ) : null}
        </div>
      )}

      {rule.key === 'custom' && (
        <div className="fs-prop-row">
          <label htmlFor={id + '-expression'}>Expression</label>
          <textarea
            id={id + '-expression'}
            rows={2}
            placeholder={def?.hint}
            value={rule.expression}
            onChange={(e) => onChange({ ...rule, expression: e.target.value })}
          />
        </div>
      )}

      {(rule.key === 'matches' || rule.key === 'after') && (
        <div className="fs-prop-row">
          <label htmlFor={id + '-field'}>Compare with</label>
          <select
            id={id + '-field'}
            value={(rule.scope ?? 'form') + ':' + rule.field}
            onChange={(event) => {
              const separator = event.target.value.indexOf(':')
              const scope = event.target.value.slice(0, separator) as 'form' | 'row'
              const field = event.target.value.slice(separator + 1)
              if (scope === 'row') {
                onChange({ ...rule, field, scope })
              } else {
                const { scope: _scope, ...rest } = rule
                onChange({ ...rest, field })
              }
            }}
          >
            <option value="form:">Choose a field…</option>
            {dataKeys.map((key) => (
              <option key={'form:' + key} value={'form:' + key}>
                Form: {key}
              </option>
            ))}
            {rowDataKeys?.map((key) => (
              <option key={'row:' + key} value={'row:' + key}>
                This row: {key}
              </option>
            ))}
          </select>
        </div>
      )}

      <RuleMessage
        id={id + '-message'}
        rule={rule}
        nodeKey={nodeKey}
        languages={languages}
        defaultLanguage={defaultLanguage}
        translations={translations}
        onTranslate={onTranslate}
        onChange={onChange}
      />

      <RuleGuard
        id={id + '-when'}
        rule={rule}
        dataKeys={dataKeys}
        rowDataKeys={rowDataKeys}
        onChange={onChange}
      />

      {rule.key === 'custom' && (
        <p className="fs-rule__note">
          Runs through the evaluator the host injects. With none injected this rule passes rather
          than throwing, so it will never fail a form on its own.
        </p>
      )}
    </li>
  )
}

function RuleMessage({
  id,
  rule,
  nodeKey,
  languages,
  defaultLanguage,
  translations,
  onTranslate,
  onChange,
}: Pick<
  RuleRowProps,
  'nodeKey' | 'languages' | 'defaultLanguage' | 'translations' | 'onTranslate' | 'onChange'
> & {
  id: string
  rule: ValidationRule
}): ReactNode {
  const message = rule.message
  const mode =
    message === undefined
      ? 'default'
      : typeof message === 'string' || message.kind === 'static'
        ? 'custom'
        : message.kind === 'i18n'
          ? 'i18n'
          : 'other'

  const setMessage = (next: ValidationRule['message']): void => {
    if (next !== undefined) {
      onChange({ ...rule, message: next })
      return
    }
    const { message: _removed, ...rest } = rule
    onChange(rest)
  }

  const custom =
    typeof message === 'string'
      ? message
      : message?.kind === 'static' && typeof message.value === 'string'
        ? message.value
        : ''

  return (
    <div className="fs-prop-row">
      <label htmlFor={id + '-mode'}>Message</label>
      <select
        id={id + '-mode'}
        value={mode}
        onChange={(event) => {
          if (event.target.value === 'default') setMessage(undefined)
          if (event.target.value === 'custom') {
            setMessage({ kind: 'static', value: DEFAULT_MESSAGES[rule.key] })
          }
          if (event.target.value === 'i18n') {
            setMessage({ kind: 'i18n', key: translationKey(nodeKey, rule.key + '_message') })
          }
        }}
      >
        <option value="default">Default</option>
        <option value="custom">Custom text</option>
        <option value="i18n">Translation</option>
        {mode === 'other' && <option value="other">Unrecognised message</option>}
      </select>

      {mode === 'custom' && (
        <input
          id={id}
          aria-label="Custom message"
          type="text"
          placeholder={DEFAULT_MESSAGES[rule.key]}
          value={custom}
          onChange={(event) => {
            if (event.target.value) setMessage({ kind: 'static', value: event.target.value })
            else setMessage(undefined)
          }}
        />
      )}

      {message && typeof message !== 'string' && message.kind === 'i18n' && (
        <TranslationEditor
          id={id}
          value={message}
          languages={languages}
          defaultLanguage={defaultLanguage}
          translations={translations}
          onChange={setMessage}
          onTranslate={onTranslate}
        />
      )}
    </div>
  )
}

function RuleGuard({
  id,
  rule,
  dataKeys,
  rowDataKeys,
  onChange,
}: {
  id: string
  rule: ValidationRule
  dataKeys: string[]
  rowDataKeys?: string[] | undefined
  onChange: (rule: ValidationRule) => void
}): ReactNode {
  const when = rule.when
  const mode =
    when === undefined
      ? 'always'
      : when.kind === 'static' && when.value === false
        ? 'never'
        : when.kind === 'condition' || when.kind === 'computed'
          ? when.kind
          : 'other'

  const setWhen = (next: ValidationRule['when']): void => {
    if (next !== undefined) {
      onChange({ ...rule, when: next })
      return
    }
    const { when: _removed, ...rest } = rule
    onChange(rest)
  }

  return (
    <div className="fs-prop-row">
      <label htmlFor={id}>Apply when</label>
      <select
        id={id}
        value={mode}
        onChange={(event) => {
          const next = event.target.value
          if (next === 'always') return setWhen(undefined)
          if (next === 'never') return setWhen({ kind: 'static', value: false })
          if (next === 'computed') return setWhen({ kind: 'computed', expression: '' })
          if (next !== 'condition') return

          const rowKey = rowDataKeys?.[0]
          const formKey = dataKeys[0]
          if (rowKey) setWhen({ kind: 'condition', condition: emptyCondition(rowKey, 'row') })
          else if (formKey) setWhen({ kind: 'condition', condition: emptyCondition(formKey) })
        }}
      >
        <option value="always">Always</option>
        <option value="never">Never</option>
        <option value="condition" disabled={(rowDataKeys?.length ?? 0) + dataKeys.length === 0}>
          A condition
        </option>
        <option value="computed">An expression</option>
        {mode === 'other' && <option value="other">Unrecognised guard</option>}
      </select>

      {when?.kind === 'condition' && (
        <ConditionEditor
          id={id + '-condition'}
          value={when.condition}
          dataKeys={dataKeys}
          rowDataKeys={rowDataKeys}
          onChange={(condition) => setWhen({ kind: 'condition', condition })}
        />
      )}

      {when?.kind === 'computed' && (
        <textarea
          aria-label="Guard expression"
          rows={2}
          value={when.expression}
          onChange={(event) => setWhen({ kind: 'computed', expression: event.target.value })}
        />
      )}
    </div>
  )
}
