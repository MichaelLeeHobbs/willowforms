/**
 * The rendering half of the HTML kit.
 *
 * Semantic elements and a stylesheet, no component library. That is the point:
 * proving a second kit is a new package rather than a rewrite should not cost
 * this repo a second heavy dependency, and a consumer who wants their own design
 * system can copy this file and change the markup.
 *
 * Every renderer spreads `nodeProps` onto its outermost element. That is the
 * kit contract's one obligation: it puts `data-fs-key` in the DOM, which is what
 * the designer's canvas selection and drop targeting are built on, and what an
 * end-to-end test against a live form can hold onto.
 *
 * Accessibility is the kit's job, not the renderer's. Each field owns a real
 * `<label for>`, errors are announced through `aria-describedby` with
 * `role="alert"`, and an invalid field carries `aria-invalid`. A kit that skips
 * these produces an inaccessible form no amount of designer polish can fix.
 */

import { createElement, useId } from 'react'
import type { ReactNode } from 'react'
import { jsonToString, optionValue } from '@formsmith/core'
import type { JsonValue } from '@formsmith/core'
import type { NodeRenderer, NodeRendererProps, RendererKit } from '@formsmith/renderer'

type Level = 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6'

const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback)
const bool = (v: unknown): boolean => v === true
const num = (v: unknown, fallback: number): number => (typeof v === 'number' ? v : fallback)

function Screen({ props, nodeProps, children }: NodeRendererProps): ReactNode {
  return (
    <div
      {...nodeProps}
      className="fsh-screen"
      style={{ maxWidth: num(props['maxWidth'], 640), gap: num(props['gap'], 16) }}
    >
      {children}
    </div>
  )
}

function Stack({ props, nodeProps, children }: NodeRendererProps): ReactNode {
  const direction = props['direction'] === 'row' ? 'row' : 'column'
  return (
    <div
      {...nodeProps}
      className="fsh-stack"
      style={{ flexDirection: direction, gap: num(props['gap'], 16) }}
    >
      {children}
    </div>
  )
}

const LEVELS: Level[] = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6']

function isLevel(value: string): value is Level {
  return (LEVELS as string[]).includes(value)
}

function Heading({ props, nodeProps }: NodeRendererProps): ReactNode {
  /*
   * Checked, not cast. `level` reaches this from the JSON editor or a computed
   * binding, so the cast was a lie: a capitalised string made React treat it as
   * a component reference and throw, and any other string rendered a tag the
   * kit never intended.
   */
  const raw = str(props['level'], 'h2')
  const tag: Level = isLevel(raw) ? raw : 'h2'

  // createElement rather than a dynamic JSX tag: the element type is data here,
  // and writing it as <Tag> reads to React and to the linter as a component
  // being defined during render.
  return createElement(tag, { ...nodeProps, className: 'fsh-heading' }, str(props['text']))
}

/**
 * Label, control, and message, wired together.
 *
 * The message element is always rendered, even when empty, so a screen reader
 * that has already read `aria-describedby` picks up an error appearing later
 * rather than finding a reference to an element that did not exist.
 */
function Field({
  id,
  label,
  helper,
  error,
  children,
}: {
  id: string
  label: string
  helper: string
  error: string | undefined
  children: ReactNode
}): ReactNode {
  const messageId = id + '-message'
  return (
    <div className={'fsh-field' + (error ? ' is-invalid' : '')}>
      <label className="fsh-field__label" htmlFor={id}>
        {label}
      </label>
      {children}
      <p
        id={messageId}
        className={'fsh-field__message' + (error ? ' is-error' : '')}
        {...(error ? { role: 'alert' } : {})}
      >
        {error ?? helper}
      </p>
    </div>
  )
}

