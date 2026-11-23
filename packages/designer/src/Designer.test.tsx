/**
 * @vitest-environment jsdom
 */

/**
 * Theme, canvas language and pane layout are view state: none of them may
 * change the document.
 */

import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import type { ComponentNode, FormDocument, Kit, Language } from '@willowforms/core'
import type { NodeRendererProps, RendererKit } from '@willowforms/renderer'

import { Designer } from './Designer.js'
import type { DesignerProps } from './Designer.js'

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
  viewProps?: Pick<DesignerProps, 'theme' | 'onThemeChange'>,
): Harness {
  const user = userEvent.setup()
  let current = documentOf(languages)
  const rendered = render(
    <Designer
      initialDocument={current}
      kit={kit}
      rendererKit={rendererKit}
      onChange={(doc) => {
        current = doc
      }}
      {...(onSave ? { onSave } : {})}
      {...viewProps}
    />,
  )
  const shell = rendered.container.querySelector<HTMLElement>('.fs-shell')
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

  it('can be controlled by a host and reports toolbar choices', async () => {
    const onThemeChange = vi.fn()
    const { user, shell } = setup([ENGLISH, FRENCH], undefined, {
      theme: 'dark',
      onThemeChange,
    })

    expect(shell.getAttribute('data-fs-theme')).toBe('dark')
    expect(screen.getByLabelText<HTMLSelectElement>('Designer theme').value).toBe('dark')

    await user.selectOptions(screen.getByLabelText('Designer theme'), 'light')

    expect(onThemeChange).toHaveBeenCalledWith('light')
    expect(shell.getAttribute('data-fs-theme')).toBe('dark')
  })
})

describe('the canvas language control', () => {
  it('is absent when the document has only one language', () => {
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
    const { user } = setup()
    await user.selectOptions(screen.getByLabelText('Canvas language'), 'fr')
    expect(screen.getByText('Courriel')).toBeTruthy()

    await user.click(screen.getByRole('tab', { name: 'Settings' }))
    await user.click(screen.getByRole('button', { name: 'Remove French' }))

    expect(screen.getByText('Email')).toBeTruthy()
    expect(screen.queryByText('Courriel')).toBeNull()
    expect(screen.queryByText('email_label')).toBeNull()
  })

  it('forgets the removed language rather than waiting for it to come back', async () => {
    const { user } = setup()
    await user.selectOptions(screen.getByLabelText('Canvas language'), 'fr')
    expect(screen.getByText('Courriel')).toBeTruthy()

    await user.click(screen.getByRole('tab', { name: 'Settings' }))
    await user.click(screen.getByRole('button', { name: 'Remove French' }))

    await user.type(screen.getByLabelText('Code'), 'fr')
    await user.type(screen.getByLabelText('Name'), 'French')
    await user.click(screen.getByRole('button', { name: 'Add language' }))

    expect(screen.getByRole('button', { name: 'Remove French' })).toBeTruthy()
    expect(screen.getByLabelText<HTMLSelectElement>('Canvas language').value).toBe('')
    expect(screen.getByText('Email')).toBeTruthy()
  })
})

/**
 * `onChange` is held in a ref, out of the effect's dependencies: hosts pass
 * inline arrows, and re-emitting on each host render loops when the host stores
 * what it is given.
 */
