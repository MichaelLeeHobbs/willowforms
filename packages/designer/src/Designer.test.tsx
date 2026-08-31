/**
 * @vitest-environment jsdom
 */

/**
 * Toolbar controls that are view state rather than document state.
 *
 * Theme, canvas language and viewport all change what the author sees and none
 * of them changes the form. Two people editing one document must not disagree
 * about what it is because one of them last looked at it in dark mode on a
 * phone, so the test that matters most here is that the document does not move.
 */

import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import type { ComponentNode, FormDocument, Kit, Language } from '@formsmith/core'
import type { NodeRendererProps, RendererKit } from '@formsmith/renderer'

import { Designer } from './Designer.js'

function Screen_({ nodeProps, children }: NodeRendererProps): ReactNode {
  return <div {...nodeProps}>{children}</div>
}
function Field({ nodeProps, props }: NodeRendererProps): ReactNode {
  return <div {...nodeProps}>{typeof props['label'] === 'string' ? props['label'] : ''}</div>
}

const rendererKit: RendererKit = { id: 'fake', renderers: { Screen: Screen_, Field } }

const kit: Kit = {
  id: 'fake',
  label: 'Fake',
  components: [
    {
      type: 'Screen',
      label: 'Screen',
      icon: 'screen',
      group: 'layout',
      container: true,
      root: true,
      defaultProps: {},
      props: [],
      events: [],
    },
    {
      type: 'Field',
      label: 'Field',
      icon: 'text',
      group: 'inputs',
      dataBound: true,
      dataType: 'string',
      defaultProps: {},
      props: [{ name: 'label', label: 'Label', editor: 'string', localizable: true }],
      events: ['onChange'],
    },
  ],
}

const ENGLISH: Language = { code: 'en', dialect: 'US', name: 'English', bidi: 'ltr' }
const FRENCH: Language = { code: 'fr', name: 'French', bidi: 'ltr' }

function documentOf(languages: Language[]): FormDocument {
  const field: ComponentNode = {
    key: 'email',
    type: 'Field',
    props: { label: { kind: 'i18n', key: 'email_label' } },
  }
  return {
    version: '1',
    id: 'doc',
    name: 'Contact',
    root: { key: 'root', type: 'Screen', props: {}, children: [field] },
    actions: {},
    languages,
    defaultLanguage: 'en-US',
    translations: {
      'en-US': { email_label: 'Email' },
      fr: { email_label: 'Courriel' },
    },
    settings: {},
  }
}

interface Harness {
  user: ReturnType<typeof userEvent.setup>
  shell: HTMLElement
  latest: () => FormDocument
}

function setup(
  languages: Language[] = [ENGLISH, FRENCH],
  onSave?: (document: FormDocument) => void,
): Harness {
  const user = userEvent.setup()
  let current = documentOf(languages)
  const view = render(
    <Designer
      initialDocument={current}
      kit={kit}
      rendererKit={rendererKit}
      onChange={(doc) => {
        current = doc
      }}
      {...(onSave ? { onSave } : {})}
    />,
  )
  const shell = view.container.querySelector<HTMLElement>('.fs-shell')
  if (!shell) throw new Error('no shell')
  return { user, shell, latest: () => current }
}

describe('the theme control', () => {
  it('sets no attribute at all for the system theme', () => {
    // Absence is how the stylesheet answers prefers-color-scheme. An explicit
    // "system" value would override the media query with nothing.
    const { shell } = setup()
    expect(shell.hasAttribute('data-fs-theme')).toBe(false)
  })

  it('forces light and dark', async () => {
    const { user, shell } = setup()
    const select = screen.getByLabelText('Designer theme')

    await user.selectOptions(select, 'dark')
    expect(shell.getAttribute('data-fs-theme')).toBe('dark')

    await user.selectOptions(select, 'light')
    expect(shell.getAttribute('data-fs-theme')).toBe('light')

    await user.selectOptions(select, 'system')
    expect(shell.hasAttribute('data-fs-theme')).toBe(false)
  })

  it('does not touch the document', async () => {
    const { user, latest } = setup()
    const before = JSON.stringify(latest())

    await user.selectOptions(screen.getByLabelText('Designer theme'), 'dark')

    expect(JSON.stringify(latest())).toBe(before)
  })
})

