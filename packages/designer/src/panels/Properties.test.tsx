/**
 * @vitest-environment jsdom
 */

/**
 * The data key field.
 *
 * A component has two names. The key is identity and has to be unique; the data
 * key is what the payload calls the answer and may repeat. The panel has to keep
 * them separable, and has to stop storing an override the moment it stops
 * meaning anything.
 */

import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import type { ReactNode } from 'react'
import type { ComponentNode, FormDocument, Kit, PropValue } from '@formsmith/core'
import type { NodeRendererProps, RendererKit } from '@formsmith/renderer'

import { Designer } from '../Designer.js'

function Screen_({ nodeProps, children }: NodeRendererProps): ReactNode {
  return <div {...nodeProps}>{children}</div>
}
function Field({ nodeProps }: NodeRendererProps): ReactNode {
  return <div {...nodeProps} />
}

function List({ nodeProps, children }: NodeRendererProps): ReactNode {
  return <div {...nodeProps}>{children}</div>
}

const rendererKit: RendererKit = { id: 'fake', renderers: { Screen: Screen_, Field, List } }

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
      props: [
        { name: 'label', label: 'Label', editor: 'string' },
        { name: 'tint', label: 'Tint', editor: 'color' },
        { name: 'glyph', label: 'Glyph', editor: 'icon' },
        { name: 'script', label: 'Script', editor: 'code' },
        { name: 'notes', label: 'Notes', editor: 'multiline' },
        { name: 'locked', label: 'Locked', editor: 'boolean', conditional: true },
      ],
      events: ['onChange'],
    },
    {
      type: 'Row',
      label: 'Row',
      icon: 'stack',
      group: 'layout',
      container: true,
      defaultProps: {},
      props: [],
      events: [],
    },
    /*
     * A repeater: a container whose data type is `array`, which is what core
     * reads as row scope. It is here so a condition can be authored *inside* a
     * row, which is the only place `scope: 'row'` means anything.
     */
    {
      type: 'List',
      label: 'List',
      icon: 'stack',
      group: 'layout',
      container: true,
      dataBound: true,
      dataType: 'array',
      defaultProps: {},
      props: [],
      events: [],
    },
  ],
}

interface Harness {
  user: ReturnType<typeof userEvent.setup>
  latest: () => ComponentNode | undefined
  select: () => Promise<void>
  /** Select any node in the tree, not only the first child of the root. */
  selectKey: (key: string) => Promise<void>
  /** Any node in the current document, by key. */
  node: (key: string) => ComponentNode | undefined
}

function setup(node: ComponentNode, siblings: ComponentNode[] = []): Harness {
  const user = userEvent.setup()
  let current: FormDocument = {
    version: '1',
    id: 'doc',
    name: 'Contact',
    root: { key: 'root', type: 'Screen', props: {}, children: [node, ...siblings] },
    actions: {},
    languages: [{ code: 'en', name: 'English', bidi: 'ltr' }],
    defaultLanguage: 'en',
    translations: {},
    settings: {},
  }

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

  const clickRow = async (key: string): Promise<void> => {
    const row = view.container.querySelector<HTMLElement>('[data-fs-row="' + key + '"]')
    if (!row) throw new Error('no tree row for ' + key)
    await user.click(row)
  }

  const find = (key: string, from: ComponentNode): ComponentNode | undefined => {
    if (from.key === key) return from
    for (const child of from.children ?? []) {
      const hit = find(key, child)
      if (hit) return hit
    }
    return undefined
  }

  return {
    user,
    latest: (): ComponentNode | undefined => current.root.children?.[0],
    select: (): Promise<void> => clickRow(node.key),
    selectKey: clickRow,
    node: (key: string): ComponentNode | undefined => find(key, current.root),
  }
}

const dataField = (): ComponentNode => ({
  key: 'emailField',
  type: 'Field',
  props: {},
  schema: { type: 'string', validations: [] },
})

