import { useState } from 'react'
import type { ReactNode } from 'react'
import type { JsonValue } from '@willowforms/core'
import { jsonToString, optionEntry, optionValue } from '@willowforms/core'

import { RemoveButton } from './RemoveButton.js'

export function OptionsEditor({
  id,
  value,
  onChange,
}: {
  id: string
  value: JsonValue | undefined
  onChange: (value: JsonValue) => void
}): ReactNode {
  const [order, setOrder] = useState('fixed')
  const serialized = JSON.stringify(value)
  const [seen, setSeen] = useState(serialized)
  if (seen !== serialized) {
    setSeen(serialized)
    setOrder('fixed')
  }
  const options = Array.isArray(value) ? value : []
  const entries = options.map((item, index) => {
    const entry = optionEntry(item, index, options)
    return item && typeof item === 'object' && !Array.isArray(item)
      ? {
          ...item,
          label: entry.label,
          value: item['value'] === undefined ? optionValue(options, entry.value) : item['value'],
        }
      : { label: entry.label, value: optionValue(options, entry.value) }
  })
  const save = (next: typeof entries): void => {
    setOrder('fixed')
    onChange(next)
  }
  return (
    <div className="fs-options-editor" role="group" aria-label="Options">
      <label htmlFor={id}>Order</label>
      <select
        id={id}
        value={order}
        onChange={(event) => {
          const next = event.target.value
          setOrder(next)
          if (next !== 'fixed') {
            const sorted = [...entries].sort(
              (a, b) =>
                a.label.localeCompare(b.label, undefined, { numeric: true, sensitivity: 'base' }) *
                (next === 'az' ? 1 : -1),
            )
            setSeen(JSON.stringify(sorted))
            onChange(sorted)
          }
        }}
      >
        <option value="fixed">Fixed / manual</option>
        <option value="az">Alphabetical A–Z</option>
        <option value="za">Alphabetical Z–A</option>
      </select>
      {entries.length === 0 && (
        <p className="fs-prop-row__hint">Add the choices people can select.</p>
      )}
      {entries.map((entry, index) => (
        <fieldset key={index} className="fs-options-editor__row">
          <legend>Option {index + 1}</legend>
          <label>
            Label
            <input
              value={entry.label}
              onChange={(event) =>
                save(
                  entries.map((item, at) =>
                    at === index ? { ...item, label: event.target.value } : item,
                  ),
                )
              }
            />
          </label>
          <OptionValue
            value={entry.value}
            onChange={(next) =>
              save(entries.map((item, at) => (at === index ? { ...item, value: next } : item)))
            }
          />
          <div className="fs-options-editor__actions">
            {([-1, 1] as const).map((direction) => (
              <button
                key={direction}
                type="button"
                disabled={!entries[index + direction]}
                aria-label={`Move option ${index + 1} ${direction < 0 ? 'up' : 'down'}`}
                onClick={() => {
                  const next = [...entries]
                  const other = next[index + direction]!
                  next[index + direction] = entry
                  next[index] = other
                  save(next)
                }}
              >
                {direction < 0 ? '↑' : '↓'}
              </button>
            ))}
            <RemoveButton
              name={`option ${index + 1}`}
              onClick={() => save(entries.filter((_, at) => at !== index))}
            />
          </div>
        </fieldset>
      ))}
      <button
        type="button"
        onClick={() => {
          let name = `option${entries.length + 1}`
          while (entries.some((entry) => jsonToString(entry.value) === name)) name += '_'
          save([...entries, { label: `Option ${entries.length + 1}`, value: name }])
        }}
      >
        + Add option
      </button>
    </div>
  )
}

function OptionValue({
  value,
  onChange,
}: {
  value: JsonValue
  onChange: (value: JsonValue) => void
}): ReactNode {
  const serialized = JSON.stringify(value)
  const [seen, setSeen] = useState(serialized)
  const [draft, setDraft] = useState(jsonToString(value))
  const [error, setError] = useState('')
  if (seen !== serialized) {
    setSeen(serialized)
    setDraft(jsonToString(value))
    setError('')
  }
  const type = value === null ? 'null' : typeof value
  return (
    <>
      <label>
        Value type
        <select
          value={type}
          onChange={(event) => {
            const next = event.target.value
            onChange(
              next === 'string'
                ? jsonToString(value)
                : next === 'number'
                  ? 0
                  : next === 'boolean'
                    ? false
                    : null,
            )
          }}
        >
          <option value="string">Text</option>
          <option value="number">Number</option>
          <option value="boolean">Yes / No</option>
          <option value="null">Empty</option>
          {type === 'object' && <option value="object">JSON</option>}
        </select>
      </label>
      {type === 'boolean' ? (
        <label>
          Value
          <select
            value={jsonToString(value)}
            onChange={(event) => onChange(event.target.value === 'true')}
          >
            <option value="false">No</option>
            <option value="true">Yes</option>
          </select>
        </label>
      ) : (
        type !== 'null' && (
          <label>
            Value
            <input
              value={draft}
              aria-invalid={!!error}
              onChange={(event) => {
                setDraft(event.target.value)
                if (type === 'string') onChange(event.target.value)
              }}
              onBlur={() => {
                if (type === 'string') return
                try {
                  const parsed = JSON.parse(draft) as JsonValue
                  if (type === 'number' && (typeof parsed !== 'number' || !Number.isFinite(parsed)))
                    throw new Error()
                  onChange(parsed)
                  setError('')
                } catch {
                  setError(
                    type === 'number' ? 'Enter a finite number.' : 'Enter a valid JSON value.',
                  )
                }
              }}
            />
          </label>
        )
      )}
      {error && (
        <p role="alert" className="fs-prop-row__error">
          {error}
        </p>
      )}
    </>
  )
}
