import { useEffect, useId, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { FormData } from '@willowforms/core'

import { useAnnouncement } from '../announce.js'
import { copyText } from '../clipboard.js'

export function PreviewData({ data }: { data: FormData }): ReactNode {
  const id = useId()
  const dialog = useRef<HTMLDialogElement>(null)
  const editor = useRef<HTMLTextAreaElement>(null)
  const [open, setOpen] = useState(false)
  const [note, setNote] = useAnnouncement()

  useEffect(() => {
    if (open && !dialog.current?.open) {
      dialog.current?.showModal()
      editor.current?.focus()
    }
  }, [open])

  const copy = async (): Promise<void> => {
    const outcome = await copyText(JSON.stringify(data, null, 2))
    if (outcome === 'copied') {
      setNote('Form data copied to the clipboard.')
      return
    }
    editor.current?.focus()
    editor.current?.select()
    setNote(
      (outcome === 'unavailable'
        ? 'This browser offers no clipboard here.'
        : 'The browser refused clipboard access.') +
        ' The JSON is selected; copy it with your keyboard or browser menu.',
    )
  }

  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        onClick={() => {
          setNote('')
          setOpen(true)
        }}
      >
        Form data JSON
      </button>
      <dialog
        ref={dialog}
        className="fs-dialog fs-preview-data"
        aria-label="Form data"
        aria-describedby={open ? id + '-description' : undefined}
        onClose={() => setOpen(false)}
      >
        {open && (
          <>
            <h2 id={id + '-title'} className="fs-panel__heading">
              Form data
            </h2>
            <p id={id + '-description'} className="fs-preview-data__description">
              Current answers from Preview. Unanswered fields may be absent.
            </p>
            <textarea
              ref={editor}
              className="fs-dialog__editor"
              aria-label="Form data JSON"
              readOnly
              spellCheck={false}
              value={JSON.stringify(data, null, 2)}
            />
            <div className="fs-dialog__actions">
              <button
                type="button"
                onClick={() => {
                  void copy()
                }}
              >
                Copy JSON
              </button>
              <button
                type="button"
                onClick={() => {
                  editor.current?.focus()
                  editor.current?.select()
                }}
              >
                Select all
              </button>
              <button type="button" onClick={() => dialog.current?.close()}>
                Close
              </button>
            </div>
            <p className="fs-dialog__note" role="status">
              {note}
            </p>
          </>
        )}
      </dialog>
    </>
  )
}
