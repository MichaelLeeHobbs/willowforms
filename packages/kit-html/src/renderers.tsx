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

import { createContext, createElement, useContext, useId, useState } from 'react'
import type { ReactNode } from 'react'
import type { ComponentNode } from '@formsmith/core'
import {
  isRequired,
  jsonToString,
  optionEntry,
  optionValue,
  safeHref,
  safeStyleValue,
} from '@formsmith/core'
import type { JsonValue } from '@formsmith/core'
import type { NodeRenderer, NodeRendererProps, RendererKit } from '@formsmith/renderer'

type Level = 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6'

/**
 * A string, or the fallback.
 *
 * `v || fallback`, not `typeof v === 'string' ? v : fallback`. An emptied field
 * *is* a string, so every "safe default" here was bypassed by clearing one —
 * which is the most natural way to try to remove a label. A button with no
 * text, a link with no text, an `aria-label` of `''` on a progress bar.
 */
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

/**
 * One of a known set, or the first of them.
 *
 * Every one of these values comes from a document, which is data. Interpolated
 * into a class name, an unnarrowed one adds classes of its own: on a host using
 * a utility CSS framework, `variant: "body fixed inset-0 z-50"` is an element
 * covering the viewport over the real form. React escapes the attribute, so it
 * is not script execution — it is UI redress, which is worse to debug.
 */
const oneOf = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T =>
  allowed.includes(v as T) ? (v as T) : fallback

/**
 * What a control has to say about itself beyond its value.
 *
 * `aria-required` rather than the platform `required`: the obligation is WCAG
 * 3.3.2, which is about the accessibility tree, and native `required` also turns
 * on the browser's own validation — a second validator with its own messages
 * competing with the form's, inside whatever `<form>` a host has wrapped this
 * in. `isRequired` is in core so the two kits cannot answer differently, and it
 * counts only an unguarded rule: a field required sometimes cannot be announced
 * as one that always is.
 */
const requiredProps = (node: ComponentNode): { 'aria-required'?: true } =>
  isRequired(node) ? { 'aria-required': true } : {}
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

/*
 * (This paragraph is `Step`'s, further down. It sat directly above `Repeater`,
 * so a reader taking a comment as documentation of the function beneath it was
 * told the wrong thing about the more complicated of the two. The same drift
 * was in `kit-mui`, copied along with the rest of the file.)
 *
 * A step draws as a plain column. Everything that makes it a step is the
 * condition on it, which core evaluates, so there is nothing here for a kit to
 * decide beyond how a group of fields stacks up.
 */
/*
 * A repeater draws the rows it was handed and nothing else. The renderer has
 * already expanded them, so a kit never counts rows, never sees an index, and
 * never learns what an address is.
 */
function Repeater({ props, nodeProps, children, error }: NodeRendererProps): ReactNode {
  const id = useId()
  const messageId = id + '-message'
  return (
    <div {...nodeProps}>
      {/*
       * A repeater is data-bound: its value is the list, so a rule about the
       * list is its own error, not any row's. "Add at least one address" has
       * nowhere else to appear, which is why the kit contract's message
       * obligation applies here like anywhere else.
       */}
      {/*
       * `role="group"` and a description, not `aria-invalid`.
       *
       * `aria-invalid` is supported on widget roles -- a textbox, a combobox, a
       * radiogroup -- and this is a container of components. On a generic
       * element it is inert: the attribute is in the DOM, a test can find it,
       * and no screen reader will ever say it. What does work is a group that
       * names the message describing it, plus the `role="alert"` below, which
       * announces the error when it appears.
       */}
      <div
        role="group"
        className="fsh-stack"
        style={{ flexDirection: 'column', gap: num(props['gap'], 16) }}
        aria-describedby={messageId}
      >
        {children}
      </div>
      <p
        id={messageId}
        className={'fsh-field__message' + (error ? ' is-error' : '')}
        {...(error ? { role: 'alert' } : {})}
      >
        {error ?? ''}
      </p>
    </div>
  )
}

