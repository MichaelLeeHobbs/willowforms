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
import { toJsonSchema, unexportableRules, validateDocument } from '@formsmith/core'

type View = 'document' | 'schema'

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

    const problems = documentProblems(parsed)
    if (problems.length > 0) {
      setErrors(problems)
      return
    }

    setErrors([])
    onReplace(parsed as FormDocument)
    onClose()
  }, [draft, onClose, onReplace])

  const copy = useCallback((text: string, what: string) => {
    // Clipboard access can be denied. Say so rather than appearing to work.
    navigator.clipboard?.writeText(text).then(
      () => setNote(what + ' copied to the clipboard.'),
      () => setNote('The browser refused clipboard access. Select the text and copy it instead.'),
    )
  }, [])

  const download = useCallback((text: string, filename: string) => {
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
    const link = window.document.createElement('a')
    link.href = url
    link.download = filename
    link.click()
    URL.revokeObjectURL(url)
  }, [])

  const onFile = useCallback((file: File | undefined) => {
    if (!file) return
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
      <div className="fs-dialog__head">
        <div className="fs-tabs" role="tablist" aria-label="JSON view">
          <ViewTab id="document" label="Document" view={view} onSelect={setView} />
          <ViewTab id="schema" label="JSON Schema" view={view} onSelect={setView} />
        </div>

        <button type="button" className="fs-dialog__close" onClick={onClose} aria-label="Close">
          &times;
        </button>
      </div>

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
              {errors.map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
          )}

          <div className="fs-dialog__actions">
            <button type="button" className="is-primary" onClick={apply}>
              Apply
            </button>
            <button type="button" onClick={() => copy(documentJson, 'The document')}>
              Copy
            </button>
            <button type="button" onClick={() => download(documentJson, slug + '.json')}>
              Download
            </button>
            <label className="fs-dialog__file">
              Import file
              <input
                type="file"
                accept="application/json,.json"
                className="fs-visually-hidden"
                onChange={(e) => onFile(e.target.files?.[0])}
              />
            </label>
            <button type="button" onClick={() => setDraft(documentJson)}>
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
              <> Custom rules on {lossy.map((l) => l.key).join(', ')} have no equivalent here.</>
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
    </>
  )
}

interface ViewTabProps {
  id: View
  label: string
  view: View
  onSelect: (view: View) => void
}

function ViewTab({ id, label, view, onSelect }: ViewTabProps): ReactNode {
  const active = view === id
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      tabIndex={active ? 0 : -1}
      className={'fs-tabs__tab' + (active ? ' is-active' : '')}
      onClick={() => onSelect(id)}
    >
      {label}
    </button>
  )
}

/** A filename stem from the form's name. */
function slugify(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  return slug || 'form'
}

/**
 * Refuse anything that would crash the renderer.
 *
 * `validateDocument` in core catches duplicate keys, empty keys, and unknown
 * references, but it takes a `FormDocument` and pasted JSON is not one yet. The
 * shape checks here are what make the cast that follows them honest.
 */
function documentProblems(value: unknown): string[] {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return ['A form document must be a JSON object.']
  }

  const candidate = value as Partial<FormDocument>
  const problems: string[] = []

  if (candidate.version !== '1') problems.push('version must be "1".')
  if (typeof candidate.id !== 'string') problems.push('id must be a string.')
  if (typeof candidate.name !== 'string') problems.push('name must be a string.')
  if (typeof candidate.root !== 'object' || candidate.root === null) {
    problems.push('root must be a component node.')
  } else if (typeof candidate.root.key !== 'string' || typeof candidate.root.type !== 'string') {
    problems.push('root needs a string key and a string type.')
  }

  // Only worth the deeper walk once the shape holds up.
  if (problems.length > 0) return problems
  return validateDocument(candidate as FormDocument).map((error) => error.message)
}
