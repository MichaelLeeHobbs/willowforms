import { useMemo } from 'react'
import type { ReactNode } from 'react'
import { ThemeProvider, useTheme } from '@mui/material/styles'
import type { FormDensity } from '@formsmith/renderer'

function defaults<T extends { defaultProps?: object | undefined }>(
  base: T | undefined,
  values: NonNullable<T['defaultProps']>,
): { defaultProps: NonNullable<T['defaultProps']> } {
  return { ...base, defaultProps: { ...base?.defaultProps, ...values } }
}

export function DensityTheme({
  density,
  children,
}: {
  density: FormDensity
  children: ReactNode
}): ReactNode {
  const theme = useTheme()
  const compact = density === 'compact'
  const value = useMemo(() => {
    const components = theme.components
    const size = compact ? 'small' : 'medium'
    return {
      ...theme,
      components: {
        ...components,
        MuiTextField: defaults(components?.MuiTextField, { size }),
        MuiFormControl: defaults(components?.MuiFormControl, { size }),
        MuiCheckbox: defaults(components?.MuiCheckbox, { size }),
        MuiRadio: defaults(components?.MuiRadio, { size }),
        MuiSwitch: defaults(components?.MuiSwitch, { size }),
        MuiButton: defaults(components?.MuiButton, { size }),
        MuiInputLabel: defaults(components?.MuiInputLabel, { shrink: compact ? true : undefined }),
        MuiOutlinedInput: defaults(components?.MuiOutlinedInput, {
          notched: compact ? true : undefined,
        }),
        MuiInputBase: {
          ...components?.MuiInputBase,
          styleOverrides: {
            ...components?.MuiInputBase?.styleOverrides,
            root: [components?.MuiInputBase?.styleOverrides?.root, { fontSize: compact ? 14 : 16 }],
          },
        },
        MuiFormControlLabel: {
          ...components?.MuiFormControlLabel,
          styleOverrides: {
            ...components?.MuiFormControlLabel?.styleOverrides,
            root: [
              components?.MuiFormControlLabel?.styleOverrides?.root,
              { marginLeft: compact ? -6 : -11, marginRight: compact ? 0 : 16 },
            ],
            label: [
              components?.MuiFormControlLabel?.styleOverrides?.label,
              { fontSize: compact ? 13 : 16 },
            ],
          },
        },
        MuiFormHelperText: {
          ...components?.MuiFormHelperText,
          styleOverrides: {
            ...components?.MuiFormHelperText?.styleOverrides,
            root: [
              components?.MuiFormHelperText?.styleOverrides?.root,
              { fontSize: 12, lineHeight: compact ? 1.3 : 1.66, marginTop: compact ? 2 : 4 },
            ],
          },
        },
      },
    }
  }, [theme, compact])
  return <ThemeProvider theme={value}>{children}</ThemeProvider>
}
