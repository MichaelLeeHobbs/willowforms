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

import { render, screen } from '@testing-library/react'
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

function setup(languages: Language[] = [ENGLISH, FRENCH], onSave?: () => void): Harness {
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

    await user.click(screen.getByRole('tab', { name: 'Form' }))
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
    const onSave = vi.fn()
    const { user } = setup([ENGLISH, FRENCH], onSave)

    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(onSave).toHaveBeenCalledTimes(1)
  })
})
