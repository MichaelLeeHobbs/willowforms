/**
 * @vitest-environment jsdom
 */

import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import type { ReactNode } from 'react'
import type { ComponentNode, FormDocument, Kit, Language } from '@willowforms/core'
import { languageTag } from '@willowforms/core'
import type { NodeRendererProps, RendererKit } from '@willowforms/renderer'

import { isLanguage } from '../language.js'
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
        { name: 'label', label: 'Label', editor: 'string', localizable: true },
        { name: 'width', label: 'Width', editor: 'number' },
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
    // Guarded: the last describe passes malformed `languages` on purpose.
    defaultLanguage:
      Array.isArray(languages) && isLanguage(languages[0]) ? languageTag(languages[0]) : 'en',
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

  fireEvent.click(screen.getByRole('tab', { name: 'Tree' }))

  return {
    user,
    latest: () => current,
    select: async () => {
      const row = view.container.querySelector<HTMLElement>('[data-fs-tree-row="email"]')
      if (!row) throw new Error('no tree row for email')
      await user.click(row)
    },
    openTab: async (name) => {
      await user.click(screen.getByRole('tab', { name }))
    },
  }
}

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

  it('offers a condition only where the schema opts in', () => {
    expect(modesFor({ name: 'disabled', label: 'Disabled', editor: 'boolean' })).not.toContain(
      'condition',
    )
    expect(
      modesFor({ name: 'disabled', label: 'Disabled', editor: 'boolean', conditional: true }),
    ).toContain('condition')
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

  it('writes a translation per language, under the tag rather than the code', async () => {
    // `en-US`, as `createDocument` ships: with a dialect-free language the tag
    // and the code are the same string and a wrong bundle cannot be seen.
    const { user, select, latest } = setup([
      { code: 'en', dialect: 'US', name: 'English', bidi: 'ltr' },
      { code: 'fr', name: 'French', bidi: 'ltr' },
    ])
    await select()

    await user.selectOptions(screen.getByLabelText('Label binding'), 'i18n')
    await user.type(screen.getByLabelText('English'), 'Email')
    await user.type(screen.getByLabelText('French'), 'Courriel')

    expect(latest().translations['en-US']).toEqual({ email_label: 'Email' })
    expect(
      latest().translations['en'],
      'written under the code, which nothing reads',
    ).toBeUndefined()
    expect(latest().translations['fr']).toEqual({ email_label: 'Courriel' })
  })

  it('shows the translation the document already holds for a dialect tag', async () => {
    const { user, select, latest } = setup([
      { code: 'en', dialect: 'US', name: 'English', bidi: 'ltr' },
    ])
    await select()

    await user.selectOptions(screen.getByLabelText('Label binding'), 'i18n')
    await user.type(screen.getByLabelText('English'), 'Email')

    expect(latest().translations['en-US']).toEqual({ email_label: 'Email' })
    expect(screen.getByLabelText('English')).toHaveProperty('value', 'Email')
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

  it('turns a language right to left, and the boxes follow', async () => {
    const { user, select, openTab, latest } = setup([
      { code: 'en', dialect: 'US', name: 'English', bidi: 'ltr' },
      { code: 'ar', name: 'Arabic', bidi: 'ltr' },
    ])
    await openTab('Settings')

    const pane = document.querySelector<HTMLElement>('.fs-panel--left')
    if (!pane) throw new Error('no left pane')
    const arabic = within(pane).getByText('Arabic').closest('li')
    if (!arabic) throw new Error('no row for Arabic')
    await user.click(within(arabic).getByLabelText('Right to left'))

    expect(latest().languages).toEqual([
      { code: 'en', dialect: 'US', name: 'English', bidi: 'ltr' },
      { code: 'ar', name: 'Arabic', bidi: 'rtl' },
    ])

    await openTab('Tree')
    await select()
    await user.selectOptions(screen.getByLabelText('Label binding'), 'i18n')
    expect(screen.getByLabelText('Arabic').getAttribute('dir')).toBe('rtl')
  })

  it('turns it back again', async () => {
    const { user, openTab, latest } = setup([
      { code: 'ar', name: 'Arabic', bidi: 'rtl' },
      { code: 'en', name: 'English', bidi: 'ltr' },
    ])
    await openTab('Settings')

    const pane = document.querySelector<HTMLElement>('.fs-panel--left')
    if (!pane) throw new Error('no left pane')
    const arabic = within(pane).getByText('Arabic').closest('li')
    if (!arabic) throw new Error('no row for Arabic')
    await user.click(within(arabic).getByLabelText('Right to left'))

    expect(latest().languages[0]).toEqual({ code: 'ar', name: 'Arabic', bidi: 'ltr' })
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
    await openTab('Settings')

    await user.clear(screen.getByLabelText('Form name'))
    await user.type(screen.getByLabelText('Form name'), 'Signup')

    expect(latest().name).toBe('Signup')
  })

  it('adds a language', async () => {
    const { user, openTab, latest } = setup()
    await openTab('Settings')

    await user.type(screen.getByLabelText('Code'), 'fr')
    await user.type(screen.getByLabelText('Name'), 'French')
    await user.click(screen.getByRole('button', { name: 'Add language' }))

    expect(latest().languages).toEqual([
      { code: 'en', name: 'English', bidi: 'ltr' },
      { code: 'fr', name: 'French', bidi: 'ltr' },
    ])
  })

  it('adds a language with no name rather than inventing one from the code', async () => {
    const { user, openTab, latest } = setup()
    await openTab('Settings')

    await user.type(screen.getByLabelText('Code'), 'pt-BR')
    await user.click(screen.getByRole('button', { name: 'Add language' }))

    expect(latest().languages[1]).toEqual({ code: 'pt', dialect: 'BR', name: '', bidi: 'ltr' })
    const pane = document.querySelector<HTMLElement>('.fs-panel--left')
    if (!pane) throw new Error('no left pane')
    expect(within(pane).getByText('pt-BR')).toBeTruthy()
  })

  it('removes the language that was clicked when two share a tag', async () => {
    const { user, openTab, latest } = setup([
      { code: 'en', name: 'English', bidi: 'ltr' },
      { code: 'en', name: 'English again', bidi: 'ltr' },
    ])
    await openTab('Settings')

    await user.click(screen.getByRole('button', { name: 'Remove English again' }))

    expect(latest().languages).toEqual([{ code: 'en', name: 'English', bidi: 'ltr' }])
  })

  it('refuses a duplicate language code', async () => {
    const { user, openTab, latest } = setup()
    await openTab('Settings')

    await user.type(screen.getByLabelText('Code'), 'en')
    await user.click(screen.getByRole('button', { name: 'Add language' }))

    expect(screen.getByRole('alert').textContent).toMatch(/already in the list/)
    expect(latest().languages).toHaveLength(1)
  })

  it('refuses an empty language code instead of adding a blank row', async () => {
    const { user, openTab, latest } = setup()
    await openTab('Settings')

    await user.click(screen.getByRole('button', { name: 'Add language' }))

    expect(screen.getByRole('alert')).toBeTruthy()
    expect(latest().languages).toHaveLength(1)
  })

  it('changes the default language', async () => {
    const { user, openTab, latest } = setup([
      { code: 'en', name: 'English', bidi: 'ltr' },
      { code: 'fr', name: 'French', bidi: 'ltr' },
    ])
    await openTab('Settings')

    // Scoped: the toolbar's language select also names every language.
    const pane = document.querySelector<HTMLElement>('.fs-panel--left')
    if (!pane) throw new Error('no left pane')
    const french = within(pane).getByText('French').closest('li')
    if (!french) throw new Error('no row for French')
    await user.click(within(french).getByRole('radio'))

    expect(latest().defaultLanguage).toBe('fr')
  })

  it('moves the default when the current default is removed', async () => {
    const { user, openTab, latest } = setup([
      { code: 'en', name: 'English', bidi: 'ltr' },
      { code: 'fr', name: 'French', bidi: 'ltr' },
    ])
    await openTab('Settings')

    await user.click(screen.getByRole('button', { name: 'Remove English' }))

    // A document pointing at a language it no longer has renders every
    // translation as its raw key.
    expect(latest().languages).toHaveLength(1)
    expect(latest().defaultLanguage).toBe('fr')
  })

  it('removes a language whose tag carries a region', async () => {
    const { user, openTab, latest } = setup([
      { code: 'en', dialect: 'US', name: 'English', bidi: 'ltr' },
      { code: 'fr', name: 'French', bidi: 'ltr' },
    ])
    await openTab('Settings')

    await user.click(screen.getByRole('button', { name: 'Remove English' }))

    expect(latest().languages).toEqual([{ code: 'fr', name: 'French', bidi: 'ltr' }])
    expect(latest().defaultLanguage).toBe('fr')
  })

  it('splits a region subtag out of the code it was typed with', async () => {
    const { user, openTab, latest } = setup()
    await openTab('Settings')

    await user.type(screen.getByLabelText('Code'), 'pt-BR')
    await user.type(screen.getByLabelText('Name'), 'Portuguese')
    await user.click(screen.getByRole('button', { name: 'Add language' }))

    expect(latest().languages[1]).toEqual({
      code: 'pt',
      dialect: 'BR',
      name: 'Portuguese',
      bidi: 'ltr',
    })
    expect(languageTag(latest().languages[1] as Language)).toBe('pt-BR')
  })

  it('refuses a script subtag by name rather than truncating it', async () => {
    // Refused rather than mangled: a truncated tag would file translations in a
    // bundle the renderer never reads.
    const { user, openTab, latest } = setup()
    await openTab('Settings')

    await user.type(screen.getByLabelText('Code'), 'zh-Hans-CN')
    await user.type(screen.getByLabelText('Name'), 'Chinese')
    await user.click(screen.getByRole('button', { name: 'Add language' }))

    expect(screen.getByRole('alert').textContent).toMatch(/script subtag/)
    expect(latest().languages).toHaveLength(1)
  })

  it('refuses a code that is not a tag at all', async () => {
    const { user, openTab, latest } = setup()
    await openTab('Settings')

    await user.type(screen.getByLabelText('Code'), 'en US')
    await user.type(screen.getByLabelText('Name'), 'English')
    await user.click(screen.getByRole('button', { name: 'Add language' }))

    expect(screen.getByRole('alert')).toBeTruthy()
    expect(latest().languages).toHaveLength(1)
  })

  it('takes a numeric region, which is a tag as much as a lettered one', async () => {
    // The control for both refusals; `es-419` is a valid tag (a UN M.49 region).
    const { user, openTab, latest } = setup()
    await openTab('Settings')

    await user.type(screen.getByLabelText('Code'), 'es-419')
    await user.type(screen.getByLabelText('Name'), 'Spanish')
    await user.click(screen.getByRole('button', { name: 'Add language' }))

    expect(latest().languages[1]).toEqual({
      code: 'es',
      dialect: '419',
      name: 'Spanish',
      bidi: 'ltr',
    })
  })

  it('takes Enter as Add, the way every other field here commits', async () => {
    // Not a `<form>`, since one nested in the host's page would submit it, so
    // Enter has to be handled by hand.
    const { user, openTab, latest } = setup()
    await openTab('Settings')

    await user.type(screen.getByLabelText('Name'), 'Portuguese')
    await user.type(screen.getByLabelText('Code'), 'pt{Enter}')

    expect(latest().languages).toHaveLength(2)
    expect(latest().languages[1]).toMatchObject({ code: 'pt', name: 'Portuguese' })
  })

  it('clears the refusal as soon as the code is corrected', async () => {
    // The message describes the `aria-invalid` box, so a stale one keeps being
    // read out.
    const { user, openTab } = setup()
    await openTab('Settings')

    await user.type(screen.getByLabelText('Code'), 'en US')
    await user.click(screen.getByRole('button', { name: 'Add language' }))
    expect(screen.getByRole('alert')).toBeTruthy()

    await user.type(screen.getByLabelText('Code'), '{Backspace}')

    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByLabelText('Code').hasAttribute('aria-invalid')).toBe(false)
  })

  it('refuses a duplicate that differs only in case', async () => {
    const { user, openTab, latest } = setup([
      { code: 'pt', dialect: 'BR', name: 'PT', bidi: 'ltr' },
    ])
    await openTab('Settings')

    await user.type(screen.getByLabelText('Code'), 'pt-br')
    await user.click(screen.getByRole('button', { name: 'Add language' }))

    expect(screen.getByRole('alert').textContent).toMatch(/already in the list/)
    expect(latest().languages).toHaveLength(1)
  })

  it('will not remove the last language', async () => {
    const { openTab, latest } = setup()
    await openTab('Settings')

    expect(screen.getByRole('button', { name: 'Remove English' })).toHaveProperty('disabled', true)
    expect(latest().languages).toHaveLength(1)
  })
})

/**
 * Renaming a translation key, and opening a document that has no bundles.
 */
describe('the translation key field', () => {
  it('carries the text with the key', async () => {
    /*
     * `en-US`, not `en`, and that is the whole point of this fixture.
     *
     * This was dialect-free, so `languageTag(language)` and `language.code`
     * were the same string everywhere on the path under test -- and the carry
     * reads its bundle by tag. Replace `languageTag(language)` with
     * `language.code` at `Binding.tsx:260` and every assertion here stayed
     * green, while a real document (`createDocument` ships `en-US`) renamed a
     * key, the carry read bundle `en`, found nothing, and orphaned the text
     * under the old key -- the exact defect this describe exists to prevent.
     *
     * This file already knows the trap: two other blocks switch to `en-US`
     * specifically to make the tag/code distinction visible, and a comment says
     * every dialect-free fixture is the unrealistic one. The rename path was
     * left on the old one.
     */
    const { user, select, latest } = setup([
      { code: 'en', dialect: 'US', name: 'English', bidi: 'ltr' },
      { code: 'fr', name: 'French', bidi: 'ltr' },
    ])
    await select()

    await user.selectOptions(screen.getByLabelText('Label binding'), 'i18n')
    await user.type(screen.getByLabelText('English'), 'Email')
    await user.type(screen.getByLabelText('French'), 'Courriel')

    const key = latest().root.children?.[0]?.props['label']
    const before = key?.kind === 'i18n' ? key.key : ''
    expect(latest().translations['en-US']?.[before]).toBe('Email')

    const box = screen.getByRole('textbox', { name: 'Translation key' })
    await user.clear(box)
    await user.type(box, 'emailLabel')
    await user.tab()

    expect(latest().translations['en-US']?.['emailLabel']).toBe('Email')
    expect(latest().translations['fr']?.['emailLabel']).toBe('Courriel')

    expect(latest().translations['en-US']).not.toHaveProperty(before)
    expect(latest().translations['fr']).not.toHaveProperty(before)
  })

  it('shows what is being typed rather than re-deriving it', async () => {
    const { user, select } = setup()
    await select()
    await user.selectOptions(screen.getByLabelText('Label binding'), 'i18n')

    const box = screen.getByRole('textbox', { name: 'Translation key' })
    await user.clear(box)
    await user.type(box, 'gree')

    expect(box).toHaveProperty('value', 'gree')
  })
})

describe('two languages sharing a tag', () => {
  it('takes the direction of the one that was ticked', async () => {
    const { user, openTab, latest } = setup([
      { code: 'en', name: 'English', bidi: 'ltr' },
      { code: 'en', name: 'English again', bidi: 'ltr' },
    ])
    await openTab('Settings')

    const boxes = screen.getAllByRole('checkbox', { name: 'Right to left' })
    expect(boxes).toHaveLength(2)
    await user.click(boxes[1] as HTMLElement)

    expect(latest().languages).toEqual([
      { code: 'en', name: 'English', bidi: 'ltr' },
      { code: 'en', name: 'English again', bidi: 'rtl' },
    ])
  })

  it('still sets the direction when only one language has that tag', async () => {
    const { user, openTab, latest } = setup([
      { code: 'en', name: 'English', bidi: 'ltr' },
      { code: 'ar', name: 'Arabic', bidi: 'ltr' },
    ])
    await openTab('Settings')

    await user.click(screen.getAllByRole('checkbox', { name: 'Right to left' })[1] as HTMLElement)

    expect(latest().languages[1]?.bidi).toBe('rtl')
    expect(latest().languages[0]?.bidi).toBe('ltr')
  })
})

describe('a document whose languages are not languages', () => {
  const junk = (languages: unknown): ReturnType<typeof setup> =>
    setup(languages as Language[] | undefined)

  it.each([
    ['an empty object', [{}]],
    ['a code that is a number', [{ code: 5 }]],
    ['an array', [[]]],
    ['null', [null]],
    ['a string', ['en']],
  ])('opens the settings tab for %s', async (_what, languages) => {
    const view = junk([...languages, { code: 'en', dialect: 'US', name: 'English', bidi: 'ltr' }])
    await view.openTab('Settings')

    expect(screen.getAllByRole('checkbox', { name: 'Right to left' })).toHaveLength(1)
  })

  // Driven through `Properties`: `Binding` may trust its `Language[]` prop, so
  // the guard belongs where the list is read.
  it.each([
    ['null', [null]],
    ['not an array at all', 'de'],
  ])('draws a translated property when languages are %s', async (_what, languages) => {
    const view = junk(
      Array.isArray(languages)
        ? [...languages, { code: 'en', dialect: 'US', name: 'English', bidi: 'ltr' }]
        : languages,
    )
    await view.select()

    await view.user.selectOptions(screen.getByLabelText('Label binding'), 'i18n')

    expect(
      screen.getAllByRole('textbox', { name: 'Translation key' }),
      'the inspector did not survive the document',
    ).toHaveLength(1)
    expect(screen.queryAllByLabelText('English')).toHaveLength(Array.isArray(languages) ? 1 : 0)
  })

  it.each([
    ['no name', [{ code: 'de' }]],
    ['a name that is an object', [{ code: 'de', name: {}, bidi: 'ltr' }]],
  ])('draws one box per language when an entry has %s', async (_what, languages) => {
    /*
     * Controls: these pass without the guard too, since `Binding` labels a box
     * `nameOf(language) || tag`. They pin that a junk entry is dropped rather
     * than drawn as an unnamed box.
     */
    const view = junk([
      ...(languages as unknown[]),
      { code: 'en', dialect: 'US', name: 'English', bidi: 'ltr' },
    ])
    await view.select()

    await view.user.selectOptions(screen.getByLabelText('Label binding'), 'i18n')

    expect(screen.getAllByLabelText('English')).toHaveLength(1)
    expect(
      screen.queryAllByLabelText('de'),
      'an entry the panel cannot read was drawn',
    ).toHaveLength(0)
  })

  it('counts what it can draw rather than what the array holds', async () => {
    const view = junk([{}, null, { code: 'en', dialect: 'US', name: 'English', bidi: 'ltr' }])
    await view.openTab('Settings')

    expect(screen.getByText('Languages').textContent).toContain('1')
  })

  it.each([
    ['not an array at all', 'en'],
    ['a number', 5],
    ['null', null],
  ])('opens the settings tab when languages is %s', async (_what, languages) => {
    const view = junk(languages)
    await view.openTab('Settings')

    expect(screen.queryAllByRole('checkbox', { name: 'Right to left' })).toHaveLength(0)
    // And the tab really is open, rather than the assertion above holding
    // because nothing rendered.
    expect(screen.getByText('Languages')).toBeTruthy()
  })

  it.each([
    ['no name', { code: 'en', bidi: 'ltr' }],
    ['a name that is not a string', { code: 'en', name: {}, bidi: 'ltr' }],
    ['no bidi', { code: 'en', name: 'English' }],
    ['a bidi outside the union', { code: 'en', name: 'English', bidi: 'sideways' }],
    ['a dialect that is not a string', { code: 'en', dialect: 5, name: 'English', bidi: 'ltr' }],
    ['an empty code', { code: '', name: 'English', bidi: 'ltr' }],
  ])('does not treat %s as a language', async (_what, entry) => {
    const view = junk([entry, { code: 'fr', name: 'French', bidi: 'ltr' }])
    await view.openTab('Settings')

    expect(screen.getAllByRole('checkbox', { name: 'Right to left' })).toHaveLength(1)
  })

  it('refuses to remove the last language it can draw', async () => {
    const view = junk([{}, { code: 'en', dialect: 'US', name: 'English', bidi: 'ltr' }])
    await view.openTab('Settings')

    const remove = screen.getByRole('button', { name: /^Remove / })
    expect(remove.hasAttribute('disabled'), 'the only drawable language can still be removed').toBe(
      true,
    )
  })

  it('leaves an entry it cannot draw in the document', async () => {
    const view = junk([{}, { code: 'en', dialect: 'US', name: 'English', bidi: 'ltr' }])
    await view.openTab('Settings')

    expect(view.latest().languages).toEqual([
      {},
      { code: 'en', dialect: 'US', name: 'English', bidi: 'ltr' },
    ])
  })
})
