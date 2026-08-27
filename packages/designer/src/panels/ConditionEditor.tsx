/**
 * Authoring a structured condition.
 *
 * This is the whole point of the condition vocabulary being closed: a finite
 * set of comparisons can be drawn as a picker, so an author builds a rule by
 * choosing rather than by writing an expression a sandbox has to run. An
 * expression box would have been a tenth of this code and would have kept
 * conditional visibility behind a sandbox and a JSON editor.
 *
 * The editor is recursive because `and`, `or` and `not` take conditions. It is
 * deliberately plain at depth: a 288px pane cannot draw a tree, so nesting is
 * shown by indentation and nothing else.
 */

import type { ReactNode } from 'react'
import { jsonToString } from '@formsmith/core'
import type { Condition, JsonValue, Operand } from '@formsmith/core'

/** Every operator, grouped by the shape of editor it needs. */
const COMPARISONS = ['eq', 'ne', 'gt', 'gte', 'lt', 'lte'] as const
const UNARY = ['empty', 'notEmpty', 'truthy', 'falsy'] as const
const MEMBERSHIP = ['in', 'notIn'] as const
const GROUPS = ['and', 'or'] as const

const OP_LABELS: Record<Condition['op'], string> = {
  eq: 'is',
  ne: 'is not',
  gt: 'is more than',
  gte: 'is at least',
  lt: 'is less than',
  lte: 'is at most',
  empty: 'is empty',
  notEmpty: 'is not empty',
  truthy: 'is on',
  falsy: 'is off',
  in: 'is one of',
  notIn: 'is none of',
  and: 'all of',
  or: 'any of',
  not: 'not',
}

const ORDER: Condition['op'][] = [...COMPARISONS, ...UNARY, ...MEMBERSHIP, ...GROUPS, 'not']

const literal = (value: JsonValue): Operand => ({ kind: 'literal', value })

/**
 * A list, whatever the document actually holds.
 *
 * `evaluateCondition` was made total against a hand-edited document and this
 * editor was not, so `options: "not-a-list"` rendered fine in the form and
 * crashed the designer the moment the panel tried to map over it. The panel is
 * where someone goes to fix a broken document, so it is the last place that can
 * afford to fall over on one.
 */
function asList<T>(value: T[] | undefined): T[] {
  return Array.isArray(value) ? value : []
}

/** A condition of the requested shape, keeping whatever the old one can spare. */
function morph(current: Condition, op: Condition['op']): Condition {
  const firstOperand: Operand =
    'left' in current ? current.left : 'value' in current ? current.value : literal('')

  if ((COMPARISONS as readonly string[]).includes(op)) {
    const right: Operand = 'right' in current ? current.right : literal('')
    return { op: op as (typeof COMPARISONS)[number], left: firstOperand, right }
  }
  if ((UNARY as readonly string[]).includes(op)) {
    return { op: op as (typeof UNARY)[number], value: firstOperand }
  }
  if ((MEMBERSHIP as readonly string[]).includes(op)) {
    const options = 'options' in current ? asList(current.options) : []
    return { op: op as (typeof MEMBERSHIP)[number], value: firstOperand, options }
  }
  if ((GROUPS as readonly string[]).includes(op)) {
    const carried = 'conditions' in current ? asList(current.conditions) : [current]
    return { op: op as (typeof GROUPS)[number], conditions: carried }
  }
  return { op: 'not', condition: 'condition' in current ? current.condition : current }
}

/** The default a fresh condition starts from: the commonest thing anyone writes. */
export function emptyCondition(dataKey: string): Condition {
  return { op: 'truthy', value: { kind: 'ref', dataKey } }
}

interface OperandFieldProps {
  id: string
  label: string
  value: Operand
  dataKeys: string[]
  onChange: (next: Operand) => void
}

/**
 * One side of a comparison: a field, or a fixed value.
 *
 * The field list comes from the document rather than being typed, so a
 * condition cannot reference a key that does not exist. A hand-edited document
 * still can, and the select shows that key rather than silently selecting the
 * first one, because quietly changing which field a rule tests is worse than
 * showing something unfamiliar.
 */
function OperandField({ id, label, value, dataKeys, onChange }: OperandFieldProps): ReactNode {
  const isRef = value.kind === 'ref'
  const known = isRef && dataKeys.includes(value.dataKey)

  return (
    <div className="fs-condition__operand">
      <label className="fs-visually-hidden" htmlFor={id + '-kind'}>
        {label} source
      </label>
      <select
        id={id + '-kind'}
        value={value.kind}
        onChange={(e) =>
          onChange(
            e.target.value === 'ref'
              ? { kind: 'ref', dataKey: dataKeys[0] ?? '' }
              : literal(isRef ? '' : value.value),
          )
        }
      >
        <option value="ref">Field</option>
        <option value="literal">Value</option>
      </select>

      <label className="fs-visually-hidden" htmlFor={id}>
        {label}
      </label>
      {isRef ? (
        <select
          id={id}
          value={value.dataKey}
          onChange={(e) => onChange({ kind: 'ref', dataKey: e.target.value })}
        >
          {!known && <option value={value.dataKey}>{value.dataKey || '(none)'}</option>}
          {dataKeys.map((key) => (
            <option key={key} value={key}>
              {key}
            </option>
          ))}
        </select>
      ) : (
        <input
          id={id}
          type="text"
          value={jsonToString(value.value)}
          onChange={(e) => onChange(literal(coerce(e.target.value)))}
        />
      )}
    </div>
  )
}

