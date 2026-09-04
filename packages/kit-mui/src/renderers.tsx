/**
 * The rendering half of the Material UI kit.
 *
 * Each renderer takes resolved props and maps them onto a MUI component. Nothing
 * here imports from the designer, so a consumer who only wants the runtime pays
 * for the renderer and MUI, and nothing else.
 */

import Alert from '@mui/material/Alert'
import AlertTitle from '@mui/material/AlertTitle'
import Box from '@mui/material/Box'
import Breadcrumbs from '@mui/material/Breadcrumbs'
import CircularProgress from '@mui/material/CircularProgress'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import CardHeader from '@mui/material/CardHeader'
import Checkbox from '@mui/material/Checkbox'
import Divider from '@mui/material/Divider'
import FormControl from '@mui/material/FormControl'
import FormControlLabel from '@mui/material/FormControlLabel'
import FormHelperText from '@mui/material/FormHelperText'
import FormLabel from '@mui/material/FormLabel'
import Radio from '@mui/material/Radio'
import RadioGroup, { useRadioGroup } from '@mui/material/RadioGroup'
import Switch from '@mui/material/Switch'
import LinearProgress from '@mui/material/LinearProgress'
import Link from '@mui/material/Link'
import MenuItem from '@mui/material/MenuItem'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { Children, useId, useState } from 'react'
import type { ReactNode } from 'react'

import type { ComponentNode, JsonValue } from '@formsmith/core'
import {
  isRequired,
  jsonToString,
  optionEntry,
  optionValue,
  safeHref,
  safeStyleValue,
} from '@formsmith/core'
import type {
  NodeEventHandlers,
  NodeRenderer,
  NodeRendererProps,
  RendererKit,
} from '@formsmith/renderer'

type Variant = 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6'

/**
 * A string, or the fallback.
 *
 * `v || fallback`, not a bare type check. An emptied field *is* a string, so
 * every "safe default" here was bypassed by clearing one — which is the most
 * natural way to try to remove a label. A button with no text, an `aria-label`
 * of `''`.
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

const px = (value: number): string => String(value) + 'px'

const changed = (
  onChange: (value: JsonValue) => void,
  events: NodeEventHandlers | undefined,
  value: JsonValue,
): void => {
  onChange(value)
  events?.onChange?.(value)
}

const GAP = 16

/**
 * What a control has to say about itself beyond its value.
 *
 * `aria-required` rather than the platform `required`, deliberately: the
 * obligation is WCAG 3.3.2, which is about the accessibility tree, and native
 * `required` also turns on the browser's own validation — a second validator
 * with its own messages, competing with the form's, inside whatever `<form>` a
 * host has wrapped this in.
 *
 * `isRequired` lives in core so the two kits cannot answer differently, and it
 * counts only an *unguarded* required rule: a field that is required sometimes
 * cannot be announced as one that always is.
 */
const requiredProps = (node: ComponentNode): { 'aria-required'?: true } =>
  isRequired(node) ? { 'aria-required': true } : {}

/*
 * The message a field is described by.
 *
 * MUI only wires `aria-describedby` when the field has an explicit `id` and
 * renders helper text, so an empty helper meant no description at all and a
 * field that gained one only when it failed. A non-breaking space keeps the
 * element in the DOM, which is what the kit contract asks for, and it reserves
 * the line so nothing shifts when an error appears.
 */
const message = (error: string | undefined, helper: string): string => error ?? (helper || ' ')

const alertWhenError = (error: string | undefined): { role?: 'alert' } =>
  error ? { role: 'alert' } : {}

const alertWhenSaying = (notice: string | undefined): { role?: 'alert' } =>
  notice ? { role: 'alert' } : {}

function Screen({ props, nodeProps, children }: NodeRendererProps): ReactNode {
  // Children need spacing of their own: MUI's outlined label sits on the border
  // and collides with the next field when siblings are flush against each other.
  return (
    <Box
      {...nodeProps}
      sx={{
        maxWidth: px(num(props['maxWidth'], 640)),
        mx: 'auto',
        p: 2,
        color: 'text.primary',
        bgcolor: 'background.default',
      }}
    >
      <Stack gap={px(num(props['gap'], GAP))}>{children}</Stack>
    </Box>
  )
}

