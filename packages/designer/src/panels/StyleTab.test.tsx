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
      const row = view.container.querySelector<HTMLElement>('[data-fs-row="' + node.key + '"]')
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

    expect(harness.latest()?.css?.any).toContain('grid-template-areas')
    expect(harness.latest()?.css?.any).toContain('border-radius: 4px')
  })

  it('removes the entry when its last declaration goes', async () => {
    // A component nobody styled carries no `css` key rather than an empty one.
    const harness = setup({ ...field(), css: { any: 'padding: 8px' } })
    await harness.openStyle()

    await harness.user.clear(screen.getByLabelText('Padding'))

    expect(harness.latest()?.css).toBeUndefined()
  })

  it('edits each breakpoint separately', async () => {
    const harness = setup({ ...field(), css: { any: 'padding: 8px' } })
    await harness.openStyle()

    await harness.user.selectOptions(screen.getByLabelText('Applies to'), 'mobile')
    await harness.user.type(screen.getByLabelText('Padding'), '4px')

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
    const row = document.querySelector<HTMLElement>('[data-fs-row="email"]')
    if (!row) throw new Error('no tree row')
    await harness.user.click(row)

    const disclosure = screen.getByText('Advanced').closest('details')
    expect(disclosure).toBeTruthy()
    expect(disclosure?.open).toBe(false)
    expect(screen.getByLabelText('Label')).toBeTruthy()
  })
})
