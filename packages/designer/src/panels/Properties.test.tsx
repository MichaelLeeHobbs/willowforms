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
        // A number editor, so what this panel stores for one can be checked.
        { name: 'padding', label: 'Padding', editor: 'number' },
        { name: 'tint', label: 'Tint', editor: 'color' },
        { name: 'glyph', label: 'Glyph', editor: 'icon' },
        { name: 'script', label: 'Script', editor: 'code' },
        { name: 'notes', label: 'Notes', editor: 'multiline' },
        { name: 'locked', label: 'Locked', editor: 'boolean', conditional: true },
        /*
         * A select whose declared values are not strings, which is the case the
         * panel's own comment says it handles. Neither shipped kit declares one,
         * which is the only reason the defect was invisible: the panel is the
         * part a third kit meets first.
         */
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

/**
 * The Key field, which this file never touched.
 *
 * The write-tests skill names it as the reference draft-and-commit shape --
 * type freely, commit on blur or Enter, refuse with a reason and keep the text
 * so it can be corrected -- and the panel that owns it had no test for it here
 * at all. A rename also re-points every condition naming the old key, so a
 * refusal that quietly half-applied is the worst outcome available.
 */
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
    /*
     * `<KeyField key={node.key}>` made a successful rename change the key this
     * field is keyed on, so React unmounted it and mounted a new one -- taking
     * the focus with it. `document.body` is also outside `.fs-shell`, so the
     * shell's keyboard shortcuts stopped firing as well: one rename and the
     * keyboard was gone until something was clicked.
     *
     * Nothing in this file looked at focus, so the fix that removed the `key`
     * had nothing holding it in place. Focus is checkable in jsdom.
     */
    const { user, select } = setup(dataField())
    await select()

    await user.clear(keyBox())
    await user.type(keyBox(), 'email{Enter}')

    expect(document.activeElement).toBe(keyBox())
  })

  it('is gone rather than stale after the rename is undone', async () => {
    /*
     * The other half of removing that `key`, and it is not the half it looks
     * like. This field holds a draft and has no re-sync, so a key changing
     * underneath it would leave the box showing text the document does not
     * have -- and the next blur would commit that text, silently redoing the
     * rename the undo had just taken back. That is the failure `DataKeyField`
     * has its own describe for, further down this file.
     *
     * It cannot happen here, and this is why: undo restores a document in which
     * `email` does not exist, the store refuses to leave the selection on a node
     * that is gone, and the whole panel unmounts with it. Written down as a test
     * because the safety comes from two components agreeing, and the agreement
     * is invisible from either one.
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
    /*
     * The reason this is a draft rather than a live write: every intermediate
     * spelling of a key is a rename of its own, and `em` is a key like any
     * other. Committing per keystroke would rewrite the document, and every
     * condition naming it, eleven times.
     */
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
    /*
     * The field goes back to the key the component actually has. It reverts and
     * says why, which is the whole point of the docblock on `KeyField`: the
     * version before it reverted silently, so a refused rename looked like a
     * field that would not accept typing.
     */
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
     * A `Step` is a Step because its `renderWhen` compares `context.step`
     * against its own key, so a rename that moved the key and left the
     * condition made the step unsatisfiable, permanently, with nothing
     * reporting why. Same hole `duplicateNode` had from the other side.
     *
     * Only its own condition. What a *sibling* names is a data key, and a
     * rename does not follow those -- see `found.md`.
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

  it('shows a hex value in the swatch', async () => {
    // The wiring, asserted first, because everything below is about what the
    // swatch does *not* do and none of it means anything if it shows nothing.
    const { user } = await open()
    await user.type(screen.getByLabelText('Tint'), '#336699')

    expect(screen.getByLabelText('Pick a colour')).toHaveProperty('value', '#336699')
  })

  it('leaves a value it cannot represent exactly where it was', async () => {
    /*
     * The swatch falls back to black for anything that is not `#rrggbb`, and the
     * assertion here used to be that it shows `#000000` -- which jsdom produces
     * on its own for an unparseable value, so deleting the fallback left it
     * green. What can fail, and is the actual contract, is the other half: the
     * text and the document still say `transparent`, because a swatch that owned
     * the value would have rewritten it to the nearest hex on first paint.
     *
     * So the `#000000` assertion is gone rather than kept as a comment saying
     * it cannot fail: a line that always passes is a line a reader has to
     * re-derive the uselessness of every time they meet it.
     */
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

    // Picking is a deliberate act, so it replaces whatever was there.
    expect(latest()?.props['tint']).toEqual({ kind: 'static', value: '#ff0000' })
    /*
     * By role, because the row's label picks up a visually hidden "(modified)"
     * once the property has been touched, which is the marker the panel draws to
     * say a value is no longer the default.
     */
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

  /**
   * Every arm of the operator picker, not just the unary one.
   *
   * `morph` has five arms -- comparison, unary, membership, group and `not` --
   * and one `selectOptions` on the Comparison picker in the whole file, which
   * drove one of them. The arms it did not drive are where the carrying logic
   * lives: what a group turns into when it becomes a scalar, and what a scalar
   * turns into when it becomes a group. Its own docblock records the regression
   * that logic exists for -- changing a group to a scalar used to discard the
   * group outright, and the store coalesces by label, so one undo went back to
   * before the whole condition was authored.
   */
  const morphTo = async (harness: Harness, ops: string[]): Promise<void> => {
    await harness.user.selectOptions(screen.getByLabelText('Show when'), 'condition')
    for (const op of ops) {
      /*
       * The outermost picker, which is the first in the DOM. A group draws a
       * Comparison select of its own for every condition inside it, so once
       * the operator is `and` there is more than one on screen and the
       * unqualified query is ambiguous -- Trap 4, in the panel it keeps
       * happening in.
       */
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
    /*
     * The regression the carrying logic was written for. Delete it and the
     * group's contents go with the change of operator -- and because the store
     * coalesces edits by label, the one undo available goes back to before the
     * condition was authored at all rather than restoring the group.
     */
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
    /*
     * A hand-edited document, or a field renamed after the condition was
     * authored. The select offers the fields that exist, so a ref to a missing
     * one has nothing to match -- and a `<select>` with no matching option
     * shows its first, which would mean the panel displaying a different
     * subject than the document holds. Quietly re-pointing a rule at another
     * field is worse than showing an unfamiliar name, which is what the extra
     * option is for.
     *
     * Every ref fixture in this file named a key that is in the list, and the
     * malformed ones all degrade to literals, so this option could be deleted
     * with nothing red.
     */
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

    // And the document is untouched by having been looked at.
    expect(harness.latest()?.renderWhen).toEqual({
      kind: 'condition',
      condition: { op: 'truthy', value: { kind: 'ref', dataKey: 'renamedAway' } },
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
    ['static true', { kind: 'static', value: true }, 'other'],
    ['static false', { kind: 'static', value: false }, 'never'],
    ['a translation key', { kind: 'i18n', key: 'x' }, 'other'],
    ['an expression', { kind: 'computed', expression: 'a' }, 'computed'],
  ])('reads %s out of a hand-edited document as %s', async (_label, renderWhen, expected) => {
    /*
     * `renderWhen` is a PropValue, so a document can hold any of its kinds.
     * Reading anything truthy as "a condition" left the select saying so while
     * rendering no editor, which made those documents unfixable from the panel.
     *
     * A static truthy and a translation key both *behave* as no condition, which
     * is what `isVisible` does with them -- and they read as `other` rather than
     * `always`, because a select already showing Always fires no change when
     * Always is chosen, so the row displayed the stray value and could not
     * remove it. The option says "Always (unrecognised rule)" and choosing
     * anything replaces it.
     */
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
    // An empty box says the condition compares against nothing, which is not
    // what the document says -- and typing into it replaced the structure.
    await open({ a: 1 })
    expect(screen.getByDisplayValue('{"a":1}')).toBeTruthy()
  })

  it('shows null as null', async () => {
    await open(null)
    expect(screen.getByDisplayValue('null')).toBeTruthy()
  })

  it('lets a quoted string be authored as a string', async () => {
    /*
     * `true` and `18` become the boolean and the number, which is what a form
     * needs and what made the *words* unauthorable: a condition testing a text
     * field whose answer is "true" could not be written here at all. Quoting is
     * the escape hatch, and it is JSON's own.
     */
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
      /*
       * `await harness.select()`, not `expect(...).resolves.toBeUndefined()`.
       *
       * That asserted the return value of `user.click`, which is `undefined` on
       * every path that resolves -- so it read as "selecting worked" while
       * saying nothing at all. What the test is about is the row below.
       */
      const harness = setup(withRenderWhen(condition))
      await harness.select()

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

  it('adds a row when Add condition is clicked', async () => {
    /*
     * The `ConditionEditor`'s only suite never pressed this button, so the one
     * gesture that grows a condition group -- the reason the group exists -- was
     * covered by nothing. Everything else here starts from a group somebody else
     * built.
     *
     * Counted by the remove buttons rather than by the options boxes: a new row
     * is an `eq` comparison, which has no options list, so counting textareas
     * counts the rows that happen to be membership tests.
     */
    const harness = setup(twoLists())
    await harness.select()

    expect(screen.getAllByRole('button', { name: /^Remove condition/ })).toHaveLength(2)

    await harness.user.click(screen.getByRole('button', { name: 'Add condition' }))

    expect(screen.getAllByRole('button', { name: /^Remove condition/ })).toHaveLength(3)

    // The document has it too, not only the panel.
    const held = harness.latest()?.renderWhen
    const condition = held?.kind === 'condition' ? held.condition : undefined
    expect(
      condition && 'conditions' in condition && Array.isArray(condition.conditions)
        ? condition.conditions.length
        : 0,
    ).toBe(3)
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

    /*
     * The draft exists. Without this the test's name was a claim about a state
     * it never reached: `clear` plus `type` with no blur is what makes an
     * uncommitted draft, and if either had stopped working the row below would
     * still have read `second` and the test would still have passed.
     */
    expect(boxes[0]).toHaveProperty('value', 'typed-but-not-committed')

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

/**
 * Tabbing past a control is not editing it.
 *
 * The options box commits on blur, and it committed unconditionally — so simply
 * moving focus through the panel parsed the stored list and wrote the parse
 * back. Parsing is lossy on purpose: it trims, drops blanks, and reads text that
 * looks numeric as a number. So a stored `"007"` became the number `7` and a
 * stored `" x "` became `"x"`, without anybody typing anything, and each pass
 * left an undo entry for an edit that was never made.
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
    /*
     * Both of these survive a render and are changed by a parse, which is what
     * makes them the fixture: `007` is text a postcode or an account number
     * would hold, and the spaces are somebody's deliberate padding.
     */
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
    // Undo is the visible half. Every tab-through used to push a version, so
    // undo walked back through edits nobody made before reaching a real one.
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
    // The control. Never committing would pass both tests above.
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

/**
 * The data key field, after an undo.
 *
 * It holds a draft and commits on blur, which is right — but it never re-synced,
 * and its React key is the node's key, which does not change when only the data
 * key changes. So an undo restored the document while the box went on showing
 * the text from before it, and the next blur wrote that text back: the undo
 * silently reversed, and the payload's key with it.
 *
 * The same shape as the raw CSS field, the JSON editor and the options box.
 * This one was the last editor here without it.
 */
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
    // The failure that made this worth fixing. The box kept the old text, and
    // blurring it committed that text — so the undo undid itself.
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
    /*
     * The control, and the reason a draft exists at all. Re-syncing on every
     * render would throw away what is being typed; only the version this field
     * last saw is replaced.
     */
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
 * A literal that looks numeric and is not.
 *
 * `coerce` turned anything `Number()` accepts into a number, so `is 01234`
 * stored `1234` and could never match the string a postcode field holds. The
 * doc comment beside it named postcodes and phone numbers as the cost and said
 * comparison operators "are the only place this matters" — the code applied it
 * to every literal in every operator.
 *
 * The rule now is that a number has to be spelled the way JavaScript spells it.
 * `18` round-trips to `18` and becomes a number; `01234` round-trips to `1234`,
 * which is not what was typed, so it stays text.
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
    /*
     * The control, and the reason coercion exists: ordering refuses to compare
     * a string to a number rather than guessing, so `is at least 18` against a
     * number field can never be true if the literal is text.
     */
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

/**
 * A select whose declared values are not strings.
 *
 * The comment above this editor says it reads and writes through `jsonToString`
 * and `optionValue`, "which are inverses", and that treating the value as a
 * string in both directions made a kit declaring `{ label: 'Two', value: 2 }`
 * store `"2"`. The comment describes the fix; the call does not perform it.
 *
 * `optionValue(options, submitted)` reads `option['value']` off each entry, so
 * it wants the declared options. The call passes `options.map((o) => o.value)`,
 * which unwraps them first -- so the declared-value pass matches nothing, the
 * position pass matches nothing either, and the raw string falls out of the end.
 * Theme 2 of the review, in the panel a third kit meets first.
 */
describe('the select editor and a value that is not a string', () => {
  /*
   * By id, not by label text or by role and name. A property with a value set
   * announces itself as "Weight (modified)", so an exact label misses after the
   * first edit; a loose pattern then matches two comboboxes, because the binding
   * mode selector on the same row carries the same label. Trap 4, twice, in four
   * tests. The id is what names this one control.
   */
  const weightSelect = (): HTMLSelectElement => {
    const element = document.getElementById('fs-prop-weight')
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
    /*
     * The other direction, and the reason "inverses" is the word the comment
     * uses. A panel that stored 2 and then showed nothing selected is the same
     * defect read from the other end.
     */
    const { user, latest, select } = setup(withSelect())
    await select()

    await user.selectOptions(weightSelect(), '2')
    expect(latest()?.props?.['weight']).toEqual({ kind: 'static', value: 2 })
    expect(weightSelect().value).toBe('2')
  })

  it('still clears back to no value at all', async () => {
    // The control: the empty placeholder must keep meaning "no value" rather
    // than becoming a stored empty string.
    const { user, latest, select } = setup(withSelect())
    await select()

    await user.selectOptions(weightSelect(), '2')
    /*
     * `/^Weight/`, because a property with a value set announces itself as
     * "Weight (modified)". That is Trap 4 and it cost this control a run.
     */
    await user.selectOptions(weightSelect(), '')

    expect(latest()?.props?.['weight']).toBeUndefined()
  })
})

/**
 * Choosing "Always" after authoring a condition.
 *
 * Consecutive edits sharing a coalescing label replace the entry on top rather
 * than stacking on it, which is right for typing and wrong for changing what
 * kind of rule this is. Every `setRenderWhen` write shared `renderWhen:<key>`,
 * so selecting "Always" replaced the version holding the condition -- removing
 * it from `past` and from `present` in one move, so it was reachable by neither
 * undo nor redo, and the panel offers no other way back.
 */
describe('a visibility condition and the undo stack', () => {
  const sibling = (): ComponentNode => ({
    key: 'other',
    type: 'Field',
    props: {},
    schema: { type: 'string', validations: [] },
  })

  it('is reachable by undo after choosing Always, and by redo after that', async () => {
    /*
     * Authored here rather than loaded from the fixture, and that is what makes
     * the test able to fail. Coalescing replaces the entry on *top* of the
     * stack, so it only bites when the condition was written by an edit that is
     * still the labelled one -- which is the ordinary case, and exactly what
     * "choosing Always after authoring a condition" means. A fixture that
     * arrives with the condition already in it has no labelled entry to
     * replace, and the first version of this test passed against the defect for
     * that reason.
     */
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

    /*
     * And forward again. An undo that restores it while a redo cannot take it
     * away would mean the entry was rebuilt rather than kept, which is a
     * different bug with the same first half.
     */
    await user.click(screen.getByRole('button', { name: 'Redo' }))
    expect(latest()?.renderWhen).toBeUndefined()
  })

  it('still folds a run of typing into one entry rather than one per keystroke', async () => {
    /*
     * The control, and the reason the label is not simply removed. Coalescing is
     * what makes typing an expression one undo step, and without it each
     * character would be its own -- one undo would leave `ab`.
     *
     * Three characters typed and one undo takes all of it *and* the mode change
     * that created the empty expression, because that edit is the entry the
     * typing folds into. That is the coalescing working, not a second bug: the
     * empty expression a mode change produces is not a state anybody wants to
     * return to.
     */
    const { user, latest, select } = setup(
      { key: 'field', type: 'Field', props: {}, schema: { type: 'string', validations: [] } },
      [sibling()],
    )
    await select()

    await user.selectOptions(screen.getByLabelText('Show when'), 'computed')
    await user.type(screen.getByLabelText('Show when expression'), 'abc')
    expect(latest()?.renderWhen).toEqual({ kind: 'computed', expression: 'abc' })

    // One undo takes the whole run, not one character of it. Without the label
    // this would be `{ kind: 'computed', expression: 'ab' }`.
    await user.click(screen.getByRole('button', { name: 'Undo' }))
    expect(latest()?.renderWhen).toBeUndefined()
  })
})

/**
 * The membership options box, and the values it could not spell.
 *
 * `coerce` parses a line beginning `{`, `[` or `"` as JSON, and its comment says
 * an object "is what the box shows a document that already holds one". The box
 * spelled its lines with `jsonToString`, which answers the empty string for an
 * object, a list and `null` -- so the document's option showed as a blank line,
 * and a blank line is dropped on commit. Touching the control at all deleted the
 * option.
 *
 * The quoting half is the same defect one step quieter: a stored string `"18"`
 * spelled as `18` came back from `coerce` as the number, so editing one line
 * silently changed a neighbour's type.
 */
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
    /*
     * The consequence. A blank line is dropped on commit, so the option was
     * deleted by the first edit anybody made to any other line -- silently, and
     * with the condition still looking right in the panel.
     */
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
    // The controls. Quoting everything would be its own defect: the panel's
    // whole point is that `18` is the number and `"18"` is the text.
    const { select } = setup(withOptions([18, 'GB', true]), [sibling()])
    await select()

    expect(optionsBox().value.split('\n')).toEqual(['18', 'GB', 'true'])
  })
})

/**
 * A data key judged by the rule a key is judged by.
 *
 * `setDataKey` never called `keyProblem`. Its only call site is `renameKey`, one
 * function away, which validates and reports the reason so the field can show
 * it -- so the panel refused `first-name` as a key and stored it as a data key,
 * writing a document its own `validateDocument` reports as malformed.
 *
 * A data key does the same jobs a key does: it is the property name in the
 * submitted payload, in exported JSON Schema, and the name a `ref` in a
 * condition mentions. One rule, so a rename and a data key are judged the same
 * way, which is exactly what `keys.ts` says about a rename and a paste.
 */
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
    // The controls. A field that refused everything would pass every row above
    // and make the override unauthorable.
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

/**
 * Editing on the canvas, and what the panel does around it.
 */
describe('the Rules tab and a pattern nobody can run', () => {
  const withPattern = (): ComponentNode => ({
    key: 'field',
    type: 'Field',
    props: {},
    schema: { type: 'string', validations: [{ key: 'pattern', value: '' }] },
  })

  it('says so under the field, where it can still be fixed', async () => {
    /*
     * The engine refuses a pattern with an unbounded repeat inside another, and
     * refusing means the rule *fails* -- so an author who typed one saw an
     * ordinary rule here and every answer rejected on the server.
     */
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

    expect(screen.getByRole('alert').textContent).toMatch(/unbounded repeat/i)
  })

  it('says nothing about a pattern the engine will run', async () => {
    // The control, and it includes a half-typed one: an error under the field
    // before the first character is finished would be worse than none.
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
    // No brackets or braces: `userEvent.type` reads those as its own key syntax.
    await user.type(field, '^abc')

    expect(screen.queryByRole('alert')).toBeNull()
  })
})

/**
 * The panel across a selection change, which no test in this file or in `e2e/`
 * ever performed.
 *
 * The harness has had `selectKey` since it was written and every test called it
 * exactly once, as the first selection -- so the transition that every editor
 * in this panel has to survive was the one transition never driven. Eight
 * editors carry a re-sync guard for it and several more are keyed per node at
 * their call site; `KeyField` was neither, and the docblock justifying that
 * said "the panel above already remounts on that", which nothing does.
 *
 * The test at 'is gone rather than stale after the rename is undone' pins the
 * unmount-on-undo half of exactly this reasoning. This is the selection half.
 */
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
    /*
     * The whole defect, end to end, and the reason it is worse than a display
     * bug. With the stale draft still reading `email`, `commit()` compares it
     * against value `'phone'`, finds them different, and calls
     * `renameKey('phone', 'email')` -- which now *succeeds*, because deleting
     * `email` freed the name. `phone` is silently renamed, and since
     * `dataKeyOf` falls back to the node key, the submitted payload key goes
     * with it.
     */
    const [first, rest] = two()
    const { user, selectKey, node } = setup(first, rest)

    await selectKey('email')
    await selectKey('phone')

    /*
     * The row's Remove button, not a click on the row followed by Delete.
     *
     * That was the first version and it was vacuous -- it passed with the guard
     * deleted. Selecting `email` in order to delete it leaves the selection on
     * a node that is then gone, `Properties` takes its `!node` early return, and
     * the unmount destroys the stale draft the test exists to observe. The
     * review's scenario is specifically that the selection *stays* on `phone`,
     * and this button is the control that does that: it carries
     * `onPointerDown` `stopPropagation` so removing a row does not select it.
     */
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
   * The sweep, and the reason it is not a list of editor names.
   *
   * The panel is safe today because eight editors each carry their own
   * `if (value !== committed)` block, not because anything keys the panel on the
   * selection -- so a ninth editor added without one inherits the bug silently,
   * and a test naming the eight would not notice. This drives whatever the panel
   * actually renders: every textbox gets typed into under the first selection,
   * and none of them may still be showing that text under the second.
   *
   * A key on the panel would make all of this structural, and it is the wrong
   * fix here: the store keeps the selection on a node it just renamed, so
   * keying on `api.selectedKey` unmounts the Key field mid-rename and takes the
   * focus and the refusal alert with it -- the defect its call site records as
   * already fixed once.
   */
  it('leaves no editor in the panel showing the previous selection value', async () => {
    /*
     * The sweep, and the reason it types nothing.
     *
     * An editor with no re-sync guard seeds its draft with `useState(value)`
     * and never updates it, so it shows the previous node's value across a
     * selection change with no interaction at all -- which is exactly what the
     * Key row did. Driving the boxes first was the first draft of this test and
     * it was worse than useless: typing into the Key box renames the node on
     * blur, which remounts every keyed sibling, so the captured elements
     * detached and the test failed on "could not be focused" rather than on
     * anything about staleness.
     *
     * Not a list of editor names, because the panel is safe today only by eight
     * independent guards rather than by one key on the panel -- so the ninth
     * editor added without one is the thing this has to catch, and a test
     * naming the eight would not. This reads whatever the panel renders.
     */
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