describe('the data key field', () => {
  it('shows the component key when nothing overrides it, and stores nothing', async () => {
    const { select, latest } = setup(dataField())
    await select()

    const input = screen.getByLabelText('Data key')
    expect(input).toHaveProperty('value', 'emailField')
    expect(input.getAttribute('placeholder')).toBe('emailField')

    // Displaying the key must not write it: an override that merely repeats the
    // key is a second name to keep in step, and it would survive a rename.
    expect(latest()?.dataKey).toBeUndefined()
  })

  it('stores an override on blur', async () => {
    const { user, select, latest } = setup(dataField())
    await select()

    const input = screen.getByLabelText('Data key')
    await user.clear(input)
    await user.type(input, 'email')
    await user.tab()

    expect(latest()?.dataKey).toBe('email')
    expect(latest()?.key).toBe('emailField')
  })

  it('leaves the component key alone', async () => {
    const { user, select, latest } = setup(dataField())
    await select()

    await user.clear(screen.getByLabelText('Data key'))
    await user.type(screen.getByLabelText('Data key'), 'email')
    await user.tab()

    // Identity is not what was being edited.
    expect(latest()?.key).toBe('emailField')
  })

  it('removes the override when cleared', async () => {
    const { user, select, latest } = setup({ ...dataField(), dataKey: 'email' })
    await select()

    await user.clear(screen.getByLabelText('Data key'))
    await user.tab()

    expect(latest()?.dataKey).toBeUndefined()
  })

  it('removes the override when it is set back to the component key', async () => {
    // Storing a copy of the key is a second thing to keep in step for no gain.
    const { user, select, latest } = setup({ ...dataField(), dataKey: 'email' })
    await select()

    await user.clear(screen.getByLabelText('Data key'))
    await user.type(screen.getByLabelText('Data key'), 'emailField')
    await user.tab()

    expect(latest()?.dataKey).toBeUndefined()
  })

  it('trims what it stores, and shows what it stored', async () => {
    const { user, select, latest } = setup({ ...dataField(), dataKey: 'email' })
    await select()

    const input = screen.getByLabelText('Data key')
    await user.clear(input)
    await user.type(input, '  email  ')
    await user.tab()

    // The padded string is not a different data key, so nothing is written.
    // The field still has to stop displaying it, or the panel shows a value the
    // document does not hold.
    expect(latest()?.dataKey).toBe('email')
    expect(input).toHaveProperty('value', 'email')
  })

  it('trims a genuinely new data key before storing it', async () => {
    const { user, select, latest } = setup(dataField())
    await select()

    const input = screen.getByLabelText('Data key')
    await user.clear(input)
    await user.type(input, '  email  ')
    await user.tab()

    expect(latest()?.dataKey).toBe('email')
    expect(input).toHaveProperty('value', 'email')
  })

  it('says what the component submits when an override is set', async () => {
    const { select } = setup({ ...dataField(), dataKey: 'email' })
    await select()

    expect(screen.getByText(/Submitted as email rather than emailField/)).toBeTruthy()
  })

  it('is absent on a component that holds no form data', async () => {
    const { select } = setup({ key: 'row', type: 'Row', props: {}, children: [] })
    await select()

    // A layout component submits nothing, so naming its answer is meaningless.
    expect(screen.queryByLabelText('Data key')).toBeNull()
  })
})

describe('the colour editor', () => {
  const open = async (): Promise<ReturnType<typeof setup>> => {
    const harness = setup(dataField())
    await harness.select()
    return harness
  }

  it('keeps the text as the value and the swatch as a convenience', async () => {
    /*
     * `<input type="color">` can only hold #rrggbb, and the useful things to
     * write are var(--brand), transparent and rgb(...). A swatch that owned the
     * value would rewrite every one of them to the nearest hex on first touch.
     */
    const { user, latest } = await open()
    const text = screen.getByLabelText('Tint')

    await user.type(text, 'var(--brand)')

    expect(latest()?.props['tint']).toEqual({ kind: 'static', value: 'var(--brand)' })
  })

  it('shows black in the swatch for a value it cannot represent', async () => {
    const { user } = await open()
    await user.type(screen.getByLabelText('Tint'), 'transparent')

    const swatch = screen.getByLabelText('Pick a colour')
    expect(swatch).toHaveProperty('value', '#000000')
  })

  it('names the swatch, since the row label belongs to the text field', async () => {
    await open()
    expect(screen.getByLabelText('Pick a colour')).toBeTruthy()
  })
})

