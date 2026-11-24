/**
 * @vitest-environment jsdom
 */

import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import type { ReactNode } from 'react'
import type { ComponentNode, FormDocument, Kit, PropValue } from '@willowforms/core'
import type { NodeRendererProps, RendererKit } from '@willowforms/renderer'

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
        { name: 'padding', label: 'Padding', editor: 'number' },
        { name: 'tint', label: 'Tint', editor: 'color' },
        { name: 'glyph', label: 'Glyph', editor: 'icon' },
        { name: 'script', label: 'Script', editor: 'code' },
        { name: 'notes', label: 'Notes', editor: 'multiline' },
        { name: 'locked', label: 'Locked', editor: 'boolean', conditional: true },
        // Declared values that are not strings, which neither shipped kit has.
        {
          name: 'weight',
          label: 'Weight',
          editor: 'select',
          options: [
            { label: 'One', value: 1 },
            { label: 'Two', value: 2 },
            { label: 'Off', value: false },
          ],
        },
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
    // A repeater (`dataType: 'array'`), so a condition can be authored in a row.
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
  selectKey: (key: string) => Promise<void>
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
    // `en-US`, as `createDocument` makes: without a dialect, a tag and its bare
    // code are the same string (Trap 5 in the write-tests skill).
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

  const clickRow = async (key: string): Promise<void> => {
    const row = view.container.querySelector<HTMLElement>('[data-fs-tree-row="' + key + '"]')
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

describe('the key field', () => {
  const keyBox = (): HTMLElement => screen.getByRole('textbox', { name: /^Key/ })

  it('renames the component on Enter', async () => {
    const { user, select, node } = setup(dataField())
    await select()

    await user.clear(keyBox())
    await user.type(keyBox(), 'email{Enter}')

    expect(node('email')).toBeDefined()
    expect(node('emailField')).toBeUndefined()
  })

  it('keeps focus in the field it renamed from', async () => {
    // Keying `KeyField` by `node.key` would remount it on rename and drop focus
    // to `document.body`, outside `.fs-shell` and its keyboard shortcuts.
    const { user, select } = setup(dataField())
    await select()

    await user.clear(keyBox())
    await user.type(keyBox(), 'email{Enter}')

    expect(document.activeElement).toBe(keyBox())
  })

  it('is gone rather than stale after the rename is undone', async () => {
    /*
     * A stale draft here would redo the rename on the next blur. It cannot,
     * because undo removes `email`, the store drops the selection, and the
     * panel unmounts: safety that comes from two components agreeing.
     */
    const { user, select, node } = setup(dataField())
    await select()

    await user.clear(keyBox())
    await user.type(keyBox(), 'email{Enter}')
    expect(node('email')).toBeDefined()

    // The toolbar button, not the shortcut: the shortcut deliberately does not
    // fire while a text field has focus, and focus is in this one.
    await user.click(screen.getByRole('button', { name: 'Undo' }))

    expect(node('emailField'), 'the undo did not take the rename back').toBeDefined()
    expect(node('email')).toBeUndefined()
    expect(screen.queryByRole('textbox', { name: /^Key/ })).toBeNull()
  })

  it('renames on blur as well, since leaving the field is a commit', async () => {
    const { user, select, node } = setup(dataField())
    await select()

    await user.clear(keyBox())
    await user.type(keyBox(), 'email')
    await user.tab()

    expect(node('email')).toBeDefined()
  })

  it('holds the draft while it is being typed, and changes nothing yet', async () => {
    const { user, select, node } = setup(dataField())
    await select()

    await user.clear(keyBox())
    await user.type(keyBox(), 'em')

    expect(keyBox()).toHaveProperty('value', 'em')
    expect(node('emailField'), 'the rename happened mid-word').toBeDefined()
    expect(node('em')).toBeUndefined()
  })

  it('refuses a key another component already has, and says which', async () => {
    const { user, select, node } = setup(dataField(), [{ key: 'taken', type: 'Field', props: {} }])
    await select()

    await user.clear(keyBox())
    await user.type(keyBox(), 'taken{Enter}')

    expect(screen.getByRole('alert').textContent).toMatch(/already used/)
    expect(keyBox().getAttribute('aria-invalid')).toBe('true')
    expect(keyBox()).toHaveProperty('value', 'emailField')
    expect(node('emailField')).toBeDefined()
    expect(node('taken')).toBeDefined()
  })

  it('refuses a key the grammar does not allow', async () => {
    const { user, select, node } = setup(dataField())
    await select()

    await user.clear(keyBox())
    await user.type(keyBox(), '2 fields{Enter}')

    expect(screen.getByRole('alert')).toBeTruthy()
    expect(node('emailField')).toBeDefined()
  })

  it('puts the real key back on Escape', async () => {
    const { user, select, node } = setup(dataField())
    await select()

    await user.clear(keyBox())
    await user.type(keyBox(), 'somethingElse{Escape}')

    expect(keyBox()).toHaveProperty('value', 'emailField')
    expect(node('emailField')).toBeDefined()
  })

  it("re-points the component's own condition, which names its own key", async () => {
    /*
     * A Step's `renderWhen` compares `context.step` with its own key, so a
     * rename must re-point it. Only its own: what a sibling names is a data
     * key, and a rename does not follow those.
     */
    const step: ComponentNode = {
      key: 'who',
      type: 'Field',
      props: {},
      renderWhen: {
        kind: 'condition',
        condition: {
          op: 'eq',
          left: { kind: 'context', path: 'step' },
          right: { kind: 'literal', value: 'who' },
        },
      },
    }
    const { user, select, node } = setup(step)
    await select()

    await user.clear(keyBox())
    await user.type(keyBox(), 'whoElse{Enter}')

    expect(node('whoElse')?.renderWhen).toEqual({
      kind: 'condition',
      condition: {
        op: 'eq',
        left: { kind: 'context', path: 'step' },
        right: { kind: 'literal', value: 'whoElse' },
      },
    })
  })
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
    // `<input type="color">` holds only #rrggbb, so a swatch that owned the value
    // would rewrite var(--brand), transparent or rgb(...) to hex.
    const { user, latest } = await open()
    const text = screen.getByLabelText('Tint')

    await user.type(text, 'var(--brand)')

    expect(latest()?.props['tint']).toEqual({ kind: 'static', value: 'var(--brand)' })
  })

  it('shows a hex value in the swatch', async () => {
    const { user } = await open()
    await user.type(screen.getByLabelText('Tint'), '#336699')

    expect(screen.getByLabelText('Pick a colour')).toHaveProperty('value', '#336699')
  })

  it('leaves a value it cannot represent exactly where it was', async () => {
    // No `#000000` swatch assertion: jsdom shows that for any unparseable
    // value, so it cannot fail.
    const { user, latest } = await open()
    const text = screen.getByLabelText('Tint')
    await user.type(text, 'transparent')

    expect(text).toHaveProperty('value', 'transparent')
    expect(latest()?.props['tint']).toEqual({ kind: 'static', value: 'transparent' })
  })

  it('writes the hex through when somebody uses the swatch', async () => {
    const { user, latest } = await open()
    await user.type(screen.getByLabelText('Tint'), 'transparent')

    fireEvent.change(screen.getByLabelText('Pick a colour'), { target: { value: '#ff0000' } })

    expect(latest()?.props['tint']).toEqual({ kind: 'static', value: '#ff0000' })
    // By role: once set, the label gains a visually hidden "(modified)".
    expect(screen.getByRole('textbox', { name: /^Tint/ })).toHaveProperty('value', '#ff0000')
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

    const preview = document.querySelector('.fs-icon-picker__preview')
    expect(preview?.querySelector('svg')).toBeNull()

    // The exact label: /Glyph/ also matches the binding mode picker.
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
    const harness = setup(dataField())
    await harness.select()

    expect(screen.getByLabelText('Notes').tagName).toBe('TEXTAREA')
  })
})

