/**
 * @vitest-environment jsdom
 */

import { createEvent, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { autoValidateKeys } from '@willowforms/core'
import type { ComponentNode, FormDocument, Kit, ValidationRule } from '@willowforms/core'
import type { NodeRendererProps, RendererKit } from '@willowforms/renderer'

import { Designer } from '../Designer.js'
import { Tabs } from './Tabs.js'

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
    // `en-US`, as `createDocument` ships: a dialect-free fixture hides tag and
    // code mix-ups (write-tests skill, Trap 5).
    languages: [{ code: 'en', dialect: 'US', name: 'English', bidi: 'ltr' }],
    defaultLanguage: 'en-US',
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

function setup(validations: ValidationRule[] = [], document?: FormDocument): Harness {
  const user = userEvent.setup()
  let current = document ?? makeDocument(validations)
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

  const selectRow = async (key: string): Promise<void> => {
    const row = view.container.querySelector<HTMLElement>(`[data-fs-tree-row="${key}"]`)
    if (!row) throw new Error(`no tree row for ${key}`)
    await user.click(row)
  }
  const openRules = async (): Promise<void> => {
    await user.click(screen.getByRole('tab', { name: 'Rules' }))
  }

  return { user, view, latest: () => current, selectRow, openRules }
}

function schemaOf(doc: FormDocument, key: string): ComponentNode['schema'] {
  return doc.root.children?.find((c) => c.key === key)?.schema
}

function rulesOf(doc: FormDocument, key: string): ValidationRule[] {
  return doc.root.children?.find((c) => c.key === key)?.schema?.validations ?? []
}

describe('inspector tabs', () => {
  it('exposes a real tablist with linked panels', () => {
    const { view } = setup()

    const tablist = screen.getByRole('tablist', { name: 'Component inspector' })
    const tabs = within(tablist).getAllByRole('tab')
    expect(tabs.map((t) => t.textContent)).toEqual(['Properties', 'Style', 'Actions', 'Rules'])

    const selected = tabs.find((t) => t.getAttribute('aria-selected') === 'true')
    expect(selected?.textContent).toBe('Properties')

    // Scoped to the inspector: the left pane is a tablist too, and its panel
    // comes first in the DOM.
    const panel = view.container.querySelector('.fs-inspector [role="tabpanel"]')
    expect(panel?.getAttribute('aria-labelledby')).toBe(selected?.id)
    expect(selected?.getAttribute('aria-controls')).toBe(panel?.id)
  })

  it('never points a tab at a panel that is not rendered', () => {
    const { view } = setup()

    // axe does not flag an unresolved `aria-controls` on an unselected tab, so only
    // this catches it.
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
    expect(tabs.map((t) => t.getAttribute('tabindex'))).toEqual(['0', '-1', '-1', '-1'])
  })

  it('moves between tabs with the arrow keys', async () => {
    const { user } = setup()

    const focused = (): string | null | undefined => document.activeElement?.textContent

    await user.click(screen.getByRole('tab', { name: 'Properties' }))
    await user.keyboard('{ArrowRight}')
    expect(focused()).toBe('Style')
    expect(screen.getByRole('tab', { name: 'Style' }).getAttribute('aria-selected')).toBe('true')

    await user.keyboard('{ArrowRight}')
    expect(focused()).toBe('Actions')

    await user.keyboard('{ArrowRight}')
    expect(focused()).toBe('Rules')

    await user.keyboard('{ArrowRight}')
    expect(focused()).toBe('Properties')
    await user.keyboard('{ArrowLeft}')
    expect(focused()).toBe('Rules')

    await user.keyboard('{Home}')
    expect(focused()).toBe('Properties')
    await user.keyboard('{End}')
    expect(focused()).toBe('Rules')
  })

  it('leaves focus alone when the strip has nowhere to go', () => {
    // A one-tab strip has nowhere to move focus, so it must leave the keys to the page.
    // No strip in the designer has one tab, so this drives `Tabs` itself.
    const onSelect = vi.fn()
    render(
      <Tabs
        label="One thing"
        tabs={[{ id: 'only', label: 'Only' }]}
        active="only"
        onSelect={onSelect}
      >
        <p>panel</p>
      </Tabs>,
    )

    const only = screen.getByRole('tab', { name: 'Only' })
    only.focus()

    const event = createEvent.keyDown(only, { key: 'End' })
    fireEvent(only, event)

    expect(event.defaultPrevented, 'the key was swallowed with nowhere to go').toBe(false)
    expect(onSelect).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(only)
  })
})

describe('rules editor', () => {
  it('says a component holding no data has nothing to validate', async () => {
    const { selectRow, openRules } = setup()

    await selectRow('note')
    await openRules()

    expect(screen.getByText(/holds no form data/)).toBeTruthy()
  })

  it('writes "Validate while typing" onto the field it belongs to', async () => {
    // Both ends: this tab writes the flag and `autoValidateKeys` reads it.
    const { user, selectRow, openRules, latest } = setup()

    await selectRow('email')
    await openRules()
    const box = screen.getByLabelText('Validate while typing')
    expect(box).toHaveProperty('checked', false)

    await user.click(box)

    expect(schemaOf(latest(), 'email')?.autoValidate).toBe(true)
    expect(autoValidateKeys(latest().root)).toEqual(new Set(['email']))
  })

  it('turns it off again, rather than only ever on', async () => {
    const { user, selectRow, openRules, latest } = setup()

    await selectRow('email')
    await openRules()
    const box = screen.getByLabelText('Validate while typing')
    await user.click(box)
    await user.click(box)

    expect(schemaOf(latest(), 'email')?.autoValidate).toBe(false)
    expect(autoValidateKeys(latest().root)).toEqual(new Set())
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
    await user.tab()

    expect(rulesOf(latest(), 'email')).toEqual([{ key: 'minLength', value: 8 }])
  })

  it('leaves the rule alone while the box is empty', async () => {
    const { user, selectRow, openRules, latest } = setup([{ key: 'minLength', value: 3 }])

    await selectRow('email')
    await openRules()
    await user.clear(screen.getByLabelText('Value'))

    expect(screen.getByLabelText('Value')).toHaveProperty('value', '')
    expect(rulesOf(latest(), 'email')).toEqual([{ key: 'minLength', value: 3 }])
  })

  it('puts the stored number back when an empty box is left', async () => {
    const { user, selectRow, openRules, latest } = setup([{ key: 'minLength', value: 3 }])

    await selectRow('email')
    await openRules()
    await user.clear(screen.getByLabelText('Value'))
    await user.tab()

    expect(screen.getByLabelText('Value')).toHaveProperty('value', '3')
    expect(rulesOf(latest(), 'email')).toEqual([{ key: 'minLength', value: 3 }])
  })

  it('edits a pattern, which is text rather than a number', async () => {
    const { user, selectRow, openRules, latest } = setup()

    await selectRow('email')
    await openRules()
    await user.selectOptions(screen.getByLabelText('Add a rule'), 'pattern')
    const box = screen.getByLabelText(/regular expression|Value/i)
    await user.clear(box)
    // `fill`-style typing: userEvent reads `[` and `{` as keyboard descriptors,
    // and a regular expression is mostly those.
    fireEvent.change(box, { target: { value: '^[A-Z]{3}$' } })

    expect(rulesOf(latest(), 'email')).toEqual([{ key: 'pattern', value: '^[A-Z]{3}$' }])
  })

  it('edits a custom rule expression, and says it needs an evaluator', async () => {
    // The hint matters as much as the write: with no evaluator injected, a
    // `custom` rule passes.
    const { user, selectRow, openRules, latest } = setup()

    await selectRow('email')
    await openRules()
    await user.selectOptions(screen.getByLabelText('Add a rule'), 'custom')
    // The box, not the hint beside it that also says "expression".
    const box = screen.getByRole('textbox', { name: /expression/i })
    await user.type(box, 'value.length > 2')

    expect(rulesOf(latest(), 'email')).toEqual([{ key: 'custom', expression: 'value.length > 2' }])
    expect(screen.getByText(/evaluator/i)).toBeTruthy()
  })

  it('authors a structured guard for a rule', async () => {
    const { user, selectRow, openRules, latest } = setup([{ key: 'required' }])

    await selectRow('email')
    await openRules()
    await user.selectOptions(screen.getByLabelText('Apply when'), 'condition')

    expect(rulesOf(latest(), 'email')).toEqual([
      {
        key: 'required',
        when: {
          kind: 'condition',
          condition: { op: 'truthy', value: { kind: 'ref', dataKey: 'email' } },
        },
      },
    ])
    expect(screen.getByLabelText('Comparison')).toBeTruthy()
  })

  it('authors and removes an expression guard', async () => {
    const { user, selectRow, openRules, latest } = setup([{ key: 'required' }])

    await selectRow('email')
    await openRules()
    await user.selectOptions(screen.getByLabelText('Apply when'), 'computed')
    await user.type(screen.getByLabelText('Guard expression'), 'data.optedIn')

    expect(rulesOf(latest(), 'email')[0]?.when).toEqual({
      kind: 'computed',
      expression: 'data.optedIn',
    })

    await user.selectOptions(screen.getByLabelText('Apply when'), 'always')
    expect(rulesOf(latest(), 'email')).toEqual([{ key: 'required' }])
  })

  it('authors a cross-field comparison from document data keys', async () => {
    const document = makeDocument()
    document.root.children?.unshift({
      key: 'password',
      type: 'Field',
      props: {},
      schema: { type: 'string' },
    })
    const { user, selectRow, openRules, latest } = setup([], document)

    await selectRow('email')
    await openRules()
    await user.selectOptions(screen.getByLabelText('Add a rule'), 'matches')
    await user.selectOptions(screen.getByLabelText('Compare with'), 'form:password')

    expect(rulesOf(latest(), 'email')).toEqual([{ key: 'matches', field: 'password' }])
  })

  it('drops the message key rather than storing an empty string', async () => {
    const { user, selectRow, openRules, latest } = setup([{ key: 'required', message: 'Needed' }])

    await selectRow('email')
    await openRules()
    await user.clear(screen.getByLabelText('Custom message'))

    expect(rulesOf(latest(), 'email')).toEqual([{ key: 'required' }])
  })

  it('authors a translated validation message', async () => {
    const { user, selectRow, openRules, latest } = setup([{ key: 'required' }])

    await selectRow('email')
    await openRules()
    await user.selectOptions(screen.getByLabelText('Message'), 'i18n')
    await user.type(screen.getByLabelText('English'), 'Email is required')

    expect(rulesOf(latest(), 'email')).toEqual([
      { key: 'required', message: { kind: 'i18n', key: 'email_required_message' } },
    ])
    expect(latest().translations['en-US']).toEqual({
      email_required_message: 'Email is required',
    })
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

// The fixture kit has no repeater, so `withRepeater` builds one: an `array`
// schema with children.
describe('the data type of a component that repeats', () => {
  const withRepeater = (): FormDocument => {
    const base = makeDocument()
    return {
      ...base,
      root: {
        ...base.root,
        children: [
          {
            key: 'addressList',
            type: 'Field',
            props: {},
            schema: { type: 'array', validations: [] },
            children: [{ key: 'street', type: 'Field', props: {} }],
          },
          ...(base.root.children ?? []),
        ],
      },
    }
  }

  it('warns that changing it stops the rows repeating', async () => {
    const { selectRow, openRules } = setup([], withRepeater())
    await selectRow('addressList')
    await openRules()

    const select = screen.getByLabelText('Data type')
    const note = select.getAttribute('aria-describedby')

    expect(note, 'the select points at no explanation').toMatch(/fs-field-type-note$/)
    expect(window.document.getElementById(note ?? '')?.textContent).toMatch(/once per row/)
  })

  it('says nothing of the kind on a field that does not repeat', async () => {
    // The control: a note shown always would pass the test above.
    const { selectRow, openRules } = setup([], withRepeater())
    await selectRow('email')
    await openRules()

    expect(screen.getByLabelText('Data type').getAttribute('aria-describedby')).toBeNull()
    expect(screen.queryByText(/once per row/)).toBeNull()
  })

  it('still changes the type when asked', async () => {
    const { user, selectRow, openRules, latest } = setup([], withRepeater())
    await selectRow('addressList')
    await openRules()

    await user.selectOptions(screen.getByLabelText('Data type'), 'string')

    expect(schemaOf(latest(), 'addressList')?.type).toBe('string')
  })
})

describe('a schema a paste can produce', () => {
  const malformed = (validations: unknown): FormDocument => {
    const base = makeDocument()
    return {
      ...base,
      root: {
        ...base.root,
        children: [
          {
            key: 'email',
            type: 'Field',
            props: {},
            schema: { type: 'string', validations },
          } as unknown as ComponentNode,
        ],
      },
    }
  }

  it.each([
    ['missing entirely', undefined],
    ['an object', { required: true }],
    ['a string', 'required'],
    ['a number', 5],
    ['null', null],
    /*
     * Arrays of junk pass `Array.isArray` but are not rules. `validateDocument`
     * rejects them, but `store.ts` only warns for a host's `initialDocument`.
     */
    ['a list holding null', [null]],
    ['a list holding a string', ['required']],
    ['a list holding a number', [5]],
    ['a list holding an object with no key', [{ message: 'nope' }]],
    ['a list mixing a real rule with junk', [{ key: 'required' }, null]],
  ])('opens the tab with validations %s', async (_what, validations) => {
    const { selectRow, openRules } = setup([], malformed(validations))
    await selectRow('email')
    await openRules()

    expect(screen.getByLabelText('Data type')).toBeTruthy()
    expect(screen.getByLabelText('Add a rule')).toBeTruthy()
  })

  it('still draws the rules a well-formed document has', async () => {
    // The control: dropping every entry would pass the rows above.
    const { selectRow, openRules } = setup([], malformed([{ key: 'required' }]))
    await selectRow('email')
    await openRules()

    expect(screen.getAllByRole('button', { name: /^Remove/ }).length).toBeGreaterThan(0)
  })

  it('keeps the real rule in a list that also holds junk', async () => {
    // Compared with the clean count, not a literal, so the panel's shape is not
    // pinned.
    const drawn = async (validations: unknown): Promise<number> => {
      const view = setup([], malformed(validations))
      await view.selectRow('email')
      await view.openRules()
      const count = view.view.container.querySelectorAll('.fs-rule').length
      view.view.unmount()
      return count
    }

    const clean = await drawn([{ key: 'required' }])
    expect(clean, 'no rule row was drawn at all, so this proves nothing').toBeGreaterThan(0)
    expect(await drawn([null, { key: 'required' }, 5])).toBe(clean)
  })

  it.each([
    ['a pattern whose value is null', { key: 'pattern', value: null }],
    ['a pattern whose value is a number', { key: 'pattern', value: 5 }],
    ['a pattern whose value is a list', { key: 'pattern', value: [] }],
    ['a key nothing recognises', { key: 'requird' }],
    ['a key that is a number', { key: 5 }],
  ])('opens the tab for a schema holding %s', async (_what, rule) => {
    /*
     * `patternProblem` reads `.length`, so a non-string pattern throws. An
     * unknown key is one `validateForm` refuses with `UNREADABLE_RULE`.
     */
    const view = setup([], malformed([rule, { key: 'required' }]))
    await view.selectRow('email')
    await view.openRules()

    expect(view.view.container.querySelectorAll('.fs-rule').length).toBe(1)
  })

  it('leaves a rule it cannot draw in the document', async () => {
    const { selectRow, openRules, latest } = setup(
      [],
      malformed([{ key: 'pattern', value: null }, { key: 'required' }]),
    )
    await selectRow('email')
    await openRules()

    expect(rulesOf(latest(), 'email')).toEqual([
      { key: 'pattern', value: null },
      { key: 'required' },
    ])
  })

  it('adds a rule to a schema whose validations were not a list', async () => {
    const { user, selectRow, openRules, latest } = setup([], malformed('required'))
    await selectRow('email')
    await openRules()

    await user.selectOptions(screen.getByLabelText('Add a rule'), 'required')

    // Repaired, not appended to: whatever was there was not rules.
    expect(rulesOf(latest(), 'email')).toEqual([{ key: 'required' }])
  })
})

describe('a rule number and undo', () => {
  const box = (): HTMLInputElement => screen.getByLabelText<HTMLInputElement>('Value')

  it('shows the number the document holds after an undo', async () => {
    const { user, selectRow, openRules, latest } = setup([{ key: 'minLength', value: 3 }])
    await selectRow('email')
    await openRules()

    await user.clear(box())
    await user.type(box(), '8')
    await user.tab()
    expect(rulesOf(latest(), 'email')).toEqual([{ key: 'minLength', value: 8 }])

    await user.click(screen.getByRole('button', { name: 'Undo' }))

    expect(rulesOf(latest(), 'email')).toEqual([{ key: 'minLength', value: 3 }])
    expect(box()).toHaveProperty('value', '3')
  })

  it('does not write the stale number back on the next blur', async () => {
    const { user, selectRow, openRules, latest } = setup([{ key: 'minLength', value: 3 }])
    await selectRow('email')
    await openRules()

    await user.clear(box())
    await user.type(box(), '8')
    await user.tab()

    await user.click(screen.getByRole('button', { name: 'Undo' }))
    await user.click(box())
    await user.tab()

    expect(rulesOf(latest(), 'email')).toEqual([{ key: 'minLength', value: 3 }])
  })
})
