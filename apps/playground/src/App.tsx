import { useCallback, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import CssBaseline from '@mui/material/CssBaseline'
import { createTheme, ThemeProvider } from '@mui/material/styles'
import { validateDocument } from '@formsmith/core'
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
    if (!raw) return SAMPLE_DOCUMENT

    const parsed = JSON.parse(raw) as FormDocument
    /*
     * The shape as well as the syntax. It guarded the parse and nothing else,
     * so a stored document that is valid JSON and not a valid document threw on
     * every load — with no way out from inside the app, because the app is what
     * failed to start. The JSON dialog refuses exactly this input; the code
     * path that runs before the dialog exists did not.
     */
    const problems = validateDocument(parsed)
    if (problems.length === 0) return parsed

    console.warn(
      'Formsmith playground: the stored draft does not validate, so the sample was loaded instead. ' +
        problems.map((problem) => problem.message).join(' '),
    )
  } catch {
    // A corrupt draft should not brick the playground; fall through to the sample.
  }
  return SAMPLE_DOCUMENT
}

const theme = createTheme({ colorSchemes: { dark: true } })

export function App(): ReactNode {
  /*
   * The document the designer is mounted with, and it has to be able to change.
   *
   * A kit change remounts the designer, and the designer reads
   * `initialDocument` only at mount — so remounting with the *boot* document
   * threw away every edit since page load. Worse, silently: the designer's mount
   * effect fires `onChange` with what it was given, which this persists, so the
   * loss reached `localStorage` and a reload did not recover it.
   */
  const [initial, setInitial] = useState(loadDocument)
  const [kitId, setKitId] = useState<string>('mui')

  /*
   * The latest document, for the remount to start from.
   *
   * A ref rather than state: this is written on every keystroke, and putting it
   * in state would re-render the whole designer from up here for a value only a
   * kit change ever reads. Written from a callback and read from a handler,
   * never during render.
   */
  const latest = useRef(initial)

  const persist = useCallback((doc: FormDocument) => {
    latest.current = doc
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(doc))
    } catch {
      // Private-mode browsers throw on write. Losing the draft beats crashing.
    }
  }, [])

  /*
   * Both in one handler, so the remount happens against the current document
   * rather than the one this component was born with.
   */
  const chooseKit = useCallback((id: string) => {
    setInitial(latest.current)
    setKitId(id)
  }, [])

  const active = KITS[kitId] ?? KITS['mui']
  if (!active) throw new Error('No kit registered')

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
        <div className="pg-kit-switch">
          <label htmlFor="pg-kit">Kit</label>
          <select id="pg-kit" value={kitId} onChange={(e) => chooseKit(e.target.value)}>
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