function Step({ props, nodeProps, children }: NodeRendererProps): ReactNode {
  return (
    <div
      {...nodeProps}
      className="fsh-stack"
      style={{ flexDirection: 'column', gap: num(props['gap'], 16) }}
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
}: {
  id: string
  label: string
  helper: string
  error: string | undefined
  nodeProps: NodeRendererProps['nodeProps']
  children: ReactNode
}): ReactNode {
  const messageId = id + '-message'
  /*
   * `nodeProps` here, on `.fsh-field`, and not on a wrapper around it.
   *
   * Seven of the nine field renderers spread it onto an unclassed `<div>` with
   * `.fsh-field` one level in, while `SwitchNode` and `RadioGroupNode` put it on
   * `.fsh-field` itself -- so the kit had two DOM shapes at the seam that every
   * external thing keys off: the designer's selection, `data-fs-key` styling
   * from the Style tab, and end-to-end selectors. `kit-html.css`'s
   * `min-width: 0` on `.fsh-field` was inert for the seven, because the flex
   * item was the wrapper and not the element carrying the rule.
   *
   * Converged on the shape the other two already had, which is also the one the
   * MUI kit produces: the component the document names is the component the
   * kit's own class describes.
   */
  return (
    <div {...nodeProps} className={'fsh-field' + (error ? ' is-invalid' : '')}>
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
  props,
  nodeProps,
  value,
  error,
  onChange,
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
    ...requiredProps(node),
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
        <textarea {...shared} rows={4} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input {...shared} type="text" onChange={(e) => onChange(e.target.value)} />
      )}
    </Field>
  )
}

function NumberFieldNode({
  node,
  props,
  nodeProps,
  value,
  error,
  onChange,
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
        className="fsh-input"
        type="number"
        disabled={bool(props['disabled'])}
        value={jsonToString(value)}
        aria-invalid={error ? true : undefined}
        {...requiredProps(node)}
        aria-describedby={id + '-message'}
        onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
      />
    </Field>
  )
}

