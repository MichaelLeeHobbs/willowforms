import { useId, useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { FormDocument } from '@willowforms/core'
import { loadDocument, toJsonSchema, unexportableRules } from '@willowforms/core'

import { useAnnouncement } from '../announce.js'
import { copyText } from '../clipboard.js'
import { Tabs } from './Tabs.js'

// Bound memory use before decoding a file into the editor.
const MAX_IMPORT = 10 * 1024 * 1024

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
      {/* Mounted only while open, so its state starts fresh each time. */}
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
  const idBase = useId()
  const documentJson = JSON.stringify(doc, null, 2)
  const schemaJson = JSON.stringify(toJsonSchema(doc), null, 2)
  const lossy = unexportableRules(doc)

  const [view, setView] = useState<View>('document')
  const [draft, setDraft] = useState(documentJson)
  const [errors, setErrors] = useState<string[]>([])
  const [note, setNote] = useAnnouncement()
  const fileRead = useRef({ version: 0 })
  useEffect(() => {
    const pending = fileRead.current
    return () => {
      pending.version++
    }
  }, [])

  const apply = useCallback(() => {
    fileRead.current.version++
    setNote('')
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
  }, [draft, onClose, onReplace, setNote])

  const copy = useCallback(
    (text: string, what: string) => {
      void copyText(text).then((outcome) => {
        if (outcome === 'copied') setNote(what + ' copied to the clipboard.')
        else if (outcome === 'unavailable')
          setNote('This browser offers no clipboard here. Select the text and copy it instead.')
        else setNote('The browser refused clipboard access. Select the text and copy it instead.')
      })
    },
    [setNote],
  )

  const download = useCallback((text: string, filename: string) => {
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
    const link = window.document.createElement('a')
    link.href = url
    link.download = filename

    // Attached through the click and revoked on a later task, so neither is gone before
    // the browser starts the download.
    link.style.display = 'none'
    window.document.body.appendChild(link)
    link.click()
    window.document.body.removeChild(link)
    setTimeout(() => URL.revokeObjectURL(url), 0)
  }, [])

  const onFile = useCallback(
    (file: File | undefined) => {
      if (!file) return
      const version = ++fileRead.current.version
      setNote('')
      if (file.size > MAX_IMPORT) {
        setErrors([
          'That file is too large. JSON files must be 10 MiB or smaller. Use linked images to reduce file size.',
        ])
        return
      }
      setErrors([])
      setNote('Reading ' + file.name + '…')
      file
        .text()
        .then((text) => {
          if (version !== fileRead.current.version) return
          setDraft(text)
          setErrors([])
          setNote('Loaded ' + file.name + '. Review it, then apply.')
        })
        .catch(() => {
          if (version !== fileRead.current.version) return
          setNote('')
          setErrors(['That file could not be read.'])
        })
    },
    [setNote],
  )

  const slug = slugify(doc.name)

  return (
    <>
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
            <label className="fs-visually-hidden" htmlFor={idBase + '-fs-document-json'}>
              Form document JSON
            </label>
            <textarea
              id={idBase + '-fs-document-json'}
              className="fs-dialog__editor"
              spellCheck={false}
              value={draft}
              onChange={(e) => {
                fileRead.current.version++
                setDraft(e.target.value)
                setNote('')
              }}
            />

            {errors.length > 0 && (
              <ul className="fs-dialog__errors" role="alert">
                {/* Position in the key: `validateDocument` can repeat a message. */}
                {errors.map((message, index) => (
                  <li key={String(index) + ':' + message}>{message}</li>
                ))}
              </ul>
            )}

            <div className="fs-dialog__actions">
              <button type="button" className="is-primary" onClick={apply}>
                Apply
              </button>
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
                  aria-describedby={idBase + '-import-hint'}
                  onChange={(e) => {
                    onFile(e.target.files?.[0])
                    // Allow selecting the same file again after it changes on disk.
                    e.target.value = ''
                  }}
                />
              </label>
              <button
                type="button"
                onClick={() => {
                  fileRead.current.version++
                  setDraft(documentJson)
                  setErrors([])
                  setNote('')
                }}
              >
                Revert
              </button>
            </div>
            <p id={idBase + '-import-hint'} className="fs-dialog__note">
              JSON files up to 10 MiB. Linked images keep image-heavy forms smaller than embedded
              images.
            </p>
          </>
        ) : (
          <>
            <label className="fs-visually-hidden" htmlFor={idBase + '-fs-schema-json'}>
              JSON Schema
            </label>
            <textarea
              id={idBase + '-fs-schema-json'}
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

        {/* Always here: a live region inserted with its text is not reliably read out. */}
        <p className="fs-dialog__note" role="status">
          {note}
        </p>
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
