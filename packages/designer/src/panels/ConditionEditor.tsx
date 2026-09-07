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

import { useState } from 'react'
import type { ReactNode } from 'react'
import { jsonToString } from '@willowforms/core'
import type { Condition, JsonValue, Operand } from '@willowforms/core'

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

const literal = (value: JsonValue): Operand => ({ kind: 'literal', value })

/** Every operator, in the order the picker lists them. */
const ORDER: Condition['op'][] = [...COMPARISONS, ...UNARY, ...MEMBERSHIP, ...GROUPS, 'not']

function asList<T>(value: T[] | undefined): T[] {
  return Array.isArray(value) ? value : []
}

/**
 * An operand, whatever the document holds in its place.
 *
 * Same reasoning as `asList`, and the shape I missed the first time: guarding
 * the lists and not the operands left `left: null` throwing on the first read
 * of `.kind`. An unreadable operand becomes an empty literal, which is what a
 * fresh one is, so the row renders and the author can retype it.
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
  /*
   * The operator has to be one this editor can draw, not merely a string. An
   * unknown one reached a controlled `<select>` with no matching option, which
   * renders blank and leaves the author looking at a comparison with no name
   * and no way to tell what the document actually says.
   */
  if (!(ORDER as string[]).includes(value.op)) return { op: 'truthy', value: literal('') }
  return value
}

/**
 * The default a fresh condition starts from: the commonest thing anyone writes.
 *
 * The scope is passed rather than defaulted, for the reason `switchKind` gives:
 * seeded at form scope inside a row, the condition is false from the moment it
 * is created and everything under it stops being validated.
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
  /**
   * The enclosing row's data keys, when this condition is authored inside one.
   *
   * Absent means there is no row here, which is not the same as a row that
   * holds nothing: the first draws one list and the second draws two.
   */
  rowDataKeys?: string[] | undefined
  onChange: (next: Operand) => void
}

/**
 * A field option's value, carrying the scope the choice implies.
 *
 * The scope is not a second control. A ref names an answer, and inside a row
 * the same name can mean two answers, so the option the author picked has to
 * say which — otherwise the panel is guessing, and the guess that reads
 * plausibly and tests the wrong place is the whole failure mode here.
 *
 * Safe to split on the first `:` because a data key is a JavaScript identifier
 * and cannot hold one; `keyProblem` enforces that on both a paste and a rename.
 */
function encodeRef(scope: 'form' | 'row', dataKey: string): string {
  return scope + ':' + dataKey
}

