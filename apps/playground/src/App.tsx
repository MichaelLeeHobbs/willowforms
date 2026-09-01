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
  const [kitId, setKitId] = useState<string>(loadKit)

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
    try {
      localStorage.setItem(KIT_KEY, id)
    } catch {
      // Private-mode browsers throw on write, the way `persist` allows for.
      // Forgetting the choice beats refusing to make it.
    }
  }, [])

  const active = KITS[kitId] ?? KITS['mui']
  /*
   * Unreachable, and it stays. `KITS` is a non-empty literal in this file and
   * `kitId` only ever holds one of its ids, so the lookup cannot miss --
   * `noUncheckedIndexedAccess` cannot know that, and the alternative is a
   * non-null assertion, which is the same claim with nothing behind it. A throw
   * that cannot happen is cheaper than a lie that can.
   */
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
