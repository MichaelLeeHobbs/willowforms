import { createTheme } from '@mui/material/styles'

export const characterTheme = createTheme({
  colorSchemes: {
    light: {
      palette: {
        primary: { main: '#80542f' },
        background: { default: '#ffffff', paper: '#ffffff' },
        text: { primary: '#292723', secondary: '#625d55' },
      },
    },
    dark: {
      palette: {
        primary: { main: '#dfb990' },
        background: { default: '#242321', paper: '#242321' },
        text: { primary: '#f1eee9', secondary: '#c8c2b9' },
      },
    },
  },
  components: {
    MuiButton: { styleOverrides: { root: { textTransform: 'none' } } },
  },
})
