// Nesting is shown by indentation only: the inspector pane is too narrow to draw a tree.

import { useState } from 'react'
import type { ReactNode } from 'react'
import { jsonToString } from '@willowforms/core'
import type { Condition, JsonValue, Operand } from '@willowforms/core'

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

/**
 * A literal comparison operand, which is a different type from the static
 * property binding that core's `prop` builds.
 */
const literal = (value: JsonValue): Operand => ({ kind: 'literal', value })

const ORDER: Condition['op'][] = [...COMPARISONS, ...UNARY, ...MEMBERSHIP, ...GROUPS, 'not']

function asList<T>(value: T[] | undefined): T[] {
  return Array.isArray(value) ? value : []
}

/**
 * Guards beyond the type: a hand-edited document can hold anything here. An
 * unreadable operand becomes an empty literal so the row renders and can be
 * retyped.
 */
function asOperand(value: Operand | undefined): Operand {
  if (!value || typeof value !== 'object') return literal('')
  if (value.kind === 'ref') return typeof value.dataKey === 'string' ? value : literal('')
  if (value.kind === 'context') return typeof value.path === 'string' ? value : literal('')
  if (value.kind === 'literal') return value
  return literal('')
}

function morph(current: Condition, op: Condition['op']): Condition {
  const carried =
    'conditions' in current
      ? asList(current.conditions)[0]
      : 'condition' in current
        ? current.condition
        : undefined

  const inner = carried ? asCondition(carried) : undefined

  const firstOperand: Operand =
    'left' in current
      ? asOperand(current.left)
      : 'value' in current
        ? asOperand(current.value)
        : inner && 'left' in inner
          ? asOperand(inner.left)
          : inner && 'value' in inner
            ? asOperand(inner.value)
            : literal('')

  if ((COMPARISONS as readonly string[]).includes(op)) {
    const right: Operand = 'right' in current ? asOperand(current.right) : literal('')
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
  if (op === 'not') {
    return { op: 'not', condition: 'condition' in current ? current.condition : current }
  }

  return current
}

function asCondition(value: Condition | undefined): Condition {
  if (!value || typeof value !== 'object') return { op: 'truthy', value: literal('') }
  // For an op with no option, the select would show its first one, and no operand would
  // be drawn.
  if (!(ORDER as string[]).includes(value.op)) return { op: 'truthy', value: literal('') }
  return value
}

/**
 * Pass `row` scope inside a repeater: seeded at form scope there, the condition
 * is false from the start and everything under it stops being validated.
 */
export function emptyCondition(dataKey: string, scope?: 'form' | 'row'): Condition {
  const ref: Operand =
    scope === 'row' ? { kind: 'ref', dataKey, scope: 'row' } : { kind: 'ref', dataKey }
  return { op: 'truthy', value: ref }
}

interface OperandFieldProps {
  id: string
  label: string
  value: Operand
  dataKeys: string[]
  /** Undefined means no enclosing row; `[]` is a row with no keys. */
  rowDataKeys?: string[] | undefined
  onChange: (next: Operand) => void
}

/**
 * The option value carries the scope, since inside a row one name can mean two
 * answers. Splitting on the first `:` is safe: `keyProblem` keeps data keys to
 * identifiers.
 */
function encodeRef(scope: 'form' | 'row', dataKey: string): string {
  return scope + ':' + dataKey
}

function decodeRef(encoded: string): Operand {
  const at = encoded.indexOf(':')
  const dataKey = encoded.slice(at + 1)
  // Absent, not `'form'`: absent already means form scope in stored documents.
  return encoded.slice(0, at) === 'row'
    ? { kind: 'ref', dataKey, scope: 'row' }
    : { kind: 'ref', dataKey }
}

function OperandField({
  id,
  label,
  value: raw,
  dataKeys,
  rowDataKeys,
  onChange,
}: OperandFieldProps): ReactNode {
  const value = asOperand(raw)
  const isRef = value.kind === 'ref'
  const isContext = value.kind === 'context'
  const scope: 'form' | 'row' = isRef && value.scope === 'row' ? 'row' : 'form'
  // Checked against the claimed scope only: a name in both scopes is two answers.
  const known = isRef && (scope === 'row' ? (rowDataKeys ?? []) : dataKeys).includes(value.dataKey)

  const option = (key: string, of: 'form' | 'row'): ReactNode => (
    <option key={of + ':' + key} value={encodeRef(of, key)}>
      {key}
    </option>
  )

  return (
    <div className="fs-condition__operand">
      <label className="fs-visually-hidden" htmlFor={id + '-kind'}>
        {label} source
      </label>
      <select
        id={id + '-kind'}
        value={value.kind}
        onChange={(e) => onChange(switchKind(value, e.target.value, dataKeys, rowDataKeys))}
      >
        <option value="ref">Field</option>
        <option value="literal">Value</option>
        <option value="context">Context</option>
      </select>

      <label className="fs-visually-hidden" htmlFor={id}>
        {label}
      </label>
      {isRef && (
        <select
          id={id}
          value={encodeRef(scope, value.dataKey)}
          onChange={(e) => onChange(decodeRef(e.target.value))}
        >
          {/*
            An unknown key is shown as it stands rather than letting the select
            fall back to the first option, which would re-point the rule.
          */}
          {!known && (
            <option value={encodeRef(scope, value.dataKey)}>{value.dataKey || '(none)'}</option>
          )}
          {rowDataKeys === undefined ? (
            dataKeys.map((key) => option(key, 'form'))
          ) : (
            <>
              {/* The group an option sits in decides the scope written. */}
              <optgroup label="This row">{rowDataKeys.map((key) => option(key, 'row'))}</optgroup>
              <optgroup label="This form">{dataKeys.map((key) => option(key, 'form'))}</optgroup>
            </>
          )}
        </select>
      )}
      {isContext && (
        <input
          id={id}
          type="text"
          placeholder="user.role"
          value={value.path}
          onChange={(e) => onChange({ kind: 'context', path: e.target.value })}
        />
      )}
      {!isRef && !isContext && (
        <LiteralField id={id} value={value.value} onCommit={(next) => onChange(literal(next))} />
      )}
    </div>
  )
}

/**
 * Nothing carries across kinds: a data key, a context path and a literal only
 * look alike, and a carried value reads plausibly while testing something else.
 */
function switchKind(
  current: Operand,
  kind: string,
  dataKeys: string[],
  rowDataKeys?: string[],
): Operand {
  // Inside a row, start on the row: a form-scope ref there is false, hides the
  // component and skips its validation.
  if (kind === 'ref') {
    const inRow = rowDataKeys?.[0]
    if (inRow !== undefined) return { kind: 'ref', dataKey: inRow, scope: 'row' }
    const first = dataKeys[0]
    // No key to offer: a ref with an empty dataKey fails `validateDocument`.
    if (first === undefined) return literal('')
    return { kind: 'ref', dataKey: first }
  }
  if (kind === 'context') return { kind: 'context', path: '' }
  return literal(current.kind === 'literal' ? current.value : '')
}

function LiteralField({
  id,
  value,
  onCommit,
}: {
  id: string
  value: JsonValue
  onCommit: (next: JsonValue) => void
}): ReactNode {
  // `jsonToString` gives `''` for objects, arrays and null, so `spell` shows
  // those as JSON and a commit parses them back.
  const text = spell(value)
  const [draft, setDraft] = useState(text)
  const [committed, setCommitted] = useState(text)

  // Re-sync on outside changes: undo, redo, or the JSON dialog.
  if (text !== committed) {
    setCommitted(text)
    setDraft(text)
  }

  const commit = (): void => {
    if (draft === committed) return
    const parsed = coerce(draft)
    // Show what was stored, so the box stops disagreeing with the document.
    const stored = spell(parsed)
    setCommitted(stored)
    setDraft(stored)
    onCommit(parsed)
  }

  return (
    <input
      id={id}
      type="text"
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

function spell(value: JsonValue): string {
  if (value === null || typeof value === 'object') return JSON.stringify(value)
  const plain = jsonToString(value)
  return coerce(plain) === value ? plain : JSON.stringify(value)
}

/**
 * Numeric-looking text becomes a number: ordering refuses to compare a string to
 * a number, so `18` must be 18 for `is at least` to hold.
 */
function coerce(text: string): JsonValue {
  if (text === '') return ''

  // JSON first, so quoting reaches what plain typing cannot: `"true"` and `"18"`
  // stay strings, and objects and lists parse.
  const first = text.trim()[0]
  if (first === '"' || first === '{' || first === '[') {
    try {
      return JSON.parse(text) as JsonValue
    } catch {
      // Not JSON after all. Fall through and treat it as the text it is.
    }
  }

  if (text === 'true') return true
  if (text === 'false') return false

  const asNumber = Number(text)
  if (!Number.isNaN(asNumber) && String(asNumber) === text) return asNumber
  return text
}

function OptionsField({
  id,
  options,
  onCommit,
}: {
  id: string
  options: JsonValue[]
  onCommit: (next: JsonValue[]) => void
}): ReactNode {
  const text = options.map(spell).join('\n')
  const [draft, setDraft] = useState(text)
  const [committed, setCommitted] = useState(text)

  if (text !== committed) {
    setCommitted(text)
    setDraft(text)
  }

  const commit = (): void => {
    if (draft === committed) return

    // A whitespace-only option could never equal any answer.
    const parsed = draft
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line !== '')
      .map(coerce)

    onCommit(parsed)
    // Show what was stored, so the box stops disagreeing with the document.
    const stored = parsed.map(spell).join('\n')
    setCommitted(stored)
    setDraft(stored)
  }

  return (
    <>
      <label className="fs-visually-hidden" htmlFor={id}>
        Options, one per line
      </label>
      <textarea
        id={id}
        rows={3}
        placeholder="One value per line"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
      />
    </>
  )
}

export interface ConditionEditorProps {
  id: string
  value: Condition
  dataKeys: string[]
  rowDataKeys?: string[] | undefined
  onChange: (next: Condition) => void
}

export function ConditionEditor({
  id,
  value: raw,
  dataKeys,
  rowDataKeys,
  onChange,
}: ConditionEditorProps): ReactNode {
  const value = asCondition(raw)
  const hasLeft = 'left' in value
  const hasValue = 'value' in value

  return (
    <div className="fs-condition">
      <div className="fs-condition__head">
        {hasLeft && (
          <OperandField
            id={id + '-left'}
            label="Left"
            value={value.left}
            dataKeys={dataKeys}
            rowDataKeys={rowDataKeys}
            onChange={(left) => onChange({ ...value, left })}
          />
        )}
        {hasValue && (
          <OperandField
            id={id + '-value'}
            label="Subject"
            value={value.value}
            dataKeys={dataKeys}
            rowDataKeys={rowDataKeys}
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
            rowDataKeys={rowDataKeys}
            onChange={(right) => onChange({ ...value, right })}
          />
        )}
      </div>

      {'options' in value && (
        <div className="fs-condition__options">
          <OptionsField
            id={id + '-options'}
            options={asList(value.options)}
            onCommit={(options) => onChange({ ...value, options })}
          />
        </div>
      )}

      {'conditions' in value && (
        <div className="fs-condition__nested">
          {/*
           * Keyed by index: the only local state below is a draft that re-syncs
           * from props, and content keys would remount and drop focus on every
           * keystroke. Removal is covered in Properties.test.tsx.
           */}
          {asList(value.conditions).map((inner, index) => (
            <div key={index} className="fs-condition__row">
              <ConditionEditor
                id={id + '-' + String(index)}
                value={inner}
                dataKeys={dataKeys}
                rowDataKeys={rowDataKeys}
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
          {}
          <button
            type="button"
            disabled={rowDataKeys?.[0] === undefined && dataKeys[0] === undefined}
            onClick={() => {
              const seed =
                rowDataKeys?.[0] !== undefined
                  ? emptyCondition(rowDataKeys[0], 'row')
                  : dataKeys[0] !== undefined
                    ? emptyCondition(dataKeys[0])
                    : undefined
              if (!seed) return

              onChange({ ...value, conditions: [...asList(value.conditions), seed] })
            }}
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
            rowDataKeys={rowDataKeys}
            onChange={(condition) => onChange({ ...value, condition })}
          />
        </div>
      )}
    </div>
  )
}
