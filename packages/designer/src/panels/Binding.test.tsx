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

import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import type { ReactNode } from 'react'
import type { ComponentNode, FormDocument, Kit, Language } from '@formsmith/core'
import { languageTag } from '@formsmith/core'
import type { NodeRendererProps, RendererKit } from '@formsmith/renderer'

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
    /*
     * Guarded, because this fixture is handed malformed `languages` on purpose
     * by the describe at the end of this file -- and a fixture that throws
     * while building a bad document cannot test what the panel does with one.
     */
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

  // The structure tree is behind a tab in the left pane. Opened here so every
  // test starts where it used to, rather than repeating the click in each.
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

  it('offers a condition only where the schema opts in', () => {
    /*
     * `conditional` is opt-in rather than inferred from the editor, because
     * `boolean` covers both "is this disabled" and "did the user tick it" and
     * only the first is worth making conditional. The arm had no test, so a
     * `modesFor` that offered a condition everywhere -- or nowhere -- read the
     * same to this file.
     */
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
    /*
     * `en-US`, not `en`. Every fixture in this describe was dialect-free, so a
     * bundle keyed by BCP 47 tag and one keyed by bare code were the same
     * string and the mistake this whole area exists to prevent -- writing to a
     * bundle the renderer never reads, which shows the raw key on the canvas --
     * could not be told apart. `createDocument` ships `en-US`, so the fixture
     * that cannot see it is also the unrealistic one.
     */
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
    // The reading half of the same distinction: a bundle under `en-US` has to
    // reach the box for English, or an author retypes a translation that exists.
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
    /*
     * The toggle rebuilds the whole language list -- it maps every language,
     * comparing tags -- and no test had ever clicked it. Comparing the wrong
     * pair of names there sets `bidi` on the wrong language, or on none.
     */
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

    // And the translation box for it is now right to left, which is the only
    // thing the flag is for.
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
    /*
     * It used to fall back to the raw code, so the row read "pt-BR pt-BR" --
     * the same string twice, which reads as a bug rather than as a language
     * nobody has named. The list draws the tag alone when there is no name.
     */
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
    /*
     * Nothing stops a hand-edited document holding one tag twice, and removal
     * filtered by tag: one click deleted both rows, with a bundle keyed by that
     * tag and no way to tell which of the two had gone.
     */
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

    /*
     * Scoped to the left pane, where settings now live. The toolbar's canvas
     * language select names every language too, and there are two tabpanels on
     * screen, so both an unscoped query and a role query match twice.
     */
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

  it('refuses a script subtag by name rather than truncating it', async () => {
    /*
     * The reason the parser is a grammar and not a `split('-')`. That split
     * took the first two subtags and dropped the rest, so `zh-Hans-CN` was
     * stored as the language `zh` with dialect `HANS` -- and every translation
     * authored for it went into a bundle keyed `zh-HANS`, which the renderer
     * never looks up, because the tag it looks up is the one this panel wrote.
     *
     * No test in this file typed a three-subtag code, so reverting the grammar
     * to a split left the whole describe green. Saying "not yet" is a smaller
     * failure than storing text nobody will find.
     */
    const { user, openTab, latest } = setup()
    await openTab('Settings')

    await user.type(screen.getByLabelText('Code'), 'zh-Hans-CN')
    await user.type(screen.getByLabelText('Name'), 'Chinese')
    await user.click(screen.getByRole('button', { name: 'Add language' }))

    expect(screen.getByRole('alert').textContent).toMatch(/script subtag/)
    expect(latest().languages).toHaveLength(1)
  })

  it('refuses a code that is not a tag at all', async () => {
    // The other half the split could not see: it checked nothing, so `en US`
    // became a bundle key nothing can ever resolve.
    const { user, openTab, latest } = setup()
    await openTab('Settings')

    await user.type(screen.getByLabelText('Code'), 'en US')
    await user.type(screen.getByLabelText('Name'), 'English')
    await user.click(screen.getByRole('button', { name: 'Add language' }))

    expect(screen.getByRole('alert')).toBeTruthy()
    expect(latest().languages).toHaveLength(1)
  })

  it('takes a numeric region, which is a tag as much as a lettered one', async () => {
    // The control for both refusals: a grammar that refused everything would
    // pass them, and `es-419` is Latin American Spanish rather than a typo.
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
    /*
     * The block is not a `<form>` -- a nested form inside a host's page is a
     * submit nobody asked for -- so nothing handled Enter and pressing it in
     * the Code field did nothing at all, in a panel where Enter commits every
     * other field.
     */
    const { user, openTab, latest } = setup()
    await openTab('Settings')

    await user.type(screen.getByLabelText('Name'), 'Portuguese')
    await user.type(screen.getByLabelText('Code'), 'pt{Enter}')

    expect(latest().languages).toHaveLength(2)
    expect(latest().languages[1]).toMatchObject({ code: 'pt', name: 'Portuguese' })
  })

  it('clears the refusal as soon as the code is corrected', async () => {
    /*
     * The error was cleared only by the next successful `add()`, so correcting
     * `en US` to `en-US` left the refusal on screen under a field that no
     * longer holds what was refused -- and the box is `aria-invalid` and
     * described by that message, so a screen reader went on reading it.
     */
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
     * It wrote a new binding on every keystroke, so typing a new name walked
     * through every prefix of it — and no prefix has a bundle entry, so both
     * language boxes blanked as they were typed while the text already written
     * stayed under the old key. Orphaned, with no way back to it from the panel.
     */
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

    /*
     * And the old key is gone from both bundles.
     *
     * The comment at the call site says the rename "carries the translations
     * with it" and it only copied them, so every rename left the old key's text
     * in every bundle: unreachable from the panel, exported with the document,
     * and two entries for one string with nothing saying which the form reads.
     */
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

/**
 * The other control on the row that was fixed by position.
 *
 * Removal used to filter by tag, so one click deleted both rows when two shared
 * one; that was fixed and pinned by the test above. The "Right to left"
 * checkbox on the same row kept matching by tag, so ticking it on one flipped
 * both -- one side of a symmetry fixed, the other left exactly as it was, with a
 * passing test beside it.
 */
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
    // The control: matching by position must not have broken the ordinary case.
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
  /*
   * `FormSettings` filtered `doc.languages` to "a non-null object", and
   * `languageTag` reads `.code` without guarding it: `languageTag({})` is
   * `undefined` and `languageTag({ code: 5 })` is `5`, and the duplicate check
   * calls `.toLowerCase()` on the result. So `{"languages":[{}]}` took the
   * settings tab down -- the failure that filter exists to prevent, through the
   * half of the shape it was not looking at.
   *
   * `typeof [] === 'object'`, which is why "a non-null object" is never enough
   * on its own, and this file's own fixtures are the place a host's JSON
   * arrives from.
   */
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

    // The tab is up, and the one real language beside the junk is drawn.
    expect(screen.getAllByRole('checkbox', { name: 'Right to left' })).toHaveLength(1)
  })

  /*
   * The third panel that reads the language list, and the one that did not
   * guard it.
   *
   * `Properties` passed `api.document.languages` straight into the prop row,
   * where `Binding` maps it to draw one box per language. So the settings tab
   * and the toolbar survived a malformed document and the inspector did not:
   * binding a property to a translation threw during render, and the designer
   * went down at the moment its job was repairing that document.
   *
   * Driven through `Properties` rather than by rendering `Binding` with a bad
   * prop. `Binding` declares `Language[]` and is entitled to believe it; the
   * question is what fills it.
   */
  it.each([
    ['null', [null]],
    ['not an array at all', 'de'],
  ])('draws a translated property when languages are %s', async (_what, languages) => {
    /*
     * The two shapes that actually threw: `languageTag(null)` reads `.dialect`
     * off null, and a `languages` that is not an array has no `.map`. Restoring
     * the raw read fails both.
     */
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
     * Controls, and worth saying so: these two pass with the raw read as well.
     * `Binding` labels each box `nameOf(language) || tag`, which was written for
     * a nameless language and absorbs an unreadable one for free.
     *
     * They are here because they are the shapes somebody would assume this
     * guard is for, and a reader who assumes that and deletes the guard should
     * find out from the rows above rather than from a bug report. What these
     * pin is that the guarded list drops the junk entry rather than drawing an
     * unnamed box beside the real one.
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
    /*
     * The heading read `doc.languages.length`, so a document with three entries
     * and one usable one said "3" over a list of one -- which reads as a panel
     * that lost something, and sends somebody looking for the two rows it did
     * not draw.
     */
    const view = junk([{}, null, { code: 'en', dialect: 'US', name: 'English', bidi: 'ltr' }])
    await view.openTab('Settings')

    expect(screen.getByText('Languages').textContent).toContain('1')
  })

  it.each([
    ['not an array at all', 'en'],
    ['a number', 5],
    ['null', null],
  ])('opens the settings tab when languages is %s', async (_what, languages) => {
    /*
     * The Remove button read `doc.languages.length` for its `disabled`, three
     * lines after the filter added to survive a malformed document -- so a
     * `languages` that is not an array threw during render, in the panel that
     * exists to survive exactly that.
     *
     * `Array.isArray` in the filter answers `[]`, so the panel draws nothing
     * and stays up. Which is the right answer: a document with no readable
     * languages has none to show.
     */
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
    /*
     * `isLanguage` is written `language is Language`, which is a promise to the
     * compiler, and checking `code` alone made it a false one: `{ code: 'en' }`
     * went on as a `Language`, the toolbar rendered `entry.name` as nothing,
     * and `api.setLanguages` -- typed `Language[]` -- took it back. After that
     * the compiler has no reason to question `.name` or `.bidi` anywhere
     * downstream, which is worse than having no predicate.
     *
     * The dialect case is the one with a recorded history: `{"code":"en",
     * "dialect":5}` builds the tag `en-5`, which `findLanguage` matches against
     * nothing, and `languageTag`'s own docblock in core records fixing exactly
     * that once already.
     */
    const view = junk([entry, { code: 'fr', name: 'French', bidi: 'ltr' }])
    await view.openTab('Settings')

    // Only the real one is drawn.
    expect(screen.getAllByRole('checkbox', { name: 'Right to left' })).toHaveLength(1)
  })

  it('refuses to remove the last language it can draw', async () => {
    /*
     * The Remove button read `doc.languages.length`, so a document with one
     * usable language and one unusable one counted two and offered to remove
     * the only one there is -- leaving a document whose every translation
     * renders as its raw key, which is the state the button is disabled to
     * prevent.
     *
     * Not a crash: the row that reads it only renders when `doc.languages` is
     * an array, so the raw read never threw. It was simply counting something
     * other than what the panel had drawn.
     */
    const view = junk([{}, { code: 'en', dialect: 'US', name: 'English', bidi: 'ltr' }])
    await view.openTab('Settings')

    const remove = screen.getByRole('button', { name: /^Remove / })
    expect(remove.hasAttribute('disabled'), 'the only drawable language can still be removed').toBe(
      true,
    )
  })

  it('leaves an entry it cannot draw in the document', async () => {
    /*
     * Dropped from the panel, never from the document. Opening a tab must not
     * delete data, and "the panel ignores it" and "the panel ate it" look the
     * same from the tab.
     */
    const view = junk([{}, { code: 'en', dialect: 'US', name: 'English', bidi: 'ltr' }])
    await view.openTab('Settings')

    expect(view.latest().languages).toEqual([
      {},
      { code: 'en', dialect: 'US', name: 'English', bidi: 'ltr' },
    ])
  })
})