describe('the icon editor', () => {
  it('offers the vocabulary and stores a name', async () => {
    const harness = setup(dataField())
    await harness.select()

    const select = screen.getByLabelText('Glyph')
    await harness.user.selectOptions(select, 'checkbox')

    expect(harness.latest()?.props['glyph']).toEqual({ kind: 'static', value: 'checkbox' })
  })

  it('previews the chosen glyph, and nothing for an unknown name', async () => {
    const harness = setup({
      ...dataField(),
      props: { glyph: { kind: 'static', value: 'not-an-icon' } },
    })
    await harness.select()

    // An unrecognised name is what a hand-edited document produces. It must not
    // crash, and it must not draw something arbitrary.
    const preview = document.querySelector('.fs-icon-picker__preview')
    expect(preview?.querySelector('svg')).toBeNull()

    // A property with a value set says so inside its own label, for a screen
    // reader. /Glyph/ would also match the binding mode picker beside it.
    await harness.user.selectOptions(screen.getByLabelText('Glyph (modified)'), 'text')
    expect(document.querySelector('.fs-icon-picker__preview svg')).not.toBeNull()
  })
})

describe('the code editor', () => {
  it('counts its lines', async () => {
    const harness = setup(dataField())
    await harness.select()

    const area = screen.getByLabelText('Script')
    expect(screen.getByText('0 lines')).toBeTruthy()

    await harness.user.type(area, 'a')
    expect(screen.getByText('1 line')).toBeTruthy()
  })

  it('stores what was typed', async () => {
    const harness = setup(dataField())
    await harness.select()

    await harness.user.type(screen.getByLabelText('Script'), 'return 1')

    expect(harness.latest()?.props['script']).toEqual({ kind: 'static', value: 'return 1' })
  })
})

describe('the multiline editor', () => {
  it('is a textarea, not a one-line box', async () => {
    // Declared in PropEditor from the first commit and unimplemented until
    // Text wanted one, so a kit asking for it got the single-line fallback.
    const harness = setup(dataField())
    await harness.select()

    expect(screen.getByLabelText('Notes').tagName).toBe('TEXTAREA')
  })
})