function StackNode({ props, nodeProps, children }: NodeRendererProps): ReactNode {
  const direction = props['direction'] === 'row' ? 'row' : 'column'
  return (
    <Stack {...nodeProps} direction={direction} gap={px(num(props['gap'], GAP))}>
      {children}
    </Stack>
  )
}

/*
 * A repeater draws the rows it was handed and nothing else. The renderer has
 * already expanded them, so a kit never counts rows, never sees an index, and
 * never learns what an address is.
 */
function itemLimit(node: ComponentNode, key: 'minItems' | 'maxItems', fallback: number): number {
  const rule = node.schema?.validations?.find((candidate) => candidate.key === key)
  return rule && 'value' in rule && typeof rule.value === 'number' && Number.isFinite(rule.value)
    ? Math.max(0, Math.floor(rule.value))
    : fallback
}

function RepeaterNode({
  node,
  props,
  nodeProps,
  value,
  onChange,
  children,
  error,
}: NodeRendererProps): ReactNode {
  const id = useId()
  const messageId = id + '-message'
  /*
   * A name for the group below, because an unnamed one is announced as "group"
   * and tells a listener nothing about which list they have entered.
   *
   * The answer's name is the only author-written string a repeater has --
   * `Repeater` declares one property, `gap` -- so it is what the group is called.
   * A `label` property on both kits would be better and is a contract change;
   * it is written up in the run's `found.md` rather than smuggled in here.
   */
  const name = str(props['label'], node.dataKey ?? node.key)
  const rows = Array.isArray(value) ? value : []
  const renderedRows = Children.toArray(children)
  const minimum = itemLimit(node, 'minItems', 0)
  const maximum = itemLimit(node, 'maxItems', Number.POSITIVE_INFINITY)
  return (
    <Stack {...nodeProps} direction="column" gap={px(num(props['gap'], GAP))}>
      {/*
       * A repeater is data-bound: its value is the list, so a rule about the
       * list is its own error, not any row's. "Add at least one address" has
       * nowhere else to appear, which is why the kit contract's message
       * obligation applies here like anywhere else.
       */}
      {/*
       * `role="group"` and a description, not `aria-invalid`, which is supported
       * on widget roles and inert on a container of components. The message
       * below carries `role="alert"`, which is what actually announces it.
       */}
      <Stack
        role="group"
        aria-label={name}
        direction="column"
        gap={px(num(props['gap'], GAP))}
        aria-describedby={messageId}
      >
        {renderedRows.map((row, index) => (
          <Stack key={index} gap={1} alignItems="flex-start">
            {row}
            {index < rows.length && (
              <Button
                type="button"
                size="small"
                disabled={rows.length <= minimum}
                aria-label={`Remove ${name} item ${String(index + 1)}`}
                onClick={() => onChange(rows.filter((_, rowIndex) => rowIndex !== index))}
              >
                Remove
              </Button>
            )}
          </Stack>
        ))}
      </Stack>
      <Button
        type="button"
        size="small"
        disabled={rows.length >= maximum}
        onClick={() => onChange([...rows, {}])}
      >
        Add {name}
      </Button>
      <FormHelperText id={messageId} error={Boolean(error)} {...alertWhenError(error)}>
        {message(error, '')}
      </FormHelperText>
    </Stack>
  )
}

function StepNode({ props, nodeProps, children, navigation }: NodeRendererProps): ReactNode {
  return (
    <Stack {...nodeProps} direction="column" gap={px(num(props['gap'], GAP))}>
      {children}
      {navigation && (
        <Stack direction="row" alignItems="center" justifyContent="space-between" gap={1}>
          <Button type="button" size="small" disabled={!navigation.back} onClick={navigation.back}>
            Back
          </Button>
          <Typography component="span" variant="body2" aria-live="polite">
            Step {navigation.position}
          </Typography>
          <Button
            type="button"
            size="small"
            variant="outlined"
            disabled={!navigation.next}
            onClick={navigation.next}
          >
            Next
          </Button>
        </Stack>
      )}
    </Stack>
  )
}

