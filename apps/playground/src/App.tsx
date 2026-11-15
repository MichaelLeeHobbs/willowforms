import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import CssBaseline from '@mui/material/CssBaseline'
import { createTheme, ThemeProvider, useColorScheme } from '@mui/material/styles'
import { loadDocument as parseDocument } from '@willowforms/core'
import type { FormDocument, Kit } from '@willowforms/core'
import { Designer } from '@willowforms/designer'
import type { DesignerTheme } from '@willowforms/designer'
import type { RendererKit } from '@willowforms/renderer'
import { htmlKit } from '@willowforms/kit-html'
import { muiKit, muiRendererKit } from '@willowforms/kit-mui'

import '@willowforms/designer/styles.css'
import '@willowforms/kit-html/styles.css'
import './playground.css'
import './palettes.css'
import { SAMPLE_DOCUMENT } from './sample.js'
import { EXAMPLES } from './examples/index.js'
import { ExampleGallery } from './ExampleGallery.js'
import { ResetExample } from './ResetExample.js'
import { characterTheme } from './character-theme.js'
import { playgroundHtmlRendererKit } from './html-theme.js'

const STORAGE_KEY = 'willowforms.playground.document'

const KIT_KEY = 'willowforms.playground.kit'
const PALETTE_KEY = 'willowforms.playground.palette'
const PALETTES = {
  willow: 'Willow',
  desert: 'Desert Willow — AZT Bi-Color',
}

/** Read a saved selector choice, accepting it only when it names an own entry of `registry`. */
export function loadChoice<K extends string>(
  key: string,
  registry: Record<K, unknown>,
  fallback: K,
): K {
  try {
    const saved = localStorage.getItem(key)
    if (saved !== null && Object.hasOwn(registry, saved)) return saved as K
  } catch {
    // Private-mode browsers throw on read as well as on write; the selector still works.
  }
  return fallback
}

const KITS: Record<string, { label: string; kit: Kit; renderers: RendererKit }> = {
  mui: { label: 'Material UI', kit: muiKit, renderers: muiRendererKit },
  html: { label: 'Plain HTML', kit: htmlKit, renderers: playgroundHtmlRendererKit },
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

export function App(): ReactNode {
  const [session, setSession] = useState(() => loadDraft(initialExample()))
  const [initial, setInitial] = useState(session.document)
  const [saveError, setSaveError] = useState(session.error)
  const [kitId, setKitId] = useState(() => loadChoice(KIT_KEY, KITS, 'mui'))
  const [themeMode, setThemeMode] = useState<DesignerTheme>('system')
  const [palette, setPalette] = useState<string>(() => loadChoice(PALETTE_KEY, PALETTES, 'willow'))
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
    <ThemeProvider theme={session.document.id === 'dnd-character-sheet' ? characterTheme : theme}>
      <ThemeModeSync mode={themeMode} />
      <CssBaseline />
      <div className="pg-app" data-pg-theme={themeMode} data-pg-palette={palette}>
        <div className="pg-kit-switch">
          <strong className="pg-brand">
            <svg className="pg-brand__mark" viewBox="0 0 28 28" fill="none" aria-hidden="true">
              <rect x="1" y="1" width="26" height="26" rx="7" fill="currentColor" />
              <path
                d="m7 8 3 12 4-8 4 8 3-12"
                stroke="var(--pg-surface)"
                strokeWidth="2.5"
                strokeLinecap="round"
              />
            </svg>
            WillowForms <span className="pg-beta">Beta</span>
          </strong>
          <ExampleGallery activeId={session.id} onChoose={chooseExample} />
          {session.id && <ResetExample onReset={resetExample} />}
          <div className="pg-kit-switch__control">
            <label htmlFor="pg-kit">Kit</label>
            <select id="pg-kit" value={kitId} onChange={(e) => chooseKit(e.target.value)}>
              {Object.entries(KITS).map(([id, entry]) => (
                <option key={id} value={id}>
                  {entry.label}
                </option>
              ))}
            </select>
          </div>
          <div className="pg-kit-switch__control">
            <label htmlFor="pg-palette">Palette</label>
            <select
              id="pg-palette"
              value={palette}
              onChange={(event) => {
                const next = event.target.value
                setPalette(next)
                try {
                  localStorage.setItem(PALETTE_KEY, next)
                } catch {
                  // Keep the current choice for this session.
                }
              }}
            >
              {Object.entries(PALETTES).map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </div>
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