describe('the visibility row', () => {
  /** A document with two data-bound fields, so one can test the other. */
  const pair = (): ComponentNode => ({
    key: 'website',
    type: 'Field',
    props: {},
    schema: { type: 'string', validations: [] },
  })

  const withSibling = async (): Promise<Harness> => {
    const harness = setup(pair(), [
      { key: 'firstName', type: 'Field', props: {}, schema: { type: 'string', validations: [] } },
    ])
    await harness.select()
    return harness
  }

  it('starts at Always, which is what an absent renderWhen means', async () => {
    const harness = await withSibling()

    expect(screen.getByLabelText('Show when')).toHaveProperty('value', 'always')
    expect(harness.latest()?.renderWhen).toBeUndefined()
  })

  it('builds a condition against another field', async () => {
    const harness = await withSibling()

    await harness.user.selectOptions(screen.getByLabelText('Show when'), 'condition')

    expect(harness.latest()?.renderWhen).toEqual({
      kind: 'condition',
      condition: { op: 'truthy', value: { kind: 'ref', dataKey: 'firstName' } },
    })
  })

  it('edits the operator through the picker', async () => {
    const harness = await withSibling()
    await harness.user.selectOptions(screen.getByLabelText('Show when'), 'condition')

    await harness.user.selectOptions(screen.getByLabelText('Comparison'), 'empty')

    expect(harness.latest()?.renderWhen).toEqual({
      kind: 'condition',
      condition: { op: 'empty', value: { kind: 'ref', dataKey: 'firstName' } },
    })
  })

  it('removes renderWhen when set back to Always', async () => {
    // Absent is not the same as a condition that is false: absent means shown.
    const harness = await withSibling()
    await harness.user.selectOptions(screen.getByLabelText('Show when'), 'condition')
    expect(harness.latest()?.renderWhen).toBeDefined()

    await harness.user.selectOptions(screen.getByLabelText('Show when'), 'always')

    expect(harness.latest()?.renderWhen).toBeUndefined()
  })

  it('switches to an expression for what a condition cannot say', async () => {
    const harness = await withSibling()

    await harness.user.selectOptions(screen.getByLabelText('Show when'), 'computed')

    expect(harness.latest()?.renderWhen).toEqual({ kind: 'computed', expression: '' })
  })

  it('refuses a condition when there is no other field to test', async () => {
    /*
     * A condition naming no field evaluates to false, so offering it here would
     * hide the component the moment it was chosen and give the author no field
     * that could bring it back.
     */
    const harness = setup(pair())
    await harness.select()

    const option = screen
      .getByLabelText('Show when')
      .querySelector<HTMLOptionElement>('option[value="condition"]')

    expect(option?.disabled).toBe(true)
    expect(screen.getByText(/nothing to test against/)).toBeTruthy()
  })

  it.each([
    ['static true', { kind: 'static', value: true }, 'always'],
    ['static false', { kind: 'static', value: false }, 'never'],
    ['a translation key', { kind: 'i18n', key: 'x' }, 'always'],
    ['an expression', { kind: 'computed', expression: 'a' }, 'computed'],
  ])('reads %s out of a hand-edited document as %s', async (_label, renderWhen, expected) => {
    /*
     * `renderWhen` is a PropValue, so a document can hold any of its kinds.
     * Reading anything truthy as "a condition" left the select saying so while
     * rendering no editor, which made those documents unfixable from the panel.
     * A static truthy and a translation key both behave as no condition, which
     * is what isVisible does with them.
     */
    const harness = setup({ ...dataField(), renderWhen: renderWhen as PropValue }, [
      { key: 'firstName', type: 'Field', props: {}, schema: { type: 'string', validations: [] } },
    ])
    await harness.select()

    expect(screen.getByLabelText('Show when')).toHaveProperty('value', expected)
  })

  it('sets a static false for Never, which is not the same as absent', async () => {
    const harness = await withSibling()

    await harness.user.selectOptions(screen.getByLabelText('Show when'), 'never')

    expect(harness.latest()?.renderWhen).toEqual({ kind: 'static', value: false })
  })

  it('offers every field to a component that has none of its own', async () => {
    /*
     * `dataKeyOf` falls back to the node key, so filtering unconditionally hid
     * a real field from a container that happened to share its name. Only a
     * component that carries data has an own field to exclude.
     */
    // The sibling has to share the container's key, or the filter removes
    // nothing and the test passes against the bug it was written for.
    const container: ComponentNode = { key: 'country', type: 'Row', props: {}, children: [] }
    const harness = setup(container, [
      {
        key: 'countryField',
        dataKey: 'country',
        type: 'Field',
        props: {},
        schema: { type: 'string', validations: [] },
      },
    ])
    await harness.select()

    await harness.user.selectOptions(screen.getByLabelText('Show when'), 'condition')
    const options = [...screen.getByLabelText('Subject').querySelectorAll('option')].map((o) =>
      o.value.replace(/^(form|row):/, ''),
    )

    expect(options).toContain('country')
  })

  it('tests against something the host knows instead of a field', async () => {
    const harness = await withSibling()
    await harness.user.selectOptions(screen.getByLabelText('Show when'), 'condition')

    await harness.user.selectOptions(screen.getByLabelText('Subject source'), 'context')
    expect(harness.latest()?.renderWhen).toEqual({
      kind: 'condition',
      condition: { op: 'truthy', value: { kind: 'context', path: '' } },
    })

    await harness.user.type(screen.getByLabelText('Subject'), 'user.role')
    expect(harness.latest()?.renderWhen).toEqual({
      kind: 'condition',
      condition: { op: 'truthy', value: { kind: 'context', path: 'user.role' } },
    })
  })

  it('does not carry a data key across into a context path', async () => {
    /*
     * A field named `email` becoming the context path `email` reads perfectly
     * plausibly and tests something else entirely. Starting empty is visibly
     * unfinished, which is the only honest state for a switch that cannot be
     * translated.
     */
    const harness = await withSibling()
    await harness.user.selectOptions(screen.getByLabelText('Show when'), 'condition')

    await harness.user.selectOptions(screen.getByLabelText('Subject source'), 'context')

    expect(screen.getByLabelText('Subject')).toHaveProperty('value', '')
  })

  it('shows a stored context operand as one, rather than as a blank value', async () => {
    // The kind select falls back to its first option when handed something it
    // does not recognise, so a document read wrongly here looks like a field
    // test that quietly changed what it tests.
    const harness = setup(
      {
        key: 'website',
        type: 'Field',
        props: {},
        schema: { type: 'string', validations: [] },
        renderWhen: {
          kind: 'condition',
          condition: { op: 'truthy', value: { kind: 'context', path: 'user.role' } },
        },
      },
      [{ key: 'firstName', type: 'Field', props: {}, schema: { type: 'string', validations: [] } }],
    )
    await harness.select()

    expect(screen.getByLabelText('Subject source')).toHaveProperty('value', 'context')
    expect(screen.getByLabelText('Subject')).toHaveProperty('value', 'user.role')
  })

  it('does not offer the component its own field', async () => {
    // Hiding a component when its own value is empty hides the only control
    // that could fill it.
    const harness = await withSibling()
    await harness.user.selectOptions(screen.getByLabelText('Show when'), 'condition')

    const options = [...screen.getByLabelText('Subject').querySelectorAll('option')].map((o) =>
      o.value.replace(/^(form|row):/, ''),
    )
    expect(options).toContain('firstName')
    expect(options).not.toContain('website')
  })
})