function CheckboxNode({
  node,
  props,
  nodeProps,
  value,
  error,
  onChange,
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
        {...requiredProps(node)}
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
  props,
  nodeProps,
  value,
  error,
  onChange,
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
    >
      <select
        id={id}
        className="fsh-input"
        disabled={bool(props['disabled'])}
        value={jsonToString(value)}
        aria-invalid={error ? true : undefined}
        {...requiredProps(node)}
        aria-describedby={id + '-message'}
        onChange={(e) => onChange(optionValue(options, e.target.value))}
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
        background: safeStyleValue(str(props['background'])),
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
  /*
   * `alt` is always present, never omitted. An empty string is the platform's
   * way of saying decorative, and it is a different statement from a missing
   * attribute, which leaves a screen reader reading out the file name.
   */
  return (
    <img
      {...nodeProps}
      className="fsh-image"
      src={safeHref(props['src'])}
      alt={str(props['alt'])}
      style={{
        objectFit: fit,
        width: width > 0 ? width : '100%',
      }}
    />
  )
}

function TextAreaNode({
  node,
  props,
  nodeProps,
  value,
  error,
  onChange,
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
        {...requiredProps(node)}
        aria-describedby={id + '-message'}
        onChange={(e) => onChange(e.target.value)}
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
  props,
  nodeProps,
  value,
  error,
  onChange,
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
          {...requiredProps(node)}
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
   * for markup that cannot say that.
   *
   * `role="radiogroup"` is stated rather than assumed. This comment claimed it
   * was implicit and it is not -- a `<fieldset>` maps to `group`, which does not
   * support `aria-invalid` or `aria-required`, so both were being set on an
   * element that has no such state and neither reached a screen reader. The role
   * is what makes the two attributes mean something.
   */
  return (
    <fieldset
      {...nodeProps}
      role="radiogroup"
      className="fsh-field"
      disabled={bool(props['disabled'])}
      aria-invalid={error ? true : undefined}
      {...requiredProps(node)}
      aria-describedby={messageId}
    >
      <legend className="fsh-field__label">{str(props['label'])}</legend>
      <RadioGroupContext.Provider
        value={{ name: id, selected: jsonToString(value), options, onSelect: onChange }}
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
                  onChange={() => onChange(optionValue(options, v))}
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
  props,
  nodeProps,
  value,
  error,
  onChange,
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
        {...requiredProps(node)}
        aria-describedby={id + '-message'}
        onChange={(e) => onChange(e.target.value || null)}
      />
    </Field>
  )
}

function FileUploadNode({
  node,
  props,
  nodeProps,
  value,
  error,
  onChange,
}: NodeRendererProps): ReactNode {
  const id = useId()
  /** How many files the last choice dropped for being over `maxSize`. */
  const [dropped, setDropped] = useState(0)
  /** How many refusals there have been, so a repeated one is a new string. */
  const [attempt, setAttempt] = useState(0)
  /*
   * The names the document holds, drawn beside the input.
   *
   * A file input is uncontrolled by design and cannot be given a value, so a
   * restored draft showed "No file chosen" while the payload was about to
   * submit a filename. Nothing on screen said what the form was going to send.
   *
   * It is also the only thing that follows the row a value belongs to: rows are
   * keyed by index, so the browser's own idea of which file this input holds
   * stays with the index rather than with the data. See the note on row keys in
   * the renderer.
   */
  const filesHeld = (Array.isArray(value) ? value : [value])
    .filter((name): name is string => typeof name === 'string' && name !== '')
    .join(', ')

  const multiple = bool(props['multiple'])
  const heldId = id + '-held'
  const refusedId = id + '-refused'
  /*
   * The value is the selected file's name, and nothing more. A file input is
   * uncontrolled by design, and turning bytes into form data is an upload
   * protocol this project does not own: the host reads the input when it
   * submits. Reporting the name keeps validation and the schema honest about
   * whether a file was chosen.
   */
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
        type="file"
        className="fsh-input"
        accept={str(props['accept']) || undefined}
        multiple={multiple}
        disabled={bool(props['disabled'])}
        aria-invalid={error ? true : undefined}
        {...requiredProps(node)}
        /*
         * Every line on screen about this input, not just the helper one.
         *
         * "Holding contract.pdf" is the only statement of what this field will
         * actually submit -- a file input is uncontrolled, so the browser's own
         * display says "No file chosen" while the payload carries a name -- and
         * it was described by nothing, so a screen reader user moving to the
         * input was told the label and the helper text and never what was held.
         * The refusal notice was likewise unreferenced. The MUI kit folds both
         * strings into `helperText`, which is the element it wires
         * `aria-describedby` to, so this was a divergence the other kit had
         * right.
         */
        aria-describedby={
          [id + '-message', filesHeld ? heldId : '', dropped > 0 ? refusedId : '']
            .filter(Boolean)
            .join(' ') || undefined
        }
        /*
         * `maxSize` is honoured here rather than left to a host that may never
         * look. It was a number in a panel with a hint admitting it did
         * nothing, which is a control that lies about being one.
         *
         * A refusal, not a truncation: the oversized files are left out and
         * the ones that fit are kept, so choosing five files and one of them
         * being too large does not silently drop the other four. The size is
         * in kilobytes, which is what the label says.
         */
        onChange={(e) => {
          const limit = num(props['maxSize'], 0) * 1024
          const chosen = Array.from(e.target.files ?? [])
          const kept = chosen.filter((file) => limit <= 0 || file.size <= limit)
          /*
           * Somebody is told when a file is dropped.
           *
           * `maxSize` filtered the reported names and said nothing, so
           * choosing a file over the limit looked exactly like choosing none:
           * the picker closed, the list did not change, and no message
           * appeared. A refusal nobody can see is indistinguishable from a
           * bug in the picker.
           */
          const refused = chosen.length - kept.length
          setDropped(refused)
          /*
           * Bumped on a refusal, not on every choice.
           *
           * A live region only announces on mutation, and `setDropped` writes
           * the same number for a second identical refusal -- React re-renders
           * the same text and a screen reader says nothing, so the second
           * attempt looked like the picker had stopped working.
           *
           * It counts refusals rather than choices because a choice that drops
           * nothing lands between two identical refusals and, counted, returns
           * the parity to where it started. That the notice also unmounts on
           * the clean choice is not the guarantee: this string has to differ
           * from the last one on its own, without resting on how a screen
           * reader treats a re-inserted `role="alert"`.
           * `docs/accessibility.md` records the same fix for the designer's own
           * live region: an unchanged announcement is never read.
           */
          if (refused > 0) setAttempt((n) => n + 1)
          onChange(multiple ? kept.map((file) => file.name) : (kept[0]?.name ?? null))
        }}
      />
      {filesHeld ? (
        <p id={heldId} className="fsh-field__message">
          Holding {filesHeld}
        </p>
      ) : null}
      {dropped > 0 ? (
        <p id={refusedId} className="fsh-field__message is-error" role="alert">
          {(dropped === 1
            ? 'One file was too large and was not added.'
            : String(dropped) + ' files were too large and were not added.') +
            // A zero-width space per attempt, so a repeat of the same refusal
            // is a different string and the live region reads it again.
            '\u200b'.repeat(attempt % 2)}
        </p>
      ) : null}
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
        /*
         * The class says which mode this is; the stylesheet used to ask whether
         * a `style` attribute was present. React does not remove the attribute
         * when the object becomes `undefined` — it empties it — so a bar that
         * went from determinate to indeterminate kept `style=""`, stopped
         * matching `:not([style])`, and rendered permanently full. "Finished"
         * instead of a sweep.
         */
        className={'fsh-progress__fill' + (determinate ? '' : ' fsh-progress__fill--sweeping')}
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
  FileUpload: FileUploadNode,
  Alert: AlertNode,
  Progress: ProgressNode,
  Link: LinkNode,
  Breadcrumbs: BreadcrumbsNode,
}

export const htmlRendererKit: RendererKit = { id: 'html', renderers }