function decodeRef(encoded: string): Operand {
  const at = encoded.indexOf(':')
  const dataKey = encoded.slice(at + 1)
  // Absent rather than `'form'`, because absent is what every ref written
  // before repeaters existed already means and no document should change.
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
  // Judged within the scope the ref claims. A row key that also exists at the
  // top level is a different answer, so matching it against the wrong list
  // would hide a stale ref behind a name that happens to appear twice.
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
            A hand-edited document may name a key that is not on the list. It is
            shown as it stands, in the scope it claims, rather than the select
            falling back to the first real option: quietly re-pointing a rule at
            a different field is worse than showing an unfamiliar name.
          */}
          {!known && (
            <option value={encodeRef(scope, value.dataKey)}>{value.dataKey || '(none)'}</option>
          )}
          {rowDataKeys === undefined ? (
            dataKeys.map((key) => option(key, 'form'))
          ) : (
            <>
              {/*
                The row first, because a condition authored inside a row almost
                always means this row's answer, and because the group an option
                sits in is the only thing that decides the scope written.
              */}
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
 * The same operand, as a different kind.
 *
 * Nothing is carried across, and that is the point. A data key, a dot path and
 * a literal are three different things wearing the same box, and a field named
 * `email` becoming the context path `email` is a rule that reads plausibly and
 * tests something else entirely. Starting empty is visibly unfinished.
 */
function switchKind(
  current: Operand,
  kind: string,
  dataKeys: string[],
  rowDataKeys?: string[],
): Operand {
  /*
   * Inside a row, a fresh ref starts on the row. Starting it on the form is the
   * one default that fails silently: it reads a key the top level does not
   * hold, the condition is false, the component is hidden, and validation then
   * skips every rule under it.
   */
  if (kind === 'ref') {
    const inRow = rowDataKeys?.[0]
    if (inRow !== undefined) return { kind: 'ref', dataKey: inRow, scope: 'row' }
    const first = dataKeys[0]
    /*
     * A ref needs a key to read, and there is not always one to offer.
     *
     * `dataKeys[0] ?? ''` minted `{ kind: 'ref', dataKey: '' }` on a document
     * whose only data-bound component is the one being edited -- which
     * `validateDocument` refuses, and which reads nothing, so the condition is
     * false and the component is hidden forever. The panel wrote a document its
     * own gate rejects.
     *
     * A literal instead: it is the one operand kind that needs nothing from the
     * document, and it is what the picker falls back to everywhere else.
     */
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
  /*
   * `jsonToString` answers `''` for an object, an array and `null`, so a literal
   * a hand-edited document holds -- `{ kind: 'literal', value: { a: 1 } }` --
   * drew an empty box. An empty box says the condition compares against nothing,
   * which is not what the document says, and typing into it silently replaced a
   * structure with a string. JSON is what those values are, so JSON is what the
   * box shows, and committing it parses the JSON back.
   */
  const text = spell(value)
  const [draft, setDraft] = useState(text)
  const [committed, setCommitted] = useState(text)

  // Re-sync when the document changes underneath, without losing an edit in
  // progress. Undo, redo and a document swapped in from the JSON dialog.
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

/**
 * What the author typed, as the value they almost certainly meant.
 *
 * A form's data is JSON, so `18` typed against a number field has to become the
 * number 18 or `is at least` can never be true: ordering refuses to compare a
 * string to a number rather than guessing. Text that merely looks numeric, like
 * a postcode or a phone number, is the cost, and it is why the comparison
 * operators are the only place this matters.
 */

function spell(value: JsonValue): string {
  if (value === null || typeof value === 'object') return JSON.stringify(value)
  const plain = jsonToString(value)
  return coerce(plain) === value ? plain : JSON.stringify(value)
}

function coerce(text: string): JsonValue {
  if (text === '') return ''

  /*
   * JSON first, for the values plain typing cannot reach.
   *
   * `true`, `false` and anything spelled like a number become that value, which
   * is right for a form and left the *strings* `"true"` and `"18"` unauthorable
   * -- a condition testing a text field whose answer is the word "true" could
   * not be written in this panel at all. Quoting is the escape hatch, and it is
   * the same one JSON uses: `"true"` is the string, `true` is the boolean. An
   * object or a list is the same story from the other end, and is what the box
   * shows a document that already holds one.
   */
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

    /*
     * Trimmed per line, and blank lines dropped. A line of spaces kept as an
     * option is a value no form data can ever equal.
     */
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
  /** Every data key in the document, so a condition can only name a real one. */
  dataKeys: string[]
  /** The enclosing row's data keys, when this condition sits inside a row. */
  rowDataKeys?: string[] | undefined
  onChange: (next: Condition) => void
  /**
   * How deep this editor is nested, kept for the guard rather than for looks.
   *
   * The comment here said "for indentation only", and nothing indented by it:
   * the attribute it rendered, `data-fs-depth`, appears in no stylesheet in the
   * repository. What indents a nested group is the padding on
   * `.fs-condition__group`. Kept because the value is what a bound would be
   * measured against the day this editor stops drawing deeper than the engine
   * will read -- see the note in `triage.md`.
   */
  depth?: number
}

export function ConditionEditor({
  id,
  value: raw,
  dataKeys,
  rowDataKeys,
  onChange,
  depth = 0,
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
           * Keyed by index, so removing a row shifts its neighbours into the
           * mounted subtrees below. That is safe because the only local state
           * down there is the options draft, and the re-sync above notices the
           * props it now holds and re-reads them. Keying by content instead
           * would remount on every keystroke and take focus with it.
           *
           * Two tests in Properties.test.tsx cover the removal, including one
           * with an uncommitted draft in the row that survives.
           */}
          {asList(value.conditions).map((inner, index) => (
            <div key={index} className="fs-condition__row">
              <ConditionEditor
                id={id + '-' + String(index)}
                value={inner}
                dataKeys={dataKeys}
                rowDataKeys={rowDataKeys}
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
            depth={depth + 1}
            onChange={(condition) => onChange({ ...value, condition })}
          />
        </div>
      )}
    </div>
  )
}