describe('the condition binding mode', () => {
  /*
   * A property whose schema opts in with `conditional: true`. No kit ships one
   * yet, so this is the only place the path is exercised — and it shipped as a
   * dead option once already, offered in the list and doing nothing when
   * chosen.
   */
  const field = (): ComponentNode => ({
    key: 'website',
    type: 'Field',
    props: {},
    schema: { type: 'string', validations: [] },
  })

  const sibling: ComponentNode = {
    key: 'firstName',
    type: 'Field',
    props: {},
    schema: { type: 'string', validations: [] },
  }

  it('binds the property to a condition when chosen', async () => {
    const harness = setup(field(), [sibling])
    await harness.select()

    await harness.user.selectOptions(screen.getByLabelText('Locked binding'), 'condition')

    /*
     * Seeded with the first field on the document, which here is the selected
     * component's own. Unlike `renderWhen`, a property may test its own value:
     * hiding a component on its own emptiness removes the control that would
     * fill it, but disabling one on its own value is a real thing to want.
     */
    expect(harness.latest()?.props['locked']).toEqual({
      kind: 'condition',
      condition: { op: 'truthy', value: { kind: 'ref', dataKey: 'website' } },
    })
  })

  it('refuses the mode when no field is available to seed it', async () => {
    // No component on the document carries a schema, so there is no data key
    // anywhere to test. A hand-authored document can look like this.
    const harness = setup({ key: 'website', type: 'Field', props: {} })
    await harness.select()

    const option = screen
      .getByLabelText('Locked binding')
      .querySelector<HTMLOptionElement>('option[value="condition"]')

    expect(option?.disabled).toBe(true)
  })
})