describe('the canvas language control', () => {
  it('is absent when the document has only one language', () => {
    // A picker with one entry is furniture.
    setup([ENGLISH])
    expect(screen.queryByLabelText('Canvas language')).toBeNull()
  })

  it('renders the canvas in the chosen language', async () => {
    const { user } = setup()
    expect(screen.getByText('Email')).toBeTruthy()

    await user.selectOptions(screen.getByLabelText('Canvas language'), 'fr')

    expect(screen.getByText('Courriel')).toBeTruthy()
    expect(screen.queryByText('Email')).toBeNull()
  })

  it('goes back to the document default', async () => {
    const { user } = setup()
    const select = screen.getByLabelText('Canvas language')

    await user.selectOptions(select, 'fr')
    await user.selectOptions(select, '')

    expect(screen.getByText('Email')).toBeTruthy()
  })

  it('does not touch the document', async () => {
    const { user, latest } = setup()
    const before = JSON.stringify(latest())

    await user.selectOptions(screen.getByLabelText('Canvas language'), 'fr')

    expect(JSON.stringify(latest())).toBe(before)
  })

  it('falls back when the language it is showing is removed', async () => {
    /*
     * Derived during render rather than corrected in an effect, so there is no
     * frame where the canvas points at a language the document no longer has
     * and renders every translation as its raw key.
     */
    const { user } = setup()
    await user.selectOptions(screen.getByLabelText('Canvas language'), 'fr')
    expect(screen.getByText('Courriel')).toBeTruthy()

    await user.click(screen.getByRole('tab', { name: 'Settings' }))
    await user.click(screen.getByRole('button', { name: 'Remove French' }))

    expect(screen.getByText('Email')).toBeTruthy()
    expect(screen.queryByText('Courriel')).toBeNull()
    expect(screen.queryByText('email_label')).toBeNull()
  })
})

describe('the Save button', () => {
  it('is absent when the host passes no onSave', () => {
    // Formsmith does not persist. A Save button it cannot honour is worse
    // than no button at all.
    setup()
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull()
  })

  it('hands the host the current document', async () => {
    const onSave = vi.fn<(document: FormDocument) => void>()
    const { user, shell } = setup([ENGLISH, FRENCH], onSave)

    /*
     * With an edit in between, because the call count was the whole assertion:
     * a Save that handed over the document the designer booted with -- the
     * failure this button has exactly one way to get wrong -- passed it.
     */
    await user.click(screen.getByRole('tab', { name: 'Tree' }))
    const row = shell.querySelector<HTMLElement>('[data-fs-tree-row="email"]')
    if (!row) throw new Error('no tree row')
    await user.click(row)
    fireEvent.keyDown(shell, { key: 'Delete' })

    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(onSave).toHaveBeenCalledTimes(1)
    const saved = onSave.mock.calls[0]?.[0]
    expect(
      saved?.root.children?.map((child) => child.key),
      'Save handed over a stale document',
    ).toEqual([])
  })
})

/**
 * The undo shortcuts, which no test in any suite had ever pressed.
 *
 * The buttons are covered and the keys are not, and they are not the same code
 * path: the handler reads `ctrlKey || metaKey`, lowercases the key, and routes
 * shift to redo. Every one of those is a place to be wrong, and being wrong
 * there costs an author the edit they just made.
 */
describe('the undo and redo shortcuts', () => {
  /** Delete the one component, so the document has a visible before and after. */
  async function withAnEdit(): Promise<Harness> {
    const harness = setup()
    await harness.user.click(screen.getByRole('tab', { name: 'Tree' }))
    const row = harness.shell.querySelector<HTMLElement>('[data-fs-tree-row="email"]')
    if (!row) throw new Error('no tree row')
    await harness.user.click(row)
    fireEvent.keyDown(harness.shell, { key: 'Delete' })

    expect(harness.latest().root.children).toEqual([])
    return harness
  }

  const keys = (): string[] => {
    const children = screen.queryAllByText('Email')
    return children.map((element) => element.textContent ?? '')
  }

  it('takes an edit back on Ctrl+Z and puts it back on Ctrl+Y', async () => {
    const { shell, latest } = await withAnEdit()

    fireEvent.keyDown(shell, { key: 'z', ctrlKey: true })
    expect(latest().root.children?.map((child) => child.key)).toEqual(['email'])
    // And the canvas says so too, not only the document the host was handed.
    expect(keys()).toHaveLength(1)

    fireEvent.keyDown(shell, { key: 'y', ctrlKey: true })
    expect(latest().root.children).toEqual([])
  })

  it('redoes on Ctrl+Shift+Z as well', async () => {
    const { shell, latest } = await withAnEdit()

    fireEvent.keyDown(shell, { key: 'z', ctrlKey: true })
    expect(latest().root.children?.map((child) => child.key)).toEqual(['email'])

    fireEvent.keyDown(shell, { key: 'Z', ctrlKey: true, shiftKey: true })
    expect(latest().root.children).toEqual([])
  })

  it('answers to the meta key, for the half of the world on a Mac', async () => {
    const { shell, latest } = await withAnEdit()

    fireEvent.keyDown(shell, { key: 'z', metaKey: true })
    expect(latest().root.children?.map((child) => child.key)).toEqual(['email'])
  })

  it('leaves the shortcut alone while a text field has focus', async () => {
    /*
     * The guard that makes the rest safe. Ctrl+Z in a property box is the
     * browser's own undo for the text being typed, and stealing it would undo
     * the last structural edit instead of the last few characters.
     */
    const { user, latest } = await withAnEdit()

    await user.click(screen.getByRole('tab', { name: 'Settings' }))
    const name = screen.getByLabelText('Form name')
    await user.click(name)
    fireEvent.keyDown(name, { key: 'z', ctrlKey: true })

    expect(latest().root.children, 'the designer took the field own undo').toEqual([])
  })
})

