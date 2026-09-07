import { useId, useState } from 'react'
import type { ChangeEvent, ReactNode } from 'react'
import { dataKeyOf, flatten, indexKit, isRowScope } from '@willowforms/core'
import type {
  ActionRef,
  ComponentNode,
  FormDocument,
  JsonValue,
  Kit,
  PropOption,
} from '@willowforms/core'

interface Target {
  address: string
  label: string
  node: ComponentNode
}

function targetsFor(root: ComponentNode): Target[] {
  const prefixes = new Map<string, string>()
  const targets: Target[] = []
  for (const { node, parentKey } of flatten(root)) {
    const prefix = parentKey ? (prefixes.get(parentKey) ?? '') : ''
    const address = prefix + dataKeyOf(node)
    if (node.schema && !targets.some((target) => target.address === address)) {
      const label = node.props['label']
      targets.push({
        address,
        node,
        label:
          label?.kind === 'static' && typeof label.value === 'string' && label.value
            ? `${label.value} — ${address}`
            : address,
      })
    }
    prefixes.set(node.key, isRowScope(node) ? address + '[].' : prefix)
  }
  return targets
}

export function ActionFields({
  action,
  document,
  kit,
  onChange,
}: {
  action: ActionRef
  document: FormDocument
  kit: Kit
  onChange: (next: ActionRef) => void
}): ReactNode {
  const params = action.params ?? {}
  const write = (values: Record<string, JsonValue | undefined>): void => {
    const next = { ...params }
    for (const [key, value] of Object.entries(values)) {
      if (value === undefined) delete next[key]
      else next[key] = value
    }
    onChange({ ...action, params: next })
  }
  const text = (name: string, label: string, optional = false): ReactNode => (
    <DraftValue
      label={label}
      value={typeof params[name] === 'string' ? params[name] : ''}
      kind="string"
      onChange={(value) => write({ [name]: optional && value === '' ? undefined : value })}
    />
  )
  if (action.type !== 'builtin') return null
  switch (action.name) {
    case 'setValue':
    case 'clearValue': {
      const targets = targetsFor(document.root)
      const address = typeof params['address'] === 'string' ? params['address'] : ''
      const template = address.replace(/\[\d+\]/g, '[]')
      const target = targets.find((entry) => entry.address === template)
      const indices = [...address.matchAll(/\[(\d+)\]/g)].map((match) => Number(match[1]))
      const options = target ? choicesFor(target.node, kit) : []
      return (
        <>
          <label>
            Target field
            <select
              value={target?.address ?? address}
              onChange={(e) =>
                write({
                  address: e.target.value.replaceAll('[]', '[0]'),
                  ...(action.name === 'setValue' ? { value: null } : {}),
                })
              }
            >
              <option value="">Choose a field…</option>
              {!target && address && <option value={address}>Unavailable field — {address}</option>}
              {targets.map((entry) => (
                <option key={entry.address} value={entry.address}>
                  {entry.label}
                </option>
              ))}
            </select>
          </label>
          {target &&
            indices.map((index, at) => (
              <DraftValue
                key={at}
                label={`Row number${indices.length > 1 ? ' (level ' + String(at + 1) + ')' : ''}`}
                kind="number"
                value={index + 1}
                min={1}
                max={999999999999999}
                integer
                onChange={(value) => {
                  if (typeof value !== 'number') return
                  let position = 0
                  write({
                    address: address.replace(/\[\d+\]/g, (part) =>
                      position++ === at ? `[${String(value - 1)}]` : part,
                    ),
                  })
                }}
              />
            ))}
          {indices.length > 0 && (
            <p className="fs-rules__note">
              Targets a specific row, counted from 1. The host decides how to handle a row that does
              not exist.
            </p>
          )}
          {!targets.length && (
            <p className="fs-rules__note">Add a field to the form to choose a target.</p>
          )}
          {action.name === 'setValue' && target && (
            <ValueField
              key={address}
              value={params['value'] ?? null}
              kind={
                target.node.type === 'TextArea'
                  ? 'multiline'
                  : (target.node.schema?.type ?? 'string')
              }
              options={options}
              onChange={(value) => write({ value })}
            />
          )}
        </>
      )
    }
    case 'focus': {
      const nodes = flatten(document.root).map(({ node }) => node)
      const key = typeof params['nodeKey'] === 'string' ? params['nodeKey'] : ''
      return (
        <label>
          Component to focus
          <select value={key} onChange={(e) => write({ nodeKey: e.target.value })}>
            <option value="">Choose a component…</option>
            {key && !nodes.some((node) => node.key === key) && (
              <option value={key}>Unavailable component — {key}</option>
            )}
            {nodes.map((node) => (
              <option key={node.key} value={node.key}>
                {node.key} — {indexKit(kit).get(node.type)?.label ?? node.type}
              </option>
            ))}
          </select>
        </label>
      )
    }
    case 'announce':
      return text('message', 'Message')
    case 'setContext':
      return (
        <>
          {text('path', 'Context path')}
          <p className="fs-rules__note">Context names are supplied by the host application.</p>
          <ValueField value={params['value'] ?? null} onChange={(value) => write({ value })} />
        </>
      )
    case 'validate':
      return text('scope', 'Validation scope (optional)', true)
    case 'emit':
      return (
        <>
          {text('event', 'Event name')}
          <details>
            <summary>Event payload (optional)</summary>
            <ValueField
              label="Payload"
              value={params['payload'] ?? null}
              onChange={(value) => write({ payload: value })}
            />
          </details>
        </>
      )
    case 'halt':
      return text('reason', 'Reason (optional)', true)
    default:
      return null
  }
}