describe('the condition editor survives a hand-edited document', () => {
  /*
   * `evaluateCondition` was made total against these shapes and the editor was
   * not, so a document with `options: "not-a-list"` rendered fine on the canvas
   * and took the designer down when the panel tried to map over it. The panel
   * is where someone goes to fix a broken document, so it is the last place
   * that can afford to fall over on one.
   */
  const withRenderWhen = (condition: unknown): ComponentNode => ({
    key: 'website',
    type: 'Field',
    props: {},
    schema: { type: 'string', validations: [] },
    // Cast at the boundary: the point of the test is a shape the type forbids
    // and a hand-edited document can still hold.
    renderWhen: { kind: 'condition', condition } as PropValue,
  })

  const malformed: unknown[] = [
    { op: 'in', value: { kind: 'ref', dataKey: 'a' }, options: 'not-a-list' },
    { op: 'and', conditions: 'not-a-list' },
    { op: 'or', conditions: null },
    { op: 'not' },
    { op: 'eq' },
    { op: 'eq', left: null, right: { kind: 'literal', value: 1 } },
    { op: 'eq', left: 'nonsense', right: null },
    { op: 'truthy', value: null },
    { op: 'in', value: { kind: 'ref' }, options: [] },
    { op: 'and', conditions: [null] },
    { op: 'or', conditions: [{ op: 'truthy', value: { kind: 'ref', dataKey: 'a' } }, 'nonsense'] },
    { op: 'not', condition: null },
    { op: 'and', conditions: [{ op: 'and', conditions: [null] }] },
    { op: 'sorcery' },
    { op: 'and', conditions: [{ op: 'sorcery' }] },
  ]

  it('draws an operator it does not know as one it does', async () => {
    /*
     * A controlled select whose value matches no option renders blank, so the
     * author sees a comparison with no name and cannot tell what the document
     * says. Falling back to a real operator gives them something to change.
     */
    const harness = setup(withRenderWhen({ op: 'sorcery' }))
    await harness.select()

    /*
     * Asserting on the select's value alone proves nothing: jsdom quietly
     * falls back to the first option when the value matches none, so the
     * broken and fixed states look identical from there. What differs is that
     * a real operator draws its operands — `sorcery` has none, `truthy` has a
     * subject — so that is the thing to check.
     */
    expect(screen.getByLabelText('Subject')).toBeTruthy()
    expect(screen.getByLabelText('Comparison')).toHaveProperty('value', 'truthy')
  })

  it.each(malformed.map((c) => [JSON.stringify(c), c] as const))(
    'renders %s without crashing',
    async (_label, condition) => {
      const harness = setup(withRenderWhen(condition))
      await expect(harness.select()).resolves.toBeUndefined()

      // The row is on screen, so the author can pick a different operator and
      // repair it rather than being left with a blank panel.
      expect(screen.getByLabelText('Show when')).toHaveProperty('value', 'condition')
    },
  )
})

describe('membership options', () => {
  const listy = (): ComponentNode => ({
    key: 'website',
    type: 'Field',
    props: {},
    schema: { type: 'string', validations: [] },
    renderWhen: {
      kind: 'condition',
      condition: { op: 'in', value: { kind: 'ref', dataKey: 'website' }, options: [] },
    },
  })

  it('lets a newline be typed at all', async () => {
    /*
     * The box holds a draft and commits on blur. Deriving its text from the
     * parsed list on every keystroke normalised the newline away the instant it
     * was typed, so `18` Enter `21` arrived as `1821` and a multi-line list
     * could not be entered.
     */
    const harness = setup(listy())
    await harness.select()

    const box = screen.getByLabelText('Options, one per line')
    await harness.user.clear(box)
    await harness.user.type(box, 'a{enter}b')

    expect(box).toHaveProperty('value', 'a\nb')
  })

  it('drops blank lines and trims the rest', async () => {
    /*
     * A line of spaces is not an option. Kept, it becomes a value no form data
     * can ever equal, so the condition silently never matches.
     */
    const harness = setup(listy())
    await harness.select()

    const box = screen.getByLabelText('Options, one per line')
    await harness.user.clear(box)
    await harness.user.type(box, ' GB {enter}   {enter}IE{enter}')
    await harness.user.tab()

    expect(harness.latest()?.renderWhen).toEqual({
      kind: 'condition',
      condition: { op: 'in', value: { kind: 'ref', dataKey: 'website' }, options: ['GB', 'IE'] },
    })
  })

  it('reads a number as a number, so an ordering test can work', async () => {
    const harness = setup(listy())
    await harness.select()

    const box = screen.getByLabelText('Options, one per line')
    await harness.user.clear(box)
    await harness.user.type(box, '18{enter}21')
    await harness.user.tab()

    const condition = harness.latest()?.renderWhen
    expect(condition?.kind === 'condition' && condition.condition).toMatchObject({
      options: [18, 21],
    })
  })

  it('re-syncs when the document changes underneath', async () => {
    /*
     * Undo, redo, and a document replaced from the JSON dialog all change the
     * options without touching this box. Holding a draft and never re-reading
     * would leave the old text on screen and write it back on the next blur.
     */
    const harness = setup(listy())
    await harness.select()

    const box = screen.getByLabelText('Options, one per line')
    await harness.user.clear(box)
    await harness.user.type(box, 'GB{enter}IE')
    await harness.user.tab()
    expect(box).toHaveProperty('value', 'GB\nIE')

    await harness.user.click(screen.getByRole('button', { name: 'Undo' }))

    expect(screen.getByLabelText('Options, one per line')).toHaveProperty('value', '')
  })
})