describe('collapsing a pane', () => {
  const handle = (side: 'left' | 'right'): HTMLElement =>
    screen.getByRole('button', {
      name: new RegExp(side === 'left' ? 'Components and structure' : 'Component properties'),
    })

  it('shows both panes to begin with', () => {
    setup()
    expect(handle('left').getAttribute('aria-expanded')).toBe('true')
    expect(handle('right').getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByLabelText('Components and structure').hidden).toBe(false)
  })

  it('hides a pane and says so', async () => {
    const { user } = setup()
    await user.click(handle('left'))

    expect(handle('left').getAttribute('aria-expanded')).toBe('false')
    expect(screen.getByLabelText('Components and structure').hidden).toBe(true)
  })

  it('leaves the grip reachable once the pane is gone', async () => {
    // The grip sits outside the pane it controls. Inside it, collapsing would
    // be a one-way door.
    const { user } = setup()
    await user.click(handle('left'))

    expect(handle('left').hidden).toBe(false)
    await user.click(handle('left'))
    expect(screen.getByLabelText('Components and structure').hidden).toBe(false)
  })

  it('collapses each pane independently', async () => {
    const { user } = setup()
    await user.click(handle('right'))

    expect(handle('right').getAttribute('aria-expanded')).toBe('false')
    expect(handle('left').getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByLabelText('Components and structure').hidden).toBe(false)
  })

  it('does not touch the document', async () => {
    const { user, latest } = setup()
    const before = JSON.stringify(latest())

    await user.click(handle('left'))
    await user.click(handle('right'))

    expect(JSON.stringify(latest())).toBe(before)
  })

  it('names the pane it controls, in both states', async () => {
    /*
     * aria-expanded without aria-controls tells a screen reader that something
     * is expanded and not what. The pane is `hidden` rather than unmounted, so
     * the reference resolves either way; an unresolved one would be invisible
     * to axe, which is how the inspector's tabs shipped two of them.
     */
    const { user, shell } = setup()

    for (const side of ['left', 'right'] as const) {
      const controls = handle(side).getAttribute('aria-controls')
      expect(controls, side + ' grip names no pane').toBeTruthy()
      expect(shell.querySelector('[id="' + controls + '"]')).not.toBeNull()
    }

    await user.click(handle('left'))
    const controls = handle('left').getAttribute('aria-controls')
    expect(shell.querySelector('[id="' + controls + '"]')).not.toBeNull()
  })
})

/**
 * A palette entry is a button and a drag handle, and the two have to be told
 * apart.
 *
 * It arms a drag on `pointerdown` and adds on `click`. The drag controller
 * already decides which of the two happened and raises a flag saying "that
 * release was a drag, not a click" — and the palette never asked. So a drag
 * begun on a button and abandoned back over it added a component anyway, which
 * is what dragging out and changing your mind looks like.
 *
 * The canvas and the tree both ask. The palette could not: `PaletteProps` had
 * no way to reach the controller, so the gap was structural rather than an
 * oversight in a handler.
 */
describe('a palette entry pressed and dragged', () => {
  /** Press, move past the threshold, release — all over the same button. */
  function dragAndReturn(button: HTMLElement): void {
    fireEvent.pointerDown(button, { clientX: 10, clientY: 10, bubbles: true })
    fireEvent.pointerMove(window, { clientX: 12, clientY: 12 })
    fireEvent.pointerMove(window, { clientX: 90, clientY: 90 })
    fireEvent.pointerUp(window, { clientX: 10, clientY: 10 })
    fireEvent.click(button, { bubbles: true })
  }

  it('does not add a component when the drag is abandoned over it', async () => {
    const harness = setup()
    await harness.user.click(screen.getByRole('tab', { name: 'Components' }))

    const before = harness.latest().root.children?.length ?? 0
    dragAndReturn(screen.getByRole('button', { name: 'Field' }))

    expect(harness.latest().root.children?.length ?? 0).toBe(before)
  })

  it('still adds one on a plain click', async () => {
    // The control, and the one that matters most: this is the no-aim path the
    // palette exists for, and swallowing every click would remove it.
    const harness = setup()
    await harness.user.click(screen.getByRole('tab', { name: 'Components' }))

    const before = harness.latest().root.children?.length ?? 0
    await harness.user.click(screen.getByRole('button', { name: 'Field' }))

    expect(harness.latest().root.children?.length ?? 0).toBe(before + 1)
  })
})
