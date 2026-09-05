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
import { EXAMPLES } from './examples/index.js'
import { ExampleGallery } from './ExampleGallery.js'

const STORAGE_KEY = 'formsmith.playground.document'

const KIT_KEY = 'formsmith.playground.kit'

const KITS: Record<string, { label: string; kit: Kit; renderers: RendererKit }> = {
  mui: { label: 'Material UI', kit: muiKit, renderers: muiRendererKit },
  html: { label: 'Plain HTML', kit: htmlKit, renderers: htmlRendererKit },
}

interface Draft {
  id: string
  document: FormDocument
  error: string
}

function draftKey(id: string): string {
  return id ? STORAGE_KEY + '.' + id : STORAGE_KEY
}

function initialExample(): string {
  const id = new URLSearchParams(window.location.search).get('example')
  return EXAMPLES.some((example) => example.id === id) ? (id ?? '') : ''
}

function loadDraft(id: string): Draft {
  const document = EXAMPLES.find((example) => example.id === id)?.document ?? SAMPLE_DOCUMENT
  try {
    const raw = localStorage.getItem(draftKey(id))
    if (!raw) return { id, document, error: '' }

    const loaded = parseDocument(JSON.parse(raw))
    if (loaded.ok) return { id, document: loaded.document, error: '' }
  } catch {
    // Preserve unreadable drafts and let the author export this session's work.
  }
  return {
    id,
    document,
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
  const [session, setSession] = useState(() => loadDraft(initialExample()))
  const [initial, setInitial] = useState(session.document)
  const [saveError, setSaveError] = useState(session.error)
  const [kitId, setKitId] = useState<string>(loadKit)
  const [themeMode, setThemeMode] = useState<DesignerTheme>('system')
  const [resetCount, setResetCount] = useState(0)

  const latest = useRef(initial)
  const drafts = useRef(new Map<string, Draft>())

  const persist = useCallback(
    (doc: FormDocument) => {
      latest.current = doc
      drafts.current.set(session.id, { ...session, document: doc })
      if (session.error) return
      try {
        localStorage.setItem(draftKey(session.id), JSON.stringify(doc))
        setSaveError('')
      } catch {
        setSaveError('Local saving is unavailable. Export your changes from JSON before leaving.')
      }
    },
    [session],
  )

  const chooseExample = useCallback(
    (id: string) => {
      if (id === session.id) return
      const next = drafts.current.get(id) ?? loadDraft(id)
      latest.current = next.document
      setInitial(next.document)
      setSession(next)
      setSaveError(next.error)
      const url = new URL(window.location.href)
      if (id) url.searchParams.set('example', id)
      else url.searchParams.delete('example')
      window.history.replaceState(null, '', url)
    },
    [session.id],
  )

  const chooseKit = useCallback((id: string) => {
    setInitial(latest.current)
    setKitId(id)
    try {
      localStorage.setItem(KIT_KEY, id)
    } catch {
      // The current choice still works when browser storage is unavailable.
    }
  }, [])

  const resetExample = (): void => {
    const example = EXAMPLES.find((entry) => entry.id === session.id)
    if (!example) return
    const next: Draft = { id: example.id, document: example.document, error: '' }
    drafts.current.set(next.id, next)
    latest.current = next.document
    setInitial(next.document)
    setSession(next)
    setSaveError('')
    setResetCount((count) => count + 1)
  }

  const active = KITS[kitId] ?? KITS['mui']

  if (!active) throw new Error('No kit registered')

  return (
    <ThemeProvider theme={theme}>
      <ThemeModeSync mode={themeMode} />
      <CssBaseline />
      <div className="pg-app" data-pg-theme={themeMode}>
        <div className="pg-kit-switch">
          <strong className="pg-brand">
            Formsmith <span className="pg-beta">Beta</span>
          </strong>
          <ExampleGallery activeId={session.id} onChoose={chooseExample} onReset={resetExample} />
          <label htmlFor="pg-kit">Kit</label>
          <select id="pg-kit" value={kitId} onChange={(e) => chooseKit(e.target.value)}>
            {Object.entries(KITS).map(([id, entry]) => (
              <option key={id} value={id}>
                {entry.label}
              </option>
            ))}
          </select>
          <span className="pg-kit-switch__note" role="status">
            {saveError ? 'Not saved locally' : 'Design saved in this browser'}
          </span>
        </div>

        {saveError && (
          <p className="pg-save-error" role="alert">
            {saveError}
          </p>
        )}

        <div className="pg-designer">
          <Designer
            key={session.id + ':' + kitId + ':' + String(resetCount)}
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
