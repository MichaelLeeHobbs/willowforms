/**
 * How much of a chosen file the import will read.
 *
 * `accept="application/json,.json"` is a picker filter, not a constraint: a
 * person can choose anything, and `file.text()` on a multi-hundred-megabyte
 * file decodes the whole thing into a string and then puts it in a textarea. A
 * form document is kilobytes; ten megabytes is far past anything real and far
 * short of what hurts.
 */
const MAX_IMPORT = 10 * 1024 * 1024

/**
 * Import, export, and raw JSON editing.
 *
 * A native `<dialog>` opened with `showModal()`, which brings focus trapping,
 * Escape to close, an inert background, and a backdrop with no code and no
 * dependency. Hand-rolling those is where accessible modals usually go wrong,
 * and the designer has no component library to borrow one from.
 *
 * The designer persists nothing itself. Storage is the host's job, the same way
 * the JavaScript sandbox is: `onChange` hands out every version of the document.
 * This covers the two things a host cannot do on the user's behalf, which are
 * getting JSON out and putting edited JSON back in.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { FormDocument } from '@formsmith/core'
import { loadDocument, toJsonSchema, unexportableRules } from '@formsmith/core'

import { Tabs } from './Tabs.js'

type View = 'document' | 'schema'

const VIEWS: { id: View; label: string }[] = [
  { id: 'document', label: 'Document' },
  { id: 'schema', label: 'JSON Schema' },
]

export interface DocumentDialogProps {
  open: boolean
  document: FormDocument
  onClose: () => void
  onReplace: (document: FormDocument) => void
}

export function DocumentDialog({
  open,
  document: doc,
  onClose,
  onReplace,
}: DocumentDialogProps): ReactNode {
  const ref = useRef<HTMLDialogElement>(null)

  // showModal() is what makes a dialog modal; rendering the `open` attribute
  // gives a non-modal dialog with no focus trap and no backdrop.
  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog ref={ref} className="fs-dialog" onClose={onClose} aria-label="Form JSON">
      {/*
        The body mounts only while open, so every state it holds starts fresh
        each time. That is React's own answer to resetting state on a prop
        change, and it beats clearing five things from an effect.
      */}
      {open && <DialogBody document={doc} onClose={onClose} onReplace={onReplace} />}
    </dialog>
  )
}

interface DialogBodyProps {
  document: FormDocument
  onClose: () => void
  onReplace: (document: FormDocument) => void
}

