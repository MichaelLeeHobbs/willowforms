/**
 * The rendering half of the Material UI kit.
 *
 * Each renderer takes resolved props and maps them onto a MUI component. Nothing
 * here imports from the designer, so a consumer who only wants the runtime pays
 * for the renderer and MUI, and nothing else.
 */

import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import CardHeader from '@mui/material/CardHeader'
import Checkbox from '@mui/material/Checkbox'
import Divider from '@mui/material/Divider'
import FormControl from '@mui/material/FormControl'
import FormControlLabel from '@mui/material/FormControlLabel'
import FormHelperText from '@mui/material/FormHelperText'
import MenuItem from '@mui/material/MenuItem'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useId } from 'react'
import type { ReactNode } from 'react'

import { jsonToString, optionValue } from '@formsmith/core'
import type { JsonValue } from '@formsmith/core'
import type { NodeRenderer, NodeRendererProps, RendererKit } from '@formsmith/renderer'

type Variant = 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6'

const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback)
const bool = (v: unknown): boolean => v === true
const num = (v: unknown, fallback: number): number => (typeof v === 'number' ? v : fallback)

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
  return (
    <Box
      {...nodeProps}
      sx={{
        display: 'grid',
        // auto-fit with a floor: columns collapse when they cannot fit, so the
        // author never writes a breakpoint.
        gridTemplateColumns: `repeat(auto-fit, minmax(min(${minWidth}px, 100%), 1fr))`,
        gap: num(props['gap'], 16) / 8,
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
        padding: num(props['padding'], 16) / 8,
        background: str(props['background']) || undefined,
        borderRadius: num(props['radius'], 0) / 8,
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
   */
  const rawAlign = props['align']
  const align = rawAlign === 'center' ? 'center' : rawAlign === 'end' ? 'right' : 'inherit'
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

const renderers: Record<string, NodeRenderer> = {
  Screen,
  Stack: StackNode,
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
}

export const muiRendererKit: RendererKit = { id: 'mui', renderers }
