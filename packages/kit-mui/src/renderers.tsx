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
import type { TextFieldProps } from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { Children, useId } from 'react'
import type { ReactNode } from 'react'
import { muiKit } from './definitions.js'
import { DensityTheme } from './DensityTheme.js'

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
} from '@willowforms/core'
import { bool, changed, num, requiredProps, str } from '@willowforms/renderer'
import type { NodeRenderer, NodeRendererProps, RendererKit } from '@willowforms/renderer'

type Variant = 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6'

const px = (value: number): string => String(value) + 'px'

const GAP = 16

// MUI wires `aria-describedby` only when the field has an `id` and helper text, so an empty
// helper becomes a non-breaking space.
const message = (error: string | undefined, helper: string): string => error ?? (helper || ' ')

const alertWhenError = (error: string | undefined): { role?: 'alert' } =>
  error ? { role: 'alert' } : {}

function fieldLayout(
  props: NodeRendererProps['props'],
  error: string | undefined,
  required: boolean,
  defaultWidth: number,
): Pick<TextFieldProps, 'sx' | 'slotProps' | 'helperText'> {
  const inline = bool(props['inlineLabel'])
  return {
    helperText: inline
      ? (error ?? str(props['helperText']))
      : message(error, str(props['helperText'])),
    sx: inline
      ? {
          display: 'grid',
          gridTemplateColumns: `minmax(0, 1fr) minmax(0, ${px(Math.max(40, num(props['inputWidth'], defaultWidth)))})`,
          alignItems: 'center',
          columnGap: '8px',
        }
      : undefined,
    slotProps: {
      htmlInput: requiredProps(required),
      formHelperText: {
        ...alertWhenError(error),
        sx: inline ? { gridColumn: '1 / -1', marginLeft: 0 } : undefined,
      },
      ...(inline
        ? {
            input: { notched: false },
            inputLabel: {
              shrink: true,
              sx: {
                position: 'static',
                transform: 'none',
                fontSize: '13px',
                lineHeight: 1.25,
                whiteSpace: 'normal',
                maxWidth: 'none',
                overflow: 'visible',
              },
            },
          }
        : {}),
    },
  }
}

function Screen({ props, nodeProps, children }: NodeRendererProps): ReactNode {
  // Children need spacing of their own: MUI's outlined label sits on the border
  // and collides with the next field when siblings are flush against each other.
  return (
    <Box
      {...nodeProps}
      style={backgroundImageStyle(props)}
      sx={{
        maxWidth: px(num(props['maxWidth'], 640)),
        mx: 'auto',
        p: 2,
        color: 'text.primary',
        bgcolor: 'background.default',
      }}
    >
      <Stack sx={{ gap: px(num(props['gap'], GAP)) }}>{children}</Stack>
    </Box>
  )
}

function StackNode({ props, nodeProps, children }: NodeRendererProps): ReactNode {
  const direction = props['direction'] === 'row' ? 'row' : 'column'
  return (
    <Stack
      {...nodeProps}
      style={backgroundImageStyle(props)}
      direction={direction}
      sx={{ gap: px(num(props['gap'], GAP)) }}
    >
      {children}
    </Stack>
  )
}