describe('the visibility row', () => {
  /** The component under test. `withSibling` adds a second field for it to test. */
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

  const morphTo = async (harness: Harness, ops: string[]): Promise<void> => {
    await harness.user.selectOptions(screen.getByLabelText('Show when'), 'condition')
    for (const op of ops) {
      // The outermost picker is first in the DOM; a group draws one more per
      // inner condition (Trap 4 in the write-tests skill).
      const pickers = screen.getAllByLabelText('Comparison')
      const outer = pickers[0]
      if (!outer) throw new Error('no operator picker')
      await harness.user.selectOptions(outer, op)
    }
  }

  it('carries the subject into a comparison, which needs a second operand', async () => {
    const harness = await withSibling()
    await morphTo(harness, ['eq'])

    expect(harness.latest()?.renderWhen).toEqual({
      kind: 'condition',
      condition: {
        op: 'eq',
        left: { kind: 'ref', dataKey: 'firstName' },
        right: { kind: 'literal', value: '' },
      },
    })
  })

  it('carries it into a membership test, which starts with no options', async () => {
    const harness = await withSibling()
    await morphTo(harness, ['in'])

    expect(harness.latest()?.renderWhen).toEqual({
      kind: 'condition',
      condition: { op: 'in', value: { kind: 'ref', dataKey: 'firstName' }, options: [] },
    })
  })

  it('wraps the condition when it becomes a group, rather than dropping it', async () => {
    const harness = await withSibling()
    await morphTo(harness, ['and'])

    expect(harness.latest()?.renderWhen).toEqual({
      kind: 'condition',
      condition: {
        op: 'and',
        conditions: [{ op: 'truthy', value: { kind: 'ref', dataKey: 'firstName' } }],
      },
    })
  })

  it('wraps it in a not the same way', async () => {
    const harness = await withSibling()
    await morphTo(harness, ['not'])

    expect(harness.latest()?.renderWhen).toEqual({
      kind: 'condition',
      condition: {
        condition: { op: 'truthy', value: { kind: 'ref', dataKey: 'firstName' } },
        op: 'not',
      },
    })
  })

  it('carries the first inner condition back out when a group becomes a scalar', async () => {
    const harness = await withSibling()
    await morphTo(harness, ['and', 'empty'])

    expect(harness.latest()?.renderWhen).toEqual({
      kind: 'condition',
      condition: { op: 'empty', value: { kind: 'ref', dataKey: 'firstName' } },
    })
  })

  it('carries the subject out of a not as well', async () => {
    const harness = await withSibling()
    await morphTo(harness, ['not', 'empty'])

    expect(harness.latest()?.renderWhen).toEqual({
      kind: 'condition',
      condition: { op: 'empty', value: { kind: 'ref', dataKey: 'firstName' } },
    })
  })

  it('shows a subject the document names but the form no longer has', async () => {
    // A `<select>` with no matching option shows its first, so without the
    // extra option the panel would show a subject the document does not hold.
    const node = pair()
    const harness = setup(
      {
        ...node,
        renderWhen: {
          kind: 'condition',
          condition: { op: 'truthy', value: { kind: 'ref', dataKey: 'renamedAway' } },
        },
      },
      [{ key: 'firstName', type: 'Field', props: {}, schema: { type: 'string', validations: [] } }],
    )
    await harness.select()

    const subject = screen.getByLabelText<HTMLSelectElement>('Subject')
    expect(subject.value).toBe('form:renamedAway')
    expect([...subject.querySelectorAll('option')].map((o) => o.textContent)).toContain(
      'renamedAway',
    )

    expect(harness.latest()?.renderWhen).toEqual({
      kind: 'condition',
      condition: { op: 'truthy', value: { kind: 'ref', dataKey: 'renamedAway' } },
    })
  })

  it('removes renderWhen when set back to Always', async () => {
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
    const harness = setup(pair())
    await harness.select()

    const option = screen
      .getByLabelText('Show when')
      .querySelector<HTMLOptionElement>('option[value="condition"]')

    expect(option?.disabled).toBe(true)
    expect(screen.getByText(/nothing to test against/)).toBeTruthy()
  })

  it.each([
    ['static true', { kind: 'static', value: true }, 'other'],
    ['static false', { kind: 'static', value: false }, 'never'],
    ['a translation key', { kind: 'i18n', key: 'x' }, 'other'],
    ['an expression', { kind: 'computed', expression: 'a' }, 'computed'],
  ])('reads %s out of a hand-edited document as %s', async (_label, renderWhen, expected) => {
    const harness = setup({ ...dataField(), renderWhen: renderWhen as PropValue }, [
      { key: 'firstName', type: 'Field', props: {}, schema: { type: 'string', validations: [] } },
    ])
    await harness.select()

    expect(screen.getByLabelText('Show when')).toHaveProperty('value', expected)
  })

  it('lets an unrecognised rule be cleared, which is why it is not named Always', async () => {
    const harness = setup({ ...dataField(), renderWhen: { kind: 'i18n', key: 'x' } }, [
      { key: 'firstName', type: 'Field', props: {}, schema: { type: 'string', validations: [] } },
    ])
    await harness.select()

    await harness.user.selectOptions(screen.getByLabelText('Show when'), 'always')

    expect(harness.latest()?.renderWhen).toBeUndefined()
  })

  it('sets a static false for Never, which is not the same as absent', async () => {
    const harness = await withSibling()

    await harness.user.selectOptions(screen.getByLabelText('Show when'), 'never')

    expect(harness.latest()?.renderWhen).toEqual({ kind: 'static', value: false })
  })

  it('offers every field to a component that has none of its own', async () => {
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
    // Field `email` becoming context path `email` reads plausibly and tests
    // something else; empty is visibly unfinished.
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
  // No shipped kit opts into `conditional: true`, so this is its only coverage.
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

    // Seeded with the component's own field, which a property, unlike
    // `renderWhen`, may test.
    expect(harness.latest()?.props['locked']).toEqual({
      kind: 'condition',
      condition: { op: 'truthy', value: { kind: 'ref', dataKey: 'website' } },
    })
  })

  it('refuses the mode when no field is available to seed it', async () => {
    const harness = setup({ key: 'website', type: 'Field', props: {} })
    await harness.select()

    const option = screen
      .getByLabelText('Locked binding')
      .querySelector<HTMLOptionElement>('option[value="condition"]')

    expect(option?.disabled).toBe(true)
  })
})

