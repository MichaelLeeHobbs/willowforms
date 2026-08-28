/**
 * @vitest-environment jsdom
 */

/**
 * The rules editor and the inspector tabs.
 *
 * None of this needs layout, so unlike the canvas it is fully testable here.
 * The tab assertions are deliberate: the product studied in docs/prior-art ships
 * tab strips with no `role="tablist"`, and the whole point of doing it properly
 * is lost if nobody checks it stays that way.
 */

import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import type { ReactNode } from 'react'
import type { FormDocument, Kit, ValidationRule } from '@formsmith/core'
import type { NodeRendererProps, RendererKit } from '@formsmith/renderer'

import { Designer } from '../Designer.js'

function Screen_({ nodeProps, children }: NodeRendererProps): ReactNode {
  return <div {...nodeProps}>{children}</div>
}

function Field({ nodeProps, props }: NodeRendererProps): ReactNode {
  return <div {...nodeProps}>{typeof props['label'] === 'string' ? props['label'] : ''}</div>
}

const rendererKit: RendererKit = { id: 'fake', renderers: { Screen: Screen_, Field, Note: Field } }

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
    {
      type: 'Note',
      label: 'Note',
      group: 'display',
      defaultProps: {},
      props: [{ name: 'label', label: 'Text', editor: 'string' }],
      events: [],
    },
  ],
}

function makeDocument(validations: ValidationRule[] = []): FormDocument {
  return {
    version: '1',
    id: 'doc',
    name: 'Test form',
    root: {
      key: 'root',
      type: 'Screen',
      props: {},
      children: [
        { key: 'email', type: 'Field', props: {}, schema: { type: 'string', validations } },
        { key: 'note', type: 'Note', props: {} },
      ],
    },
    actions: {},
    languages: [{ code: 'en', name: 'English', bidi: 'ltr' }],
    defaultLanguage: 'en',
    translations: {},
    settings: {},
  }
}

interface Harness {
  user: ReturnType<typeof userEvent.setup>
  view: ReturnType<typeof render>
  latest: () => FormDocument
  selectRow: (key: string) => Promise<void>
  openRules: () => Promise<void>
}

function setup(validations: ValidationRule[] = []): Harness {
  const user = userEvent.setup()
  let current = makeDocument(validations)
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

  const selectRow = async (key: string): Promise<void> => {
    const row = view.container.querySelector<HTMLElement>(`[data-fs-row="${key}"]`)
    if (!row) throw new Error(`no tree row for ${key}`)
    await user.click(row)
  }
  const openRules = async (): Promise<void> => {
    await user.click(screen.getByRole('tab', { name: 'Rules' }))
  }

  return { user, view, latest: () => current, selectRow, openRules }
}

/** The rules on the selected field, read back out of the document. */
function rulesOf(doc: FormDocument, key: string): ValidationRule[] {
  return doc.root.children?.find((c) => c.key === key)?.schema?.validations ?? []
}

describe('inspector tabs', () => {
  it('exposes a real tablist with linked panels', () => {
    const { view } = setup()

    const tablist = screen.getByRole('tablist', { name: 'Component inspector' })
    const tabs = within(tablist).getAllByRole('tab')
    // Form settings moved to the left pane: it belongs to the document, not to
    // whatever is selected.
    expect(tabs.map((t) => t.textContent)).toEqual(['Properties', 'Style', 'Rules'])

    const selected = tabs.find((t) => t.getAttribute('aria-selected') === 'true')
    expect(selected?.textContent).toBe('Properties')

    // The panel points back at the tab that controls it, in both directions.
    // Scoped to the inspector: the left pane is a tablist too, and its panel
    // comes first in the DOM.
    const panel = view.container.querySelector('.fs-inspector [role="tabpanel"]')
    expect(panel?.getAttribute('aria-labelledby')).toBe(selected?.id)
    expect(selected?.getAttribute('aria-controls')).toBe(panel?.id)
  })

  it('never points a tab at a panel that is not rendered', () => {
    const { view } = setup()

    // Only the selected panel is in the DOM. Every tab used to claim one, so
    // two of the three named an id nothing resolved to. An unresolved IDREF is
    // not an axe violation, which is how this survived an accessibility suite.
    // Named: the left pane is a tablist too now.
    const tablist = screen.getByRole('tablist', { name: 'Component inspector' })
    for (const tab of within(tablist).getAllByRole('tab')) {
      const controls = tab.getAttribute('aria-controls')
      if (controls === null) continue
      expect(
        view.container.querySelector('[id="' + controls + '"]'),
        `the ${tab.textContent} tab controls #${controls}, which is not in the DOM`,
      ).not.toBeNull()
    }
  })

  it('keeps exactly one tab in the tab order', () => {
    setup()
    const tablist = screen.getByRole('tablist', { name: 'Component inspector' })
    const tabs = within(tablist).getAllByRole('tab')
    expect(tabs.map((t) => t.getAttribute('tabindex'))).toEqual(['0', '-1', '-1'])
  })

  it('moves between tabs with the arrow keys', async () => {
    const { user } = setup()

    const focused = (): string | null | undefined => document.activeElement?.textContent

    await user.click(screen.getByRole('tab', { name: 'Properties' }))
    await user.keyboard('{ArrowRight}')
    expect(focused()).toBe('Style')
    expect(screen.getByRole('tab', { name: 'Style' }).getAttribute('aria-selected')).toBe('true')

    await user.keyboard('{ArrowRight}')
    expect(focused()).toBe('Rules')

    // Wraps around rather than stopping at the end.
    await user.keyboard('{ArrowRight}')
    expect(focused()).toBe('Properties')
    await user.keyboard('{ArrowLeft}')
    expect(focused()).toBe('Rules')

    await user.keyboard('{Home}')
    expect(focused()).toBe('Properties')
    await user.keyboard('{End}')
    expect(focused()).toBe('Rules')
  })
})