function DialogBody({ document: doc, onClose, onReplace }: DialogBodyProps): ReactNode {
  const documentJson = JSON.stringify(doc, null, 2)
  const schemaJson = JSON.stringify(toJsonSchema(doc), null, 2)
  const lossy = unexportableRules(doc)

  const [view, setView] = useState<View>('document')
  const [draft, setDraft] = useState(documentJson)
  const [errors, setErrors] = useState<string[]>([])
  const [note, setNote] = useState('')

  const apply = useCallback(() => {
    let parsed: unknown
    try {
      parsed = JSON.parse(draft)
    } catch (error) {
      setErrors([error instanceof Error ? error.message : 'That is not valid JSON.'])
      return
    }

    const loaded = loadDocument(parsed)
    if (!loaded.ok) {
      setErrors(loaded.errors.map((error) => error.message))
      return
    }

    setErrors([])
    onReplace(loaded.document)
    onClose()
  }, [draft, onClose, onReplace])

  const copy = useCallback((text: string, what: string) => {
    /*
     * Clipboard access can be denied, and the API can be absent entirely.
     *
     * The comment said "Say so rather than appearing to work" and the optional
     * chain did the opposite: with no `navigator.clipboard` -- any page not on a
     * secure origin, which includes a plain-HTTP host and some embedded
     * webviews -- the expression evaluated to `undefined`, no handler ran, and
     * the button did nothing at all. Silence is the one outcome the comment
     * ruled out.
     */
    const clipboard = navigator.clipboard
    if (!clipboard) {
      setNote('This browser offers no clipboard here. Select the text and copy it instead.')
      return
    }
    clipboard.writeText(text).then(
      () => setNote(what + ' copied to the clipboard.'),
      () => setNote('The browser refused clipboard access. Select the text and copy it instead.'),
    )
  }, [])

  const download = useCallback((text: string, filename: string) => {
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
    const link = window.document.createElement('a')
    link.href = url
    link.download = filename

    /*
     * Attached before the click and revoked on a later task. A detached anchor
     * and a URL revoked in the same tick are both long-standing ways to get a
     * download that silently never starts in Firefox and Safari.
     */
    link.style.display = 'none'
    window.document.body.appendChild(link)
    link.click()
    window.document.body.removeChild(link)
    setTimeout(() => URL.revokeObjectURL(url), 0)
  }, [])

  const onFile = useCallback((file: File | undefined) => {
    if (!file) return
    if (file.size > MAX_IMPORT) {
      setErrors(['That file is too large to be a form document.'])
      return
    }
    file
      .text()
      .then((text) => {
        // Loaded into the editor rather than applied, so a bad file is visible
        // and fixable instead of replacing the form outright.
        setDraft(text)
        setErrors([])
        setNote('Loaded ' + file.name + '. Review it, then apply.')
      })
      .catch(() => setErrors(['That file could not be read.']))
  }, [])

  const slug = slugify(doc.name)

  return (
    <>
      {}
      <Tabs
        label="JSON view"
        tabs={VIEWS}
        active={view}
        onSelect={setView}
        aside={
          <button type="button" className="fs-dialog__close" onClick={onClose} aria-label="Close">
            &times;
          </button>
        }
      >
        {view === 'document' ? (
          <>
            <label className="fs-visually-hidden" htmlFor="fs-document-json">
              Form document JSON
            </label>
            <textarea
              id="fs-document-json"
              className="fs-dialog__editor"
              spellCheck={false}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />

            {errors.length > 0 && (
              <ul className="fs-dialog__errors" role="alert">
                {/*
                 * Keyed by position as well as text. `validateDocument` reports
                 * per node, so two components can produce the same sentence --
                 * "root.children[0] is not a component node" for a document with
                 * two of them -- and React kept one row and dropped the other,
                 * so the count on screen disagreed with the list.
                 */}
                {errors.map((message, index) => (
                  <li key={String(index) + ':' + message}>{message}</li>
                ))}
              </ul>
            )}

            <div className="fs-dialog__actions">
              <button type="button" className="is-primary" onClick={apply}>
                Apply
              </button>
              {/*
               * The draft, not the stored document. These serialised `doc`, so
               * after editing the textarea both handed over the version from
               * before the edit -- silently, with the edit still on screen. Copy
               * and Download are about what is in front of you; Revert is the
               * button that means "give me the stored one back".
               */}
              <button type="button" onClick={() => copy(draft, 'The document')}>
                Copy
              </button>
              <button type="button" onClick={() => download(draft, slug + '.json')}>
                Download
              </button>
              <label className="fs-dialog__file">
                Import file
                <input
                  type="file"
                  accept="application/json,.json"
                  className="fs-visually-hidden"
                  onChange={(e) => {
                    onFile(e.target.files?.[0])
                    /*
                     * Cleared, so importing the same file twice does something
                     * the second time. A file input fires nothing when the
                     * chosen file has not changed, so re-importing after
                     * editing it on disk silently did nothing at all — no note,
                     * no error, just a button that had stopped working.
                     */
                    e.target.value = ''
                  }}
                />
              </label>
              {/*
               * The errors and the note go back with the draft.
               *
               * Revert put the stored document into the editor and left
               * everything else alone, so the `role="alert"` list went on
               * naming problems with a draft that is no longer on screen --
               * four complaints about a document the box no longer holds, and
               * nothing to click to clear them. `onFile` clears both for the
               * same reason.
               */}
              <button
                type="button"
                onClick={() => {
                  setDraft(documentJson)
                  setErrors([])
                  setNote('')
                }}
              >
                Revert
              </button>
            </div>
          </>
        ) : (
          <>
            <label className="fs-visually-hidden" htmlFor="fs-schema-json">
              JSON Schema
            </label>
            <textarea
              id="fs-schema-json"
              className="fs-dialog__editor"
              spellCheck={false}
              readOnly
              value={schemaJson}
            />

            <p className="fs-dialog__note">
              An export, never storage. JSON Schema cannot express layout or nesting, so this
              describes the submitted data and nothing about how the form looks.
              {lossy.length > 0 && (
                <> No equivalent here for {lossy.map((l) => l.rule + ' on ' + l.key).join(', ')}.</>
              )}
            </p>

            <div className="fs-dialog__actions">
              <button type="button" onClick={() => copy(schemaJson, 'The schema')}>
                Copy
              </button>
              <button type="button" onClick={() => download(schemaJson, slug + '.schema.json')}>
                Download
              </button>
            </div>
          </>
        )}

        {note && (
          <p className="fs-dialog__note" role="status">
            {note}
          </p>
        )}
      </Tabs>
    </>
  )
}

function slugify(name: unknown): string {
  if (typeof name !== 'string') return 'form'
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  return slug || 'form'
}
