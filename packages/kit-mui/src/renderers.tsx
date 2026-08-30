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
import { useId } from 'react'
import type { ReactNode } from 'react'

import { jsonToString, optionValue, safeHref, safeStyleValue } from '@formsmith/core'
import type { JsonValue } from '@formsmith/core'
import type { NodeRenderer, NodeRendererProps, RendererKit } from '@formsmith/renderer'

type Variant = 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6'

const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback)
const bool = (v: unknown): boolean => v === true
const num = (v: unknown, fallback: number): number => (typeof v === 'number' ? v : fallback)

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
      <Stack gap={num(props['gap'], 2)}>{children}</Stack>
    </Box>
  )
}

function StackNode({ props, nodeProps, children }: NodeRendererProps): ReactNode {
  const direction = props['direction'] === 'row' ? 'row' : 'column'
  return (
    <Stack {...nodeProps} direction={direction} gap={num(props['gap'], 2)}>
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
    <Stack {...nodeProps} direction="column" gap={num(props['gap'], 2)}>
      {/*
       * A repeater is data-bound: its value is the list, so a rule about the
       * list is its own error, not any row's. "Add at least one address" has
       * nowhere else to appear, which is why the kit contract's message
       * obligation applies here like anywhere else.
       */}
      <Stack
        direction="column"
        gap={num(props['gap'], 2)}
        aria-invalid={error ? true : undefined}
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
    <Stack {...nodeProps} direction="column" gap={num(props['gap'], 2)}>
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

function TextFieldNode({ props, nodeProps, value, error, onChange }: NodeRendererProps): ReactNode {
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
      value={str(value)}
      error={Boolean(error)}
      helperText={message(error, str(props['helperText']))}
      slotProps={{ formHelperText: alertWhenError(error) }}
      onChange={(e) => onChange(e.target.value)}
    />
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
      slotProps={{ formHelperText: alertWhenError(error) }}
      onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
    />
  )
}

function CheckboxNode({ props, nodeProps, value, error, onChange }: NodeRendererProps): ReactNode {
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
            inputProps={{ 'aria-describedby': messageId }}
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

function SelectNode({ props, nodeProps, value, error, onChange }: NodeRendererProps): ReactNode {
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
      value={str(value)}
      error={Boolean(error)}
      helperText={message(error, str(props['helperText']))}
      slotProps={{ formHelperText: alertWhenError(error) }}
      onChange={(e) => onChange(optionValue(options, e.target.value))}
    >
      {options.map((option, i) => {
        const o = option as { label?: unknown; value?: JsonValue }
        // jsonToString, not a fallback to the array index: a numeric option
        // value used to become its own position, so the first option submitted
        // "0" whatever it said.
        const v = o.value === undefined ? String(i) : jsonToString(o.value)
        return (
          <MenuItem key={v || String(i)} value={v}>
            {str(o.label, v)}
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
      src={str(props['src'])}
      alt={str(props['alt'])}
      sx={{ objectFit: fit, width: width > 0 ? width : '100%', display: 'block' }}
    />
  )
}

function TextAreaNode({ props, nodeProps, value, error, onChange }: NodeRendererProps): ReactNode {
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
      value={str(value)}
      error={Boolean(error)}
      helperText={message(error, str(props['helperText']))}
      slotProps={{ formHelperText: alertWhenError(error) }}
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

function SwitchNode({ props, nodeProps, value, error, onChange }: NodeRendererProps): ReactNode {
  const messageId = useId()
  return (
    <FormControl {...nodeProps} error={Boolean(error)} disabled={bool(props['disabled'])}>
      <FormControlLabel
        label={str(props['label'])}
        control={
          <Switch
            checked={bool(value)}
            inputProps={{ 'aria-describedby': messageId }}
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
        onChange={(e) => onChange(optionValue(options, e.target.value))}
      >
        {options.map((option, i) => {
          const o = option as { label?: unknown; value?: JsonValue }
          const v = o.value === undefined ? String(i) : jsonToString(o.value)
          return (
            <FormControlLabel
              key={v || String(i)}
              value={v}
              control={<Radio />}
              label={typeof o.label === 'string' ? o.label : v}
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
        disabled={bool(props['disabled'])}
        control={<Radio />}
        label={str(props['label'])}
      />
    </Box>
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
      value={str(value)}
      error={Boolean(error)}
      helperText={message(error, str(props['helperText']))}
      slotProps={{
        formHelperText: alertWhenError(error),
        // Without this the label sits on top of the browser's date placeholder.
        inputLabel: { shrink: true },
        htmlInput: {
          ...(str(props['min']) ? { min: str(props['min']) } : {}),
          ...(str(props['max']) ? { max: str(props['max']) } : {}),
        },
      }}
      onChange={(e) => onChange(e.target.value || null)}
    />
  )
}

function FileUploadNode({ props, nodeProps, error, onChange }: NodeRendererProps): ReactNode {
  const id = useId()
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
      helperText={message(error, str(props['helperText']))}
      slotProps={{
        formHelperText: alertWhenError(error),
        inputLabel: { shrink: true },
        htmlInput: {
          multiple,
          ...(str(props['accept']) ? { accept: str(props['accept']) } : {}),
        },
      }}
      onChange={(e) => {
        const input = e.target as unknown as HTMLInputElement
        const files = Array.from(input.files ?? []).map((file) => file.name)
        onChange(multiple ? files : (files[0] ?? null))
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
  const determinate = typeof raw === 'number'
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
        const entry = item as { label?: unknown; href?: JsonValue }
        const text = typeof entry.label === 'string' ? entry.label : String(i + 1)
        const href = safeHref(entry.href)
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