describe('removing a nested condition', () => {
  /*
   * Nested rows are keyed by index, so removing the first shifts the second
   * into its slot and React reuses the mounted subtree. Anything holding local
   * state there — the options box holds a draft — could end up attached to the
   * wrong condition. This is the test that says whether it does.
   */
  const twoLists = (): ComponentNode => ({
    key: 'website',
    type: 'Field',
    props: {},
    schema: { type: 'string', validations: [] },
    renderWhen: {
      kind: 'condition',
      condition: {
        op: 'or',
        conditions: [
          { op: 'in', value: { kind: 'ref', dataKey: 'website' }, options: ['first'] },
          { op: 'in', value: { kind: 'ref', dataKey: 'website' }, options: ['second'] },
        ],
      },
    },
  })

  it('leaves the surviving row showing its own options', async () => {
    const harness = setup(twoLists())
    await harness.select()

    const boxes = screen.getAllByLabelText('Options, one per line')
    expect(boxes.map((b) => (b as HTMLTextAreaElement).value)).toEqual(['first', 'second'])

    await harness.user.click(screen.getByRole('button', { name: 'Remove condition 1' }))

    const remaining = screen.getAllByLabelText('Options, one per line')
    expect(remaining).toHaveLength(1)
    expect(remaining[0]).toHaveProperty('value', 'second')
  })

  it('does not carry an uncommitted draft onto the surviving row', async () => {
    const harness = setup(twoLists())
    await harness.select()

    // Type into the first row without blurring, then remove that row.
    const boxes = screen.getAllByLabelText('Options, one per line')
    await harness.user.clear(boxes[0] as HTMLElement)
    await harness.user.type(boxes[0] as HTMLElement, 'typed-but-not-committed')

    await harness.user.click(screen.getByRole('button', { name: 'Remove condition 1' }))

    const remaining = screen.getAllByLabelText('Options, one per line')
    expect(remaining[0]).toHaveProperty('value', 'second')
  })
})

/**
 * Authoring a condition inside a repeater's row.
 *
 * A `ref` carries an optional scope, and absent means the top level. So a
 * condition authored inside a row and left at the default reads a key the top
 * level does not hold, resolves to nothing, hides its component, and
 * `validateForm` then skips every rule beneath it. A required answer becomes
 * advisory on the server, where nobody is looking.
 *
 * The panel answers that by never offering the choice loosely: inside a row the
 * field list is two groups, and which group an option came from is what decides
 * the scope. There is no default to leave wrong.
 */