function choicesFor(node: ComponentNode, kit: Kit): PropOption[] {
  const prop = node.props['options']
  const raw = prop
    ? prop.kind === 'static'
      ? prop.value
      : undefined
    : indexKit(kit).get(node.type)?.defaultProps['options']
  const options = Array.isArray(raw)
    ? raw.filter(
        (item): item is { label: string; value: JsonValue } =>
          item !== null &&
          typeof item === 'object' &&
          !Array.isArray(item) &&
          typeof item['label'] === 'string' &&
          Object.hasOwn(item, 'value'),
      )
    : []
  if (options.length || node.type !== 'RadioGroup' || (prop && prop.kind !== 'static'))
    return options
  return (node.children ?? []).flatMap((child) => {
    const value = child.props['value']
    const label = child.props['label']
    return child.type === 'RadioItem' && value?.kind === 'static'
      ? [
          {
            value: value.value,
            label:
              label?.kind === 'static' && typeof label.value === 'string'
                ? label.value
                : JSON.stringify(value.value),
          },
        ]
      : []
  })
}

function ValueField({
  label = 'Value',
  kind,
  value,
  options = [],
  onChange,
}: {
  label?: string
  kind?: string
  value: JsonValue
  options?: PropOption[]
  onChange: (value: JsonValue) => void
}): ReactNode {
  const inferred = value === null ? 'string' : Array.isArray(value) ? 'array' : typeof value
  const [chosen, setChosen] = useState(inferred)
  const [seenType, setSeenType] = useState(inferred)
  if (value !== null && inferred !== seenType) {
    setSeenType(inferred)
    setChosen(inferred)
  }
  const type = kind ?? chosen
  const optionIndex = options.findIndex(
    (option) => JSON.stringify(option.value) === JSON.stringify(value),
  )
  return (
    <>
      {!kind && (
        <label>
          {label} type
          <select
            value={chosen}
            onChange={(e) => {
              setChosen(e.target.value)
              onChange(
                e.target.value === 'boolean'
                  ? false
                  : e.target.value === 'number'
                    ? 0
                    : e.target.value === 'array'
                      ? []
                      : e.target.value === 'object'
                        ? {}
                        : '',
              )
            }}
          >
            {['string', 'number', 'boolean', 'array', 'object'].map((type) => (
              <option key={type} value={type}>
                {
                  {
                    string: 'Text',
                    number: 'Number',
                    boolean: 'True / false',
                    array: 'List (JSON)',
                    object: 'Object (JSON)',
                  }[type]
                }
              </option>
            ))}
          </select>
        </label>
      )}
      {options.length > 0 ? (
        <label>
          {label}
          <select
            aria-label={label}
            value={value === null ? '' : optionIndex < 0 ? 'unknown' : String(optionIndex)}
            onChange={(e) =>
              onChange(e.target.value === '' ? null : options[Number(e.target.value)]!.value)
            }
          >
            <option value="">No value</option>
            {value !== null && optionIndex < 0 && (
              <option value="unknown" disabled>
                Current value: {JSON.stringify(value)}
              </option>
            )}
            {options.map((option, index) => (
              <option key={index} value={String(index)}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      ) : type === 'boolean' ? (
        <label>
          {label}
          <select
            aria-label={label}
            value={value === null ? '' : typeof value === 'boolean' ? String(value) : 'unknown'}
            onChange={(e) => onChange(e.target.value === '' ? null : e.target.value === 'true')}
          >
            <option value="">No value</option>
            <option value="true">True</option>
            <option value="false">False</option>
            {value !== null && typeof value !== 'boolean' && (
              <option value="unknown" disabled>
                Current value: {JSON.stringify(value)}
              </option>
            )}
          </select>
        </label>
      ) : (
        <DraftValue label={label} value={value} kind={type} onChange={onChange} />
      )}
      {value !== null && (
        <button type="button" className="fs-action__clear" onClick={() => onChange(null)}>
          Clear {label.toLowerCase()}
        </button>
      )}
    </>
  )
}

function DraftValue({
  label,
  value,
  kind,
  onChange,
  min,
  max,
  integer,
}: {
  label: string
  value: JsonValue
  kind: string
  onChange: (value: JsonValue) => void
  min?: number
  max?: number
  integer?: boolean
}): ReactNode {
  const id = useId()
  const json = ['object', 'array', 'file'].includes(kind)
  const serialized = json
    ? JSON.stringify(value, null, 2)
    : value === null
      ? ''
      : typeof value === 'object'
        ? JSON.stringify(value)
        : String(value)
  const [draft, setDraft] = useState(serialized)
  const [seen, setSeen] = useState(serialized)
  const [error, setError] = useState('')
  const [badInput, setBadInput] = useState(false)
  if (seen !== serialized) {
    setSeen(serialized)
    setDraft(serialized)
    setError('')
    setBadInput(false)
  }
  const commit = (): void => {
    if (badInput) {
      setError('Enter a valid number.')
      return
    }
    if (draft === serialized) return
    try {
      const next: JsonValue = json
        ? (JSON.parse(draft) as JsonValue)
        : kind === 'number'
          ? draft === ''
            ? null
            : Number(draft)
          : draft
      if (
        kind === 'number' &&
        ((next !== null && (typeof next !== 'number' || !Number.isFinite(next))) ||
          (integer && (typeof next !== 'number' || !Number.isInteger(next))) ||
          (typeof next === 'number' &&
            ((min !== undefined && next < min) || (max !== undefined && next > max))))
      )
        throw new Error(
          'Enter a valid number' + (min !== undefined ? ' of at least ' + String(min) : '') + '.',
        )
      if (
        json &&
        next !== null &&
        (kind === 'array' ? !Array.isArray(next) : typeof next !== 'object' || Array.isArray(next))
      )
        throw new Error(kind === 'array' ? 'Enter a JSON list.' : 'Enter a JSON object.')
      onChange(next)
      setError('')
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'Enter valid JSON.')
    }
  }
  const props = {
    value: draft,
    'aria-label': label + (json ? ' (JSON)' : ''),
    'aria-invalid': error ? (true as const) : undefined,
    'aria-describedby': error ? id + '-error' : undefined,
    onChange: (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setDraft(e.target.value)
      setBadInput(kind === 'number' && e.target.validity.badInput)
      setError('')
    },
    onBlur: commit,
  }
  return (
    <label>
      {label}
      {json ? ' (JSON)' : ''}
      {json || kind === 'multiline' ? (
        <textarea {...props} className={json ? 'fs-code__area' : undefined} rows={4} />
      ) : (
        <input
          {...props}
          type={kind === 'number' ? 'number' : kind === 'date' ? 'date' : 'text'}
          min={min}
          max={max}
          step={integer ? 1 : 'any'}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              commit()
            }
            if (e.key === 'Escape') {
              setDraft(serialized)
              setError('')
              setBadInput(false)
            }
          }}
        />
      )}
      {error && (
        <span id={id + '-error'} className="fs-prop-row__error" role="alert">
          {error}
        </span>
      )}
    </label>
  )
}
