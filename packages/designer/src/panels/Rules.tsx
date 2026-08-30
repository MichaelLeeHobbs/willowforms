/**
 * The validation rules editor.
 *
 * The rule engine and the rule types have been in core since the start; what was
 * missing was any way to author a rule without editing the document by hand.
 *
 * Two behaviours from the model are surfaced here rather than left implicit,
 * because both surprise people who have used other builders:
 *
 * - Only `required` fails on an empty value. A field carrying just a `url` rule
 *   stays valid while blank. The panel says so, next to the rule.
 * - `custom` rules and `when` guards run author-supplied JavaScript through an
 *   evaluator the host injects. With no evaluator, they pass rather than throw.
 *   The panel says that too, because a rule that silently never fires is worse
 *   than one that visibly cannot run.
 */

import type { ReactNode } from 'react'
import type { FieldSchema, ValidationKey, ValidationRule } from '@formsmith/core'
import { DEFAULT_MESSAGES } from '@formsmith/core'

import type { DesignerApi } from '../store.js'

/** What each rule needs from the author beyond a message. */
type Parameter = 'none' | 'number' | 'text' | 'expression'

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
  { key: 'min', label: 'Minimum', parameter: 'number' },
  { key: 'max', label: 'Maximum', parameter: 'number' },
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
    case 'min':
    case 'max':
      return { key, value: 0 }
    case 'pattern':
      return { key, value: '' }
    case 'custom':
      return { key, expression: '' }
    default:
      return { key }
  }
}

export interface RulesProps {
  api: DesignerApi
}

export function Rules({ api }: RulesProps): ReactNode {
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
  const rules = Array.isArray(schema.validations) ? schema.validations : []
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

  const used = new Set(rules.map((r) => r.key))
  // Every rule but `custom` is idempotent, so offering a second one is noise.
  const addable = RULES.filter((r) => r.key === 'custom' || !used.has(r.key))

  return (
    <div className="fs-rules">
      <div className="fs-prop-row">
        <label htmlFor="fs-field-type">Data type</label>
        <select
          id="fs-field-type"
          value={schema.type}
          onChange={(e) => write({ type: e.target.value as FieldSchema['type'] })}
          aria-describedby={repeats ? 'fs-field-type-note' : undefined}
        >
          {FIELD_TYPES.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
        {repeats && (
          <p id="fs-field-type-note" className="fs-prop-row__hint">
            This component repeats its contents once per row because it holds a list. Changing the
            type away from <code>array</code> stops that, and any condition inside that reads
            &ldquo;this row&rdquo; will read nothing.
          </p>
        )}
      </div>

      <div className="fs-prop-row">
        <label htmlFor="fs-auto-validate">Validate while typing</label>
        <input
          id="fs-auto-validate"
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
        <label className="fs-visually-hidden" htmlFor="fs-add-rule">
          Add a rule
        </label>
        <select
          id="fs-add-rule"
          value=""
          onChange={(e) => {
            const key = e.target.value as ValidationKey
            if (!key) return
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

type NumericRule = Extract<ValidationRule, { key: 'minLength' | 'maxLength' | 'min' | 'max' }>

function isNumeric(rule: ValidationRule): rule is NumericRule {
  return (
    rule.key === 'minLength' || rule.key === 'maxLength' || rule.key === 'min' || rule.key === 'max'
  )
}

interface RuleRowProps {
  rule: ValidationRule
  index: number
  onChange: (rule: ValidationRule) => void
  onRemove: () => void
}

function RuleRow({ rule, index, onChange, onRemove }: RuleRowProps): ReactNode {
  const def = BY_KEY.get(rule.key)
  const id = 'fs-rule-' + String(index)
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
          <input
            id={id + '-value'}
            type="number"
            value={rule.value}
            onChange={(e) => onChange({ ...rule, value: Number(e.target.value) })}
          />
        </div>
      )}

      {rule.key === 'pattern' && (
        <div className="fs-prop-row">
          <label htmlFor={id + '-value'}>{def?.hint ?? 'Value'}</label>
          <input
            id={id + '-value'}
            type="text"
            value={rule.value}
            onChange={(e) => onChange({ ...rule, value: e.target.value })}
          />
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

      <div className="fs-prop-row">
        <label htmlFor={id + '-message'}>Message</label>
        <input
          id={id + '-message'}
          type="text"
          placeholder={DEFAULT_MESSAGES[rule.key]}
          value={rule.message ?? ''}
          onChange={(e) => {
            const message = e.target.value
            if (message) onChange({ ...rule, message })
            else {
              // exactOptionalPropertyTypes: clearing a message drops the key
              // rather than setting it to undefined.
              const { message: _cleared, ...rest } = rule
              onChange(rest)
            }
          }}
        />
      </div>

      {rule.key === 'custom' && (
        <p className="fs-rule__note">
          Runs through the evaluator the host injects. With none injected this rule passes rather
          than throwing, so it will never fail a form on its own.
        </p>
      )}
    </li>
  )
}
