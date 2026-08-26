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

import { createContext, createElement, useContext, useId } from 'react'
import type { ReactNode } from 'react'
import { jsonToString, optionValue, safeHref } from '@formsmith/core'
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

function Grid({ props, nodeProps, children }: NodeRendererProps): ReactNode {
  const columns = num(props['columns'], 2)
  const minWidth = num(props['minColumnWidth'], 200)
  return (
    <div
      {...nodeProps}
      className="fsh-grid"
      style={{
        // `auto-fit` with a floor is what makes this responsive without asking
        // the author for breakpoints: columns collapse when they cannot fit.
        gridTemplateColumns: `repeat(auto-fit, minmax(min(${minWidth}px, 100%), 1fr))`,
        gap: num(props['gap'], 16),
        maxWidth: columns > 0 ? columns * (minWidth + num(props['gap'], 16)) : undefined,
      }}
    >
      {children}
    </div>
  )
}

function Box({ props, nodeProps, children }: NodeRendererProps): ReactNode {
  return (
    <div
      {...nodeProps}
      className="fsh-box"
      style={{
        padding: num(props['padding'], 16),
        background: str(props['background']) || undefined,
        borderRadius: num(props['radius'], 0),
      }}
    >
      {children}
    </div>
  )
}

function Card({ props, nodeProps, children }: NodeRendererProps): ReactNode {
  const title = str(props['title'])
  const subtitle = str(props['subtitle'])
  const variant = props['variant'] === 'elevated' ? 'elevated' : 'outlined'
  return (
    <section {...nodeProps} className={'fsh-card fsh-card--' + variant}>
      {(title || subtitle) && (
        <header className="fsh-card__header">
          {title && <h3 className="fsh-card__title">{title}</h3>}
          {subtitle && <p className="fsh-card__subtitle">{subtitle}</p>}
        </header>
      )}
      {children}
    </section>
  )
}

function Text({ props, nodeProps }: NodeRendererProps): ReactNode {
  const variant = str(props['variant'], 'body')
  // Narrowed rather than cast: the value comes from a document, which a person
  // can hand-edit, so `align: "javascript:"` has to land somewhere harmless.
  const raw = props['align']
  const align = raw === 'center' || raw === 'end' ? raw : 'start'
  return (
    <p {...nodeProps} className={'fsh-text fsh-text--' + variant} style={{ textAlign: align }}>
      {str(props['text'])}
    </p>
  )
}

function Divider({ props, nodeProps }: NodeRendererProps): ReactNode {
  const vertical = props['orientation'] === 'vertical'
  /*
   * `<hr>` is the semantic element for a thematic break and carries an implicit
   * role of separator, so a screen reader is told the same thing the eye is.
   */
  return (
    <hr
      {...nodeProps}
      className={'fsh-divider' + (vertical ? ' fsh-divider--vertical' : '')}
      {...(vertical ? { 'aria-orientation': 'vertical' as const } : {})}
    />
  )
}

function Image({ props, nodeProps }: NodeRendererProps): ReactNode {
  const width = num(props['width'], 0)
  const rawFit = props['fit']
  const fit = rawFit === 'contain' || rawFit === 'fill' ? rawFit : 'cover'
  /*
   * `alt` is always present, never omitted. An empty string is the platform's
   * way of saying decorative, and it is a different statement from a missing
   * attribute, which leaves a screen reader reading out the file name.
   */
  return (
    <img
      {...nodeProps}
      className="fsh-image"
      src={str(props['src'])}
      alt={str(props['alt'])}
      style={{
        objectFit: fit,
        width: width > 0 ? width : '100%',
      }}
    />
  )
}