function Heading({ props, nodeProps }: NodeRendererProps): ReactNode {
  const LEVELS = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'] as const
  /*
   * `h2` when the document names no rank, which is what the HTML kit answers.
   *
   * This fell back to `h5`, so a hand-written document with no `level` rendered
   * at a different rank depending on which kit drew it -- and a heading's rank
   * is the document outline a screen reader navigates by. The palette still
   * starts a *new* heading at `h5`, which is this kit's own call about size.
   */
  const asked = str(props['level'], 'h2')
  const level: Variant = (LEVELS as readonly string[]).includes(asked) ? (asked as Variant) : 'h2'
  return (
    <Typography {...nodeProps} variant={level}>
      {str(props['text'])}
    </Typography>
  )
}

function TextFieldNode({
  node,
  props,
  nodeProps,
  value,
  error,
  onChange,
  events,
}: NodeRendererProps): ReactNode {
  // MUI derives the helper text's id, and the input's aria-describedby, from
  // this one. Without it there is no description at all.
  const id = useId()
  return (
    <TextField
      {...nodeProps}
      id={id}
      fullWidth
      label={str(props['label'])}
      placeholder={str(props['placeholder'])}
      multiline={bool(props['multiline'])}
      disabled={bool(props['disabled'])}
      // `jsonToString`, not `str`: a host seeding `{age: 30}` saw an empty
      // field whose data was not empty, so `required` passed, the field looked
      // unanswered, and the first keystroke overwrote an answer nobody saw.
      value={jsonToString(value)}
      error={Boolean(error)}
      helperText={message(error, str(props['helperText']))}
      slotProps={{ formHelperText: alertWhenError(error), htmlInput: requiredProps(node) }}
      onBlur={() => events?.onBlur?.()}
      onFocus={() => events?.onFocus?.()}
      onChange={(e) => changed(onChange, events, e.target.value)}
    />
  )
}

function NumberFieldNode({
  node,
  props,
  nodeProps,
  value,
  error,
  onChange,
  events,
}: NodeRendererProps): ReactNode {
  const id = useId()
  return (
    <TextField
      {...nodeProps}
      id={id}
      fullWidth
      type="number"
      label={str(props['label'])}
      disabled={bool(props['disabled'])}
      value={jsonToString(value)}
      error={Boolean(error)}
      helperText={message(error, str(props['helperText']))}
      slotProps={{ formHelperText: alertWhenError(error), htmlInput: requiredProps(node) }}
      onBlur={() => events?.onBlur?.()}
      onChange={(e) =>
        changed(onChange, events, e.target.value === '' ? null : Number(e.target.value))
      }
    />
  )
}

function CheckboxNode({
  node,
  props,
  nodeProps,
  value,
  error,
  onChange,
  events,
}: NodeRendererProps): ReactNode {
  // Every other field in this kit shows its error. This one used to drop it on
  // the floor, so a required checkbox failed a submit while saying nothing. The
  // kit contract test caught it.
  const messageId = useId()
  return (
    <FormControl {...nodeProps} error={Boolean(error)} disabled={bool(props['disabled'])}>
      <FormControlLabel
        label={str(props['label'])}
        control={
          <Checkbox
            checked={bool(value)}

            slotProps={{
              input: {
                'aria-describedby': messageId,
                /*
                 * Stated on the input, because that is what a screen reader
                 * announces. `FormControl error` colours the label and says
                 * nothing to anybody not looking at it — which is why this was
                 * missing here and present on all three in the HTML kit.
                 */
                ...(error ? { 'aria-invalid': true } : {}),
                ...(isRequired(node) ? { 'aria-required': true } : {}),
              },
            }}
            onChange={(e) => changed(onChange, events, e.target.checked)}
          />
        }
      />
      <FormHelperText id={messageId} {...alertWhenError(error)}>
        {message(error, str(props['helperText']))}
      </FormHelperText>
    </FormControl>
  )
}

