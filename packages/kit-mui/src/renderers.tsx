/**
 * The rendering half of the Material UI kit.
 *
 * Each renderer takes resolved props and maps them onto a MUI component. Nothing
 * here imports from the designer, so a consumer who only wants the runtime pays
 * for the renderer and MUI, and nothing else.
 */

import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Checkbox from '@mui/material/Checkbox'
import FormControlLabel from '@mui/material/FormControlLabel'
import MenuItem from '@mui/material/MenuItem'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import type { ReactNode } from 'react'

import type { NodeRenderer, NodeRendererProps, RendererKit } from '@formsmith/renderer'

type Variant = 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6'

const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback)
const bool = (v: unknown): boolean => v === true
const num = (v: unknown, fallback: number): number => (typeof v === 'number' ? v : fallback)

function Screen({ props, children }: NodeRendererProps): ReactNode {
  // Children need spacing of their own: MUI's outlined label sits on the border
  // and collides with the next field when siblings are flush against each other.
  return (
    <Box sx={{ maxWidth: num(props['maxWidth'], 640), mx: 'auto', p: 2 }}>
      <Stack gap={num(props['gap'], 2)}>{children}</Stack>
    </Box>
  )
}

function StackNode({ props, children }: NodeRendererProps): ReactNode {
  const direction = props['direction'] === 'row' ? 'row' : 'column'
  return (
    <Stack direction={direction} gap={num(props['gap'], 2)}>
      {children}
    </Stack>
  )
}

function Heading({ props }: NodeRendererProps): ReactNode {
  const level = str(props['level'], 'h5') as Variant
  return <Typography variant={level}>{str(props['text'])}</Typography>
}

function TextFieldNode({ props, value, error, onChange }: NodeRendererProps): ReactNode {
  return (
    <TextField
      fullWidth
      label={str(props['label'])}
      placeholder={str(props['placeholder'])}
      multiline={bool(props['multiline'])}
      disabled={bool(props['disabled'])}
      value={str(value)}
      error={Boolean(error)}
      helperText={error ?? str(props['helperText'])}
      onChange={(e) => onChange(e.target.value)}
    />
  )
}

function NumberFieldNode({ props, value, error, onChange }: NodeRendererProps): ReactNode {
  return (
    <TextField
      fullWidth
      type="number"
      label={str(props['label'])}
      disabled={bool(props['disabled'])}
      value={value === undefined || value === null ? '' : String(value)}
      error={Boolean(error)}
      helperText={error ?? str(props['helperText'])}
      onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
    />
  )
}

function CheckboxNode({ props, value, onChange }: NodeRendererProps): ReactNode {
  return (
    <FormControlLabel
      label={str(props['label'])}
      disabled={bool(props['disabled'])}
      control={<Checkbox checked={bool(value)} onChange={(e) => onChange(e.target.checked)} />}
    />
  )
}

function SelectNode({ props, value, error, onChange }: NodeRendererProps): ReactNode {
  const raw = props['options']
  const options = Array.isArray(raw) ? raw : []
  return (
    <TextField
      select
      fullWidth
      label={str(props['label'])}
      disabled={bool(props['disabled'])}
      value={str(value)}
      error={Boolean(error)}
      helperText={error ?? str(props['helperText'])}
      onChange={(e) => onChange(e.target.value)}
    >
      {options.map((option, i) => {
        const o = option as { label?: unknown; value?: unknown }
        const v = str(o.value, String(i))
        return (
          <MenuItem key={v} value={v}>
            {str(o.label, v)}
          </MenuItem>
        )
      })}
    </TextField>
  )
}

function ButtonNode({ props }: NodeRendererProps): ReactNode {
  const variant = str(props['variant'], 'contained')
  const safe = variant === 'outlined' || variant === 'text' ? variant : 'contained'
  return (
    <Button variant={safe} disabled={bool(props['disabled'])}>
      {str(props['text'], 'Button')}
    </Button>
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
}

export const muiRendererKit: RendererKit = { id: 'mui', renderers }
