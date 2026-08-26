/**
 * @vitest-environment jsdom
 */

/**
 * Binding editors and form settings.
 *
 * `PropValue` is a tagged union, so the thing worth pinning is that switching
 * modes produces a value of exactly one kind and never a blend, and that a
 * property only offers the modes its `PropSchema` allows.
 */

import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import type { ReactNode } from 'react'
import type { ComponentNode, FormDocument, Kit, Language } from '@formsmith/core'
import { languageTag } from '@formsmith/core'
import type { NodeRendererProps, RendererKit } from '@formsmith/renderer'

import { Designer } from '../Designer.js'
import { modesFor, translationKey } from './Binding.js'

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
      type: 'Field',
      label: 'Field',
      group: 'inputs',
      dataBound: true,
      dataType: 'string',
      defaultProps: {},
      props: [
        // User-facing copy: worth translating, and computable.
        { name: 'label', label: 'Label', editor: 'string', localizable: true },
        // A layout number: computable, but translating it is meaningless.
        { name: 'width', label: 'Width', editor: 'number' },
        // Neither: a literal only.
        { name: 'anchor', label: 'Anchor', editor: 'string', computable: false },
      ],
      events: [],
    },
  ],
}

function makeDocument(
  languages: Language[] = [{ code: 'en', name: 'English', bidi: 'ltr' }],
): FormDocument {
  const field: ComponentNode = { key: 'email', type: 'Field', props: {} }
  return {
    version: '1',
    id: 'doc',
    name: 'Contact request',
    root: { key: 'root', type: 'Screen', props: {}, children: [field] },
    actions: {},
    languages,
    defaultLanguage: languages[0] ? languageTag(languages[0]) : 'en',
    translations: {},
    settings: {},
  }
}

interface Harness {
  user: ReturnType<typeof userEvent.setup>
  latest: () => FormDocument
  select: () => Promise<void>
  openTab: (name: string) => Promise<void>
}

function setup(languages?: Language[]): Harness {
  const user = userEvent.setup()
  let current = makeDocument(languages)
  const view = render(
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
    select: async () => {
      const row = view.container.querySelector<HTMLElement>('[data-fs-row="email"]')
      if (!row) throw new Error('no tree row for email')
      await user.click(row)
    },
    openTab: async (name) => {
      await user.click(screen.getByRole('tab', { name }))
    },
  }
}

/** The stored binding for a prop on the field. */
function propOf(doc: FormDocument, name: string): unknown {
  return doc.root.children?.[0]?.props[name]
}

describe('modesFor', () => {
  it('always offers a literal value', () => {
    expect(modesFor({ name: 'x', label: 'X', editor: 'string', computable: false })).toEqual([
      'static',
    ])
  })

  it('offers an expression unless the schema forbids one', () => {
    expect(modesFor({ name: 'x', label: 'X', editor: 'string' })).toEqual(['static', 'computed'])
  })

  it('offers a translation only for copy marked localizable', () => {
    expect(modesFor({ name: 'x', label: 'X', editor: 'string', localizable: true })).toEqual([
      'static',
      'computed',
      'i18n',
    ])
  })
})

describe('translationKey', () => {
  it('follows the documented component_prop convention', () => {
    expect(translationKey('email', 'label')).toBe('email_label')
  })
})