function SelectNode({
  node,
  props,
  nodeProps,
  value,
  error,
  onChange,
  events,
}: NodeRendererProps): ReactNode {
  const raw = props['options']
  const options = Array.isArray(raw) ? raw : []
  const id = useId()
  return (
    <TextField
      {...nodeProps}
      id={id}
      select
      fullWidth
      label={str(props['label'])}
      disabled={bool(props['disabled'])}

      value={jsonToString(value)}
      error={Boolean(error)}
      helperText={message(error, str(props['helperText']))}

      slotProps={{
        formHelperText: alertWhenError(error),
        htmlInput: requiredProps(node),
        select: { SelectDisplayProps: requiredProps(node) },
      }}
      onChange={(e) => changed(onChange, events, optionValue(options, e.target.value))}
    >
      {}
      <MenuItem value="">{str(props['placeholder'], 'Choose…')}</MenuItem>
      {options.map((option, i) => {
        /*
         * `optionEntry` in core, which is `optionValue`'s inverse: the two have
         * to agree on what an entry means or a choice cannot round-trip. Read
         * inline here, it also threw on a `null` in the array.
         */
        const { value: v, label } = optionEntry(option, i, options)
        return (
          <MenuItem key={String(i) + ':' + v} value={v}>
            {label}
          </MenuItem>
        )
      })}
    </TextField>
  )
}

function ButtonNode({ props, nodeProps, events }: NodeRendererProps): ReactNode {
  const variant = str(props['variant'], 'contained')
  const safe = variant === 'outlined' || variant === 'text' ? variant : 'contained'
  return (
    <Button
      {...nodeProps}
      variant={safe}
      disabled={bool(props['disabled'])}
      onClick={() => events?.onClick?.()}
    >
      {str(props['text'], 'Button')}
    </Button>
  )
}

function Grid({ props, nodeProps, children }: NodeRendererProps): ReactNode {
  const minWidth = num(props['minColumnWidth'], 200)
  const columns = num(props['columns'], 2)
  const gap = num(props['gap'], 16)
  return (
    <Box
      {...nodeProps}
      sx={{
        display: 'grid',
        // auto-fit with a floor: columns collapse when they cannot fit, so the
        // author never writes a breakpoint.
        gridTemplateColumns: `repeat(auto-fit, minmax(min(${minWidth}px, 100%), 1fr))`,
        gap: px(gap),
        // `columns` caps how many can ever fit, which is what makes it mean
        // something alongside auto-fit. Ignoring it here made the same document
        // lay out differently in the two kits.
        // `px()`, for the reason `Screen`'s own comment gives: MUI reads a
        // bare number at or below 1 as a percentage. `px()` hands it a CSS
        // string instead, which the sizing transform passes through untouched,
        // so the range stops mattering rather than being avoided.
        //
        // Worth having rather than relying on the arithmetic staying large:
        // `minColumnWidth` is an ordinary number prop with no floor, so a
        // document saying `1` and `columns: 1` reaches exactly the value that
        // would be read as 100%.
        maxWidth: columns > 0 ? px(columns * (minWidth + gap)) : undefined,
      }}
    >
      {children}
    </Box>
  )
}

function BoxNode({ props, nodeProps, children }: NodeRendererProps): ReactNode {
  return (
    <Box
      {...nodeProps}
      sx={{
        padding: px(num(props['padding'], 16)),
        background: safeStyleValue(str(props['background'])),
        borderRadius: px(num(props['radius'], 0)),
      }}
    >
      {children}
    </Box>
  )
}

function CardNode({ props, nodeProps, children }: NodeRendererProps): ReactNode {
  const title = str(props['title'])
  const subtitle = str(props['subtitle'])
  const elevated = props['variant'] === 'elevated'
  return (
    <Card {...nodeProps} variant={elevated ? 'elevation' : 'outlined'} elevation={elevated ? 2 : 0}>
      {(title || subtitle) && (
        <CardHeader
          {...(title ? { title } : {})}
          {...(subtitle ? { subheader: subtitle } : {})}

          slotProps={{ title: { variant: 'h6', component: 'h3' } }}
        />
      )}
      <CardContent>{children}</CardContent>
    </Card>
  )
}

