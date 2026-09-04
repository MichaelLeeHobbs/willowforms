/** @vitest-environment jsdom */

import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import type { ReactNode } from 'react'
import type { FormDocument, Kit } from '@formsmith/core'
import type { NodeRendererProps, RendererKit } from '@formsmith/renderer'

import { Designer } from '../Designer.js'

function Node({ nodeProps, children }: NodeRendererProps): ReactNode {
  return <div {...nodeProps}>{children}</div>
}

const kit: Kit = {
  id: 'actions-test',
  label: 'Actions test',
  components: [
    {
      type: 'Button',
      label: 'Button',
      group: 'display',
      defaultProps: {},
      props: [],
      events: ['onClick'],
    },
  ],
}
const rendererKit: RendererKit = { id: 'actions-test', renderers: { Screen: Node, Button: Node } }

function document(): FormDocument {
  return {
    version: '1',
    id: 'actions',
    name: 'Actions',
    root: {
      key: 'root',
      type: 'Screen',
      props: {},
      children: [{ key: 'submit', type: 'Button', props: {} }],
    },
    actions: {},
    languages: [{ code: 'en', name: 'English', bidi: 'ltr' }],
    defaultLanguage: 'en',
    translations: {},
    settings: {},
  }
}

describe('action authoring', () => {
  it('wires an ordered built-in action to a declared component event', async () => {
    const user = userEvent.setup()
    let latest = document()
    const view = render(
      <Designer
        initialDocument={latest}
        kit={kit}
        rendererKit={rendererKit}
        onChange={(next) => {
          latest = next
        }}
      />,
    )

    fireEvent.click(screen.getByRole('tab', { name: 'Tree' }))
    await user.click(view.container.querySelector<HTMLElement>('[data-fs-tree-row="submit"]')!)
    await user.click(screen.getByRole('tab', { name: 'Actions' }))
    await user.selectOptions(screen.getByLabelText('Action for onClick'), 'builtin:announce')
    await user.click(screen.getByRole('button', { name: 'Add' }))

    expect(latest.root.children?.[0]?.events?.onClick).toEqual([
      { type: 'builtin', name: 'announce', params: { message: '' } },
    ])
  })

  it('authors reusable code actions at document scope', async () => {
    const user = userEvent.setup()
    let latest = document()
    render(
      <Designer
        initialDocument={latest}
        kit={kit}
        rendererKit={rendererKit}
        onChange={(next) => {
          latest = next
        }}
      />,
    )

    await user.click(screen.getByRole('tab', { name: 'Settings' }))
    await user.type(screen.getByLabelText('New code action name'), 'prepare')
    await user.click(screen.getByRole('button', { name: 'Add action' }))

    expect(latest.actions.prepare).toEqual({ name: 'prepare', body: '', params: {} })
    expect(screen.getByText(/host must provide a sandboxed action evaluator/i)).toBeTruthy()
  })

  it('removes references when a shared code action is deleted', async () => {
    const user = userEvent.setup()
    let latest = document()
    latest = {
      ...latest,
      actions: { prepare: { name: 'prepare', body: 'return []', params: {} } },
      root: {
        ...latest.root,
        children: [
          {
            key: 'submit',
            type: 'Button',
            props: {},
            events: { onClick: [{ type: 'code', name: 'prepare' }] },
          },
        ],
      },
    }
    render(
      <Designer
        initialDocument={latest}
        kit={kit}
        rendererKit={rendererKit}
        onChange={(next) => {
          latest = next
        }}
      />,
    )

    await user.click(screen.getByRole('tab', { name: 'Settings' }))
    await user.click(screen.getByRole('button', { name: 'Remove prepare' }))

    expect(latest.actions).toEqual({})
    expect(latest.root.children?.[0]?.events).toBeUndefined()
  })
})