describe('a literal the plain grammar cannot spell', () => {
  const withCondition = (literal: unknown): ComponentNode =>
    ({
      ...dataField(),
      renderWhen: {
        kind: 'condition',
        condition: {
          op: 'eq',
          left: { kind: 'ref', dataKey: 'firstName' },
          right: { kind: 'literal', value: literal },
        },
      },
    }) as ComponentNode

  const open = async (literal: unknown): Promise<ReturnType<typeof setup>> => {
    const harness = setup(withCondition(literal), [
      { key: 'firstName', type: 'Field', props: {}, schema: { type: 'string', validations: [] } },
    ])
    await harness.select()
    return harness
  }

  it('shows an object literal as JSON rather than as an empty box', async () => {
    await open({ a: 1 })
    expect(screen.getByDisplayValue('{"a":1}')).toBeTruthy()
  })

  it('shows null as null', async () => {
    await open(null)
    expect(screen.getByDisplayValue('null')).toBeTruthy()
  })

  it('lets a quoted string be authored as a string', async () => {
    // Unquoted `true` and `18` parse as boolean and number, so JSON quoting is
    // how to write the word.
    const harness = await open('x')
    const box = screen.getByDisplayValue('x')
    await harness.user.clear(box)
    await harness.user.type(box, '"true"')
    await harness.user.tab()

    const condition = harness.latest()?.renderWhen
    expect(condition).toMatchObject({
      condition: { right: { kind: 'literal', value: 'true' } },
    })
  })

  it('still reads an unquoted true as the boolean', async () => {
    const harness = await open('x')
    const box = screen.getByDisplayValue('x')
    await harness.user.clear(box)
    await harness.user.type(box, 'true')
    await harness.user.tab()

    expect(harness.latest()?.renderWhen).toMatchObject({
      condition: { right: { kind: 'literal', value: true } },
    })
  })
})