function TextNode({ props, nodeProps }: NodeRendererProps): ReactNode {
  const raw = props['variant']
  const variant = raw === 'small' ? 'body2' : raw === 'caption' ? 'caption' : 'body1'

  const rawAlign = props['align']
  const align = rawAlign === 'center' ? 'center' : rawAlign === 'end' ? 'right' : 'left'
  return (
    <Typography {...nodeProps} variant={variant} align={align}>
      {str(props['text'])}
    </Typography>
  )
}

function DividerNode({ props, nodeProps }: NodeRendererProps): ReactNode {
  const vertical = props['orientation'] === 'vertical'
  return (
    <Divider
      {...nodeProps}
      orientation={vertical ? 'vertical' : 'horizontal'}
      {...(vertical ? { flexItem: true } : {})}
    />
  )
}

function ImageNode({ props, nodeProps }: NodeRendererProps): ReactNode {
  const width = num(props['width'], 0)
  const rawFit = props['fit']
  const fit = rawFit === 'contain' || rawFit === 'fill' ? rawFit : 'cover'
  /*
   * `alt` is always present, never omitted. An empty string is the platform's
   * way of saying decorative, and it is a different statement from a missing
   * attribute, which leaves a screen reader reading out the file name.
   */
  return (
    <Box
      {...nodeProps}
      component="img"
      /*
       * Omitted when refused, not emptied.
       *
       * `src=""` is a request for the current page in several browsers and a
       * broken-image glyph in the rest, and this and `LinkNode` read the same
       * allowlist: one refusal, two behaviours, where the link degrades to plain
       * text and says why. Without the attribute the element falls back to its
       * `alt`, which is the platform's own answer and the nearest thing to what
       * the link does.
       *
       * A plain prop rather than a conditional spread, and it is equivalent
       * because `safeHref` answers `undefined` for an unsafe address and for an
       * empty one alike -- `if (!raw) return undefined` is its first line. React
       * omits an attribute whose value is `undefined`, so this is the same
       * markup with one call instead of two.
       */
      src={safeHref(props['src'])}
      alt={str(props['alt'])}
      /*
       * `px(width)`, not the bare number.
       *
       * `sx.width` runs MUI's `sizingTransform`, which reads a number at or
       * below 1 as a fraction: `width: 1` rendered as `100%` and `0.5` as
       * `50%`, against a palette hint that says only "Zero means full width".
       * That is the same reinterpretation `px()` exists for everywhere else in
       * this file.
       */
      sx={{ objectFit: fit, width: width > 0 ? px(width) : '100%', display: 'block' }}
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
  events,
}: NodeRendererProps): ReactNode {
  const id = useId()
  return (
    <TextField
      {...nodeProps}
      id={id}
      fullWidth
      multiline
      rows={num(props['rows'], 4)}
      label={str(props['label'])}
      placeholder={str(props['placeholder'])}
      disabled={bool(props['disabled'])}
      // `jsonToString`, not `str`: a host seeding `{age: 30}` saw an empty
      // field whose data was not empty, so `required` passed, the field looked
      // unanswered, and the first keystroke overwrote an answer nobody saw.
      value={jsonToString(value)}
      error={Boolean(error)}
      helperText={message(error, str(props['helperText']))}
      slotProps={{ formHelperText: alertWhenError(error), htmlInput: requiredProps(node) }}
      onBlur={() => events?.onBlur?.()}
      onChange={(e) => changed(onChange, events, e.target.value)}
    />
  )
}

function ButtonGroupNode({ props, nodeProps, children }: NodeRendererProps): ReactNode {
  const vertical = props['orientation'] === 'vertical'
  return (
    <Stack
      {...nodeProps}
      role="group"
      direction={vertical ? 'column' : 'row'}

      gap={px(8)}
      sx={{ alignItems: vertical ? 'stretch' : 'center' }}
    >
      {children}
    </Stack>
  )
}

