import { useRef } from 'react'
import type { ReactNode } from 'react'

export function ResetExample({ onReset }: { onReset: () => void }): ReactNode {
  const dialog = useRef<HTMLDialogElement>(null)
  const cancel = useRef<HTMLButtonElement>(null)
  return (
    <>
      <button
        className="pg-reset-button"
        type="button"
        aria-haspopup="dialog"
        onClick={() => {
          dialog.current?.showModal()
          cancel.current?.focus()
        }}
      >
        Reset example
      </button>
      <dialog
        ref={dialog}
        className="pg-reset"
        aria-labelledby="pg-reset-title"
        aria-describedby="pg-reset-description"
      >
        <h2 id="pg-reset-title">Reset this example?</h2>
        <p id="pg-reset-description">
          Load the latest example design and discard your edits and preview answers. Export JSON
          first if you want to keep your design.
        </p>
        <div className="pg-reset__actions">
          <button ref={cancel} type="button" onClick={() => dialog.current?.close()}>
            Cancel reset
          </button>
          <button
            type="button"
            onClick={() => {
              dialog.current?.close()
              onReset()
            }}
          >
            Reset design
          </button>
        </div>
      </dialog>
    </>
  )
}