/**
 * What the author typed, as the value they almost certainly meant.
 *
 * A form's data is JSON, so `18` typed against a number field has to become the
 * number 18 or `is at least` can never be true: ordering refuses to compare a
 * string to a number rather than guessing. Text that merely looks numeric, like
 * a postcode or a phone number, is the cost, and it is why the comparison
 * operators are the only place this matters.
 */
function coerce(text: string): JsonValue {
  if (text === '') return ''
  if (text === 'true') return true
  if (text === 'false') return false
  const asNumber = Number(text)
  return text.trim() !== '' && !Number.isNaN(asNumber) ? asNumber : text
}

export interface ConditionEditorProps {
  id: string
  value: Condition
  /** Every data key in the document, so a condition can only name a real one. */
  dataKeys: string[]
  onChange: (next: Condition) => void
  /** Nesting level, for indentation only. */
  depth?: number
}

export function ConditionEditor({
  id,
  value,
  dataKeys,
  onChange,
  depth = 0,
}: ConditionEditorProps): ReactNode {
  const hasLeft = 'left' in value
  const hasValue = 'value' in value

  return (
    <div className="fs-condition" data-fs-depth={depth}>
      <div className="fs-condition__head">
        {hasLeft && (
          <OperandField
            id={id + '-left'}
            label="Left"
            value={value.left}
            dataKeys={dataKeys}
            onChange={(left) => onChange({ ...value, left })}
          />
        )}
        {hasValue && (
          <OperandField
            id={id + '-value'}
            label="Subject"
            value={value.value}
            dataKeys={dataKeys}
            onChange={(next) => onChange({ ...value, value: next })}
          />
        )}

        <label className="fs-visually-hidden" htmlFor={id + '-op'}>
          Comparison
        </label>
        <select
          id={id + '-op'}
          className="fs-condition__op"
          value={value.op}
          onChange={(e) => onChange(morph(value, e.target.value as Condition['op']))}
        >
          {ORDER.map((op) => (
            <option key={op} value={op}>
              {OP_LABELS[op]}
            </option>
          ))}
        </select>

        {'right' in value && (
          <OperandField
            id={id + '-right'}
            label="Right"
            value={value.right}
            dataKeys={dataKeys}
            onChange={(right) => onChange({ ...value, right })}
          />
        )}
      </div>

      {'options' in value && (
        <div className="fs-condition__options">
          <label className="fs-visually-hidden" htmlFor={id + '-options'}>
            Options, one per line
          </label>
          <textarea
            id={id + '-options'}
            rows={3}
            placeholder="One value per line"
            value={asList(value.options)
              .map((option) => jsonToString(option))
              .join('\n')}
            onChange={(e) =>
              onChange({
                ...value,
                options: e.target.value.split('\n').filter(Boolean).map(coerce),
              })
            }
          />
        </div>
      )}

      {'conditions' in value && (
        <div className="fs-condition__nested">
          {asList(value.conditions).map((inner, index) => (
            <div key={index} className="fs-condition__row">
              <ConditionEditor
                id={id + '-' + String(index)}
                value={inner}
                dataKeys={dataKeys}
                depth={depth + 1}
                onChange={(next) =>
                  onChange({
                    ...value,
                    conditions: asList(value.conditions).map((c, i) => (i === index ? next : c)),
                  })
                }
              />
              <button
                type="button"
                className="fs-condition__remove"
                aria-label={'Remove condition ' + String(index + 1)}
                onClick={() =>
                  onChange({
                    ...value,
                    conditions: asList(value.conditions).filter((_, i) => i !== index),
                  })
                }
              >
                &times;
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() =>
              onChange({
                ...value,
                conditions: [...asList(value.conditions), emptyCondition(dataKeys[0] ?? '')],
              })
            }
          >
            Add condition
          </button>
        </div>
      )}

      {'condition' in value && (
        <div className="fs-condition__nested">
          <ConditionEditor
            id={id + '-inner'}
            value={value.condition}
            dataKeys={dataKeys}
            depth={depth + 1}
            onChange={(condition) => onChange({ ...value, condition })}
          />
        </div>
      )}
    </div>
  )
}
