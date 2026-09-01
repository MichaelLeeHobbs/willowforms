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

import { createEvent, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { autoValidateKeys } from '@formsmith/core'
import type { ComponentNode, FormDocument, Kit, ValidationRule } from '@formsmith/core'
import type { NodeRendererProps, RendererKit } from '@formsmith/renderer'

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

  // The structure tree is behind a tab in the left pane. Opened here so every
  // test starts where it used to, rather than repeating the click in each.
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

/** The schema on one field, read back out of the document. */
function schemaOf(doc: FormDocument, key: string): ComponentNode['schema'] {
  return doc.root.children?.find((c) => c.key === key)?.schema
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

  it('leaves focus alone when the strip has nowhere to go', () => {
    /*
     * `preventDefault` used to run before the one-tab check, so on a strip with
     * a single tab the four navigation keys were swallowed and did nothing at
     * all -- Home and End included, which anywhere else on the page scroll. A
     * component that takes a key and declines to act on it has to give it back.
     *
     * The JSON dialog's strip has two tabs and the inspector has three, so the
     * one-tab case is checked through `Tabs` itself.
     */
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
    /*
     * The one control on this tab with no test anywhere, and it decides which
     * errors somebody sees before they press anything: `autoValidateKeys` reads
     * it, the renderer asks that set which fields validate on every keystroke.
     * It was written by this tab and read by nothing at all for the whole of
     * the tab's life, which is the reason to pin both ends of it.
     */
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
    // Committed on blur, because the box holds a draft: written straight
    // through, clearing it would have stored `Number('') === 0`.
    await user.tab()

    expect(rulesOf(latest(), 'email')).toEqual([{ key: 'minLength', value: 8 }])
  })

  it('leaves the rule alone while the box is empty', async () => {
    /*
     * `Number('')` is `0`, so backspacing the last digit used to set
     * `minLength` to zero -- a rule that passes everything, written by somebody
     * in the middle of typing a different number.
     */
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
    // The `pattern` editor had no test: it is the one parameter that is a
    // string, so a row that reused the numeric input would have stored
    // `Number('^a')` -- `NaN` -- and refused every value silently.
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
    /*
     * The other untested editor, and the one whose failure is quietest: with no
     * evaluator injected a `custom` rule passes, so a form that looks guarded is
     * not. The panel says so beside the box, which is why the text matters as
     * much as the write.
     */
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

/**
 * A repeater on this tab, which the fixture could not produce.
 *
 * `repeats` is `schema.type === 'array'` plus children, and the only data-bound
 * component the fixture kit offers is a childless `Field` with `dataType:
 * 'string'` -- so `repeats` was `false` in every test in this file, the
 * `aria-describedby` wiring never fired, and the note never rendered. That
 * makes the Data type select the most dangerous control on the tab and the
 * least covered one: changing it away from `array` stops the subtree repeating
 * and makes every `scope: 'row'` condition inside read nothing.
 */
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

    expect(note, 'the select points at no explanation').toBe('fs-field-type-note')
    expect(window.document.getElementById(note ?? '')?.textContent).toMatch(/once per row/)
  })

  it('says nothing of the kind on a field that does not repeat', async () => {
    // The control. A note shown always is a note nobody reads, and it would
    // make the assertion above true for a component it is wrong about.
    const { selectRow, openRules } = setup([], withRepeater())
    await selectRow('email')
    await openRules()

    expect(screen.getByLabelText('Data type').getAttribute('aria-describedby')).toBeNull()
    expect(screen.queryByText(/once per row/)).toBeNull()
  })

  it('still changes the type when asked', async () => {
    // And the control for the control: the select has to work on a repeater,
    // warning or not. This is the edit the note is warning about.
    const { user, selectRow, openRules, latest } = setup([], withRepeater())
    await selectRow('addressList')
    await openRules()

    await user.selectOptions(screen.getByLabelText('Data type'), 'string')

    expect(schemaOf(latest(), 'addressList')?.type).toBe('string')
  })
})

/**
 * A document nobody gated, opened on this tab.
 *
 * `Rules.tsx` reads `Array.isArray(schema.validations) ? ... : []` because a
 * pasted `"schema": {"type":"string"}` took the whole designer down the moment
 * this tab was opened -- and the fixture always passed an array, so the guard
 * could be deleted with nothing red. The condition editor has a fifteen-case
 * describe for the same hardening; this tab had none.
 */
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
     * An *array* whose entries are junk, which this table did not have -- so it
     * blessed `Array.isArray(schema.validations)` as a sufficient guard when it
     * is not. Such a list passes that check and crashes one line later at
     * `new Set(rules.map((r) => r.key))`.
     *
     * `validateDocument` does reject these entries, and `store.ts` only *warns*
     * for a host-supplied `initialDocument` -- which is exactly the path this
     * describe's own docblock says is ungated, and the one a restored document
     * takes.
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

    // The tab is the place somebody goes to repair such a document, so it has
    // to draw its controls rather than take the designer down.
    expect(screen.getByLabelText('Data type')).toBeTruthy()
    expect(screen.getByLabelText('Add a rule')).toBeTruthy()
  })

  it('still draws the rules a well-formed document has', async () => {
    /*
     * The control. Filtering every entry out would pass every row above while
     * emptying the panel for every real document.
     */
    const { selectRow, openRules } = setup([], malformed([{ key: 'required' }]))
    await selectRow('email')
    await openRules()

    expect(screen.getAllByRole('button', { name: /^Remove/ }).length).toBeGreaterThan(0)
  })

  it('keeps the real rule in a list that also holds junk', async () => {
    /*
     * The half that says the filter is a filter rather than an early return: a
     * list of one real rule plus junk draws the same rules as that rule alone.
     *
     * Counted as a comparison rather than against a literal, because the panel
     * draws Remove buttons for things other than rules and pinning a number
     * would be pinning the panel's whole shape.
     */
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

  it('adds a rule to a schema whose validations were not a list', async () => {
    const { user, selectRow, openRules, latest } = setup([], malformed('required'))
    await selectRow('email')
    await openRules()

    await user.selectOptions(screen.getByLabelText('Add a rule'), 'required')

    // Repaired, not appended to: whatever was there was not rules.
    expect(rulesOf(latest(), 'email')).toEqual([{ key: 'required' }])
  })
})

/**
 * A rule's number, after the document moves underneath it.
 *
 * `NumberField` holds a draft and re-reads the value when the document changes
 * -- undo, redo, a JSON swap -- and no test in this file ever entered that
 * block: every case either committed and then matched, or cleared without
 * committing, or reverted through `commit` itself. With the re-sync deleted the
 * box keeps showing `8` while the document holds `3`, and the next blur writes
 * `8` back, which is the undo-reversal the data key field has its own describe
 * for.
 */
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
    // The failure that makes it worth fixing: the box kept the old number, and
    // blurring it committed that number, so the undo undid itself.
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
