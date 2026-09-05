import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import CssBaseline from '@mui/material/CssBaseline'
import { createTheme, ThemeProvider, useColorScheme } from '@mui/material/styles'
import { loadDocument as parseDocument } from '@formsmith/core'
import type { FormDocument, Kit } from '@formsmith/core'
import { Designer } from '@formsmith/designer'
import type { DesignerTheme } from '@formsmith/designer'
import type { RendererKit } from '@formsmith/renderer'
import { htmlKit, htmlRendererKit } from '@formsmith/kit-html'
import { muiKit, muiRendererKit } from '@formsmith/kit-mui'

import '@formsmith/designer/styles.css'
import '@formsmith/kit-html/styles.css'
import './playground.css'
import { SAMPLE_DOCUMENT } from './sample.js'

const STORAGE_KEY = 'formsmith.playground.document'

/**
 * Which kit was chosen, kept beside the document.
 *
 * The kit switch is the demonstration this whole app exists for -- "a kit is a
 * package, not a rewrite" -- and it did not survive a reload. Somebody switched
 * to the HTML kit, pressed F5 to check something, and was back on MUI looking at
 * a document they had authored against the other one. The document was
 * persisted and the choice that framed it was not.
 */
const KIT_KEY = 'formsmith.playground.kit'

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

function loadDraft(): { document: FormDocument; error: string } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { document: SAMPLE_DOCUMENT, error: '' }

    const loaded = parseDocument(JSON.parse(raw))
    if (loaded.ok) return { document: loaded.document, error: '' }
  } catch {
    // Preserve unreadable drafts and let the author export this session's work.
  }
  return {
    document: SAMPLE_DOCUMENT,
    error:
      'Saved draft could not be loaded. Local saving is paused to preserve it. Export your changes from JSON.',
  }
}

const theme = createTheme({ colorSchemes: { dark: true } })

/** Keep the host-owned MUI palette aligned with the designer's view preference. */
function ThemeModeSync({ mode }: { mode: DesignerTheme }): null {
  const { setMode } = useColorScheme()

  useEffect(() => {
    setMode(mode)
  }, [mode, setMode])

  return null
}

/**
 * The kit chosen last time, or MUI.
 *
 * Validated against `KITS` rather than trusted: this is `localStorage`, which a
 * person can edit and an older build of this app can have written, and an id
 * nothing registers would throw on the next line of `App`.
 */
function loadKit(): string {
  try {
    const saved = localStorage.getItem(KIT_KEY)
    return saved !== null && Object.hasOwn(KITS, saved) ? saved : 'mui'
  } catch {
    // Private-mode browsers throw on read as well as on write.
    return 'mui'
  }
}

export function App(): ReactNode {
  const [boot] = useState(loadDraft)
  const [initial, setInitial] = useState(boot.document)
  const [saveError, setSaveError] = useState(boot.error)
  const [kitId, setKitId] = useState<string>(loadKit)
  const [themeMode, setThemeMode] = useState<DesignerTheme>('system')

  const latest = useRef(initial)

  const persist = useCallback(
    (doc: FormDocument) => {
      latest.current = doc
      if (boot.error) return
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(doc))
        setSaveError('')
      } catch {
        setSaveError('Local saving is unavailable. Export your changes from JSON before leaving.')
      }
    },
    [boot.error],
  )

  /*
   * Both in one handler, so the remount happens against the current document
   * rather than the one this component was born with.
   */
  const chooseKit = useCallback((id: string) => {
    setInitial(latest.current)
    setKitId(id)
    try {
      localStorage.setItem(KIT_KEY, id)
    } catch {
      // Private-mode browsers throw on write, the way `persist` allows for.
      // Forgetting the choice beats refusing to make it.
    }
  }, [])

  const active = KITS[kitId] ?? KITS['mui']

  if (!active) throw new Error('No kit registered')

  return (
    <ThemeProvider theme={theme}>
      <ThemeModeSync mode={themeMode} />
      <CssBaseline />
      <div className="pg-app">
        <div className="pg-kit-switch">
          <strong className="pg-brand">
            Formsmith <span className="pg-beta">Beta</span>
          </strong>
          <label htmlFor="pg-kit">Kit</label>
          <select id="pg-kit" value={kitId} onChange={(e) => chooseKit(e.target.value)}>
            {Object.entries(KITS).map(([id, entry]) => (
              <option key={id} value={id}>
                {entry.label}
              </option>
            ))}
          </select>
          <span className="pg-kit-switch__note" role="status">
            {saveError ? 'Not saved locally' : 'Saved in this browser'}
          </span>
        </div>

        {saveError && (
          <p className="pg-save-error" role="alert">
            {saveError}
          </p>
        )}

        <div className="pg-designer">
          <Designer
            key={kitId}
            initialDocument={initial}
            kit={active.kit}
            rendererKit={active.renderers}
            onChange={persist}
            theme={themeMode}
            onThemeChange={setThemeMode}
          />
        </div>
      </div>
    </ThemeProvider>
  )
}