describe('binding editors', () => {
  it('hides the mode picker for a property with only one mode', async () => {
    const { select } = setup()
    await select()

    expect(screen.queryByLabelText('Anchor binding')).toBeNull()
    expect(screen.getByLabelText('Label binding')).toBeTruthy()
  })

  it('switches a property to a computed expression', async () => {
    const { user, select, latest } = setup()
    await select()

    await user.selectOptions(screen.getByLabelText('Label binding'), 'computed')

    expect(propOf(latest(), 'label')).toEqual({ kind: 'computed', expression: '' })
  })

  it('stores the expression as it is typed', async () => {
    const { user, select, latest } = setup()
    await select()

    await user.selectOptions(screen.getByLabelText('Label binding'), 'computed')
    await user.type(screen.getByLabelText('Label'), 'data.name')

    expect(propOf(latest(), 'label')).toEqual({ kind: 'computed', expression: 'data.name' })
  })

  it('seeds a translation binding with the conventional key', async () => {
    const { user, select, latest } = setup()
    await select()

    await user.selectOptions(screen.getByLabelText('Label binding'), 'i18n')

    expect(propOf(latest(), 'label')).toEqual({ kind: 'i18n', key: 'email_label' })
  })

  it('does not carry a value across a mode change', async () => {
    const { user, select, latest } = setup()
    await select()

    await user.type(screen.getByLabelText('Label'), 'Email')
    expect(propOf(latest(), 'label')).toEqual({ kind: 'static', value: 'Email' })

    await user.selectOptions(screen.getByLabelText('Label binding'), 'computed')

    // An expression is not a label, so the old text is gone rather than becoming
    // a broken expression.
    expect(propOf(latest(), 'label')).toEqual({ kind: 'computed', expression: '' })
  })

  it('returns to a literal value and clears the binding', async () => {
    const { user, select, latest } = setup()
    await select()

    await user.selectOptions(screen.getByLabelText('Label binding'), 'computed')
    await user.selectOptions(screen.getByLabelText('Label binding'), 'static')

    expect(propOf(latest(), 'label')).toBeUndefined()
  })

  it('writes a translation per language', async () => {
    const { user, select, latest } = setup([
      { code: 'en', name: 'English', bidi: 'ltr' },
      { code: 'fr', name: 'French', bidi: 'ltr' },
    ])
    await select()

    await user.selectOptions(screen.getByLabelText('Label binding'), 'i18n')
    await user.type(screen.getByLabelText('English'), 'Email')
    await user.type(screen.getByLabelText('French'), 'Courriel')

    expect(latest().translations['en']).toEqual({ email_label: 'Email' })
    expect(latest().translations['fr']).toEqual({ email_label: 'Courriel' })
  })

  it('drops a translation rather than storing an empty string', async () => {
    const { user, select, latest } = setup()
    await select()

    await user.selectOptions(screen.getByLabelText('Label binding'), 'i18n')
    await user.type(screen.getByLabelText('English'), 'Email')
    await user.clear(screen.getByLabelText('English'))

    // An absent key renders as the key itself, which shows the gap.
    expect(latest().translations['en']).toEqual({})
  })

  it('marks a right-to-left language on its input', async () => {
    const { user, select } = setup([
      { code: 'en', name: 'English', bidi: 'ltr' },
      { code: 'ar', name: 'Arabic', bidi: 'rtl' },
    ])
    await select()

    await user.selectOptions(screen.getByLabelText('Label binding'), 'i18n')

    expect(screen.getByLabelText('Arabic').getAttribute('dir')).toBe('rtl')
  })
})

