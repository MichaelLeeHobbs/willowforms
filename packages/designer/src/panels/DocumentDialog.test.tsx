/**
 * @vitest-environment jsdom
 */

/**
 * The JSON dialog.
 *
 * The interesting cases are the ones where a user hands the designer something
 * broken. Pasted JSON is untrusted input, and replacing the document with
 * something malformed would take the whole builder down, so every refusal below
 * is a real guard rather than a formality.
 */

import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import type { FormDocument, JsonSchema, Kit } from '@formsmith/core'
import type { NodeRendererProps, RendererKit } from '@formsmith/renderer'

import { Designer } from '../Designer.js'

function Screen_({ nodeProps, children }: NodeRendererProps): ReactNode {
  return <div {...nodeProps}>{children}</div>
}
function Field({ nodeProps }: NodeRendererProps): ReactNode {
  return <div {...nodeProps} />
}

const rendererKit: RendererKit = { id: 'fake', renderers: { Screen: Screen_, Field } }

const kit: Kit = {
  id: 'fake',
  label: 'Fake',
  components: [
    {
      type: 'Field',
      label: 'Field',
      group: 'inputs',
      dataBound: true,
      dataType: 'string',
      defaultProps: {},
      props: [{ name: 'label', label: 'Label', editor: 'string' }],
      events: [],
    },
  ],
}

function makeDocument(): FormDocument {
  return {
    version: '1',
    id: 'doc',
    name: 'Contact request',
    root: {
      key: 'root',
      type: 'Screen',
      props: {},
      children: [
        {
          key: 'email',
          type: 'Field',
          props: { label: { kind: 'static', value: 'Email' } },
          schema: { type: 'string', validations: [{ key: 'required' }] },
        },
      ],
    },
    actions: {},
    languages: [{ code: 'en', name: 'English', bidi: 'ltr' }],
    defaultLanguage: 'en',
    translations: {},
    settings: {},
  }
}

