/**
 * @vitest-environment jsdom
 */

import { act, createEvent, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, describe, expect, it } from 'vitest'
import type { ReactNode } from 'react'
import type { FormDocument, JsonSchema, Kit } from '@willowforms/core'
import type { NodeRendererProps, RendererKit } from '@willowforms/renderer'

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
    // `en-US`, as `createDocument` ships: a dialect-free fixture hides tag and
    // code mix-ups (write-tests skill, Trap 5).
    languages: [{ code: 'en', dialect: 'US', name: 'English', bidi: 'ltr' }],
    defaultLanguage: 'en-US',
    translations: {},
    settings: {},
  }
}

beforeAll(() => {
  /*
   * jsdom implements neither. Typed as optional properties so assigning them is
   * not an unbound method read. Focus trapping and the backdrop cannot be
   * checked here.
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

    expect(within(screen.getByRole('alert')).getByText(/must be an object/)).toBeTruthy()
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
    expect(messages).toHaveLength(6)
    expect(messages.join(' ')).toMatch(/version/)
    expect(messages.join(' ')).toMatch(/root/)
  })

  it('refuses a structurally invalid document, not just a malformed one', async () => {
    const { user, open, editor, latest } = setup()

    await open()
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

  it('takes the errors back with the draft they were about', async () => {
    const { user, open, editor } = setup()

    await open()
    await replaceEditor(user, editor(), '{}')
    await user.click(screen.getByRole('button', { name: 'Apply' }))
    expect(screen.getByRole('alert')).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Revert' }))

    expect(JSON.parse(editor().value)).toMatchObject({ name: 'Contact request' })
    expect(screen.queryByRole('alert')).toBeNull()
  })

  const chooseFile = async (
    user: ReturnType<typeof userEvent.setup>,
    file: File,
  ): Promise<HTMLInputElement> => {
    const input = screen.getByLabelText<HTMLInputElement>('Import file')
    await user.upload(input, file)
    return input
  }

  const asFile = (name: string, text: string): File =>
    new File([text], name, { type: 'application/json' })

  const pendingFile = (
    name: string,
  ): {
    file: File
    promise: Promise<string>
    resolve: (text: string) => void
    reject: (reason: Error) => void
  } => {
    let resolve!: (text: string) => void
    let reject!: (reason: Error) => void
    const promise = new Promise<string>((accept, refuse) => {
      resolve = accept
      reject = refuse
    })
    const file = asFile(name, '')
    Object.defineProperty(file, 'text', { value: () => promise })
    return { file, promise, resolve, reject }
  }

  it('keeps the latest selected file when earlier reads finish later', async () => {
    const { user, open, editor } = setup()
    await open()
    const first = pendingFile('first.json')
    const second = pendingFile('second.json')
    await chooseFile(user, first.file)
    await chooseFile(user, second.file)
    await act(() => {
      second.resolve('{"latest":true}')
      return second.promise
    })
    expect(editor().value).toBe('{"latest":true}')
    await act(() => {
      first.resolve('{"old":true}')
      return first.promise
    })
    expect(editor().value).toBe('{"latest":true}')
    expect(within(screen.getByRole('dialog')).getByRole('status').textContent).toContain(
      'Loaded second.json',
    )
  })

  it.each(['edit', 'revert'])(
    'preserves an explicit %s after a file read starts',
    async (operation) => {
      const { user, open, editor } = setup()
      await open()
      const original = editor().value
      const pending = pendingFile('slow.json')
      await chooseFile(user, pending.file)
      if (operation === 'edit') await replaceEditor(user, editor(), '{"manual":true}')
      else await user.click(screen.getByRole('button', { name: 'Revert' }))
      await act(() => {
        pending.resolve('{"old":true}')
        return pending.promise
      })
      expect(editor().value).toBe(operation === 'edit' ? '{"manual":true}' : original)
      expect(within(screen.getByRole('dialog')).queryByRole('status')).toBeNull()
    },
  )

  it('does not report a stale read failure over a newer successful import', async () => {
    const { user, open, editor } = setup()
    await open()
    const pending = pendingFile('slow.json')
    await chooseFile(user, pending.file)
    await chooseFile(user, asFile('latest.json', '{"latest":true}'))
    await act(() => {
      pending.reject(new Error('unreadable'))
      return pending.promise.catch(() => undefined)
    })
    expect(editor().value).toBe('{"latest":true}')
    expect(within(screen.getByRole('dialog')).queryByRole('alert')).toBeNull()
    expect(within(screen.getByRole('dialog')).getByRole('status').textContent).toContain(
      'Loaded latest.json',
    )
  })

  it('cancels a pending read even when the next selected file exceeds the limit', async () => {
    const { user, open, editor } = setup()
    await open()
    const original = editor().value
    const pending = pendingFile('slow.json')
    await chooseFile(user, pending.file)
    const huge = asFile('huge.json', '{}')
    Object.defineProperty(huge, 'size', { value: 11 * 1024 * 1024 })
    await chooseFile(user, huge)
    await act(() => {
      pending.resolve('{"old":true}')
      return pending.promise
    })
    expect(editor().value).toBe(original)
    expect(within(screen.getByRole('dialog')).getByRole('alert').textContent).toContain('too large')
  })

  it('loads a chosen file into the editor rather than applying it', async () => {
    const { user, open, editor, latest } = setup()
    await open()

    const renamed = { ...JSON.parse(editor().value), name: 'From a file' } as Record<
      string,
      unknown
    >
    await chooseFile(user, asFile('form.json', JSON.stringify(renamed)))

    // In the editor, and not in the document: a bad file has to be visible and
    // fixable rather than replacing the form outright.
    expect(JSON.parse(editor().value)).toMatchObject({ name: 'From a file' })
    expect(latest().name).toBe('Contact request')
    expect(screen.getByText(/Loaded form\.json/)).toBeTruthy()
  })

  it('clears the file input, so the same file can be imported twice', async () => {
    // A file input fires no change event when the same file is chosen again.
    const { user, open, editor } = setup()
    await open()

    const first = { ...JSON.parse(editor().value), name: 'First read' } as Record<string, unknown>
    const input = await chooseFile(user, asFile('form.json', JSON.stringify(first)))
    expect(input.value).toBe('')

    const second = { ...first, name: 'Second read' }
    await chooseFile(user, asFile('form.json', JSON.stringify(second)))

    expect(JSON.parse(editor().value)).toMatchObject({ name: 'Second read' })
  })

  it('refuses a file too large to be a form document', async () => {
    const { user, open, editor } = setup()
    await open()

    const huge = asFile('form.json', '{}')
    Object.defineProperty(huge, 'size', { value: 11 * 1024 * 1024 })
    Object.defineProperty(huge, 'text', {
      value: () => {
        throw new Error('the file was read after all')
      },
    })

    const before = editor().value
    await chooseFile(user, huge)

    expect(within(await screen.findByRole('alert')).getByText(/too large/)).toBeTruthy()
    expect(editor().value).toBe(before)
  })

  it('still takes a file of an ordinary size', async () => {
    // The control: a cap that refused everything would pass the test above.
    const { user, open, editor } = setup()
    await open()

    const named = { ...JSON.parse(editor().value), name: 'Small enough' } as Record<string, unknown>
    await chooseFile(user, asFile('form.json', JSON.stringify(named)))

    expect(JSON.parse(editor().value)).toMatchObject({ name: 'Small enough' })
  })

  it('says so when the file cannot be read', async () => {
    const { user, open, editor } = setup()
    await open()

    const unreadable = asFile('form.json', '{}')
    // A file whose bytes are gone: the picker holds a handle, and the file can
    // be moved or a permission withdrawn between choosing it and reading it.
    Object.defineProperty(unreadable, 'text', {
      value: () => Promise.reject(new Error('gone')),
    })

    const before = editor().value
    await chooseFile(user, unreadable)

    expect(within(await screen.findByRole('alert')).getByText(/could not be read/)).toBeTruthy()
    expect(editor().value, 'a failed read replaced the draft').toBe(before)
  })

  it('starts from the document again after a cancelled edit', async () => {
    const { user, open, editor } = setup()

    await open()
    await replaceEditor(user, editor(), '{"abandoned": true}')
    await user.click(screen.getByRole('button', { name: 'Close' }))

    await open()

    expect(JSON.parse(editor().value)).toMatchObject({ name: 'Contact request' })
  })

  it('exposes its views as a real tablist', async () => {
    const { open } = setup()
    await open()

    const tablist = screen.getByRole('tablist', { name: 'JSON view' })
    const tabs = within(tablist).getAllByRole('tab')
    expect(tabs.map((tab) => tab.textContent)).toEqual(['Document', 'JSON Schema'])

    const selected = tabs.find((tab) => tab.getAttribute('aria-selected') === 'true')
    expect(selected?.textContent).toBe('Document')

    const panel = document.querySelector('dialog [role="tabpanel"]')
    expect(panel?.getAttribute('aria-labelledby')).toBe(selected?.id)
    expect(selected?.getAttribute('aria-controls')).toBe(panel?.id)
  })

  it('puts one tab in the tab order and moves between them with the arrows', async () => {
    // With a roving tabindex and no arrow keys, unselected tabs are unreachable.
    const { user, open } = setup()
    await open()

    const tablist = screen.getByRole('tablist', { name: 'JSON view' })
    const tabs = within(tablist).getAllByRole('tab')
    expect(tabs.map((tab) => tab.getAttribute('tabindex'))).toEqual(['0', '-1'])

    tabs[0]?.focus()
    await user.keyboard('{ArrowRight}')
    expect(document.activeElement?.textContent).toBe('JSON Schema')
    await user.keyboard('{ArrowLeft}')
    expect(document.activeElement?.textContent).toBe('Document')
  })

  it('shows a JSON Schema projection of the form', async () => {
    const { user, open } = setup()

    await open()
    await user.click(screen.getByRole('tab', { name: 'JSON Schema' }))

    const schema = JSON.parse(
      // The textarea, not the tabpanel: its tab also names the panel "JSON Schema".
      screen.getByRole<HTMLTextAreaElement>('textbox', { name: 'JSON Schema' }).value,
    ) as JsonSchema
    expect(schema.type).toBe('object')
    expect(schema.properties['email']).toMatchObject({ type: 'string', title: 'Email' })
    expect(schema.required).toEqual(['email'])
  })

  it('does not let the schema view be edited', async () => {
    const { user, open } = setup()

    await open()
    await user.click(screen.getByRole('tab', { name: 'JSON Schema' }))

    expect(screen.getByRole<HTMLTextAreaElement>('textbox', { name: 'JSON Schema' }).readOnly).toBe(
      true,
    )
  })

  // A clipboard for one test, restored so later tests do not inherit it.
  const clipboard = (
    writeText: (text: string) => Promise<void>,
  ): { calls: string[]; restore: () => void } => {
    const calls: string[] = []
    const before = Object.getOwnPropertyDescriptor(navigator, 'clipboard')

    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: (text: string) => {
          calls.push(text)
          return writeText(text)
        },
      },
    })

    return {
      calls,
      restore: () => {
        if (before) Object.defineProperty(navigator, 'clipboard', before)
        else delete (navigator as { clipboard?: unknown }).clipboard
      },
    }
  }

  it('says so when the clipboard is refused instead of appearing to work', async () => {
    const { user, open } = setup()
    const denied = clipboard(() => Promise.reject(new Error('denied')))

    try {
      await open()
      await user.click(screen.getByRole('button', { name: 'Copy' }))

      // Scoped to the dialog: the designer shell also has a live region with
      // role="status", which is a different thing entirely.
      const dialog = document.querySelector('dialog')
      if (!dialog) throw new Error('no dialog')
      expect(await within(dialog).findByRole('status')).toHaveProperty(
        'textContent',
        expect.stringContaining('refused clipboard access'),
      )
    } finally {
      denied.restore()
    }
  })

  it('copies the draft and says it did', async () => {
    const { user, open, editor } = setup()
    const allowed = clipboard(() => Promise.resolve())

    try {
      await open()
      const text = editor().value
      await user.click(screen.getByRole('button', { name: 'Copy' }))

      expect(allowed.calls).toEqual([text])

      const dialog = document.querySelector('dialog')
      if (!dialog) throw new Error('no dialog')
      expect(await within(dialog).findByRole('status')).toHaveProperty(
        'textContent',
        expect.stringContaining('copied to the clipboard'),
      )
    } finally {
      allowed.restore()
    }
  })

  it('says so when the browser offers no clipboard at all', async () => {
    // `navigator.clipboard` is undefined on an insecure origin, such as plain HTTP.
    const { user, open } = setup()
    const before = Object.getOwnPropertyDescriptor(navigator, 'clipboard')
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined })

    try {
      await open()
      await user.click(screen.getByRole('button', { name: 'Copy' }))

      const dialog = document.querySelector('dialog')
      if (!dialog) throw new Error('no dialog')
      expect(await within(dialog).findByRole('status')).toHaveProperty(
        'textContent',
        expect.stringContaining('offers no clipboard'),
      )
    } finally {
      if (before) Object.defineProperty(navigator, 'clipboard', before)
      else delete (navigator as { clipboard?: unknown }).clipboard
    }
  })
})

/**
 * The shell's shortcuts, while the dialog is open.
 *
 * `showModal()` makes the background inert to *pointers*. It does nothing about
 * keys, and the shell binds Delete, Backspace, Escape and Ctrl+Z to `window`
 * with a guard that excludes only text fields. So Backspace on the dialog's own
 * Apply button deleted the component selected behind it, while the textarea in
 * front of you still showed the JSON from before the deletion.
 *
 * The guard is containment: an event from inside an open dialog is that
 * dialog's. It is also what lets Escape reach the native close watcher, which
 * the shell was cancelling with an unconditional `preventDefault` whenever
 * anything was selected — so the dialog took two presses to close.
 */
describe('shell shortcuts while the dialog is open', () => {
  function treeRow(key: string): HTMLElement {
    const row = globalThis.document.querySelector<HTMLElement>('[data-fs-tree-row="' + key + '"]')
    if (!row) throw new Error('no tree row for ' + key)
    return row
  }

  async function selectedThenOpen(harness: Harness): Promise<void> {
    fireEvent.click(screen.getByRole('tab', { name: 'Tree' }))
    await harness.user.click(treeRow('email'))
    await harness.open()
  }

  it('does not delete the component behind it on Backspace', async () => {
    const harness = setup()
    await selectedThenOpen(harness)

    const apply = screen.getByRole('button', { name: 'Apply' })
    apply.focus()
    fireEvent.keyDown(apply, { key: 'Backspace' })

    expect(harness.latest().root.children?.map((c) => c.key)).toContain('email')
  })

  it('does not delete it on Delete either', async () => {
    const harness = setup()
    await selectedThenOpen(harness)

    const apply = screen.getByRole('button', { name: 'Apply' })
    apply.focus()
    fireEvent.keyDown(apply, { key: 'Delete' })

    expect(harness.latest().root.children?.map((c) => c.key)).toContain('email')
  })

  it('leaves Escape to the dialog rather than cancelling it', async () => {
    // `preventDefault` would cancel the native `<dialog>` close. jsdom has no
    // close watcher, so this checks only that the shell leaves Escape alone.
    const harness = setup()
    await selectedThenOpen(harness)

    const apply = screen.getByRole('button', { name: 'Apply' })
    apply.focus()
    const event = createEvent.keyDown(apply, { key: 'Escape' })
    fireEvent(apply, event)

    expect(event.defaultPrevented).toBe(false)
  })

  it('still claims the shortcut when the dialog is closed', async () => {
    // The control. Ignoring these keys everywhere would pass all three tests
    // above and silently remove the shell's own shortcuts.
    const harness = setup()
    fireEvent.click(screen.getByRole('tab', { name: 'Tree' }))
    await harness.user.click(treeRow('email'))

    // Dispatched on the shell, where the shortcuts are bound, not on `window`.
    const shell = globalThis.document.querySelector('.fs-shell')
    if (!shell) throw new Error('no shell')
    fireEvent.keyDown(shell, { key: 'Delete' })

    expect(harness.latest().root.children?.map((c) => c.key)).not.toContain('email')
  })
})

// No axe rule requires arrow keys on tabs, so only these tests catch their loss.
describe('the dialog view tabs', () => {
  async function openTabs(): Promise<Harness> {
    const harness = setup()
    await harness.open()
    return harness
  }

  it('moves between views with the arrow keys', async () => {
    const harness = await openTabs()

    const document_ = screen.getByRole('tab', { name: 'Document' })
    document_.focus()
    fireEvent.keyDown(document_, { key: 'ArrowRight' })

    expect(screen.getByRole('tab', { name: 'JSON Schema' })).toHaveProperty('ariaSelected', 'true')
    expect(harness.latest().name).toBe('Contact request')
  })

  it('wraps around, and Home and End reach the ends', async () => {
    await openTabs()

    const document_ = screen.getByRole('tab', { name: 'Document' })
    document_.focus()
    fireEvent.keyDown(document_, { key: 'End' })
    expect(screen.getByRole('tab', { name: 'JSON Schema' })).toHaveProperty('ariaSelected', 'true')

    fireEvent.keyDown(screen.getByRole('tab', { name: 'JSON Schema' }), { key: 'Home' })
    expect(screen.getByRole('tab', { name: 'Document' })).toHaveProperty('ariaSelected', 'true')
  })

  it('gives the selected tab a panel that exists', async () => {
    await openTabs()

    // Scoped to the dialog: the left pane has tabs of its own.
    const dialog = within(screen.getByRole('dialog'))
    const selected = dialog.getByRole('tab', { selected: true })
    const panelId = selected.getAttribute('aria-controls')

    expect(panelId, 'the selected tab controls nothing').toBeTruthy()
    // An unresolved IDREF is not an axe violation, so it is checked here.
    expect(globalThis.document.getElementById(panelId ?? '')).toBeTruthy()
    expect(dialog.getByRole('tabpanel')).toBeTruthy()
  })

  it('still closes', async () => {
    // The control: the close button lives beside the strip and has to survive
    // the strip being replaced.
    const harness = await openTabs()
    await harness.user.click(screen.getByRole('button', { name: 'Close' }))

    expect(screen.queryByLabelText('Form document JSON')).toBeNull()
  })
})
