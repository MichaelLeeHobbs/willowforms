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
import RadioGroup from '@mui/material/RadioGroup'
import Switch from '@mui/material/Switch'
import LinearProgress from '@mui/material/LinearProgress'
import Link from '@mui/material/Link'
import MenuItem from '@mui/material/MenuItem'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useId, useState } from 'react'
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
import type { NodeRenderer, NodeRendererProps, RendererKit } from '@formsmith/renderer'

type Variant = 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6'

/**
 * A string, or the fallback.
 *
 * `v || fallback`, not a bare type check. An emptied field *is* a string, so
 * every "safe default" here was bypassed by clearing one — which is the most
 * natural way to try to remove a label. A button with no text, an `aria-label`
 * of `''`.
 */
const str = (v: unknown, fallback = ''): string => (typeof v === 'string' && v ? v : fallback)
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

/**
 * Lengths as CSS strings, not as theme multiples.
 *
 * `sx` reads a bare number as a multiple of a theme value — `padding` through
 * `theme.spacing`, `borderRadius` through `theme.shape.borderRadius` — so the
 * kit used to divide by the scale to get back to the pixels the document
 * authored. That round-trips only under the defaults it was written against,
 * and MUI's whole point is that a host replaces them: under `spacing: 3` an
 * authored 8px drew at 3px. One of the two divisions was against the wrong
 * default and was wrong even under the defaults, dividing `radius` by 8 where
 * MUI multiplies by 4, so an authored 24 drew at 12.
 *
 * A string is passed through untouched, so the document's number is the number
 * on the page in every theme. `Grid` already carries a note about the same
 * failure — "made the same document lay out differently in the two kits" — and
 * this was the same failure two functions below it, undetected because no test
 * rendered one document through both kits and compared what came out.
 */
const px = (value: number): string => String(value) + 'px'

/**
 * The gap a layout component takes when the document does not say.
 *
 * CSS pixels, like every other length in both kits, and this one was not.
 * MUI's `gap` prop is a multiple of `theme.spacing`, which defaults to 8, so an
 * authored `gap: 2` was 16px here and 2px in `@formsmith/kit-html` -- eight
 * times apart for the same document, which is the one thing the kit contract
 * exists to prevent. MUI's own `Grid` in this file already used pixels, so the
 * kit disagreed with itself as well.
 *
 * 16 rather than 2, so the *default* renders exactly as it did: `gap: 2` through
 * MUI's spacing scale was 16px, and 16px is what `kit-html` has always used.
 * What changes is the meaning of an authored number, which is stated in
 * `docs/spec/02-kit-contract.md`.
 */
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

function Screen({ props, nodeProps, children }: NodeRendererProps): ReactNode {
  // Children need spacing of their own: MUI's outlined label sits on the border
  // and collides with the next field when siblings are flush against each other.
  return (
    <Box {...nodeProps} sx={{ maxWidth: num(props['maxWidth'], 640), mx: 'auto', p: 2 }}>
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
 * A step draws as a plain column. Everything that makes it a step is the
 * condition on it, which core evaluates, so there is nothing here for a kit to
 * decide beyond how a group of fields stacks up.
 */
/*
 * A repeater draws the rows it was handed and nothing else. The renderer has
 * already expanded them, so a kit never counts rows, never sees an index, and
 * never learns what an address is.
 */
function RepeaterNode({ props, nodeProps, children, error }: NodeRendererProps): ReactNode {
  const id = useId()
  const messageId = id + '-message'
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
        direction="column"
        gap={px(num(props['gap'], GAP))}
        aria-describedby={messageId}
      >
        {children}
      </Stack>
      <FormHelperText id={messageId} error={Boolean(error)} {...(error ? { role: 'alert' } : {})}>
        {error ?? ''}
      </FormHelperText>
    </Stack>
  )
}

function StepNode({ props, nodeProps, children }: NodeRendererProps): ReactNode {
  return (
    <Stack {...nodeProps} direction="column" gap={px(num(props['gap'], GAP))}>
      {children}
    </Stack>
  )
}

function Heading({ props, nodeProps }: NodeRendererProps): ReactNode {
  const level = str(props['level'], 'h5') as Variant
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
      onChange={(e) => onChange(e.target.value)}
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
      onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
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
            /*
             * `slotProps.input`, not `inputProps`.
             *
             * `inputProps` is deprecated in MUI 7 and on `Switch` it is simply
             * dropped, so every one of these attributes vanished -- measured, by
             * installing `@mui/material@7` and running the contract suite:
             * `aria-invalid`, `aria-required` and `aria-describedby` all gone
             * from the Switch, while the Checkbox happened to survive. This
             * package's peer range claims `^6 || ^7`, so that was a shipped
             * accessibility regression on half the range nobody had run.
             *
             * `slotProps` works on both, which is what makes it the fix rather
             * than a version bump.
             */
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
            onChange={(e) => onChange(e.target.checked)}
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
      /*
       * `jsonToString`, not `str`. `str` answers `''` for a number, so a stored
       * answer of `2` rendered as nothing selected: the user picks an option,
       * the data holds it, the control shows blank, and the choice can never be
       * made to stick. `optionValue` in core exists so a numeric option value
       * survives the round trip, and this was the one end that dropped it —
       * `RadioGroupNode` in this same file already had it right.
       */
      value={jsonToString(value)}
      error={Boolean(error)}
      helperText={message(error, str(props['helperText']))}
      /*
       * The required marking goes on the element a screen reader announces.
       *
       * A MUI `select` renders three nested boxes: an `InputBase` root, a
       * `div[role="combobox"]` inside it, and a hidden native `input` beside
       * that. `htmlInput` lands on the hidden one, which is `aria-hidden`, so
       * `aria-required` there reached nobody -- and the contract test passed
       * because it looked for the attribute anywhere inside the component.
       *
       * `slotProps.select` was the first attempt at fixing that and it is not
       * enough: it lands on the `InputBase` root, which carries no role, so the
       * attribute still was not on the thing being announced. `aria-invalid`
       * arrives on the combobox by itself, which is why only half of this was
       * visible. `SelectDisplayProps` is MUI's own way through to the element
       * with the role, and the contract test now looks at ARIA widget roles
       * rather than native elements, so it can see the difference.
       */
      slotProps={{
        formHelperText: alertWhenError(error),
        htmlInput: requiredProps(node),
        select: { SelectDisplayProps: requiredProps(node) },
      }}
      onChange={(e) => onChange(optionValue(options, e.target.value))}
    >
      {/*
       * The empty choice, which this kit did not draw at all.
       *
       * Without it a MUI select could be answered and never unanswered: there
       * was no option to pick that means "none", so clearing a non-required
       * field was impossible once anybody had touched it. The HTML kit had one
       * and hardcoded its English; both now read the authored `placeholder`.
       */}
      <MenuItem value="">{str(props['placeholder'], 'Choose…')}</MenuItem>
      {options.map((option, i) => {
        /*
         * `optionEntry` in core, which is `optionValue`'s inverse: the two have
         * to agree on what an entry means or a choice cannot round-trip. Read
         * inline here, it also threw on a `null` in the array.
         */
        const { value: v, label } = optionEntry(option, i)
        return (
          <MenuItem key={String(i) + ':' + v} value={v}>
            {label}
          </MenuItem>
        )
      })}
    </TextField>
  )
}

