/**
 * @vitest-environment jsdom
 */

/**
 * The Preview form data dialog's Copy JSON button.
 *
 * A missing clipboard API and a refused write need different advice, and on
 * either failure the JSON is left selected so a keyboard copy is one step.
 */

import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'

import { PreviewData } from './PreviewData.js'

beforeAll(() => {
  // jsdom implements neither; the dialog needs both to open and close.
  const proto = HTMLDialogElement.prototype as {
    showModal?: () => void
    close?: () => void
    open?: boolean
  }
  proto.showModal ??= function showModal(this: HTMLDialogElement): void {
    this.open = true
  }
  proto.close ??= function close(this: HTMLDialogElement): void {
    this.open = false
    this.dispatchEvent(new Event('close'))
  }
})

const original = Object.getOwnPropertyDescriptor(navigator, 'clipboard')

function setClipboard(value: unknown): void {
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value })
}

afterEach(() => {
  if (original) Object.defineProperty(navigator, 'clipboard', original)
  else delete (navigator as { clipboard?: unknown }).clipboard
})

const data = { name: 'Mira', count: 0, addresses: [{ street: '12 Oak Lane' }] }
const json = JSON.stringify(data, null, 2)

/**
 * Opens the dialog with the given clipboard, presses Copy JSON, and returns the
 * settled note and editor. The clipboard is set after `userEvent.setup()`,
 * which installs a clipboard stub of its own.
 */
async function copyAndRead(
  clipboard: unknown,
): Promise<{ note: string; editor: HTMLTextAreaElement; unmount: () => void }> {
  const user = userEvent.setup()
  setClipboard(clipboard)
  const { unmount } = render(<PreviewData data={data} />)
  await user.click(screen.getByRole('button', { name: 'Form data JSON' }))

  const dialog = screen.getByRole('dialog', { name: 'Form data' })
  const editor = within(dialog).getByRole<HTMLTextAreaElement>('textbox', {
    name: 'Form data JSON',
  })
  const status = within(dialog).getByRole('status')

  await user.click(within(dialog).getByRole('button', { name: 'Copy JSON' }))
  await waitFor(() => expect(status.textContent).not.toBe(''))

  return { note: status.textContent ?? '', editor, unmount }
}

function expectSelected(editor: HTMLTextAreaElement): void {
  expect(document.activeElement).toBe(editor)
  expect(editor.value.slice(editor.selectionStart, editor.selectionEnd)).toBe(json)
}

describe('PreviewData Copy JSON', () => {
  it('tells a missing clipboard from a refused one and selects the JSON for both', async () => {
    const missing = await copyAndRead(undefined)
    expect(missing.note).toContain('offers no clipboard')
    expectSelected(missing.editor)
    missing.unmount()

    const refused = await copyAndRead({ writeText: () => Promise.reject(new Error('denied')) })
    expect(refused.note).toContain('refused')
    expectSelected(refused.editor)

    expect(refused.note).not.toBe(missing.note)
  })

  it('copies the JSON and says so', async () => {
    const written: string[] = []
    const { note } = await copyAndRead({
      writeText: (text: string) => {
        written.push(text)
        return Promise.resolve()
      },
    })

    expect(written).toEqual([json])
    expect(note).toBe('Form data copied to the clipboard.')
  })
})