describe('the condition editor survives a hand-edited document', () => {
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
    const harness = setup(withRenderWhen({ op: 'sorcery' }))
    await harness.select()

    // Not the select's value alone: React selects the first enabled option when none
    // matches. A real operator draws operands; `sorcery` draws none.
    expect(screen.getByLabelText('Subject')).toBeTruthy()
    expect(screen.getByLabelText('Comparison')).toHaveProperty('value', 'truthy')
  })

  it.each(malformed.map((c) => [JSON.stringify(c), c] as const))(
    'renders %s without crashing',
    async (_label, condition) => {
      const harness = setup(withRenderWhen(condition))
      await harness.select()

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
    const harness = setup(listy())
    await harness.select()

    const box = screen.getByLabelText('Options, one per line')
    await harness.user.clear(box)
    await harness.user.type(box, 'a{enter}b')

    expect(box).toHaveProperty('value', 'a\nb')
  })

  it('drops blank lines and trims the rest', async () => {
    // A blank option is a value no form data can equal.
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
  // Nested rows are keyed by index, so removing the first hands its mounted
  // subtree, and any draft it holds, to the second.
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

  it('adds a row when Add condition is clicked', async () => {
    // Counted by remove buttons: a new row is an `eq` comparison, which has no
    // options box.
    // A sibling, so there is a field to seed the new clause with: the node's
    // own field is excluded.
    const harness = setup(twoLists(), [
      { key: 'other', type: 'Field', props: {}, schema: { type: 'string', validations: [] } },
    ])
    await harness.select()

    expect(screen.getAllByRole('button', { name: /^Remove condition/ })).toHaveLength(2)

    await harness.user.click(screen.getByRole('button', { name: 'Add condition' }))

    expect(screen.getAllByRole('button', { name: /^Remove condition/ })).toHaveLength(3)

    const held = harness.latest()?.renderWhen
    const condition = held?.kind === 'condition' ? held.condition : undefined
    expect(
      condition && 'conditions' in condition && Array.isArray(condition.conditions)
        ? condition.conditions.length
        : 0,
    ).toBe(3)

    const clauses =
      condition && 'conditions' in condition && Array.isArray(condition.conditions)
        ? condition.conditions
        : []
    const added = clauses[2] as { value?: { dataKey?: string }; left?: { dataKey?: string } }
    expect(added?.left?.dataKey ?? added?.value?.dataKey).toBe('other')
  })

  it('offers no way to add a clause when there is no field to read', async () => {
    const harness = setup(twoLists())
    await harness.select()

    const add = screen.getByRole('button', { name: 'Add condition' })
    expect(add.hasAttribute('disabled')).toBe(true)
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

    const boxes = screen.getAllByLabelText('Options, one per line')
    await harness.user.clear(boxes[0] as HTMLElement)
    await harness.user.type(boxes[0] as HTMLElement, 'typed-but-not-committed')

    expect(boxes[0]).toHaveProperty('value', 'typed-but-not-committed')

    await harness.user.click(screen.getByRole('button', { name: 'Remove condition 1' }))

    const remaining = screen.getAllByLabelText('Options, one per line')
    expect(remaining[0]).toHaveProperty('value', 'second')
  })
})

/**
 * A `ref` with no scope reads the top level, so a row condition left at that
 * default hides its component and `validateForm` skips every rule beneath it.
 */
