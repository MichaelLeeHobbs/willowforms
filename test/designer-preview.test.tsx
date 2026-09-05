// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { createDocument, prop } from '@formsmith/core'
import type { ComponentNode } from '@formsmith/core'
import { htmlKit, htmlRendererKit } from '@formsmith/kit-html'
import { Designer } from '../packages/designer/src/Designer.js'

function open(children: ComponentNode[]): ReturnType<typeof render> {
  const document = createDocument('Beta review', 'beta')
  document.root.children = children
  return render(<Designer initialDocument={document} kit={htmlKit} rendererKit={htmlRendererKit} />)
}

const email: ComponentNode = {
  key: 'emailField',
  dataKey: 'emailAddress',
  type: 'TextField',
  props: { label: prop('Email') },
  schema: { type: 'string', autoValidate: true, validations: [{ key: 'email' }] },
}

describe('beta authoring regressions', () => {
  it('validates a touched field with a distinct data key before Validate is pressed', () => {
    open([email])
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }))
    const input = within(screen.getByRole('main')).getByRole('textbox', { name: 'Email' })
    fireEvent.change(input, { target: { value: 'invalid' } })
    expect(input.getAttribute('aria-invalid')).toBe('true')
    fireEvent.change(input, { target: { value: 'beta@example.com' } })
    expect(input.getAttribute('aria-invalid')).not.toBe('true')
  })

  it('validates custom data keys inside a repeater without marking untouched rows', () => {
    open([
      {
        key: 'contactList',
        dataKey: 'contacts',
        type: 'Repeater',
        props: { label: prop('contacts') },
        schema: { type: 'array', validations: [] },
        children: [email],
      },
    ])
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }))
    const canvas = within(screen.getByRole('main'))
    fireEvent.click(canvas.getByRole('button', { name: 'Add contacts' }))
    fireEvent.click(canvas.getByRole('button', { name: 'Add contacts' }))
    const inputs = canvas.getAllByRole('textbox', { name: 'Email' })
    fireEvent.change(inputs[1]!, { target: { value: 'invalid' } })
    expect(inputs[1]!.getAttribute('aria-invalid')).toBe('true')
    expect(inputs[0]!.getAttribute('aria-invalid')).not.toBe('true')
  })

  it('does not delete the selected component from a preview button', () => {
    const view = open([email, { key: 'send', type: 'Button', props: { text: prop('Send') } }])
    fireEvent.click(view.container.querySelector('[data-fs-key="emailField"]')!)
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }))
    fireEvent.keyDown(within(screen.getByRole('main')).getByRole('button', { name: 'Send' }), {
      key: 'Delete',
    })
    expect(within(screen.getByRole('main')).getByRole('textbox', { name: 'Email' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Undo' }).hasAttribute('disabled')).toBe(true)
  })

  it('supports numeric step identities without turning them into strings', () => {
    open(
      [1, 2].map((value) => ({
        key: `step${value}`,
        type: 'Step',
        props: { title: prop(`Page ${value}`) },
        children: [],
        renderWhen: {
          kind: 'condition',
          condition: {
            op: 'eq',
            left: { kind: 'context', path: 'step' },
            right: { kind: 'literal', value },
          },
        },
      })),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }))
    const canvas = screen.getByRole('main')
    expect(canvas.querySelector('[data-fs-key="step1"]')).not.toBeNull()
    fireEvent.change(within(canvas).getByLabelText('Step'), { target: { value: '2' } })
    expect(canvas.querySelector('[data-fs-key="step2"]')).not.toBeNull()
    expect(canvas.querySelector('[data-fs-key="step1"]')).toBeNull()
  })

  it('shows guidance for an empty document only while editing', () => {
    open([])
    const canvas = within(screen.getByRole('main'))
    expect(canvas.getByText('Start building your form')).toBeTruthy()
    fireEvent.click(canvas.getByRole('button', { name: 'Preview' }))
    expect(canvas.queryByText('Start building your form')).toBeNull()
  })
})
