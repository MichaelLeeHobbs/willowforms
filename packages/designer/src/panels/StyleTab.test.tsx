/**
 * @vitest-environment jsdom
 */

import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import type { ReactNode } from 'react'
import { flatten } from '@willowforms/core'
import type { ComponentNode, FormDocument, Kit } from '@willowforms/core'
import type { NodeRendererProps, RendererKit } from '@willowforms/renderer'

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
        {
          name: 'gap',
          label: 'Gap',
          editor: 'number',
          section: 'style',
          // Makes the `scopes` that `StyleTab` passes to `PropRows` observable.
          conditional: true,
        },
        { name: 'disabled', label: 'Disabled', editor: 'boolean', section: 'advanced' },
      ],
      events: ['onChange'],
    },
  ],
}

interface Harness {
  user: ReturnType<typeof userEvent.setup>
  latest: () => ComponentNode | undefined
  openStyle: () => Promise<void>
}

function setup(node: ComponentNode, selectKey: string = node.key): Harness {
  const user = userEvent.setup()
  let current: FormDocument = {
    version: '1',
    id: 'doc',
    name: 'Styling',
    root: { key: 'root', type: 'Screen', props: {}, children: [node] },
    actions: {},
    // `en-US`, as `createDocument` ships: a dialect-free fixture hides tag and
    // code mix-ups (write-tests skill, Trap 5).
    languages: [{ code: 'en', dialect: 'US', name: 'English', bidi: 'ltr' }],
    defaultLanguage: 'en-US',
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
  fireEvent.click(screen.getByRole('tab', { name: 'Tree' }))

  return {
    user,
    latest: () => flatten(current.root).find((each) => each.node.key === selectKey)?.node,
    openStyle: async () => {
      const row = view.container.querySelector<HTMLElement>(
        '[data-fs-tree-row="' + selectKey + '"]',
      )
      if (!row) throw new Error('no tree row')
      await user.click(row)
      await user.click(screen.getByRole('tab', { name: 'Style' }))
      await user.click(screen.getByText('Advanced CSS'))
    },
  }
}

const field = (): ComponentNode => ({
  key: 'email',
  type: 'Field',
  props: {},
  schema: { type: 'string', validations: [] },
})

describe('the Style tab', () => {
  it('writes a structured control into the CSS for the chosen breakpoint', async () => {
    const harness = setup(field())
    await harness.openStyle()

    await harness.user.type(screen.getByLabelText('Padding'), '8px')
    await harness.user.tab()

    expect(harness.latest()?.css?.any).toContain('padding: 8px')
  })

  it('reads a value back out of hand-written CSS', async () => {
    const harness = setup({ ...field(), css: { any: 'padding: 12px; color: red' } })
    await harness.openStyle()

    expect(screen.getByLabelText('Padding')).toHaveProperty('value', '12px')
  })

  it('leaves declarations it has no control for alone', async () => {
    const harness = setup({ ...field(), css: { any: 'grid-template-areas: "a b"' } })
    await harness.openStyle()

    await harness.user.type(screen.getByLabelText('Radius'), '4px')
    await harness.user.tab()

    expect(harness.latest()?.css?.any).toContain('grid-template-areas')
    expect(harness.latest()?.css?.any).toContain('border-radius: 4px')
  })

  it('removes the entry when its last declaration goes', async () => {
    // A component nobody styled carries no `css` key rather than an empty one.
    const harness = setup({ ...field(), css: { any: 'padding: 8px' } })
    await harness.openStyle()

    await harness.user.clear(screen.getByLabelText('Padding'))
    await harness.user.tab()

    expect(harness.latest()?.css).toBeUndefined()
  })

  it('edits each breakpoint separately', async () => {
    const harness = setup({ ...field(), css: { any: 'padding: 8px' } })
    await harness.openStyle()

    await harness.user.selectOptions(screen.getByLabelText('Applies to'), 'mobile')
    await harness.user.type(screen.getByLabelText('Padding'), '4px')
    await harness.user.tab()

    expect(harness.latest()?.css?.any).toContain('8px')
    expect(harness.latest()?.css?.mobile).toContain('4px')
  })

  it('shows a structured edit in the raw box, which is the direction never tested', async () => {
    const harness = setup({ ...field(), css: { any: 'color: red' } })
    await harness.openStyle()

    await harness.user.type(screen.getByLabelText('Padding'), '12px')
    await harness.user.tab()

    const raw = screen.getByLabelText('CSS')
    expect(raw).toHaveProperty('value', expect.stringContaining('padding: 12px'))
    expect(raw).toHaveProperty('value', expect.stringContaining('color: red'))
  })

  it('says so rather than silently dropping CSS that would escape the component', async () => {
    const harness = setup(field())
    await harness.openStyle()

    const raw = screen.getByLabelText('CSS')
    await harness.user.type(raw, 'color: red }} body {{ display: none')
    await harness.user.tab()

    expect(screen.getByRole('alert').textContent).toMatch(/Declarations only/)
    expect(raw).toHaveProperty('ariaInvalid', 'true')
    expect(harness.latest()?.css?.any ?? '').not.toContain('body')
    expect(harness.latest()?.css?.any ?? '').not.toContain('}')
  })

  it('drops the refusal when the value moves underneath it', async () => {
    // Commit first: a refusal writes nothing, so without an earlier commit Undo
    // has nothing to step back over and `value` never moves.
    const harness = setup(field())
    await harness.openStyle()

    const radius = screen.getByLabelText('Radius')
    await harness.user.clear(radius)
    await harness.user.type(radius, '4px')
    await harness.user.tab()

    await harness.user.clear(radius)
    await harness.user.type(radius, '6px}')
    await harness.user.tab()

    expect(screen.getByRole('alert'), 'the refusal never happened').toBeTruthy()
    expect(radius).toHaveProperty('ariaInvalid', 'true')

    // Undo through the toolbar, which is what a person does and what moves the
    // `value` prop the resync watches.
    await harness.user.click(screen.getByRole('button', { name: 'Undo' }))

    expect(screen.queryByRole('alert'), 'the refusal outlived the value it was about').toBeNull()
    expect(radius).not.toHaveProperty('ariaInvalid', 'true')
  })

  it('drops the refusal when the typed text is repaired back to the written value', async () => {
    // Commit first, so `4px` is the written value and the repair takes
    // `commit`'s early return when the draft matches it.
    const harness = setup(field())
    await harness.openStyle()

    const radius = screen.getByLabelText('Radius')
    await harness.user.clear(radius)
    await harness.user.type(radius, '4px')
    await harness.user.tab()

    await harness.user.type(radius, '}')
    await harness.user.tab()

    expect(screen.getByRole('alert'), 'the refusal never happened').toBeTruthy()
    expect(radius).toHaveProperty('ariaInvalid', 'true')

    await harness.user.type(radius, '{backspace}')
    await harness.user.tab()

    expect(radius).toHaveProperty('value', '4px')
    expect(screen.queryByRole('alert'), 'the refusal outlived the text it was about').toBeNull()
    expect(radius).not.toHaveProperty('ariaInvalid', 'true')
  })

  it('keeps the refused text in the box so it can be repaired', async () => {
    const harness = setup(field())
    await harness.openStyle()

    const raw = screen.getByLabelText('CSS')
    await harness.user.type(raw, 'color: red }} body {{ display: none')
    await harness.user.tab()

    expect(raw).toHaveProperty('value', 'color: red }} body { display: none')
  })

  it('accepts the same declarations once the brace is gone', async () => {
    // The control. Without it, "refuses" could mean "refuses everything".
    const harness = setup(field())
    await harness.openStyle()

    await harness.user.type(screen.getByLabelText('CSS'), 'color: red')
    await harness.user.tab()

    expect(screen.queryByRole('alert')).toBeNull()
    expect(harness.latest()?.css?.any).toContain('color: red')
  })

  it('shows the kit properties that are styling, and Properties does not', async () => {
    const harness = setup(field())
    await harness.openStyle()

    expect(screen.getByLabelText('Gap')).toBeTruthy()

    await harness.user.click(screen.getByRole('tab', { name: 'Properties' }))
    expect(screen.queryByLabelText('Gap')).toBeNull()
  })
})

describe('property sections', () => {
  it('folds advanced properties away instead of giving them equal weight', async () => {
    const harness = setup(field())
    const row = document.querySelector<HTMLElement>('[data-fs-tree-row="email"]')
    if (!row) throw new Error('no tree row')
    await harness.user.click(row)

    const disclosure = screen.getByText('Advanced').closest('details')
    expect(disclosure).toBeTruthy()
    expect(disclosure?.open).toBe(false)
    expect(screen.getByLabelText('Label')).toBeTruthy()

    // A closed `<details>` still renders its children and `getByLabelText`
    // ignores visibility, so check which side of the fold each property is on.
    const advanced = screen.getByLabelText('Disabled')
    expect(advanced.closest('details'), 'an advanced property outside the fold').toBe(disclosure)
    expect(
      screen.getByLabelText('Label').closest('details'),
      'the main property was folded away',
    ).toBeNull()
  })

  it('opens on demand, and what was inside is still the same set', async () => {
    const harness = setup(field())
    const row = document.querySelector<HTMLElement>('[data-fs-tree-row="email"]')
    if (!row) throw new Error('no tree row')
    await harness.user.click(row)

    const disclosure = screen.getByText('Advanced').closest('details')
    if (!disclosure) throw new Error('no disclosure')
    await harness.user.click(screen.getByText('Advanced'))

    expect(disclosure.open).toBe(true)
    expect(screen.getByLabelText('Disabled').closest('details')).toBe(disclosure)
  })
})

// A structured control holds a draft: `setDeclaration` trims, so writing per
// keystroke would eat the space in `8px auto` (write-tests skill, Trap 10).
describe('a value being typed into a structured control', () => {
  it.each([
    ['Margin', '0, or 8px auto', '8px auto', 'margin'],
    ['Border', '1px solid #ccc', '1px solid #ccc', 'border'],
    ['Padding', '8px, or 8px 16px', '8px 16px', 'padding'],
  ])('survives being typed into %s', async (label, placeholder, typed, property) => {
    const harness = setup(field())
    await harness.openStyle()

    const input = screen.getByLabelText(label)
    // The string the control itself offers as an example. If the field cannot
    // accept its own placeholder, the control does not work.
    expect(input.getAttribute('placeholder')).toBe(placeholder)

    await harness.user.type(input, typed)
    await harness.user.tab()

    expect(harness.latest()?.css?.any).toContain(property + ': ' + typed)
  })

  it('shows what was typed while it is being typed', async () => {
    const harness = setup(field())
    await harness.openStyle()

    const input = screen.getByLabelText('Margin')
    await harness.user.type(input, '8px auto')

    expect(input).toHaveProperty('value', '8px auto')
  })

  it('still reads a value back out of the document', async () => {
    // The control. A draft that never re-syncs would pass every test above and
    // show the previous component's styling.
    const harness = setup({ ...field(), css: { any: 'margin: 4px 8px' } })
    await harness.openStyle()

    expect(screen.getByLabelText('Margin')).toHaveProperty('value', '4px 8px')
  })

  it('re-syncs when the raw field rewrites the same declaration', async () => {
    const harness = setup({ ...field(), css: { any: 'margin: 4px' } })
    await harness.openStyle()

    const raw = screen.getByLabelText('CSS')
    await harness.user.clear(raw)
    await harness.user.type(raw, 'margin: 99px')
    await harness.user.tab()

    expect(screen.getByLabelText('Margin')).toHaveProperty('value', '99px')
  })
})

describe('a style property bound to a condition inside a row', () => {
  const inRow = (): ComponentNode => ({
    key: 'addressList',
    type: 'Field',
    props: {},
    // A repeater is recognised from the node: a list schema plus children.
    schema: { type: 'array', validations: [] },
    children: [
      {
        key: 'street',
        dataKey: 'line1',
        type: 'Field',
        props: {},
        schema: { type: 'string', validations: [] },
      },
    ],
  })

  const openStyleFor = async (key: string): Promise<Harness> => {
    const harness = setup(inRow(), key)
    await harness.openStyle()
    return harness
  }

  it('offers the row own answers as the subject', async () => {
    const harness = await openStyleFor('street')

    await harness.user.selectOptions(screen.getByLabelText('Gap binding'), 'condition')

    const subject = screen.getByLabelText<HTMLSelectElement>('Subject')
    const options = [...subject.querySelectorAll('option')].map((option) => option.value)

    // Scoped to the row, and named by the data key: a condition inside a
    // repeater that names a form-level key reads nothing at all.
    expect(options).toContain('row:line1')
  })

  it('seeds the condition against a field in the same row', async () => {
    const harness = await openStyleFor('street')

    await harness.user.selectOptions(screen.getByLabelText('Gap binding'), 'condition')

    // Seeded on the row, not on the form: a condition inside a repeater that
    // names a top-level key is false from the moment it is created, and hides
    // the component it was authored on.
    expect(harness.latest()?.props['gap']).toEqual({
      kind: 'condition',
      condition: { op: 'truthy', value: { kind: 'ref', dataKey: 'line1', scope: 'row' } },
    })
  })

  it('offers the form fields to a component outside every row', async () => {
    // The control. Row scope everywhere would be as wrong as form scope
    // everywhere, and would satisfy the two tests above by accident.
    const harness = setup(
      { key: 'plain', type: 'Field', props: {}, schema: { type: 'string', validations: [] } },
      'plain',
    )
    await harness.openStyle()

    await harness.user.selectOptions(screen.getByLabelText('Gap binding'), 'condition')

    expect(harness.latest()?.props['gap']).toEqual({
      kind: 'condition',
      condition: { op: 'truthy', value: { kind: 'ref', dataKey: 'plain' } },
    })
  })
})

describe('a brace typed into a structured control', () => {
  /*
   * The other brace tests type into the raw CSS box. Without the structured control's
   * own `safeDeclarations` check, a brace would be stored and the renderer would drop
   * the component's whole block.
   */
  it('is refused rather than written', async () => {
    const harness = setup(field())
    await harness.openStyle()

    await harness.user.type(screen.getByLabelText('Padding'), '8px')
    await harness.user.tab()
    expect(harness.latest()?.css?.any, 'nothing was written at all').toContain('padding: 8px')

    await harness.user.type(screen.getByLabelText('Radius'), '6px}')
    await harness.user.tab()

    expect(harness.latest()?.css?.any).not.toContain('6px}')
    expect(harness.latest()?.css?.any, 'the earlier declaration was lost too').toContain(
      'padding: 8px',
    )
  })

  it('says why, and keeps what was typed', async () => {
    const harness = setup(field())
    await harness.openStyle()

    await harness.user.type(screen.getByLabelText('Radius'), '6px}')
    await harness.user.tab()

    expect(screen.getByRole('alert').textContent).toMatch(/cannot be written as CSS/i)
    expect(screen.getByLabelText('Radius')).toHaveProperty('value', '6px}')
  })

  it('clears the refusal once the value is corrected', async () => {
    const harness = setup(field())
    await harness.openStyle()

    await harness.user.type(screen.getByLabelText('Radius'), '6px}')
    await harness.user.tab()
    expect(screen.queryByRole('alert')).not.toBeNull()

    await harness.user.clear(screen.getByLabelText('Radius'))
    await harness.user.type(screen.getByLabelText('Radius'), '6px')
    await harness.user.tab()

    expect(screen.queryByRole('alert')).toBeNull()
    expect(harness.latest()?.css?.any).toContain('6px')
  })
})