beforeAll(() => {
  /*
   * jsdom implements neither of these, and the dialog needs both. Typed as
   * optional properties rather than methods so assigning them is not an unbound
   * method read. This is a jsdom gap, not a behaviour under test: focus trapping
   * and the backdrop are the browser's job and cannot be checked here.
   */
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

interface Harness {
  user: ReturnType<typeof userEvent.setup>
  latest: () => FormDocument
  open: () => Promise<void>
  editor: () => HTMLTextAreaElement
}

function setup(): Harness {
  const user = userEvent.setup()
  let current = makeDocument()
  render(
    <Designer
      initialDocument={current}
      kit={kit}
      rendererKit={rendererKit}
      onChange={(doc) => {
        current = doc
      }}
    />,
  )

  return {
    user,
    latest: () => current,
    open: async () => {
      await user.click(screen.getByRole('button', { name: 'JSON' }))
    },
    editor: () => screen.getByLabelText<HTMLTextAreaElement>('Form document JSON'),
  }
}

/** Replace the whole editor contents without typing thousands of characters. */
async function replaceEditor(
  user: ReturnType<typeof userEvent.setup>,
  editor: HTMLTextAreaElement,
  text: string,
): Promise<void> {
  await user.clear(editor)
  await user.click(editor)
  await user.paste(text)
}

describe('the JSON dialog', () => {
  it('stays shut until asked for', () => {
    setup()
    expect(screen.queryByLabelText('Form document JSON')).toBeNull()
  })

  it('opens showing the current document', async () => {
    const { open, editor } = setup()

    await open()

    expect(JSON.parse(editor().value)).toMatchObject({ id: 'doc', name: 'Contact request' })
  })

  it('applies an edited document', async () => {
    const { user, open, editor, latest } = setup()

    await open()
    const edited = { ...makeDocument(), name: 'Renamed form' }
    await replaceEditor(user, editor(), JSON.stringify(edited))
    await user.click(screen.getByRole('button', { name: 'Apply' }))

    expect(latest().name).toBe('Renamed form')
    // Applying closes, so the editor is gone.
    expect(screen.queryByLabelText('Form document JSON')).toBeNull()
  })

  it('refuses malformed JSON and keeps the document', async () => {
    const { user, open, editor, latest } = setup()

    await open()
    await replaceEditor(user, editor(), '{ not json')
    await user.click(screen.getByRole('button', { name: 'Apply' }))

    expect(screen.getByRole('alert')).toBeTruthy()
    expect(latest().name).toBe('Contact request')
  })

  it('refuses JSON that is not a document', async () => {
    const { user, open, editor, latest } = setup()

    await open()
    await replaceEditor(user, editor(), '[1, 2, 3]')
    await user.click(screen.getByRole('button', { name: 'Apply' }))

    expect(within(screen.getByRole('alert')).getByText(/must be a JSON object/)).toBeTruthy()
    expect(latest().name).toBe('Contact request')
  })

  it('names every missing field rather than only the first', async () => {
    const { user, open, editor } = setup()

    await open()
    await replaceEditor(user, editor(), '{}')
    await user.click(screen.getByRole('button', { name: 'Apply' }))

    const messages = within(screen.getByRole('alert'))
      .getAllByRole('listitem')
      .map((li) => li.textContent)
    expect(messages).toHaveLength(4)
    expect(messages.join(' ')).toMatch(/version/)
    expect(messages.join(' ')).toMatch(/root/)
  })

  it('refuses a structurally invalid document, not just a malformed one', async () => {
    const { user, open, editor, latest } = setup()

    await open()
    // Well-formed and correctly shaped, but two components share a key.
    const clashing = makeDocument()
    clashing.root.children = [
      { key: 'same', type: 'Field', props: {} },
      { key: 'same', type: 'Field', props: {} },
    ]
    await replaceEditor(user, editor(), JSON.stringify(clashing))
    await user.click(screen.getByRole('button', { name: 'Apply' }))

    expect(within(screen.getByRole('alert')).getByText(/Duplicate key: same/)).toBeTruthy()
    expect(latest().root.children).toHaveLength(1)
  })

  it('reverts the draft without touching the document', async () => {
    const { user, open, editor, latest } = setup()

    await open()
    await replaceEditor(user, editor(), '{"nonsense": true}')
    await user.click(screen.getByRole('button', { name: 'Revert' }))

    expect(JSON.parse(editor().value)).toMatchObject({ name: 'Contact request' })
    expect(latest().name).toBe('Contact request')
  })

  it('starts from the document again after a cancelled edit', async () => {
    const { user, open, editor } = setup()

    await open()
    await replaceEditor(user, editor(), '{"abandoned": true}')
    await user.click(screen.getByRole('button', { name: 'Close' }))

    await open()

    expect(JSON.parse(editor().value)).toMatchObject({ name: 'Contact request' })
  })

  it('shows a JSON Schema projection of the form', async () => {
    const { user, open } = setup()

    await open()
    await user.click(screen.getByRole('tab', { name: 'JSON Schema' }))

    const schema = JSON.parse(
      screen.getByLabelText<HTMLTextAreaElement>('JSON Schema').value,
    ) as JsonSchema
    expect(schema.type).toBe('object')
    expect(schema.properties['email']).toMatchObject({ type: 'string', title: 'Email' })
    expect(schema.required).toEqual(['email'])
  })

  it('does not let the schema view be edited', async () => {
    const { user, open } = setup()

    await open()
    await user.click(screen.getByRole('tab', { name: 'JSON Schema' }))

    expect(screen.getByLabelText<HTMLTextAreaElement>('JSON Schema').readOnly).toBe(true)
  })

  it('says so when the clipboard is refused instead of appearing to work', async () => {
    const { user, open } = setup()
    const writeText = vi.fn().mockRejectedValue(new Error('denied'))
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })

    await open()
    await user.click(screen.getByRole('button', { name: 'Copy' }))

    expect(await screen.findByRole('status')).toHaveProperty(
      'textContent',
      expect.stringContaining('refused clipboard access'),
    )
  })
})
