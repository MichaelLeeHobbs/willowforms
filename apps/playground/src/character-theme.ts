import { createTheme } from '@mui/material/styles'

export const characterTheme = createTheme({
  colorSchemes: {
    light: {
      palette: {
        primary: { main: '#456456' },
        background: { default: '#fcfaf5', paper: '#fcfaf5' },
        text: { primary: '#283b33', secondary: '#5a665e' },
      },
    },
    dark: {
      palette: {
        primary: { main: '#b2ccbf' },
        background: { default: '#18231f', paper: '#18231f' },
        text: { primary: '#eeeade', secondary: '#bec8bf' },
      },
    },
  },
  components: {
    MuiTextField: { defaultProps: { size: 'small' } },
    MuiFormControl: { defaultProps: { size: 'small' } },
    MuiCheckbox: { defaultProps: { size: 'small' } },
    MuiInputBase: { styleOverrides: { root: { fontSize: 14 } } },
    MuiInputLabel: { defaultProps: { shrink: true } },
    MuiOutlinedInput: { defaultProps: { notched: true } },
    MuiFormControlLabel: {
      styleOverrides: { root: { marginLeft: -6, marginRight: 0 }, label: { fontSize: 13 } },
    },
    MuiFormHelperText: {
      styleOverrides: { root: { fontSize: 12, lineHeight: 1.3, marginTop: 2 } },
    },
    MuiButton: { styleOverrides: { root: { textTransform: 'none' } } },
  },
})
