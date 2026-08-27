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
  ],
}

interface Harness {
  user: ReturnType<typeof userEvent.setup>
  latest: () => ComponentNode | undefined
  select: () => Promise<void>
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

  return {
    user,
    latest: (): ComponentNode | undefined => current.root.children?.[0],
    select: async (): Promise<void> => {
      const row = view.container.querySelector<HTMLElement>('[data-fs-row="' + node.key + '"]')
      if (!row) throw new Error('no tree row')
      await user.click(row)
    },
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

  it('does not offer the component its own field', async () => {
    // Hiding a component when its own value is empty hides the only control
    // that could fill it.
    const harness = await withSibling()
    await harness.user.selectOptions(screen.getByLabelText('Show when'), 'condition')

    const options = [...screen.getByLabelText('Subject').querySelectorAll('option')].map(
      (o) => o.value,
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
  ]

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