function ButtonNode({ props, nodeProps }: NodeRendererProps): ReactNode {
  const variant = str(props['variant'], 'contained')
  const safe = variant === 'outlined' || variant === 'text' ? variant : 'contained'
  return (
    <Button {...nodeProps} variant={safe} disabled={bool(props['disabled'])}>
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
        maxWidth: columns > 0 ? columns * (minWidth + gap) : undefined,
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
          titleTypographyProps={{ variant: 'h6', component: 'h3' }}
        />
      )}
      <CardContent>{children}</CardContent>
    </Card>
  )
}

function TextNode({ props, nodeProps }: NodeRendererProps): ReactNode {
  const raw = props['variant']
  const variant = raw === 'small' ? 'body2' : raw === 'caption' ? 'caption' : 'body1'
  /*
   * MUI's `align` predates logical properties and takes left/right, so the
   * document's start/end are mapped here rather than passed through. The HTML
   * kit uses `text-align: start` directly and is correct in RTL for free; this
   * one is correct in LTR, which is what MUI's own API allows.
   *
   * `start` maps to left rather than to `inherit`. Inheriting means a Text
   * inside a centred container comes out centred while its own property says
   * start, so the one alignment an author never set explicitly was the one that
   * could not be relied on.
   */
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
      src={safeHref(props['src']) ?? ''}
      alt={str(props['alt'])}
      sx={{ objectFit: fit, width: width > 0 ? width : '100%', display: 'block' }}
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
      onChange={(e) => onChange(e.target.value)}
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
      gap={1}
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
            onChange={(e) => onChange(e.target.checked)}
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
        onChange={(e) => onChange(optionValue(options, e.target.value))}
      >
        {options.map((option, i) => {
          const { value: v, label } = optionEntry(option, i)
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
  /*
   * Deliberately not wired to the group's value. A RadioItem is a slot for an
   * option that needs its own layout, and the group owns selection; making this
   * self-controlling would give one question two sources of truth.
   */
  return (
    <Box {...nodeProps}>
      <FormControlLabel
        value={str(props['value'])}
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
      onChange={(e) => onChange(e.target.value || null)}
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
}: NodeRendererProps): ReactNode {
  /** How many files the last choice dropped for being over `maxSize`. */
  const [dropped, setDropped] = useState(0)
  const id = useId()
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
        error ?? (dropped > 0 ? tooLarge(dropped) : undefined),
        filesHeld ? 'Holding ' + filesHeld : str(props['helperText']),
      )}
      slotProps={{
        formHelperText: alertWhenError(error),
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
        /*
         * `maxSize` is honoured here rather than left to a host that may never
         * look: it was a number in a panel whose own hint admitted it did
         * nothing. Oversized files are left out and the rest are kept, so one
         * file being too large does not silently drop the others. Kilobytes,
         * which is what the label says.
         */
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
        onChange(multiple ? kept.map((file) => file.name) : (kept[0]?.name ?? null))
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
  /*
   * `Number.isFinite`, not `typeof === 'number'`. `NaN` is a number, and a
   * document can hold one -- `JsonValue` admits it, and a computed prop can
   * produce one -- so it reached MUI as a determinate value and the bar rendered
   * with `aria-valuenow="NaN"`. The `num()` helper in this file exists for
   * exactly this and was the only narrowing here that did not use it.
   */
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

function LinkNode({ props, nodeProps }: NodeRendererProps): ReactNode {
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
    <Breadcrumbs {...nodeProps} aria-label="Breadcrumb">
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