function TextFieldNode({ props, nodeProps, value, error, onChange }: NodeRendererProps): ReactNode {
  const id = useId()
  const shared = {
    id,
    className: 'fsh-input',
    placeholder: str(props['placeholder']),
    disabled: bool(props['disabled']),
    value: jsonToString(value),
    'aria-invalid': error ? true : undefined,
    'aria-describedby': id + '-message',
  }

  return (
    <div {...nodeProps}>
      <Field id={id} label={str(props['label'])} helper={str(props['helperText'])} error={error}>
        {bool(props['multiline']) ? (
          <textarea {...shared} rows={4} onChange={(e) => onChange(e.target.value)} />
        ) : (
          <input {...shared} type="text" onChange={(e) => onChange(e.target.value)} />
        )}
      </Field>
    </div>
  )
}

function NumberFieldNode({
  props,
  nodeProps,
  value,
  error,
  onChange,
}: NodeRendererProps): ReactNode {
  const id = useId()
  return (
    <div {...nodeProps}>
      <Field id={id} label={str(props['label'])} helper={str(props['helperText'])} error={error}>
        <input
          id={id}
          className="fsh-input"
          type="number"
          disabled={bool(props['disabled'])}
          value={jsonToString(value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={id + '-message'}
          onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
        />
      </Field>
    </div>
  )
}

function CheckboxNode({ props, nodeProps, value, error, onChange }: NodeRendererProps): ReactNode {
  const id = useId()
  const messageId = id + '-message'
  return (
    <div {...nodeProps}>
      <div className={'fsh-field fsh-field--inline' + (error ? ' is-invalid' : '')}>
        <input
          id={id}
          className="fsh-checkbox"
          type="checkbox"
          disabled={bool(props['disabled'])}
          checked={value === true}
          aria-invalid={error ? true : undefined}
          aria-describedby={messageId}
          onChange={(e) => onChange(e.target.checked)}
        />
        <label className="fsh-field__label" htmlFor={id}>
          {str(props['label'])}
        </label>
        <p
          id={messageId}
          className={'fsh-field__message' + (error ? ' is-error' : '')}
          {...(error ? { role: 'alert' } : {})}
        >
          {error ?? ''}
        </p>
      </div>
    </div>
  )
}

function SelectNode({ props, nodeProps, value, error, onChange }: NodeRendererProps): ReactNode {
  const id = useId()
  const raw = props['options']
  const options = Array.isArray(raw) ? raw : []

  return (
    <div {...nodeProps}>
      <Field id={id} label={str(props['label'])} helper={str(props['helperText'])} error={error}>
        <select
          id={id}
          className="fsh-input"
          disabled={bool(props['disabled'])}
          value={jsonToString(value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={id + '-message'}
          onChange={(e) => onChange(optionValue(options, e.target.value))}
        >
          <option value="">Choose…</option>
          {options.map((option, i) => {
            const o = option as { label?: unknown; value?: JsonValue }
            /*
             * jsonToString, not a fallback to the array index. Numeric option
             * values are the natural thing to type into the JSON editor, and
             * treating them as missing made every value its own position:
             * choosing the first option submitted "0" whatever it said.
             */
            const v = o.value === undefined ? String(i) : jsonToString(o.value)
            return (
              <option key={v || String(i)} value={v}>
                {str(o.label, v)}
              </option>
            )
          })}
        </select>
      </Field>
    </div>
  )
}

function ButtonNode({ props, nodeProps }: NodeRendererProps): ReactNode {
  const variant = str(props['variant'], 'solid')
  const safe = variant === 'outline' || variant === 'plain' ? variant : 'solid'
  return (
    <button
      {...nodeProps}
      type="button"
      className={'fsh-button fsh-button--' + safe}
      disabled={bool(props['disabled'])}
    >
      {str(props['text'], 'Button')}
    </button>
  )
}

const renderers: Record<string, NodeRenderer> = {
  Screen,
  Stack,
  Heading,
  TextField: TextFieldNode,
  NumberField: NumberFieldNode,
  Checkbox: CheckboxNode,
  Select: SelectNode,
  Button: ButtonNode,
}

export const htmlRendererKit: RendererKit = { id: 'html', renderers }