function SwitchNode({
  node,
  props,
  nodeProps,
  value,
  error,
  onChange,
  events,
}: NodeRendererProps): ReactNode {
  const messageId = useId()
  return (
    <FormControl {...nodeProps} error={Boolean(error)} disabled={bool(props['disabled'])}>
      <FormControlLabel
        label={str(props['label'])}
        control={
          <Switch
            checked={bool(value)}
            // `slotProps.input`, for the reason on the Checkbox above. This is
            // the control that lost every attribute on MUI 7.
            slotProps={{
              input: {
                'aria-describedby': messageId,
                ...(error ? { 'aria-invalid': true } : {}),
                ...(isRequired(node) ? { 'aria-required': true } : {}),
              },
            }}
            onChange={(e) => changed(onChange, events, e.target.checked)}
          />
        }
      />
      <FormHelperText id={messageId} {...alertWhenError(error)}>
        {message(error, str(props['helperText']))}
      </FormHelperText>
    </FormControl>
  )
}

function RadioGroupNode({
  node,
  props,
  nodeProps,
  value,
  error,
  onChange,
  events,
  children,
}: NodeRendererProps): ReactNode {
  const messageId = useId()
  const raw = props['options']
  const options = Array.isArray(raw) ? raw : []
  const row = props['direction'] === 'row'

  return (
    <FormControl
      {...nodeProps}
      component="fieldset"
      error={Boolean(error)}
      disabled={bool(props['disabled'])}
    >
      {/* A legend, not a label: one question, many answers. */}
      <FormLabel component="legend">{str(props['label'])}</FormLabel>
      <RadioGroup
        row={row}
        value={jsonToString(value)}
        aria-describedby={messageId}
        {...(error ? { 'aria-invalid': true } : {})}
        {...requiredProps(node)}
        onChange={(e) => changed(onChange, events, optionValue(options, e.target.value))}
      >
        {options.map((option, i) => {
          const { value: v, label } = optionEntry(option, i, options)
          return (
            <FormControlLabel
              // Position first, so two options sharing a value are still two
              // keys. React drops one of a duplicated pair without a word.
              key={String(i) + ':' + v}
              value={v}
              control={<Radio />}
              label={label}
            />
          )
        })}
        {/* Children are RadioItems, for options that need their own layout. */}
        {children}
      </RadioGroup>
      <FormHelperText id={messageId} {...alertWhenError(error)}>
        {message(error, str(props['helperText']))}
      </FormHelperText>
    </FormControl>
  )
}

function RadioItemNode({ props, nodeProps }: NodeRendererProps): ReactNode {
  const group = useRadioGroup()
  const value = str(props['value'])

  return (
    <Box {...nodeProps}>
      <FormControlLabel
        value={value}
        /*
         * Controlled only under a group, because only a group has an answer.
         *
         * `checked={false}` outside one made a standalone item permanently
         * unchecked: a controlled input whose value never moves, so clicking it
         * does nothing. Nothing stops that structure -- `ComponentDef` has no
         * way to say a type may only appear under another -- so a `RadioItem`
         * dropped on its own is a document somebody can author, and it should
         * behave like a radio rather than like a disabled one.
         *
         * Omitting the prop leaves it uncontrolled, which is the platform's own
         * behaviour and the honest answer when there is no group to be the
         * source of truth.
         */
        {...(group ? { checked: value !== '' && group.value === value } : {})}
        /*
         * Only when the document says so.
         *
         * `bool()` answers `false` for an absent prop, and an explicit
         * `disabled={false}` blocks MUI's inheritance chain -- so a `RadioItem`
         * inside a disabled `RadioGroup` re-enabled itself, which is the
         * opposite of what disabling the group means. Omitting the prop is how
         * a component says "inherit".
         */
        {...(props['disabled'] === undefined ? {} : { disabled: bool(props['disabled']) })}
        control={<Radio />}
        label={str(props['label'])}
      />
    </Box>
  )
}