describe('a condition authored inside a row', () => {
  // No key equals its data key, so addressing by key and by data key differ.
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
    const harness = setup(list(), [topLevel])
    await harness.selectKey('rowEmail')

    await harness.user.selectOptions(screen.getByLabelText('Show when'), 'condition')

    expect(harness.node('rowEmail')?.renderWhen).toEqual({
      kind: 'condition',
      condition: { op: 'truthy', value: { kind: 'ref', dataKey: 'kind', scope: 'row' } },
    })
  })

  it('writes no scope for a field at the top level, because absent means the form', async () => {
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

/**
 * The options box parses lossily (it trims, drops blanks and reads numeric text
 * as numbers), so a blur with no edit must not commit.
 */
describe('moving focus through a membership condition', () => {
  const stored = (options: unknown[]): ComponentNode => ({
    key: 'website',
    type: 'Field',
    props: {},
    schema: { type: 'string', validations: [] },
    renderWhen: {
      kind: 'condition',
      condition: {
        op: 'in',
        value: { kind: 'ref', dataKey: 'website' },
        options: options as never,
      },
    },
  })

  it('leaves the stored options byte-identical', async () => {
    // Both survive a render and are changed by a parse.
    const harness = setup(stored(['007', ' x ']))
    await harness.select()

    const box = screen.getByLabelText('Options, one per line')
    box.focus()
    await harness.user.tab()

    expect(harness.latest()?.renderWhen).toEqual({
      kind: 'condition',
      condition: { op: 'in', value: { kind: 'ref', dataKey: 'website' }, options: ['007', ' x '] },
    })
  })

  it('records no edit at all', async () => {
    const harness = setup(stored([18, 21]))
    await harness.select()

    const before = harness.latest()

    const box = screen.getByLabelText('Options, one per line')
    box.focus()
    await harness.user.tab()

    // Same object, not merely an equal one: tree operations are immutable, so a
    // commit that changed nothing would still hand back a new document.
    expect(harness.latest()).toBe(before)
  })

  it('still commits an edit that was actually made', async () => {
    const harness = setup(stored(['007']))
    await harness.select()

    const box = screen.getByLabelText('Options, one per line')
    await harness.user.clear(box)
    await harness.user.type(box, 'GB')
    await harness.user.tab()

    expect(harness.latest()?.renderWhen).toEqual({
      kind: 'condition',
      condition: { op: 'in', value: { kind: 'ref', dataKey: 'website' }, options: ['GB'] },
    })
  })
})

describe('the data key field and undo', () => {
  const named = (): ComponentNode => ({
    key: 'emailField',
    type: 'Field',
    props: {},
    schema: { type: 'string', validations: [] },
  })

  it('shows the key the document holds after an undo', async () => {
    const harness = setup(named())
    await harness.select()

    const input = screen.getByLabelText('Data key')
    await harness.user.clear(input)
    await harness.user.type(input, 'primaryEmail')
    await harness.user.tab()
    expect(harness.node('emailField')?.dataKey).toBe('primaryEmail')

    await harness.user.click(screen.getByRole('button', { name: 'Undo' }))

    expect(screen.getByLabelText('Data key')).toHaveProperty('value', 'emailField')
  })

  it('does not write the stale text back on the next blur', async () => {
    const harness = setup(named())
    await harness.select()

    const input = screen.getByLabelText('Data key')
    await harness.user.clear(input)
    await harness.user.type(input, 'primaryEmail')
    await harness.user.tab()

    await harness.user.click(screen.getByRole('button', { name: 'Undo' }))
    await harness.user.click(screen.getByLabelText('Data key'))
    await harness.user.tab()

    expect(harness.node('emailField')?.dataKey).toBeUndefined()
  })

  it('keeps an edit in progress when the document changes elsewhere', async () => {
    const harness = setup(named())
    await harness.select()

    const input = screen.getByLabelText('Data key')
    await harness.user.clear(input)
    await harness.user.type(input, 'halfTyped')

    expect(input).toHaveProperty('value', 'halfTyped')
    expect(harness.node('emailField')?.dataKey).toBeUndefined()
  })
})

/**
 * A number must be spelled the way JavaScript prints it: `01234` prints as
 * `1234`, so it stays text.
 */
describe('typing a literal into a condition', () => {
  const listy = (): ComponentNode => ({
    key: 'website',
    type: 'Field',
    props: {},
    schema: { type: 'string', validations: [] },
    renderWhen: {
      kind: 'condition',
      condition: {
        op: 'eq',
        left: { kind: 'ref', dataKey: 'website' },
        right: { kind: 'literal', value: '' },
      },
    },
  })

  const stored = (harness: Harness): unknown => {
    const when = harness.node('website')?.renderWhen
    return when?.kind === 'condition' && 'right' in when.condition
      ? when.condition.right
      : undefined
  }

  it.each([
    ['a postcode with a leading zero', '01234', '01234'],
    ['a phone number', '+441234567890', '+441234567890'],
    ['a version', '1.50', '1.50'],
    ['something in exponent form', '1e3', '1e3'],
  ])('keeps %s as text', async (_what, typed, expected) => {
    const harness = setup(listy())
    await harness.select()

    const right = screen.getByLabelText('Right')
    await harness.user.clear(right)
    await harness.user.type(right, typed)
    await harness.user.tab()

    expect(stored(harness)).toEqual({ kind: 'literal', value: expected })
  })

  it.each([
    ['a whole number', '18', 18],
    ['a negative', '-4', -4],
    ['a decimal', '1.5', 1.5],
    ['zero', '0', 0],
  ])('still reads %s as a number', async (_what, typed, expected) => {
    // Ordering refuses to compare a string with a number, so `is at least 18`
    // needs a numeric literal.
    const harness = setup(listy())
    await harness.select()

    const right = screen.getByLabelText('Right')
    await harness.user.clear(right)
    await harness.user.type(right, typed)
    await harness.user.tab()

    expect(stored(harness)).toEqual({ kind: 'literal', value: expected })
  })

  it('still reads true and false as booleans', async () => {
    const harness = setup(listy())
    await harness.select()

    const right = screen.getByLabelText('Right')
    await harness.user.clear(right)
    await harness.user.type(right, 'true')
    await harness.user.tab()

    expect(stored(harness)).toEqual({ kind: 'literal', value: true })
  })
})

describe('the select editor and a value that is not a string', () => {
  // By id: the label gains "(modified)" once set, and a loose pattern also
  // matches the binding mode select on the same row (Trap 4).
  const weightSelect = (): HTMLSelectElement => {
    const element = document.querySelector('[id$="fs-prop-weight"]')
    if (!(element instanceof HTMLSelectElement)) throw new Error('no Weight select')
    return element
  }

  const withSelect = (): ComponentNode => ({
    key: 'field',
    type: 'Field',
    props: {},
    schema: { type: 'string', validations: [] },
  })

  it('stores the number the kit declared, not its spelling', async () => {
    const { user, latest, select } = setup(withSelect())
    await select()

    await user.selectOptions(weightSelect(), '2')

    expect(latest()?.props?.['weight']).toEqual({ kind: 'static', value: 2 })
  })

  it('stores a boolean the same way', async () => {
    const { user, latest, select } = setup(withSelect())
    await select()

    await user.selectOptions(weightSelect(), 'false')

    expect(latest()?.props?.['weight']).toEqual({ kind: 'static', value: false })
  })

  it('shows the stored value as selected when it comes back', async () => {
    const { user, latest, select } = setup(withSelect())
    await select()

    await user.selectOptions(weightSelect(), '2')
    expect(latest()?.props?.['weight']).toEqual({ kind: 'static', value: 2 })
    expect(weightSelect().value).toBe('2')
  })

  it('still clears back to no value at all', async () => {
    const { user, latest, select } = setup(withSelect())
    await select()

    await user.selectOptions(weightSelect(), '2')
    await user.selectOptions(weightSelect(), '')

    expect(latest()?.props?.['weight']).toBeUndefined()
  })
})

/**
 * Consecutive edits sharing a coalescing label replace the top undo entry:
 * right for typing, wrong for changing what kind of rule this is.
 */
describe('a visibility condition and the undo stack', () => {
  const sibling = (): ComponentNode => ({
    key: 'other',
    type: 'Field',
    props: {},
    schema: { type: 'string', validations: [] },
  })

  it('is reachable by undo after choosing Always, and by redo after that', async () => {
    // Authored, not loaded: coalescing only replaces an entry a labelled edit
    // wrote, so a preloaded condition could not fail this.
    const { user, latest, select } = setup(
      { key: 'field', type: 'Field', props: {}, schema: { type: 'string', validations: [] } },
      [sibling()],
    )
    await select()

    await user.selectOptions(screen.getByLabelText('Show when'), 'condition')
    const authored = latest()?.renderWhen
    expect(authored).toBeDefined()

    await user.selectOptions(screen.getByLabelText('Show when'), 'always')
    expect(latest()?.renderWhen).toBeUndefined()

    await user.click(screen.getByRole('button', { name: 'Undo' }))
    expect(latest()?.renderWhen, 'the condition was destroyed rather than undone').toEqual(authored)

    await user.click(screen.getByRole('button', { name: 'Redo' }))
    expect(latest()?.renderWhen).toBeUndefined()
  })

  it('still folds a run of typing into one entry rather than one per keystroke', async () => {
    // One undo also takes the mode change, because that edit is the entry the
    // typing folds into.
    const { user, latest, select } = setup(
      { key: 'field', type: 'Field', props: {}, schema: { type: 'string', validations: [] } },
      [sibling()],
    )
    await select()

    await user.selectOptions(screen.getByLabelText('Show when'), 'computed')
    await user.type(screen.getByLabelText('Show when expression'), 'abc')
    expect(latest()?.renderWhen).toEqual({ kind: 'computed', expression: 'abc' })

    await user.click(screen.getByRole('button', { name: 'Undo' }))
    expect(latest()?.renderWhen).toBeUndefined()
  })
})

describe('the options a membership condition holds', () => {
  const withOptions = (options: unknown[]): ComponentNode => ({
    key: 'field',
    type: 'Field',
    props: {},
    schema: { type: 'string', validations: [] },
    renderWhen: {
      kind: 'condition',
      condition: {
        op: 'in',
        value: { kind: 'ref', dataKey: 'other' },
        options: options as never,
      },
    },
  })

  const sibling = (): ComponentNode => ({
    key: 'other',
    type: 'Field',
    props: {},
    schema: { type: 'string', validations: [] },
  })

  const optionsBox = (): HTMLTextAreaElement =>
    screen.getByLabelText<HTMLTextAreaElement>('Options, one per line')

  it('shows an object option rather than a blank line', async () => {
    const { select } = setup(withOptions([{ a: 1 }, 'GB']), [sibling()])
    await select()

    expect(optionsBox().value.split('\n')).toEqual(['{"a":1}', 'GB'])
  })

  it('keeps an object option when an unrelated line is edited', async () => {
    const { user, latest, select } = setup(withOptions([{ a: 1 }, 'GB']), [sibling()])
    await select()

    await user.click(optionsBox())
    await user.keyboard('{End}X')
    await user.tab()

    const condition = latest()?.renderWhen
    expect(condition?.kind).toBe('condition')
    expect(condition?.kind === 'condition' ? condition.condition : undefined).toMatchObject({
      options: [{ a: 1 }, 'GBX'],
    })
  })

  it('keeps a stored string that is spelled like a number', async () => {
    const { user, latest, select } = setup(withOptions(['18', 'GB']), [sibling()])
    await select()

    expect(optionsBox().value.split('\n')).toEqual(['"18"', 'GB'])

    await user.click(optionsBox())
    await user.keyboard('{End}X')
    await user.tab()

    const condition = latest()?.renderWhen
    expect(condition?.kind === 'condition' ? condition.condition : undefined).toMatchObject({
      options: ['18', 'GBX'],
    })
  })

  it('still writes a number as a number, and a plain string plainly', async () => {
    const { select } = setup(withOptions([18, 'GB', true]), [sibling()])
    await select()

    expect(optionsBox().value.split('\n')).toEqual(['18', 'GB', 'true'])
  })
})

describe('a data key that breaks the key grammar', () => {
  const field = (): ComponentNode => ({
    key: 'emailField',
    type: 'Field',
    props: {},
    schema: { type: 'string', validations: [] },
  })

  const dataKeyInput = (): HTMLInputElement => screen.getByLabelText<HTMLInputElement>('Data key')

  it.each([
    ['first-name', 'a hyphen, which an expression reads as a subtraction'],
    ['__proto__', 'a name that changes an object rather than filling it in'],
    ['1st', 'a name no expression can mention'],
  ])('refuses %s — %s', async (bad) => {
    const { user, latest, select } = setup(field())
    await select()

    await user.clear(dataKeyInput())
    await user.type(dataKeyInput(), bad)
    await user.tab()

    expect(latest()?.dataKey, 'the panel stored a data key its own gate refuses').toBeUndefined()
  })

  it('says why, rather than silently reverting', async () => {
    const { user, select } = setup(field())
    await select()

    await user.clear(dataKeyInput())
    await user.type(dataKeyInput(), 'first-name')
    await user.tab()

    expect(screen.getByRole('alert').textContent).toMatch(/subtraction/)
  })

  it('still accepts an ordinary data key, and still clears back to the key', async () => {
    const { user, latest, select } = setup(field())
    await select()

    await user.clear(dataKeyInput())
    await user.type(dataKeyInput(), 'email')
    await user.tab()
    expect(latest()?.dataKey).toBe('email')

    await user.clear(dataKeyInput())
    await user.tab()
    expect(latest()?.dataKey).toBeUndefined()
  })
})

describe('the Rules tab and a pattern nobody can run', () => {
  const withPattern = (): ComponentNode => ({
    key: 'field',
    type: 'Field',
    props: {},
    schema: { type: 'string', validations: [{ key: 'pattern', value: '' }] },
  })

  it('accepts nested repeats because the pattern engine has linear-time semantics', async () => {
    const { user, select } = setup(withPattern())
    await select()
    await user.click(screen.getByRole('tab', { name: 'Rules' }))

    /*
     * By id suffix, not by label text. The row's label is the rule's own hint,
     * which differs per rule key, and a loose pattern matches the `<label>`
     * element as well as the input it names.
     */
    const field = document.querySelector('input[id$="-value"]')
    if (!(field instanceof HTMLInputElement)) throw new Error('no pattern field')
    await user.clear(field)
    await user.type(field, '(a+)+$')

    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('reports syntax the bounded pattern engine does not support', async () => {
    const { user, select } = setup(withPattern())
    await select()
    await user.click(screen.getByRole('tab', { name: 'Rules' }))

    const field = document.querySelector('input[id$="-value"]')
    if (!(field instanceof HTMLInputElement)) throw new Error('no pattern field')
    await user.clear(field)
    await user.type(field, '(?=a)')

    expect(screen.getByRole('alert').textContent).toMatch(/unsupported/i)
  })

  it('says nothing about a pattern the engine will run', async () => {
    const { user, select } = setup(withPattern())
    await select()
    await user.click(screen.getByRole('tab', { name: 'Rules' }))

    const field = document.querySelector('input[id$="-value"]')
    if (!(field instanceof HTMLInputElement)) throw new Error('no pattern field')
    await user.clear(field)
    // No brackets or braces: `userEvent.type` reads those as its own key syntax.
    await user.type(field, '^abc')

    expect(screen.queryByRole('alert')).toBeNull()
  })
})

describe('moving the selection from one component to another', () => {
  const keyBox = (): HTMLElement => screen.getByRole('textbox', { name: /^Key/ })

  const two = (): [ComponentNode, ComponentNode[]] => [
    { key: 'email', type: 'Field', props: {}, schema: { type: 'string', validations: [] } },
    [{ key: 'phone', type: 'Field', props: {}, schema: { type: 'string', validations: [] } }],
  ]

  it('shows the newly selected component key, not the one before it', async () => {
    const [first, rest] = two()
    const { selectKey } = setup(first, rest)

    await selectKey('email')
    expect((keyBox() as HTMLInputElement).value).toBe('email')

    await selectKey('phone')

    expect((keyBox() as HTMLInputElement).value).toBe('phone')
  })

  it('does not rename the new component to the old one when the old one is gone', async () => {
    const [first, rest] = two()
    const { user, selectKey, node } = setup(first, rest)

    await selectKey('email')
    await selectKey('phone')

    // The row's Remove button, which does not select the row: selecting `email`
    // to delete it would unmount the panel and the stale draft under test.
    await user.click(screen.getByRole('button', { name: 'Remove email' }))
    expect(node('email'), 'the fixture did not actually remove email').toBeUndefined()

    keyBox().focus()
    await user.keyboard('{Enter}')

    expect(node('phone'), 'phone was renamed out from under the selection').toBeDefined()
    expect(
      node('email'),
      'the deleted key came back on a component that never had it',
    ).toBeUndefined()
  })

  it('carries no refusal message across from the component before it', async () => {
    const [first, rest] = two()
    const { user, selectKey } = setup(first, rest)

    await selectKey('email')
    await user.clear(keyBox())
    await user.type(keyBox(), 'phone{Enter}')
    expect(screen.getByRole('alert')).toBeTruthy()

    await selectKey('phone')

    expect(screen.queryByRole('alert')).toBeNull()
  })

  /*
   * Reads every textbox rather than naming editors: each carries its own
   * `if (value !== committed)` guard, so a new one without it must fail here.
   * Keying the panel on `api.selectedKey` is the wrong fix: a rename keeps the
   * selection, so the Key field would unmount mid-rename and lose focus.
   */
  it('leaves no editor in the panel showing the previous selection value', async () => {
    // Types nothing: a missing guard shows the old value without interaction,
    // and typing in the Key box would rename and remount the editors.
    const marker = 'zzfirst'
    const { selectKey } = setup(
      { key: marker, type: 'Field', props: {}, schema: { type: 'string', validations: [] } },
      [{ key: 'zzsecond', type: 'Field', props: {}, schema: { type: 'string', validations: [] } }],
    )

    await selectKey(marker)
    const before = screen.getAllByRole('textbox')
    expect(before.length, 'no editors were read, so this proves nothing').toBeGreaterThan(0)
    expect(
      before.filter((box) => (box as HTMLInputElement).value.includes(marker)).length,
      'the first selection never showed its own value, so the check below cannot fail',
    ).toBeGreaterThan(0)

    await selectKey('zzsecond')

    const stale = screen
      .getAllByRole('textbox')
      .filter((box) => (box as HTMLInputElement).value.includes(marker))
      .map((box) => box.getAttribute('id') ?? 'an editor with no id')

    expect(stale, 'these editors kept the previous selection value').toEqual([])
  })
})

describe('the number editor, which the fixture kit declares and nothing drove', () => {
  // By role: "Padding" and "Padding binding" labels defeat a name lookup, and
  // `getByRole` throws rather than picking if a second number editor appears.
  const numberBox = (): HTMLInputElement => {
    const box = screen.getByRole('spinbutton')
    if (!(box instanceof HTMLInputElement)) {
      throw new Error('the panel number editor is not an input')
    }
    return box
  }

  it('stores a number the author types', async () => {
    const { user, select, latest } = setup(dataField())
    await select()

    await user.clear(numberBox())
    await user.type(numberBox(), '24')

    expect(latest()?.props['padding']).toEqual({ kind: 'static', value: 24 })
  })

  /*
   * The `Number.isFinite` arm is not covered here: a browser hands `1e999` to
   * the handler, but jsdom sanitises it to '' first, so it needs `e2e/`.
   */

  it('clears the property when the box is emptied', async () => {
    const { user, select, latest } = setup(dataField())
    await select()

    await user.clear(numberBox())
    await user.type(numberBox(), '24')
    await user.clear(numberBox())

    expect(latest()?.props['padding']).toBeUndefined()
  })
})