// `children` is already expanded, one entry per row. Add or remove a row by writing the whole
// list.
function RepeaterNode({
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
  const name = str(props['label'], node.dataKey ?? node.key)
  const rows = Array.isArray(value) ? value : []
  const renderedRows = Children.toArray(children)
  return (
    <Stack
      {...nodeProps}
      style={backgroundImageStyle(props)}
      direction="column"
      sx={{ gap: px(num(props['gap'], GAP)) }}
    >
      <Stack
        role="group"
        aria-label={name}
        direction="column"
        sx={{ gap: px(num(props['gap'], GAP)) }}
        aria-describedby={messageId}
      >
        {renderedRows.map((row, index) => (
          <Stack key={index} sx={{ gap: 1 }}>
            {row}
            {index < rows.length && (
              <Button
                type="button"
                size="small"
                sx={{ alignSelf: 'flex-start' }}
                disabled={rows.length <= limits.min}
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
        disabled={rows.length >= limits.max}
        onClick={() => onChange([...rows, {}])}
      >
        Add {name}
      </Button>
      <FormHelperText id={messageId} error={Boolean(error)} {...alertWhenError(error)}>
        {message(error, str(props['helperText']))}
      </FormHelperText>
    </Stack>
  )
}

function StepNode({ props, nodeProps, children, navigation }: NodeRendererProps): ReactNode {
  return (
    <Stack
      {...nodeProps}
      style={backgroundImageStyle(props)}
      direction="column"
      sx={{ gap: px(num(props['gap'], GAP)) }}
    >
      {children}
      {navigation && (
        <Stack
          direction="row"
          sx={{ alignItems: 'center', justifyContent: 'space-between', gap: 1 }}
        >
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
  // `h2` when the document names no rank, as in kit-html: rank is the outline a
  // screen reader navigates, so both kits must agree. The palette's `h5` for a
  // new heading is a separate choice about size.
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
  required = isRequired(node),
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
      value={jsonToString(value)}
      error={Boolean(error)}
      helperText={message(error, str(props['helperText']))}
      slotProps={{ formHelperText: alertWhenError(error), htmlInput: requiredProps(required) }}
      onBlur={() => events?.onBlur?.()}
      onFocus={() => events?.onFocus?.()}
      onChange={(e) => changed(onChange, events, e.target.value)}
    />
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
    <TextField
      {...nodeProps}
      id={id}
      fullWidth
      type="number"
      label={str(props['label'])}
      disabled={bool(props['disabled'])}
      value={jsonToString(value)}
      error={Boolean(error)}
      {...fieldLayout(props, error, required, 80)}
      onBlur={() => events?.onBlur?.()}
      onChange={(e) =>
        changed(onChange, events, e.target.value === '' ? null : Number(e.target.value))
      }
    />
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
                // On the input, which is what a screen reader announces;
                // `FormControl error` only colours the label.
                ...(error ? { 'aria-invalid': true } : {}),
                ...requiredProps(required),
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
  required = isRequired(node),
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
  const layout = fieldLayout(props, error, required, 120)
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
      {...layout}
      slotProps={{
        ...layout.slotProps,
        select: { SelectDisplayProps: requiredProps(required) },
      }}
      onChange={(e) => changed(onChange, events, optionValue(options, e.target.value))}
    >
      {}
      <MenuItem value="">{str(props['placeholder'], 'Choose…')}</MenuItem>
      {options.map((option, i) => {
        // `optionEntry` is `optionValue`'s inverse; reading an entry any other
        // way breaks the round trip.
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
  const safe =
    variant === 'outlined' || variant === 'outline'
      ? 'outlined'
      : variant === 'text' || variant === 'plain'
        ? 'text'
        : 'contained'
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
    <Box
      {...nodeProps}
      style={backgroundImageStyle(props)}
      sx={{
        display: 'grid',
        gridTemplateColumns: `repeat(auto-fit, minmax(min(${track}, 100%), 1fr))`,
        gap: px(gap),
        width: fill ? '100%' : undefined,
        minWidth: fill ? 0 : undefined,
        overflowWrap: fill ? 'anywhere' : undefined,
        '& > *': fill ? { minWidth: 0 } : undefined,
        // Missing fillWidth keeps the sizing of saved documents, in pixels.
        maxWidth: !fill && columns > 0 ? px(columns * (minWidth + gap)) : undefined,
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
      style={backgroundImageStyle(props)}
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
    <Card
      {...nodeProps}
      style={backgroundImageStyle(props)}
      variant={elevated ? 'elevation' : 'outlined'}
      elevation={elevated ? 2 : 0}
    >
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
  return (
    <Box
      {...nodeProps}
      component="img"
      src={safeImageSource(props['src'])}
      alt={str(props['alt'])}
      sx={{
        objectFit: fit,
        width: width > 0 ? px(width) : '100%',
        height: num(props['height'], 0) > 0 ? px(num(props['height'], 0)) : 'auto',
        maxWidth: '100%',
        minHeight: safeImageSource(props['src']) ? undefined : '80px',
        display: 'block',
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
    <TextField
      {...nodeProps}
      id={id}
      fullWidth
      multiline
      rows={num(props['rows'], 4)}
      label={str(props['label'])}
      placeholder={str(props['placeholder'])}
      disabled={bool(props['disabled'])}
      value={jsonToString(value)}
      error={Boolean(error)}
      helperText={message(error, str(props['helperText']))}
      slotProps={{ formHelperText: alertWhenError(error), htmlInput: requiredProps(required) }}
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
      sx={{ alignItems: vertical ? 'stretch' : 'center', gap: px(8) }}
    >
      {children}
    </Stack>
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
  const messageId = useId()
  return (
    <FormControl {...nodeProps} error={Boolean(error)} disabled={bool(props['disabled'])}>
      <FormControlLabel
        label={str(props['label'])}
        control={
          <Switch
            checked={bool(value)}
            // `slotProps.input`: on MUI 7 this control drops input attributes
            // passed any other way.
            slotProps={{
              input: {
                'aria-describedby': messageId,
                ...(error ? { 'aria-invalid': true } : {}),
                ...requiredProps(required),
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
  required = isRequired(node),
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
      <FormLabel component="legend" id={messageId + '-label'}>
        {str(props['label'])}
      </FormLabel>
      <RadioGroup
        aria-labelledby={messageId + '-label'}
        row={row}
        value={jsonToString(value)}
        aria-describedby={messageId}
        {...(error ? { 'aria-invalid': true } : {})}
        {...requiredProps(required)}
        onChange={(e) => changed(onChange, events, optionValue(options, e.target.value))}
      >
        {options.map((option, i) => {
          const { value: v, label } = optionEntry(option, i, options)
          return (
            <FormControlLabel
              // Position first, so two options sharing a value are still two
              // keys.
              key={String(i) + ':' + v}
              value={v}
              control={<Radio />}
              label={label}
            />
          )
        })}
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
        {...(group ? { checked: value !== '' && group.value === value } : {})}
        // Omitted unless the document sets it: an explicit `disabled={false}`
        // stops MUI inheriting a disabled RadioGroup.
        {...(props['disabled'] === undefined ? {} : { disabled: bool(props['disabled']) })}
        control={<Radio />}
        label={str(props['label'])}
      />
    </Box>
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
          ...requiredProps(required),
          ...(str(props['min']) ? { min: str(props['min']) } : {}),
          ...(str(props['max']) ? { max: str(props['max']) } : {}),
        },
      }}
      onBlur={() => events?.onBlur?.()}
      onChange={(e) => changed(onChange, events, e.target.value || null)}
    />
  )
}

function AlertNode({ props, nodeProps }: NodeRendererProps): ReactNode {
  const raw = props['severity']
  const severity =
    raw === 'success' || raw === 'warning' || raw === 'error' ? raw : ('info' as const)
  const title = str(props['title'])
  // Only an error is `role="alert"`: an authored alert is on screen from first
  // paint, and announcing them all would read every notice before the form.
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
  // A refused address renders as text, not as a link that does nothing.
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
        // A crumb is document data and can be anything, `null` included.
        const entry =
          item !== null && typeof item === 'object' && !Array.isArray(item) ? item : undefined
        const text = typeof entry?.['label'] === 'string' ? entry['label'] : String(i + 1)
        const href = safeHref(entry?.['href'])
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
  Alert: AlertNode,
  Progress: ProgressNode,
  Link: LinkNode,
  Breadcrumbs: BreadcrumbsNode,
}

export const muiRendererKit: RendererKit = {
  id: 'mui',
  renderers: Object.fromEntries(
    muiKit.components.map(({ type, defaultProps }) => {
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
          const rendered = <Renderer {...input} props={props} />
          const density = input.props['density']
          return density === 'compact' || density === 'comfortable' ? (
            <DensityTheme density={density}>{rendered}</DensityTheme>
          ) : (
            rendered
          )
        },
      ]
    }),
  ),
}