function DatePickerNode({
  node,
  props,
  nodeProps,
  value,
  error,
  onChange,
  events,
}: NodeRendererProps): ReactNode {
  const id = useId()
  /*
   * A native date input, not MUI's DatePicker: that lives in @mui/x-date-pickers
   * and needs a date library alongside it. A kit is meant to be cheap to write,
   * and two dependencies for one component is not cheap.
   */
  return (
    <TextField
      {...nodeProps}
      id={id}
      fullWidth
      type="date"
      label={str(props['label'])}
      disabled={bool(props['disabled'])}
      value={jsonToString(value)}
      error={Boolean(error)}
      helperText={message(error, str(props['helperText']))}
      slotProps={{
        formHelperText: alertWhenError(error),
        // Without this the label sits on top of the browser's date placeholder.
        inputLabel: { shrink: true },
        htmlInput: {
          ...requiredProps(node),
          ...(str(props['min']) ? { min: str(props['min']) } : {}),
          ...(str(props['max']) ? { max: str(props['max']) } : {}),
        },
      }}
      onBlur={() => events?.onBlur?.()}
      onChange={(e) => changed(onChange, events, e.target.value || null)}
    />
  )
}

/** What a file input says when it left something out for being too large. */
function tooLarge(count: number): string {
  return count === 1
    ? 'One file was too large and was not added.'
    : String(count) + ' files were too large and were not added.'
}

function FileUploadNode({
  node,
  props,
  nodeProps,
  value,
  error,
  onChange,
  events,
}: NodeRendererProps): ReactNode {
  /** How many files the last choice dropped for being over `maxSize`. */
  const [dropped, setDropped] = useState(0)
  /*
   * Whichever of the two the helper line is carrying. An error wins, because a
   * field that is invalid is a bigger fact than a file that was skipped.
   */
  const notice = error ?? (dropped > 0 ? tooLarge(dropped) : undefined)
  const id = useId()

  const filesHeld = (Array.isArray(value) ? value : [value])
    .filter((name): name is string => typeof name === 'string' && name !== '')
    .join(', ')

  const multiple = bool(props['multiple'])
  /*
   * The value is the selected file's name and nothing more. A file input is
   * uncontrolled by design, and turning bytes into form data is an upload
   * protocol this project does not own.
   */
  return (
    <TextField
      {...nodeProps}
      id={id}
      fullWidth
      type="file"
      label={str(props['label'])}
      disabled={bool(props['disabled'])}
      error={Boolean(error)}
      /*
       * The held filename joins the helper text, because a MUI `TextField` is
       * one element and there is nowhere else to put it without wrapping the
       * component and moving where `nodeProps` is spread.
       */
      helperText={message(
        notice,

        filesHeld || str(props['helperText']),
      )}
      slotProps={{
        // Whichever message the line is carrying. An error wins upstream, and a
        // dropped file is announced with the same mechanism rather than silently.
        formHelperText: alertWhenSaying(notice),
        inputLabel: { shrink: true },
        htmlInput: {
          ...requiredProps(node),
          multiple,
          ...(str(props['accept']) ? { accept: str(props['accept']) } : {}),
        },
      }}
      onChange={(e) => {
        /*
         * Narrowed, not laundered. `as unknown as HTMLInputElement` asserted a
         * type nothing had checked -- and this handler is reachable from a
         * `TextField` that is not a file input, where `files` is undefined and
         * the assertion would have said otherwise.
         */
        const input = e.target
        if (!(input instanceof HTMLInputElement)) return

        const limit = num(props['maxSize'], 0) * 1024
        const chosen = Array.from(input.files ?? [])
        const kept = chosen.filter((file) => limit <= 0 || file.size <= limit)
        /*
         * And somebody is told. The filtering was silent, so choosing a file
         * over the limit looked exactly like choosing none: the picker closed,
         * the list did not change, and nothing appeared. A refusal nobody can
         * see is indistinguishable from a broken picker.
         */
        setDropped(chosen.length - kept.length)
        changed(
          onChange,
          events,
          multiple ? kept.map((file) => file.name) : (kept[0]?.name ?? null),
        )
      }}
    />
  )
}

