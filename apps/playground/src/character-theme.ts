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
    MuiButton: { styleOverrides: { root: { textTransform: 'none' } } },
  },
})
