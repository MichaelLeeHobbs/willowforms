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

import { Children, createContext, createElement, useContext, useId } from 'react'
import type { ReactNode } from 'react'
import { htmlKit } from './definitions.js'
import {
  isRequired,
  itemLimits,
  jsonToString,
  optionEntry,
  optionValue,
  safeHref,
  safeImageSource,
  backgroundImageStyle,
  safeStyleValue,
} from '@formsmith/core'
import type { JsonValue } from '@formsmith/core'
import type {
  NodeEventHandlers,
  NodeRenderer,
  NodeRendererProps,
  RendererKit,
} from '@formsmith/renderer'

type Level = 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6'

const str = (v: unknown, fallback = ''): string => {
  /*
   * A non-string that is still text renders as its text, not as the fallback.
   *
   * This read `typeof v === 'string' && v ? v : fallback`, which collapses "not
   * a string" and "the empty string" into one answer -- so a label, text,
   * helper or placeholder arriving as a number showed the fallback instead of
   * itself. A `computed` binding is evaluated by the host at render time, so a
   * number genuinely arrives: `label: { kind: 'computed', expression: 'year' }`
   * drew nothing.
   *
   * `jsonToString` is the project's one answer to "what does this value look
   * like", which both kits already use for a field's value. An empty result
   * still falls back, because an empty label is a label nobody wrote.
   */
  const text = typeof v === 'string' ? v : jsonToString(v as JsonValue | undefined)
  return text === '' ? fallback : text
}

const oneOf = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T =>
  allowed.includes(v as T) ? (v as T) : fallback

// ARIA exposes required state without enabling a second, browser-owned validator.
const requiredProps = (required: boolean): { 'aria-required'?: true } =>
  required ? { 'aria-required': true } : {}
const bool = (v: unknown): boolean => v === true
/*
 * A finite number, or the fallback.
 *
 * `typeof NaN` is `'number'`, and a document can hold one: `JSON.parse('{"a":1e999}')`
 * gives `Infinity`, and an expression can return either. It reached
 * `aria-valuenow="NaN"` and an inline width of `NaN%`, which browsers drop --
 * so an indeterminate progress bar painted itself full and told a screen
 * reader a number that is not one.
 */