describe('form settings', () => {
  it('renames the form', async () => {
    const { user, openTab, latest } = setup()
    await openTab('Form')

    await user.clear(screen.getByLabelText('Form name'))
    await user.type(screen.getByLabelText('Form name'), 'Signup')

    expect(latest().name).toBe('Signup')
  })

  it('adds a language', async () => {
    const { user, openTab, latest } = setup()
    await openTab('Form')

    await user.type(screen.getByLabelText('Code'), 'fr')
    await user.type(screen.getByLabelText('Name'), 'French')
    await user.click(screen.getByRole('button', { name: 'Add language' }))

    expect(latest().languages).toEqual([
      { code: 'en', name: 'English', bidi: 'ltr' },
      { code: 'fr', name: 'French', bidi: 'ltr' },
    ])
  })

  it('refuses a duplicate language code', async () => {
    const { user, openTab, latest } = setup()
    await openTab('Form')

    await user.type(screen.getByLabelText('Code'), 'en')
    await user.click(screen.getByRole('button', { name: 'Add language' }))

    expect(screen.getByRole('alert').textContent).toMatch(/already in the list/)
    expect(latest().languages).toHaveLength(1)
  })

  it('refuses an empty language code instead of adding a blank row', async () => {
    const { user, openTab, latest } = setup()
    await openTab('Form')

    await user.click(screen.getByRole('button', { name: 'Add language' }))

    expect(screen.getByRole('alert')).toBeTruthy()
    expect(latest().languages).toHaveLength(1)
  })

  it('changes the default language', async () => {
    const { user, openTab, latest } = setup([
      { code: 'en', name: 'English', bidi: 'ltr' },
      { code: 'fr', name: 'French', bidi: 'ltr' },
    ])
    await openTab('Form')

    const french = screen.getByText('French').closest('li')
    if (!french) throw new Error('no row for French')
    await user.click(within(french).getByRole('radio'))

    expect(latest().defaultLanguage).toBe('fr')
  })

  it('moves the default when the current default is removed', async () => {
    const { user, openTab, latest } = setup([
      { code: 'en', name: 'English', bidi: 'ltr' },
      { code: 'fr', name: 'French', bidi: 'ltr' },
    ])
    await openTab('Form')

    await user.click(screen.getByRole('button', { name: 'Remove English' }))

    // A document pointing at a language it no longer has renders every
    // translation as its raw key.
    expect(latest().languages).toHaveLength(1)
    expect(latest().defaultLanguage).toBe('fr')
  })

  /*
   * Every test above builds languages with no dialect, which is not what
   * createDocument produces: the shipped default is en-US. A tag and a code are
   * different strings, and the remove button was passing the code to a filter
   * comparing tags, so removing the default language did nothing at all.
   */
  it('removes a language whose tag carries a region', async () => {
    const { user, openTab, latest } = setup([
      { code: 'en', dialect: 'US', name: 'English', bidi: 'ltr' },
      { code: 'fr', name: 'French', bidi: 'ltr' },
    ])
    await openTab('Form')

    await user.click(screen.getByRole('button', { name: 'Remove English' }))

    expect(latest().languages).toEqual([{ code: 'fr', name: 'French', bidi: 'ltr' }])
    expect(latest().defaultLanguage).toBe('fr')
  })

  it('splits a region subtag out of the code it was typed with', async () => {
    const { user, openTab, latest } = setup()
    await openTab('Form')

    await user.type(screen.getByLabelText('Code'), 'pt-BR')
    await user.type(screen.getByLabelText('Name'), 'Portuguese')
    await user.click(screen.getByRole('button', { name: 'Add language' }))

    // The panel's own hint says to type pt-BR. Lowercasing the whole string
    // into `code` made the language "pt-br", which no dialect could be read
    // back out of and which the renderer never looked a translation up by.
    expect(latest().languages[1]).toEqual({
      code: 'pt',
      dialect: 'BR',
      name: 'Portuguese',
      bidi: 'ltr',
    })
    expect(languageTag(latest().languages[1] as Language)).toBe('pt-BR')
  })

  it('refuses a duplicate that differs only in case', async () => {
    const { user, openTab, latest } = setup([
      { code: 'pt', dialect: 'BR', name: 'PT', bidi: 'ltr' },
    ])
    await openTab('Form')

    await user.type(screen.getByLabelText('Code'), 'pt-br')
    await user.click(screen.getByRole('button', { name: 'Add language' }))

    expect(screen.getByRole('alert').textContent).toMatch(/already in the list/)
    expect(latest().languages).toHaveLength(1)
  })

  it('will not remove the last language', async () => {
    const { openTab, latest } = setup()
    await openTab('Form')

    expect(screen.getByRole('button', { name: 'Remove English' })).toHaveProperty('disabled', true)
    expect(latest().languages).toHaveLength(1)
  })
})
