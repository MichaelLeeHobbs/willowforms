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

import { createEvent, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, describe, expect, it } from 'vitest'
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
    // `en-US`, which is what `createDocument` produces. A dialect-free
    // fixture makes a bundle keyed by tag and one keyed by bare code the
    // same string, which is Trap 5 in the write-tests skill and the shape
    // that made the language filter green here and broken for real
    // documents.
    languages: [{ code: 'en', dialect: 'US', name: 'English', bidi: 'ltr' }],
    defaultLanguage: 'en-US',
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

  it('takes the errors back with the draft they were about', async () => {
    /*
     * The test above reverts a draft that was never applied, so there was
     * nothing on screen for Revert to leave behind. Apply first and there is:
     * `setDraft(documentJson)` put the stored document in the editor and left
     * the `role="alert"` list naming problems with a draft that is no longer
     * there -- complaints about a document the box no longer holds, and no way
     * to clear them short of closing the dialog. `onFile` had always cleared
     * both, which is what made this one look deliberate.
     */
    const { user, open, editor } = setup()

    await open()
    await replaceEditor(user, editor(), '{}')
    await user.click(screen.getByRole('button', { name: 'Apply' }))
    expect(screen.getByRole('alert')).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Revert' }))

    expect(JSON.parse(editor().value)).toMatchObject({ name: 'Contact request' })
    expect(screen.queryByRole('alert')).toBeNull()
  })

  /**
   * Importing a file, which is the half of "import and export" nothing drove.
   *
   * Every other test in this file reaches the editor by typing into it. The
   * file input has its own path -- read the text, load it rather than apply it,
   * say what happened -- plus a failure branch and a reset whose comment records
   * a bug that had already been fixed once.
   */
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
    /*
     * A file input fires nothing when the chosen file has not changed, so
     * re-importing after editing it on disk did nothing at all -- no note, no
     * error, a button that had stopped working. The reset that fixed it had no
     * test, which is what this is.
     */
    const { user, open, editor } = setup()
    await open()

    const first = { ...JSON.parse(editor().value), name: 'First read' } as Record<string, unknown>
    const input = await chooseFile(user, asFile('form.json', JSON.stringify(first)))
    expect(input.value).toBe('')

    // The same file name again, with different content, which is what editing
    // it on disk looks like from here.
    const second = { ...first, name: 'Second read' }
    await chooseFile(user, asFile('form.json', JSON.stringify(second)))

    expect(JSON.parse(editor().value)).toMatchObject({ name: 'Second read' })
  })

  it('refuses a file too large to be a form document', async () => {
    /*
     * `accept="application/json,.json"` is a picker filter, not a constraint:
     * anything can be chosen, and `file.text()` on a very large file decodes
     * the whole thing into a string and then puts it in a textarea. A form
     * document is kilobytes.
     */
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
    /*
     * This was a hand-rolled strip -- a roving `tabIndex` with no arrow keys, no
     * `aria-controls` and no tabpanel -- so the JSON Schema view could not be
     * reached from the keyboard at all, and nothing in this file ever asked. It
     * uses the shared `Tabs` now, and this is the check that says so: the same
     * pattern `Rules.test.tsx` pins for the inspector, applied to the other
     * tablist in the product.
     */
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
    /*
     * A roving tabindex is only half a tab pattern: without arrow keys the tabs
     * that are not selected are unreachable by any means at all, which is the
     * exact state this dialog shipped in.
     */
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
      // The textarea, not the tabpanel: the panel is labelled by its own tab, so
      // "JSON Schema" now names two elements. Trap 4, arriving the moment the
      // dialog gained the tabpanel it was missing.
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

  /**
   * A clipboard for one test, put back afterwards.
   *
   * `Object.defineProperty(navigator, 'clipboard', ...)` with no restore is a
   * change to the environment every later test in the file inherits. It was
   * harmless only because nothing after it clicked Copy -- and the day
   * something does, it reads as a product bug in whatever test happens to run
   * next. There are three Copy tests now, each needing a different clipboard.
   */
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
    // The other branch, which nothing drove: a Copy that works has to say so,
    // or a user cannot tell it from a Copy that silently did nothing.
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
    /*
     * Any page not on a secure origin, which includes a plain-HTTP host and
     * some embedded webviews. The optional chain that used to be here made the
     * button do nothing at all in that case, which is the one outcome the
     * comment beside it ruled out.
     */
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
  /** The tree row for a node, which is what selects it. */
  function treeRow(key: string): HTMLElement {
    const row = globalThis.document.querySelector<HTMLElement>('[data-fs-tree-row="' + key + '"]')
    if (!row) throw new Error('no tree row for ' + key)
    return row
  }

  /** Select a component, then open the dialog over it. */
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
    /*
     * The shell called `preventDefault()` on Escape whenever anything was
     * selected, which cancels the native `<dialog>` close request — so the first
     * press did nothing visible and the second closed it. jsdom has no close
     * watcher, so what is checked here is the half that is checkable: the shell
     * does not claim the event.
     */
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

    /*
     * Dispatched on the shell, because that is where the shortcuts live now.
     * They used to be on `window`, which meant the designer claimed Delete,
     * Backspace, Escape and Ctrl+Z for the whole host page.
     */
    const shell = globalThis.document.querySelector('.fs-shell')
    if (!shell) throw new Error('no shell')
    fireEvent.keyDown(shell, { key: 'Delete' })

    expect(harness.latest().root.children?.map((c) => c.key)).not.toContain('email')
  })
})

/**
 * The dialog's two views are tabs, and tabs have a keyboard.
 *
 * This dialog hand-rolled its own tablist: a roving `tabIndex` with no arrow
 * handler, no `aria-controls`, and no `tabpanel` anywhere. A roving tabindex
 * means exactly one tab is in the tab order, so with no arrow keys the JSON
 * Schema view could not be reached from the keyboard at all.
 *
 * `Tabs.tsx` already implements this, and its own comment says two copies was
 * the mistake it was avoiding. Axe passes either way — no rule requires arrow
 * keys — which is why a passing accessibility suite said nothing about it.
 */
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

    /*
     * Scoped to the dialog. The left pane has tabs of its own, so an unscoped
     * `getByRole('tab')` matches both and the query that was meant to check one
     * thing silently measures another — Trap 4, and the reason the same query
     * became ambiguous the moment the left pane grew tabs.
     */
    const dialog = within(screen.getByRole('dialog'))
    const selected = dialog.getByRole('tab', { selected: true })
    const panelId = selected.getAttribute('aria-controls')

    expect(panelId, 'the selected tab controls nothing').toBeTruthy()
    // An unresolved IDREF is not an axe violation, which is how the inspector
    // shipped two of them for months.
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
