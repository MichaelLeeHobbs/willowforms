import { useCallback, useState } from 'react'
import type { ReactNode } from 'react'
import CssBaseline from '@mui/material/CssBaseline'
import { createTheme, ThemeProvider } from '@mui/material/styles'
import type { FormDocument } from '@formsmith/core'
import { Designer } from '@formsmith/designer'
import { muiKit, muiRendererKit } from '@formsmith/kit-mui'

import '@formsmith/designer/styles.css'
import { SAMPLE_DOCUMENT } from './sample.js'

const STORAGE_KEY = 'formsmith.playground.document'

function loadDocument(): FormDocument {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw) as FormDocument
  } catch {
    // A corrupt draft should not brick the playground; fall through to the sample.
  }
  return SAMPLE_DOCUMENT
}

const theme = createTheme({ colorSchemes: { dark: true } })

export function App(): ReactNode {
  const [initial] = useState(loadDocument)

  const persist = useCallback((doc: FormDocument) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(doc))
    } catch {
      // Private-mode browsers throw on write. Losing the draft beats crashing.
    }
  }, [])

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <div style={{ height: '100vh' }}>
        <Designer
          initialDocument={initial}
          kit={muiKit}
          rendererKit={muiRendererKit}
          onChange={persist}
        />
      </div>
    </ThemeProvider>
  )
}