function TextAreaNode({ props, nodeProps, value, error, onChange }: NodeRendererProps): ReactNode {
  const id = useId()
  return (
    <div {...nodeProps}>
      <Field id={id} label={str(props['label'])} helper={str(props['helperText'])} error={error}>
        <textarea
          id={id}
          className="fsh-input"
          rows={num(props['rows'], 4)}
          placeholder={str(props['placeholder'])}
          disabled={bool(props['disabled'])}
          value={str(value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={id + '-message'}
          onChange={(e) => onChange(e.target.value)}
        />
      </Field>
    </div>
  )
}

function ButtonGroupNode({ props, nodeProps, children }: NodeRendererProps): ReactNode {
  const vertical = props['orientation'] === 'vertical'
  /*
   * `role="group"` rather than `toolbar`: toolbar implies arrow-key navigation
   * between its controls, which this does not provide, and claiming a keyboard
   * pattern that is not there is worse than claiming nothing.
   */
  return (
    <div
      {...nodeProps}
      role="group"
      className={'fsh-button-group' + (vertical ? ' fsh-button-group--vertical' : '')}
    >
      {children}
    </div>
  )
}

function SwitchNode({ props, nodeProps, value, error, onChange }: NodeRendererProps): ReactNode {
  const id = useId()
  const messageId = id + '-message'
  /*
   * A checkbox with `role="switch"`, which is the platform pattern: the input
   * carries the state and the keyboard behaviour, and the role changes only
   * what a screen reader calls it.
   */
  return (
    <div {...nodeProps} className="fsh-field">
      <label className="fsh-switch" htmlFor={id}>
        <input
          id={id}
          type="checkbox"
          role="switch"
          className="fsh-switch__input"
          checked={bool(value)}
          disabled={bool(props['disabled'])}
          aria-invalid={error ? true : undefined}
          aria-describedby={messageId}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span className="fsh-switch__track" aria-hidden="true" />
        <span>{str(props['label'])}</span>
      </label>
      <p
        id={messageId}
        className={'fsh-field__message' + (error ? ' is-error' : '')}
        {...(error ? { role: 'alert' } : {})}
      >
        {error ?? str(props['helperText'])}
      </p>
    </div>
  )
}

/**
 * What a RadioItem needs from the group above it.
 *
 * A RadioItem used to render a radio wired to nothing, so clicking one did
 * nothing at all while looking exactly like an option. The group owns
 * selection, which is right; it just has to hand the item enough to take part.
 *
 * Kit-local, and deliberately so: this is two components in one package
 * agreeing with each other, not a new obligation on the kit contract.
 */
interface RadioContext {
  name: string
  selected: string
  onSelect: (value: JsonValue) => void
}

const RadioGroupContext = createContext<RadioContext | undefined>(undefined)

function RadioGroupNode({
  props,
  nodeProps,
  value,
  error,
  onChange,
  children,
}: NodeRendererProps): ReactNode {
  const id = useId()
  const messageId = id + '-message'
  const raw = props['options']
  const options = Array.isArray(raw) ? raw : []

  /*
   * A fieldset with a legend, not a div with a label: a group of radios has one
   * question and many answers, and `aria-labelledby` on a div is the workaround
   * for markup that cannot say that. `role="radiogroup"` is implicit here.
   */
  return (
    <fieldset
      {...nodeProps}
      className="fsh-field"
      disabled={bool(props['disabled'])}
      aria-invalid={error ? true : undefined}
      aria-describedby={messageId}
    >
      <legend className="fsh-field__label">{str(props['label'])}</legend>
      <RadioGroupContext.Provider
        value={{ name: id, selected: jsonToString(value), onSelect: onChange }}
      >
        <div className={'fsh-radios fsh-radios--' + str(props['direction'], 'column')}>
          {options.map((option, i) => {
            const o = option as { label?: unknown; value?: JsonValue }
            const v = o.value === undefined ? String(i) : jsonToString(o.value)
            return (
              <label key={v || String(i)} className="fsh-radio">
                <input
                  type="radio"
                  name={id}
                  value={v}
                  checked={jsonToString(value) === v}
                  onChange={() => onChange(optionValue(options, v))}
                />
                <span>{typeof o.label === 'string' ? o.label : v}</span>
              </label>
            )
          })}
          {/* Children are RadioItems, for options that need their own layout. */}
          {children}
        </div>
      </RadioGroupContext.Provider>
      <p
        id={messageId}
        className={'fsh-field__message' + (error ? ' is-error' : '')}
        {...(error ? { role: 'alert' } : {})}
      >
        {error ?? str(props['helperText'])}
      </p>
    </fieldset>
  )
}

function RadioItemNode({ props, nodeProps }: NodeRendererProps): ReactNode {
  const group = useContext(RadioGroupContext)
  const value = str(props['value'])

  /*
   * Outside a group there is no question to answer, so the radio is disabled
   * rather than rendered as a control that cannot do anything. The designer
   * lets a RadioItem be dropped anywhere; this is what it looks like when it
   * has been dropped somewhere that makes no sense.
   */
  return (
    <label {...nodeProps} className="fsh-radio">
      <input
        type="radio"
        name={group?.name}
        value={value}
        checked={group ? group.selected === value : false}
        disabled={!group || bool(props['disabled'])}
        onChange={() => group?.onSelect(value)}
      />
      <span>{str(props['label'])}</span>
    </label>
  )
}

function DatePickerNode({
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
          type="date"
          className="fsh-input"
          min={str(props['min']) || undefined}
          max={str(props['max']) || undefined}
          disabled={bool(props['disabled'])}
          value={str(value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={id + '-message'}
          onChange={(e) => onChange(e.target.value || null)}
        />
      </Field>
    </div>
  )
}

function FileUploadNode({ props, nodeProps, error, onChange }: NodeRendererProps): ReactNode {
  const id = useId()
  const multiple = bool(props['multiple'])
  /*
   * The value is the selected file's name, and nothing more. A file input is
   * uncontrolled by design, and turning bytes into form data is an upload
   * protocol this project does not own: the host reads the input when it
   * submits. Reporting the name keeps validation and the schema honest about
   * whether a file was chosen.
   */
  return (
    <div {...nodeProps}>
      <Field id={id} label={str(props['label'])} helper={str(props['helperText'])} error={error}>
        <input
          id={id}
          type="file"
          className="fsh-input"
          accept={str(props['accept']) || undefined}
          multiple={multiple}
          disabled={bool(props['disabled'])}
          aria-invalid={error ? true : undefined}
          aria-describedby={id + '-message'}
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []).map((file) => file.name)
            onChange(multiple ? files : (files[0] ?? null))
          }}
        />
      </Field>
    </div>
  )
}

function AlertNode({ props, nodeProps }: NodeRendererProps): ReactNode {
  const severity = str(props['severity'], 'info')
  const title = str(props['title'])
  /*
   * Only an error announces itself. This component is authored into the form,
   * so it is on screen from the first paint; `role="alert"` on all four would
   * have a screen reader read every notice on the page before the form itself.
   */
  return (
    <div
      {...nodeProps}
      className={'fsh-alert fsh-alert--' + severity}
      {...(severity === 'error' ? { role: 'alert' as const } : {})}
    >
      {title && <strong className="fsh-alert__title">{title}</strong>}
      <span>{str(props['text'])}</span>
    </div>
  )
}

function ProgressNode({ props, nodeProps }: NodeRendererProps): ReactNode {
  const circular = props['variant'] === 'circular'
  const raw = props['value']
  const determinate = typeof raw === 'number'
  const value = determinate ? Math.min(100, Math.max(0, raw)) : 0

  return (
    <div
      {...nodeProps}
      role="progressbar"
      aria-label={str(props['label'], 'Progress')}
      // Omitted entirely when indeterminate, which is how the platform says
      // "running, length unknown" rather than "zero percent done".
      {...(determinate ? { 'aria-valuenow': value, 'aria-valuemin': 0, 'aria-valuemax': 100 } : {})}
      className={'fsh-progress' + (circular ? ' fsh-progress--circular' : '')}
    >
      <span
        className="fsh-progress__fill"
        style={determinate ? { inlineSize: value + '%' } : undefined}
      />
    </div>
  )
}

function LinkNode({ props, nodeProps }: NodeRendererProps): ReactNode {
  const href = safeHref(props['href'])
  const blank = props['target'] === 'blank'
  /*
   * A refused address renders as text, not as a dead link. A link that looks
   * like a link and does nothing is the failure this project treats as worst.
   */
  if (!href) {
    return (
      <span {...nodeProps} className="fsh-link is-inert">
        {str(props['text'], 'Link')}
      </span>
    )
  }
  return (
    <a
      {...nodeProps}
      className="fsh-link"
      href={href}
      // noopener is what stops the opened page reaching back through
      // window.opener; noreferrer is the courtesy that goes with it.
      {...(blank ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
    >
      {str(props['text'], 'Link')}
    </a>
  )
}

function BreadcrumbsNode({ props, nodeProps }: NodeRendererProps): ReactNode {
  const raw = props['items']
  const items = Array.isArray(raw) ? raw : []
  const last = items.length - 1

  return (
    <nav {...nodeProps} aria-label="Breadcrumb">
      <ol className="fsh-breadcrumbs">
        {items.map((item, i) => {
          const entry = item as { label?: unknown; href?: JsonValue }
          const text = typeof entry.label === 'string' ? entry.label : String(i + 1)
          const href = safeHref(entry.href)
          return (
            <li key={text + ':' + String(i)}>
              {/* The last crumb is where you are, so it is text and says so. */}
              {i === last || !href ? (
                <span {...(i === last ? { 'aria-current': 'page' as const } : {})}>{text}</span>
              ) : (
                <a className="fsh-link" href={href}>
                  {text}
                </a>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
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
  Grid,
  Box,
  Card,
  Text,
  Divider,
  Image,
  TextArea: TextAreaNode,
  ButtonGroup: ButtonGroupNode,
  Switch: SwitchNode,
  RadioGroup: RadioGroupNode,
  RadioItem: RadioItemNode,
  DatePicker: DatePickerNode,
  FileUpload: FileUploadNode,
  Alert: AlertNode,
  Progress: ProgressNode,
  Link: LinkNode,
  Breadcrumbs: BreadcrumbsNode,
}

export const htmlRendererKit: RendererKit = { id: 'html', renderers }
