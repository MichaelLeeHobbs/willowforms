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

import { render, screen } from '@testing-library/react'
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
      props: [{ name: 'label', label: 'Label', editor: 'string' }],
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

function setup(node: ComponentNode): Harness {
  const user = userEvent.setup()
  let current: FormDocument = {
    version: '1',
    id: 'doc',
    name: 'Contact',
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
