import { useId, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { indexKit } from '@willowforms/core'
import type { ActionRef, EventName, FormDocument, JsonValue, Kit } from '@willowforms/core'

import type { DesignerApi } from '../store.js'
import { ActionFields } from './ActionFields.js'
import { RemoveButton } from './RemoveButton.js'
import { paramsText } from './text.js'

const LABELS: Record<string, string> = {
  setValue: 'Set field value',
  clearValue: 'Clear field value',
  focus: 'Focus component',
  announce: 'Announce message',
  setContext: 'Update context',
  validate: 'Validate form',
  emit: 'Emit event',
  halt: 'Stop actions',
}

const BUILTINS: ReadonlyArray<{ name: string; params: Record<string, JsonValue> }> = [
  { name: 'setValue', params: { address: '', value: null } },
  { name: 'clearValue', params: { address: '' } },
  { name: 'focus', params: { nodeKey: '' } },
  { name: 'announce', params: { message: '' } },
  { name: 'setContext', params: { path: '', value: null } },
  { name: 'validate', params: {} },
  { name: 'emit', params: { event: '' } },
  { name: 'halt', params: {} },
]

interface ActionRowProps {
  action: ActionRef
  document: FormDocument
  kit: Kit
  index: number
  count: number
  onChange: (next: ActionRef) => void
  onMove: (offset: -1 | 1) => void
  onRemove: () => void
}

function ActionRow({
  action,
  document,
  kit,
  index,
  count,
  onChange,
  onMove,
  onRemove,
}: ActionRowProps): ReactNode {
  const id = useId()
  const [params, setParams] = useState(() => paramsText(action.params))
  const [error, setError] = useState('')
  const stored = paramsText(action.params)
  const [seen, setSeen] = useState(stored)
  if (seen !== stored) {
    setSeen(stored)
    setParams(stored)
    setError('')
  }

  const commit = (): void => {
    if (params === stored) {
      setError('')
      return
    }
    try {
      const parsed: unknown = JSON.parse(params)
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        setError('Parameters must be a JSON object.')
        return
      }
      onChange({ ...action, params: parsed as Record<string, JsonValue> })
      setError('')
    } catch {
      setError('Parameters must be valid JSON.')
    }
  }

  return (
    <li className="fs-action">
      <div className="fs-action__head">
        <strong>
          {action.type === 'builtin' ? (LABELS[action.name] ?? action.name) : action.name}
        </strong>
        <span>
          <button
            type="button"
            aria-label={`Move ${action.name} up`}
            disabled={index === 0}
            onClick={() => onMove(-1)}
          >
            ↑
          </button>
          <button
            type="button"
            aria-label={`Move ${action.name} down`}
            disabled={index === count - 1}
            onClick={() => onMove(1)}
          >
            ↓
          </button>
          <RemoveButton name={action.name} onClick={onRemove} />
        </span>
      </div>
      <ActionFields action={action} document={document} kit={kit} onChange={onChange} />
      <details open={action.type === 'code'}>
        <summary>Advanced parameters</summary>
        <label>
          Parameters
          <textarea
            aria-label="Parameters"
            className="fs-code__area"
            rows={4}
            value={params}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? id + '-error' : undefined}
            onChange={(event) => {
              setParams(event.target.value)
              setError('')
            }}
            onBlur={commit}
          />
        </label>
        {error && (
          <p id={id + '-error'} className="fs-languages__error" role="alert">
            {error}
          </p>
        )}
      </details>
    </li>
  )
}

export interface ActionsProps {
  api: DesignerApi
  kit: Kit
}

export function Actions({ api, kit }: ActionsProps): ReactNode {
  const node = api.selectedNode
  const supported = useMemo(
    () => (node ? (indexKit(kit).get(node.type)?.events ?? []) : []),
    [kit, node],
  )
  const [choices, setChoices] = useState<Partial<Record<EventName, string>>>({})
  const storedActions: unknown = api.document.actions
  const actions =
    storedActions && typeof storedActions === 'object' && !Array.isArray(storedActions)
      ? (storedActions as typeof api.document.actions)
      : {}

  if (!node) return <p className="fs-empty">Select a component to wire its actions.</p>
  if (supported.length === 0)
    return <p className="fs-empty">This component does not raise events.</p>

  const write = (event: EventName, refs: ActionRef[]): void => {
    api.setNodeEvents(node.key, { ...(node.events ?? {}), [event]: refs })
  }

  const add = (event: EventName): void => {
    const choice = choices[event] ?? ''
    if (!choice) return
    const [type, ...nameParts] = choice.split(':')
    const name = nameParts.join(':')
    const builtin = BUILTINS.find((item) => item.name === name)
    const ref: ActionRef =
      type === 'builtin'
        ? { type: 'builtin', name, params: { ...(builtin?.params ?? {}) } }
        : { type: 'code', name, params: {} }
    write(event, [...(node.events?.[event] ?? []), ref])
    setChoices((current) => ({ ...current, [event]: '' }))
  }

  return (
    <div className="fs-actions">
      <p className="fs-rules__note">
        Choose what happens on each event. The host application applies the actions. Code actions
        require a host-provided sandbox.
      </p>
      {supported.map((event) => {
        const refs = node.events?.[event] ?? []
        return (
          <section key={event} className="fs-actions__event">
            <h3 className="fs-rules__heading">
              {event} <span className="fs-rules__count">{refs.length}</span>
            </h3>
            {refs.length > 0 && (
              <ol className="fs-actions__list">
                {refs.map((ref, index) => (
                  <ActionRow
                    key={`${node.key}:${event}:${ref.type}:${ref.name}:${index}`}
                    action={ref}
                    document={api.document}
                    kit={kit}
                    index={index}
                    count={refs.length}
                    onChange={(next) =>
                      write(
                        event,
                        refs.map((item, at) => (at === index ? next : item)),
                      )
                    }
                    onMove={(offset) => {
                      const next = [...refs]
                      const target = index + offset
                      ;[next[index], next[target]] = [next[target]!, next[index]!]
                      write(event, next)
                    }}
                    onRemove={() =>
                      write(
                        event,
                        refs.filter((_, at) => at !== index),
                      )
                    }
                  />
                ))}
              </ol>
            )}
            <div className="fs-rules__add">
              <select
                aria-label={`Action for ${event}`}
                value={choices[event] ?? ''}
                onChange={(change) =>
                  setChoices((current) => ({ ...current, [event]: change.target.value }))
                }
              >
                <option value="">Choose an action…</option>
                <optgroup label="Built-ins">
                  {BUILTINS.map((item) => (
                    <option key={item.name} value={`builtin:${item.name}`}>
                      {LABELS[item.name] ?? item.name}
                    </option>
                  ))}
                </optgroup>
                {Object.keys(actions).length > 0 && (
                  <optgroup label="Code actions">
                    {Object.keys(actions)
                      .sort()
                      .map((name) => (
                        <option key={name} value={`code:${name}`}>
                          {name}
                        </option>
                      ))}
                  </optgroup>
                )}
              </select>
              <button type="button" disabled={!choices[event]} onClick={() => add(event)}>
                Add
              </button>
            </div>
          </section>
        )
      })}
    </div>
  )
}
