import { useCallback, useState } from 'react'
import type { ReactNode } from 'react'
import CssBaseline from '@mui/material/CssBaseline'
import { createTheme, ThemeProvider } from '@mui/material/styles'
import type { FormDocument, Kit } from '@formsmith/core'
import { Designer } from '@formsmith/designer'
import type { RendererKit } from '@formsmith/renderer'
import { htmlKit, htmlRendererKit } from '@formsmith/kit-html'
import { muiKit, muiRendererKit } from '@formsmith/kit-mui'

import '@formsmith/designer/styles.css'
import '@formsmith/kit-html/styles.css'
import './playground.css'
import { SAMPLE_DOCUMENT } from './sample.js'

const STORAGE_KEY = 'formsmith.playground.document'

/**
 * Two kits, switchable at runtime.
 *
 * This is the demonstration behind the architecture's central claim. The same
 * document renders through either kit, the designer never imports either one,
 * and swapping them is the two props below. Adding `@formsmith/kit-html`
 * required no change to core, the renderer, or the designer.
 */
const KITS: Record<string, { label: string; kit: Kit; renderers: RendererKit }> = {
  mui: { label: 'Material UI', kit: muiKit, renderers: muiRendererKit },
  html: { label: 'Plain HTML', kit: htmlKit, renderers: htmlRendererKit },
}

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
  const [kitId, setKitId] = useState<string>('mui')

  const persist = useCallback((doc: FormDocument) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(doc))
    } catch {
      // Private-mode browsers throw on write. Losing the draft beats crashing.
    }
  }, [])

  const active = KITS[kitId] ?? KITS['mui']
  if (!active) throw new Error('No kit registered')

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
        <div className="pg-kit-switch">
          <label htmlFor="pg-kit">Kit</label>
          <select id="pg-kit" value={kitId} onChange={(e) => setKitId(e.target.value)}>
            {Object.entries(KITS).map(([id, entry]) => (
              <option key={id} value={id}>
                {entry.label}
              </option>
            ))}
          </select>
          <span className="pg-kit-switch__note">
            The same document, rendered through a different kit. The designer imports neither.
          </span>
        </div>

        <div style={{ flex: 1, minHeight: 0 }}>
          <Designer
            /*
             * Remounting on a kit change is deliberate. The designer holds a
             * selection and an undo stack keyed to component types the previous
             * kit defined, and carrying those across would leave the properties
             * panel describing a component the new kit may not have.
             */
            key={kitId}
            initialDocument={initial}
            kit={active.kit}
            rendererKit={active.renderers}
            onChange={persist}
          />
        </div>
      </div>
    </ThemeProvider>
  )
}