function AlertNode({ props, nodeProps }: NodeRendererProps): ReactNode {
  const raw = props['severity']
  const severity =
    raw === 'success' || raw === 'warning' || raw === 'error' ? raw : ('info' as const)
  const title = str(props['title'])
  /*
   * Only an error announces itself. This component is authored into the form,
   * so it is on screen from the first paint; role="alert" on all four would
   * have a screen reader read every notice before the form itself.
   */
  return (
    <Alert {...nodeProps} severity={severity} {...(severity === 'error' ? {} : { role: 'note' })}>
      {title && <AlertTitle>{title}</AlertTitle>}
      {str(props['text'])}
    </Alert>
  )
}

function ProgressNode({ props, nodeProps }: NodeRendererProps): ReactNode {
  const circular = props['variant'] === 'circular'

  const raw = props['value']
  const determinate = typeof raw === 'number' && Number.isFinite(raw)
  const value = determinate ? Math.min(100, Math.max(0, raw)) : 0
  const shared = {
    'aria-label': str(props['label'], 'Progress'),
    ...(determinate ? { variant: 'determinate' as const, value } : {}),
  }
  return circular ? (
    <Box {...nodeProps}>
      <CircularProgress {...shared} />
    </Box>
  ) : (
    <Box {...nodeProps}>
      <LinearProgress {...shared} />
    </Box>
  )
}

function LinkNode({ props, nodeProps, events }: NodeRendererProps): ReactNode {
  const href = safeHref(props['href'])
  const blank = props['target'] === 'blank'
  /*
   * A refused address renders as text, not as a dead link. A link that looks
   * like one and does nothing is the failure this project treats as worst.
   */
  if (!href) {
    return (
      <Typography {...nodeProps} component="span">
        {str(props['text'], 'Link')}
      </Typography>
    )
  }
  return (
    <Link
      {...nodeProps}
      href={href}
      {...(blank ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
      onClick={() => events?.onClick?.()}
    >
      {str(props['text'], 'Link')}
    </Link>
  )
}

function BreadcrumbsNode({ props, nodeProps }: NodeRendererProps): ReactNode {
  const raw = props['items']
  const items = Array.isArray(raw) ? raw : []
  const last = items.length - 1

  return (
    <Breadcrumbs {...nodeProps} aria-label={str(props['label'], 'Breadcrumb')}>
      {items.map((item, i) => {
        /*
         * Guarded like an option, and for the same reason: a crumb comes out of
         * a document. Reading `.label` off a `null` threw during render, and the
         * HTML kit had the identical line — one shared test found both.
         */
        const entry =
          item !== null && typeof item === 'object' && !Array.isArray(item) ? item : undefined
        const text = typeof entry?.['label'] === 'string' ? entry['label'] : String(i + 1)
        const href = safeHref(entry?.['href'])
        // The last crumb is where you are, so it is text and says so.
        return i === last || !href ? (
          <Typography
            key={text + ':' + String(i)}
            component="span"
            {...(i === last ? { 'aria-current': 'page' as const } : {})}
          >
            {text}
          </Typography>
        ) : (
          <Link key={text + ':' + String(i)} href={href}>
            {text}
          </Link>
        )
      })}
    </Breadcrumbs>
  )
}

const renderers: Record<string, NodeRenderer> = {
  Screen,
  Stack: StackNode,
  Step: StepNode,
  Repeater: RepeaterNode,
  Heading,
  TextField: TextFieldNode,
  NumberField: NumberFieldNode,
  Checkbox: CheckboxNode,
  Select: SelectNode,
  Button: ButtonNode,
  Grid,
  Box: BoxNode,
  Card: CardNode,
  Text: TextNode,
  Divider: DividerNode,
  Image: ImageNode,
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

export const muiRendererKit: RendererKit = { id: 'mui', renderers }