describe('rules editor', () => {
  it('says a component holding no data has nothing to validate', async () => {
    const { selectRow, openRules } = setup()

    await selectRow('note')
    await openRules()

    expect(screen.getByText(/holds no form data/)).toBeTruthy()
  })

  it('adds a rule to the document', async () => {
    const { user, selectRow, openRules, latest } = setup()

    await selectRow('email')
    await openRules()
    await user.selectOptions(screen.getByLabelText('Add a rule'), 'required')

    expect(rulesOf(latest(), 'email')).toEqual([{ key: 'required' }])
  })

  it('gives a parameterised rule a parameter the type demands', async () => {
    const { user, selectRow, openRules, latest } = setup()

    await selectRow('email')
    await openRules()
    await user.selectOptions(screen.getByLabelText('Add a rule'), 'minLength')

    expect(rulesOf(latest(), 'email')).toEqual([{ key: 'minLength', value: 0 }])
  })

  it('edits a numeric parameter', async () => {
    const { user, selectRow, openRules, latest } = setup([{ key: 'minLength', value: 3 }])

    await selectRow('email')
    await openRules()
    const input = screen.getByLabelText('Value')
    await user.clear(input)
    await user.type(input, '8')

    expect(rulesOf(latest(), 'email')).toEqual([{ key: 'minLength', value: 8 }])
  })

  it('drops the message key rather than storing an empty string', async () => {
    const { user, selectRow, openRules, latest } = setup([{ key: 'required', message: 'Needed' }])

    await selectRow('email')
    await openRules()
    await user.clear(screen.getByLabelText('Message'))

    expect(rulesOf(latest(), 'email')).toEqual([{ key: 'required' }])
  })

  it('removes a rule', async () => {
    const { user, selectRow, openRules, latest } = setup([{ key: 'required' }, { key: 'email' }])

    await selectRow('email')
    await openRules()
    await user.click(screen.getByRole('button', { name: 'Remove Required' }))

    expect(rulesOf(latest(), 'email')).toEqual([{ key: 'email' }])
  })

  it('does not offer a rule that is already applied', async () => {
    const { selectRow, openRules } = setup([{ key: 'required' }])

    await selectRow('email')
    await openRules()

    const options = within(screen.getByLabelText('Add a rule')).getAllByRole('option')
    expect(options.map((o) => o.textContent)).not.toContain('Required')
    // Custom stays available, because more than one custom rule is meaningful.
    expect(options.map((o) => o.textContent)).toContain('Custom expression')
  })

  it('warns that rules other than required pass on an empty value', async () => {
    const { selectRow, openRules } = setup([{ key: 'url' }])

    await selectRow('email')
    await openRules()

    expect(screen.getByText(/stays valid while empty/)).toBeTruthy()
  })

  it('drops the warning once the field is required', async () => {
    const { selectRow, openRules } = setup([{ key: 'url' }, { key: 'required' }])

    await selectRow('email')
    await openRules()

    expect(screen.queryByText(/stays valid while empty/)).toBeNull()
  })

  it('says a custom rule cannot fail without an injected evaluator', async () => {
    const { selectRow, openRules } = setup([{ key: 'custom', expression: 'value.length > 2' }])

    await selectRow('email')
    await openRules()

    expect(screen.getByText(/passes rather than throwing/)).toBeTruthy()
  })

  it('edits the field data type', async () => {
    const { user, selectRow, openRules, latest } = setup()

    await selectRow('email')
    await openRules()
    await user.selectOptions(screen.getByLabelText('Data type'), 'number')

    expect(latest().root.children?.[0]?.schema?.type).toBe('number')
  })

  it('undoes a rule change in one step', async () => {
    const { user, selectRow, openRules, latest } = setup()

    await selectRow('email')
    await openRules()
    await user.selectOptions(screen.getByLabelText('Add a rule'), 'required')
    expect(rulesOf(latest(), 'email')).toHaveLength(1)

    await user.click(screen.getByRole('button', { name: 'Undo' }))

    expect(rulesOf(latest(), 'email')).toEqual([])
  })
})