const num = (v: unknown, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback

const changed = (
  onChange: (value: JsonValue) => void,
  events: NodeEventHandlers | undefined,
  value: JsonValue,
): void => {
  onChange(value)
  events?.onChange?.(value)
}

function Screen({ props, nodeProps, children }: NodeRendererProps): ReactNode {
  return (
    <div
      {...nodeProps}
      className="fsh-screen"
      style={{
        ...backgroundImageStyle(props),
        maxWidth: num(props['maxWidth'], 640),
        gap: num(props['gap'], 16),
      }}
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
      style={{
        ...backgroundImageStyle(props),
        flexDirection: direction,
        gap: num(props['gap'], 16),
      }}
    >
      {children}
    </div>
  )
}

/*
 * A repeater draws the rows it was handed and nothing else. The renderer has
 * already expanded them, so a kit never counts rows, never sees an index, and
 * never learns what an address is.
 */
function Repeater({
  node,
  itemLimits: limits = itemLimits(node),
  props,
  nodeProps,
  value,
  onChange,
  children,
  error,
}: NodeRendererProps): ReactNode {
  const id = useId()
  const messageId = id + '-message'
  const rows = Array.isArray(value) ? value : []
  const renderedRows = Children.toArray(children)
  const label = str(props['label'], node.dataKey ?? node.key)
  return (
    <div {...nodeProps} style={backgroundImageStyle(props)}>
      {/* Group-level help and errors describe the list independently of its rows. */}
      <div
        role="group"
        className="fsh-stack"
        style={{
          flexDirection: 'column',
          gap: num(props['gap'], 16),
        }}
        aria-label={label}
        aria-describedby={messageId}
      >
        {renderedRows.map((row, index) => (
          <div className="fsh-repeater__row" key={index}>
            {row}
            {index < rows.length && (
              <button
                type="button"
                className="fsh-button fsh-button--plain fsh-repeater__remove"
                disabled={rows.length <= limits.min}
                aria-label={`Remove ${label} item ${String(index + 1)}`}
                onClick={() => onChange(rows.filter((_, rowIndex) => rowIndex !== index))}
              >
                Remove
              </button>
            )}
          </div>
        ))}
      </div>
      <button
        type="button"
        className="fsh-button fsh-button--outline fsh-repeater__add"
        disabled={rows.length >= limits.max}
        onClick={() => onChange([...rows, {}])}
      >
        Add {label}
      </button>
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

function Step({ props, nodeProps, children, navigation }: NodeRendererProps): ReactNode {
  return (
    <div
      {...nodeProps}
      className="fsh-stack"
      style={{
        ...backgroundImageStyle(props),
        flexDirection: 'column',
        gap: num(props['gap'], 16),
      }}
    >
      {children}
      {navigation && (
        <div className="fsh-step__navigation">
          <button
            type="button"
            className="fsh-button fsh-button--plain"
            disabled={!navigation.back}
            onClick={navigation.back}
          >
            Back
          </button>
          <span aria-live="polite">Step {navigation.position}</span>
          <button
            type="button"
            className="fsh-button fsh-button--outline"
            disabled={!navigation.next}
            onClick={navigation.next}
          >
            Next
          </button>
        </div>
      )}
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
  /*
   * `h2` when the document names no rank, in both kits.
   *
   * The MUI kit fell back to `h5`, so a hand-written document with no `level`
   * rendered at a different rank depending on which kit drew it -- and a
   * heading's rank is the document outline a screen reader navigates by, not a
   * size. The two palettes still start a *new* heading at whatever rank suits
   * them; this is only the answer for a document that says nothing.
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
  nodeProps,
  children,
  inline = false,
  inputWidth = 80,
}: {
  id: string
  label: string
  helper: string
  error: string | undefined
  nodeProps: NodeRendererProps['nodeProps']
  children: ReactNode
  inline?: boolean
  inputWidth?: number
}): ReactNode {
  const messageId = id + '-message'

  return (
    <div
      {...nodeProps}
      className={
        'fsh-field' + (inline ? ' fsh-field--label-inline' : '') + (error ? ' is-invalid' : '')
      }
      style={
        inline
          ? {
              gridTemplateColumns: `minmax(0, 1fr) minmax(0, ${String(Math.max(40, inputWidth))}px)`,
            }
          : undefined
      }
    >
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

function TextFieldNode({
  node,
  required = isRequired(node),
  props,
  nodeProps,
  value,
  error,
  onChange,
  events,
}: NodeRendererProps): ReactNode {
  const id = useId()
  const shared = {
    id,
    className: 'fsh-input',
    placeholder: str(props['placeholder']),
    disabled: bool(props['disabled']),
    value: jsonToString(value),
    'aria-invalid': error ? true : undefined,
    'aria-describedby': id + '-message',
    ...requiredProps(required),
    onBlur: () => events?.onBlur?.(),
    onFocus: () => events?.onFocus?.(),
  }

  return (
    <Field
      id={id}
      label={str(props['label'])}
      helper={str(props['helperText'])}
      error={error}
      nodeProps={nodeProps}
    >
      {bool(props['multiline']) ? (
        <textarea
          {...shared}
          rows={4}
          onChange={(e) => changed(onChange, events, e.target.value)}
        />
      ) : (
        <input
          {...shared}
          type="text"
          onChange={(e) => changed(onChange, events, e.target.value)}
        />
      )}
    </Field>
  )
}

function NumberFieldNode({
  node,
  required = isRequired(node),
  props,
  nodeProps,
  value,
  error,
  onChange,
  events,
}: NodeRendererProps): ReactNode {
  const id = useId()
  return (
    <Field
      id={id}
      label={str(props['label'])}
      helper={str(props['helperText'])}
      error={error}
      nodeProps={nodeProps}
      inline={bool(props['inlineLabel'])}
      inputWidth={num(props['inputWidth'], 80)}
    >
      <input
        id={id}
        className="fsh-input"
        type="number"
        disabled={bool(props['disabled'])}
        value={jsonToString(value)}
        aria-invalid={error ? true : undefined}
        {...requiredProps(required)}
        aria-describedby={id + '-message'}
        onBlur={() => events?.onBlur?.()}
        onChange={(e) =>
          changed(onChange, events, e.target.value === '' ? null : Number(e.target.value))
        }
      />
    </Field>
  )
}

function CheckboxNode({
  node,
  required = isRequired(node),
  props,
  nodeProps,
  value,
  error,
  onChange,
  events,
}: NodeRendererProps): ReactNode {
  const id = useId()
  const messageId = id + '-message'
  return (
    <div {...nodeProps} className={'fsh-field fsh-field--inline' + (error ? ' is-invalid' : '')}>
      <input
        id={id}
        className="fsh-checkbox"
        type="checkbox"
        disabled={bool(props['disabled'])}
        checked={value === true}
        aria-invalid={error ? true : undefined}
        {...requiredProps(required)}
        aria-describedby={messageId}
        onChange={(e) => changed(onChange, events, e.target.checked)}
      />
      <label className="fsh-field__label" htmlFor={id}>
        {str(props['label'])}
      </label>
      <p
        id={messageId}
        className={'fsh-field__message' + (error ? ' is-error' : '')}
        {...(error ? { role: 'alert' } : {})}
      >
        {/*
         * The error, or the helper text when there is no error -- which is
         * what every other field in this kit does and what the MUI kit's
         * checkbox already did. This one drew the error and dropped the
         * helper text on the floor.
         */}
        {error ?? str(props['helperText'])}
      </p>
    </div>
  )
}

function SelectNode({
  node,
  required = isRequired(node),
  props,
  nodeProps,
  value,
  error,
  onChange,
  events,
}: NodeRendererProps): ReactNode {
  const id = useId()
  const raw = props['options']
  const options = Array.isArray(raw) ? raw : []

  return (
    <Field
      id={id}
      label={str(props['label'])}
      helper={str(props['helperText'])}
      error={error}
      nodeProps={nodeProps}
      inline={bool(props['inlineLabel'])}
      inputWidth={num(props['inputWidth'], 120)}
    >
      <select
        id={id}
        className="fsh-input"
        disabled={bool(props['disabled'])}
        value={jsonToString(value)}
        aria-invalid={error ? true : undefined}
        {...requiredProps(required)}
        aria-describedby={id + '-message'}
        onChange={(e) => changed(onChange, events, optionValue(options, e.target.value))}
      >
        <option value="">{str(props['placeholder'], 'Choose…')}</option>
        {options.map((option, i) => {
          /*
           * `optionEntry` in core, which is `optionValue`'s inverse: the two
           * have to agree on what an entry means or a choice cannot
           * round-trip. Read inline here, it also threw on a `null` in the
           * array, and a document is data.
           */
          const { value: v, label } = optionEntry(option, i, options)
          return (
            <option key={String(i) + ':' + v} value={v}>
              {label}
            </option>
          )
        })}
      </select>
    </Field>
  )
}

function ButtonNode({ props, nodeProps, events }: NodeRendererProps): ReactNode {
  const variant = str(props['variant'], 'solid')
  const safe = variant === 'outline' || variant === 'plain' ? variant : 'solid'
  return (
    <button
      {...nodeProps}
      type="button"
      className={'fsh-button fsh-button--' + safe}
      disabled={bool(props['disabled'])}
      onClick={() => events?.onClick?.()}
    >
      {str(props['text'], 'Button')}
    </button>
  )
}

function Grid({ props, nodeProps, children }: NodeRendererProps): ReactNode {
  const fill = bool(props['fillWidth'])
  const columns = fill
    ? Math.max(1, Math.floor(num(props['columns'], 2)))
    : num(props['columns'], 2)
  const minWidth = fill
    ? Math.max(1, num(props['minColumnWidth'], 200))
    : num(props['minColumnWidth'], 200)
  const gap = fill ? Math.max(0, num(props['gap'], 16)) : num(props['gap'], 16)
  const track = fill
    ? `max(${minWidth}px, calc((100% - ${(columns - 1) * gap}px) / ${columns}))`
    : `${minWidth}px`
  return (
    <div
      {...nodeProps}
      className={'fsh-grid' + (fill ? ' fsh-grid--fill' : '')}
      style={{
        ...backgroundImageStyle(props),
        gridTemplateColumns: `repeat(auto-fit, minmax(min(${track}, 100%), 1fr))`,
        gap,
        width: fill ? '100%' : undefined,
        maxWidth: !fill && columns > 0 ? columns * (minWidth + gap) : undefined,
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
        background: safeStyleValue(str(props['background'])),
        borderRadius: num(props['radius'], 0),
        ...backgroundImageStyle(props),
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
    <section
      {...nodeProps}
      style={backgroundImageStyle(props)}
      className={'fsh-card fsh-card--' + variant}
    >
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

// The three the palette offers. Kept beside the renderer that draws them;
// `test/kit-contract.test.tsx` checks a kit's declared options against what it
// actually renders.
const TEXT_VARIANTS = ['body', 'small', 'caption'] as const

function Text({ props, nodeProps }: NodeRendererProps): ReactNode {
  const variant = oneOf(props['variant'], TEXT_VARIANTS, 'body')
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
  return (
    <img
      {...nodeProps}
      className="fsh-image"
      src={safeImageSource(props['src'])}
      alt={str(props['alt'])}
      style={{
        objectFit: fit,
        width: width > 0 ? width : '100%',
        height: num(props['height'], 0) > 0 ? num(props['height'], 0) : 'auto',
        maxWidth: '100%',
        minHeight: safeImageSource(props['src']) ? undefined : 80,
      }}
    />
  )
}

function TextAreaNode({
  node,
  required = isRequired(node),
  props,
  nodeProps,
  value,
  error,
  onChange,
  events,
}: NodeRendererProps): ReactNode {
  const id = useId()
  return (
    <Field
      id={id}
      label={str(props['label'])}
      helper={str(props['helperText'])}
      error={error}
      nodeProps={nodeProps}
    >
      <textarea
        id={id}
        className="fsh-input"
        rows={num(props['rows'], 4)}
        placeholder={str(props['placeholder'])}
        disabled={bool(props['disabled'])}
        value={jsonToString(value)}
        aria-invalid={error ? true : undefined}
        {...requiredProps(required)}
        aria-describedby={id + '-message'}
        onBlur={() => events?.onBlur?.()}
        onChange={(e) => changed(onChange, events, e.target.value)}
      />
    </Field>
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

function SwitchNode({
  node,
  required = isRequired(node),
  props,
  nodeProps,
  value,
  error,
  onChange,
  events,
}: NodeRendererProps): ReactNode {
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
          {...requiredProps(required)}
          aria-describedby={messageId}
          onChange={(e) => changed(onChange, events, e.target.checked)}
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

interface RadioContext {
  name: string
  selected: string
  /**
   * The group's declared options, so a child can resolve its own value the way
   * the group resolves one of its own.
   *
   * A `RadioItem` handed its value over as a string while the options path
   * routed through `optionValue`, so a group holding both submitted a number
   * from one control and the string spelling of it from the other -- one
   * question with two answer types.
   */
  options: readonly JsonValue[]
  onSelect: (value: JsonValue) => void
}

const RadioGroupContext = createContext<RadioContext | undefined>(undefined)

function RadioGroupNode({
  node,
  required = isRequired(node),
  props,
  nodeProps,
  value,
  error,
  onChange,
  events,
  children,
}: NodeRendererProps): ReactNode {
  const id = useId()
  const messageId = id + '-message'
  const raw = props['options']
  const options = Array.isArray(raw) ? raw : []

  return (
    <fieldset
      {...nodeProps}
      role="radiogroup"
      className="fsh-field"
      disabled={bool(props['disabled'])}
      aria-invalid={error ? true : undefined}
      {...requiredProps(required)}
      aria-describedby={messageId}
    >
      <legend className="fsh-field__label">{str(props['label'])}</legend>
      <RadioGroupContext.Provider
        value={{
          name: id,
          selected: jsonToString(value),
          options,
          onSelect: (next) => changed(onChange, events, next),
        }}
      >
        <div
          className={
            'fsh-radios fsh-radios--' +
            oneOf(props['direction'], ['row', 'column'] as const, 'column')
          }
        >
          {options.map((option, i) => {
            const { value: v, label } = optionEntry(option, i, options)
            return (
              <label key={String(i) + ':' + v} className="fsh-radio">
                <input
                  type="radio"
                  name={id}
                  value={v}
                  /*
                   * A value nobody wrote is not the selected one, which is
                   * exactly what `RadioItemNode` twenty lines below guards and
                   * this path did not. Options authored as
                   * `[{ label: 'Prefer not to say', value: '' }, ...]` rendered
                   * with the first radio already selected on an unanswered
                   * group, because an unanswered group's value is `''` too.
                   */
                  checked={v !== '' && jsonToString(value) === v}
                  onChange={() => changed(onChange, events, optionValue(options, v))}
                />
                <span>{label}</span>
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
        /*
         * A value nobody wrote is not the selected one.
         *
         * `RadioItem` ships with `value: ''` and an unanswered group's
         * `selected` is `''` too, so a freshly dropped item rendered
         * pre-checked -- and so did every other one, all at once. An empty
         * value is a control that cannot answer anything, which is what the
         * disabled state below already says.
         */
        checked={group ? value !== '' && group.selected === value : false}
        disabled={!group || bool(props['disabled'])}
        /*
         * Through `optionValue`, like the `options` path in the group above.
         *
         * This handed the raw string straight over, so a group holding both
         * declared options and `RadioItem` children submitted a number from one
         * control and the string spelling of it from the other -- one question
         * with two answer types, which a server validating against the exported
         * schema rejects for one of them.
         */
        onChange={() => group?.onSelect(optionValue(group.options, value))}
      />
      <span>{str(props['label'])}</span>
    </label>
  )
}

function DatePickerNode({
  node,
  required = isRequired(node),
  props,
  nodeProps,
  value,
  error,
  onChange,
  events,
}: NodeRendererProps): ReactNode {
  const id = useId()
  return (
    <Field
      id={id}
      label={str(props['label'])}
      helper={str(props['helperText'])}
      error={error}
      nodeProps={nodeProps}
    >
      <input
        id={id}
        type="date"
        className="fsh-input"
        min={str(props['min']) || undefined}
        max={str(props['max']) || undefined}
        disabled={bool(props['disabled'])}
        value={jsonToString(value)}
        aria-invalid={error ? true : undefined}
        {...requiredProps(required)}
        aria-describedby={id + '-message'}
        onBlur={() => events?.onBlur?.()}
        onChange={(e) => changed(onChange, events, e.target.value || null)}
      />
    </Field>
  )
}

function AlertNode({ props, nodeProps }: NodeRendererProps): ReactNode {
  const severity = oneOf(
    props['severity'],
    ['info', 'success', 'warning', 'error'] as const,
    'info',
  )
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
      /*
       * An error announces itself; the other three are still a notice rather
       * than a paragraph, and `role="note"` says so without interrupting. The
       * MUI kit gives its alerts that role, so without this one document had two
       * different accessibility trees depending on which kit rendered it.
       */
      {...(severity === 'error' ? { role: 'alert' as const } : { role: 'note' as const })}
    >
      {title && <strong className="fsh-alert__title">{title}</strong>}
      <span>{str(props['text'])}</span>
    </div>
  )
}

function ProgressNode({ props, nodeProps }: NodeRendererProps): ReactNode {
  const circular = props['variant'] === 'circular'
  const raw = props['value']
  // `Number.isFinite`, not `typeof === 'number'`: `NaN` is a number and a
  // document can hold one. The same narrowing as `kit-mui`'s ProgressNode.
  const determinate = typeof raw === 'number' && Number.isFinite(raw)
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
        className={'fsh-progress__fill' + (determinate ? '' : ' fsh-progress__fill--sweeping')}
        style={determinate ? { inlineSize: value + '%' } : undefined}
      />
    </div>
  )
}

function LinkNode({ props, nodeProps, events }: NodeRendererProps): ReactNode {
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
      onClick={() => events?.onClick?.()}
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
    // The landmark's name, which a screen reader reads out. It was the English
    // word regardless of the form's language, on a component whose every other
    // string is translatable.
    <nav {...nodeProps} aria-label={str(props['label'], 'Breadcrumb')}>
      <ol className="fsh-breadcrumbs">
        {items.map((item, i) => {
          /*
           * Guarded like an option, and for the same reason: a crumb comes out
           * of a document. Reading `.label` off a `null` threw during render.
           */
          const entry =
            item !== null && typeof item === 'object' && !Array.isArray(item) ? item : undefined
          const text = typeof entry?.['label'] === 'string' ? entry['label'] : String(i + 1)
          const href = safeHref(entry?.['href'])
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
  Step,
  Repeater,
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
  Alert: AlertNode,
  Progress: ProgressNode,
  Link: LinkNode,
  Breadcrumbs: BreadcrumbsNode,
}

export const htmlRendererKit: RendererKit = {
  id: 'html',
  renderers: Object.fromEntries(
    htmlKit.components.map(({ type, defaultProps }) => {
      const Renderer = renderers[type]!
      return [
        type,
        function WithDefaults(input: NodeRendererProps): ReactNode {
          const props = { ...defaultProps, ...input.props }
          if (
            input.density === 'compact' &&
            input.props['gap'] === undefined &&
            defaultProps['gap'] !== undefined
          )
            props['gap'] = 12
          return <Renderer {...input} props={props} />
        },
      ]
    }),
  ),
}
