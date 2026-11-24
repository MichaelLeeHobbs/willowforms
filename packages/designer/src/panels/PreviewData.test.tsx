/**
 * @vitest-environment jsdom
 */

import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { stubClipboard, stubClipboardWrites } from '../../../../test/clipboard.js'
import { PreviewData } from './PreviewData.js'

const data = { name: 'Mira', count: 0, addresses: [{ street: '12 Oak Lane' }] }
const json = JSON.stringify(data, null, 2)

async function copyAndRead(
  stub: () => void,
): Promise<{ note: string; editor: HTMLTextAreaElement; unmount: () => void }> {
  const user = userEvent.setup()
  stub()
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
    const missing = await copyAndRead(() => stubClipboard(undefined))
    expect(missing.note).toContain('offers no clipboard')
    expectSelected(missing.editor)
    missing.unmount()

    const refused = await copyAndRead(() => {
      stubClipboardWrites(() => Promise.reject(new Error('denied')))
    })
    expect(refused.note).toContain('refused')
    expectSelected(refused.editor)

    expect(refused.note).not.toBe(missing.note)
  })

  it('copies the JSON and says so', async () => {
    let written: string[] = []
    const { note } = await copyAndRead(() => {
      written = stubClipboardWrites()
    })

    expect(written).toEqual([json])
    expect(note).toBe('Form data copied to the clipboard.')
  })

  it('changes the note when the same copy is refused again, so it is read out again', async () => {
    const user = userEvent.setup()
    const written = stubClipboardWrites(() => Promise.reject(new Error('denied')))
    render(<PreviewData data={data} />)
    await user.click(screen.getByRole('button', { name: 'Form data JSON' }))
    const dialog = screen.getByRole('dialog', { name: 'Form data' })
    const copy = within(dialog).getByRole('button', { name: 'Copy JSON' })
    const status = within(dialog).getByRole('status')

    await user.click(copy)
    await waitFor(() => expect(status.textContent).toContain('refused'))
    const first = status.textContent

    await user.click(copy)
    await waitFor(() => expect(status.textContent).not.toBe(first))
    expect(status.textContent).toContain('refused')
    expect(written).toEqual([json, json])
  })
})
