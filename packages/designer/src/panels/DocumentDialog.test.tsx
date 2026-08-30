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

  it('says so when the clipboard is refused instead of appearing to work', async () => {
    const { user, open } = setup()
    const writeText = vi.fn().mockRejectedValue(new Error('denied'))
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })

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