describe('emitting the document to the host', () => {
  const mounted = (): { emit: ReturnType<typeof vi.fn>; rerender: () => void } => {
    const emit = vi.fn<(doc: FormDocument) => void>()
    const document = documentOf([ENGLISH])

    const view = render(
      <Designer initialDocument={document} kit={kit} rendererKit={rendererKit} onChange={emit} />,
    )

    return {
      emit,
      // A host render with nothing changed, which is what an inline arrow makes
      // a new function on. Every prop is the same value it already had.
      rerender: () => {
        view.rerender(
          <Designer
            initialDocument={document}
            kit={kit}
            rendererKit={rendererKit}
            onChange={emit}
          />,
        )
      },
    }
  }

  it('emits once on mount', () => {
    expect(mounted().emit).toHaveBeenCalledTimes(1)
  })

  it('does not emit again when the host re-renders with a new arrow', () => {
    const { emit, rerender } = mounted()
    emit.mockClear()

    act(() => {
      rerender()
      rerender()
    })

    expect(emit).not.toHaveBeenCalled()
  })

  it('still emits when the document actually changes', async () => {
    const user = userEvent.setup()
    const { emit } = mounted()
    emit.mockClear()

    await user.click(screen.getByRole('tab', { name: 'Components' }))
    await user.click(screen.getByTitle('Add Field, or drag it onto the canvas'))

    expect(emit).toHaveBeenCalledTimes(1)
  })
})

describe('the Save button', () => {
  it('is absent when the host passes no onSave', () => {
    setup()
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull()
  })

  it('hands the host the current document', async () => {
    const onSave = vi.fn<(document: FormDocument) => void>()
    const { user, shell } = setup([ENGLISH, FRENCH], onSave)

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

describe('the undo and redo shortcuts', () => {
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

  const drawn = (harness: Harness): string[] =>
    [...harness.shell.querySelectorAll('.fs-canvas__frame [data-fs-key]')]
      .map((element) => element.getAttribute('data-fs-key') ?? '')
      .filter((key) => key !== 'root')

  it('takes an edit back on Ctrl+Z and puts it back on Ctrl+Y', async () => {
    const harness = await withAnEdit()
    const { shell, latest } = harness

    fireEvent.keyDown(shell, { key: 'z', ctrlKey: true })
    expect(latest().root.children?.map((child) => child.key)).toEqual(['email'])
    expect(drawn(harness)).toEqual(['email'])

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
     * aria-expanded without aria-controls says something is expanded, not what.
     * Checked by id here because axe may not flag an id that does not resolve.
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

describe('a palette entry pressed and dragged', () => {
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
    const harness = setup()
    await harness.user.click(screen.getByRole('tab', { name: 'Components' }))

    const before = harness.latest().root.children?.length ?? 0
    await harness.user.click(screen.getByRole('button', { name: 'Field' }))

    expect(harness.latest().root.children?.length ?? 0).toBe(before + 1)
  })
})

describe('shell shortcuts and a target they cannot read', () => {
  const selectEmail = async (harness: Harness): Promise<void> => {
    await harness.user.click(screen.getByRole('tab', { name: 'Tree' }))
    const row = harness.shell.querySelector<HTMLElement>('[data-fs-tree-row="email"]')
    if (!row) throw new Error('no tree row')
    await harness.user.click(row)
  }

  const keys = (harness: Harness): (string | undefined)[] =>
    (harness.latest().root.children ?? []).map((child) => child.key)

  it('does not delete on Backspace from a target it cannot attribute', async () => {
    const harness = setup()
    await selectEmail(harness)

    const before = keys(harness)
    expect(before, 'the fixture has no email row, so this proves nothing').toContain('email')

    // An SVG element: an `Element` but not an `HTMLElement`, which is the shape
    // `Icon` puts on screen throughout the chrome.
    const svg = harness.shell.querySelector('svg')
    expect(svg, 'the chrome renders no SVG, so this fixture is wrong').not.toBeNull()

    fireEvent.keyDown(svg as SVGElement, { key: 'Backspace', bubbles: true })

    expect(keys(harness)).toEqual(before)
  })

  it('still deletes on Backspace from the shell itself', async () => {
    // In the shell or a tree row, Backspace can only mean "remove the selection".
    const harness = setup()
    await selectEmail(harness)

    fireEvent.keyDown(harness.shell, { key: 'Backspace' })

    expect(keys(harness)).not.toContain('email')
  })

  it('still deletes on Delete, which is unambiguous from anywhere', async () => {
    const harness = setup()
    await selectEmail(harness)

    fireEvent.keyDown(harness.shell, { key: 'Delete' })

    expect(keys(harness)).not.toContain('email')
  })
})
