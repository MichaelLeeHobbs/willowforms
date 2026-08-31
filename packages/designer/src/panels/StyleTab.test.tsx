/**
 * @vitest-environment jsdom
 */

/**
 * The Style tab.
 *
 * The thing worth pinning is that the structured controls and the raw field are
 * two views of one string. Anything that let them drift would give a component
 * two styles and no way to say which wins.
 */

import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import type { ReactNode } from 'react'
import type { ComponentNode, FormDocument, Kit } from '@formsmith/core'
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
        { name: 'gap', label: 'Gap', editor: 'number', section: 'style' },
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

function setup(node: ComponentNode): Harness {
  const user = userEvent.setup()
  let current: FormDocument = {
    version: '1',
    id: 'doc',
    name: 'Styling',
    root: { key: 'root', type: 'Screen', props: {}, children: [node] },
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
  fireEvent.click(screen.getByRole('tab', { name: 'Tree' }))

  return {
    user,
    latest: () => current.root.children?.[0],
    openStyle: async () => {
      const row = view.container.querySelector<HTMLElement>('[data-fs-tree-row="' + node.key + '"]')
      if (!row) throw new Error('no tree row')
      await user.click(row)
      await user.click(screen.getByRole('tab', { name: 'Style' }))
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
    // Committed on blur, not on every keystroke: the control holds a draft so a
    // value with a space in it can be typed at all.
    await harness.user.tab()

    expect(harness.latest()?.css?.any).toContain('padding: 8px')
  })

  it('reads a value back out of hand-written CSS', async () => {
    // The two editors are one string, so a control shows what the raw field
    // holds without anything syncing them.
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

  it('says so rather than silently dropping CSS that would escape the component', async () => {
    /*
     * `}` ends the block and starts a rule that could style the whole page, so
     * the text is refused. Telling the author is the point: silently keeping a
     * value that is never applied is the worst of both.
     */
    const harness = setup(field())
    await harness.openStyle()

    const raw = screen.getByLabelText('CSS')
    await harness.user.type(raw, 'color: red }} body {{ display: none')
    await harness.user.tab()

    expect(screen.getByRole('alert').textContent).toMatch(/Declarations only/)
    expect(raw).toHaveProperty('ariaInvalid', 'true')
    /*
     * And the document does not have it. The warning and the flag were the whole
     * assertion, so a refusal that said its piece and then committed the text
     * anyway -- a rule that escapes the component, which is what the message is
     * about -- passed this test.
     */
    expect(harness.latest()?.css?.any ?? '').not.toContain('body')
    expect(harness.latest()?.css?.any ?? '').not.toContain('}')
  })

  it('keeps the refused text in the box so it can be repaired', async () => {
    // Refusing is not the same as deleting what somebody typed: the text stays,
    // flagged, so the stray brace can be taken out rather than retyped.
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

    /*
     * *Which* properties, which this never asked. A closed `<details>` still
     * renders its children and `getByLabelText` does not filter on visibility,
     * so inverting the routing -- the label folded away and the advanced
     * property given the top of the panel -- kept every assertion above green.
     */
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

/**
 * A structured control holds a draft, like every other editor here that parses.
 *
 * Trap 10 in this repository's own skill, and the third instance of it. The
 * controls read `readDeclaration` on every render and wrote `setDeclaration` on
 * every keystroke, so the value being typed was parsed, normalised and handed
 * back before it was finished. `setDeclaration` trims, so the space in
 * `8px auto` was removed the moment it was typed and the next character landed
 * against `8px` — the field's own placeholder could not be entered into it.
 */
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
    // Not only the stored value: the box itself went blank-ish as the parse
    // rewrote it, which is what made this look like a broken keyboard.
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