describe('a condition authored inside a row', () => {
  /*
   * Not one name in this fixture is reused. The repeater's key is `contactList`
   * and its data key is `contacts`; every field's key differs from its data key
   * too. Every repeater fixture in this repository used to set the two to the
   * same string, which made the row-addressing design and its opposite produce
   * identical output across the whole suite.
   */
  const field = (key: string, dataKey: string): ComponentNode => ({
    key,
    type: 'Field',
    props: {},
    dataKey,
    schema: { type: 'string', validations: [] },
  })

  const list = (renderWhen?: ComponentNode['renderWhen']): ComponentNode => ({
    key: 'contactList',
    type: 'List',
    props: {},
    dataKey: 'contacts',
    schema: { type: 'array', validations: [] },
    children: [
      { ...field('rowEmail', 'email'), ...(renderWhen ? { renderWhen } : {}) },
      field('rowKind', 'kind'),
      field('rowNote', 'note'),
    ],
  })

  const topLevel = field('nameField', 'fullName')

  const rowScoped = (dataKey: string): ComponentNode['renderWhen'] => ({
    kind: 'condition',
    condition: { op: 'truthy', value: { kind: 'ref', dataKey, scope: 'row' } },
  })

  const subject = (): HTMLElement => screen.getByLabelText('Subject')

  it('keeps the row scope when the field it tests is changed', async () => {
    /*
     * The CRITICAL. The field select rebuilt the operand from scratch, so
     * changing which field a row-scoped condition tested silently re-pointed it
     * at the form — the same rule, reading a different place, with nothing on
     * screen saying so.
     */
    const harness = setup(list(rowScoped('kind')), [topLevel])
    await harness.selectKey('rowEmail')

    await harness.user.selectOptions(subject(), 'row:note')

    expect(harness.node('rowEmail')?.renderWhen).toEqual({
      kind: 'condition',
      condition: { op: 'truthy', value: { kind: 'ref', dataKey: 'note', scope: 'row' } },
    })
  })

  it('can author the row scope in the first place', async () => {
    // Starting from a form-scoped condition, so the assertion is that the
    // picker *wrote* the scope rather than that it was already there.
    const harness = setup(
      list({
        kind: 'condition',
        condition: { op: 'truthy', value: { kind: 'ref', dataKey: 'fullName' } },
      }),
      [topLevel],
    )
    await harness.selectKey('rowEmail')

    await harness.user.selectOptions(subject(), 'row:kind')

    expect(harness.node('rowEmail')?.renderWhen).toEqual({
      kind: 'condition',
      condition: { op: 'truthy', value: { kind: 'ref', dataKey: 'kind', scope: 'row' } },
    })
  })

  it('seeds a fresh condition on the row rather than on the form', async () => {
    // The default is the failure: a condition seeded at form scope inside a row
    // names a key the top level does not hold, so it is false on arrival and
    // hides the component it was just authored on.
    const harness = setup(list(), [topLevel])
    await harness.selectKey('rowEmail')

    await harness.user.selectOptions(screen.getByLabelText('Show when'), 'condition')

    expect(harness.node('rowEmail')?.renderWhen).toEqual({
      kind: 'condition',
      condition: { op: 'truthy', value: { kind: 'ref', dataKey: 'kind', scope: 'row' } },
    })
  })

  it('writes no scope for a field at the top level, because absent means the form', async () => {
    // The other half of the same control. If the picker wrote `row` whenever it
    // could, the test above would pass and the feature would still be broken.
    const harness = setup(list(rowScoped('kind')), [topLevel])
    await harness.selectKey('rowEmail')

    await harness.user.selectOptions(subject(), 'form:fullName')

    expect(harness.node('rowEmail')?.renderWhen).toEqual({
      kind: 'condition',
      condition: { op: 'truthy', value: { kind: 'ref', dataKey: 'fullName' } },
    })
  })

  it('separates the row from the form in the list it offers', async () => {
    const harness = setup(list(rowScoped('kind')), [topLevel])
    await harness.selectKey('rowEmail')

    const groups = Array.from(subject().querySelectorAll('optgroup')).map((group) => [
      group.label,
      Array.from(group.querySelectorAll('option')).map((option) => option.value),
    ])

    // `email` is absent from the row group: a component cannot test its own
    // field, whichever scope the field is in.
    expect(groups).toEqual([
      ['This row', ['row:kind', 'row:note']],
      // Document order, and the repeater's own key is a top-level answer: it
      // holds the list, which `is empty` is a fair thing to test.
      ['This form', ['form:contacts', 'form:fullName']],
    ])
  })

  it('offers no groups at all outside a row', async () => {
    // Nothing changes for the document that has no repeater in it, which is
    // every document written before this existed.
    const harness = setup(topLevel, [field('other', 'phone')])
    await harness.select()
    await harness.user.selectOptions(screen.getByLabelText('Show when'), 'condition')

    expect(subject().querySelectorAll('optgroup')).toHaveLength(0)
    expect(harness.node('nameField')?.renderWhen).toEqual({
      kind: 'condition',
      condition: { op: 'truthy', value: { kind: 'ref', dataKey: 'phone' } },
    })
  })
})
