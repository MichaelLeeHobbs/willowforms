// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { createDocument, prop } from '@willowforms/core'
import type { ComponentNode } from '@willowforms/core'
import { htmlKit, htmlRendererKit } from '@willowforms/kit-html'
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

const required = (label: string): ComponentNode => ({
  key: label.toLowerCase() + 'Field',
  dataKey: label.toLowerCase(),
  type: 'TextField',
  props: { label: prop(label) },
  schema: { type: 'string', validations: [{ key: 'required' }] },
})

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

  it('changes the action note when the same action gives the same answer twice', () => {
    open([
      {
        key: 'send',
        type: 'Button',
        props: { text: prop('Send') },
        events: { onClick: [{ type: 'builtin', name: 'emit', params: { event: 'submit' } }] },
      },
    ])
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }))
    const canvas = within(screen.getByRole('main'))
    const note = canvas.getByRole('status')
    expect(note.textContent).toBe('')

    fireEvent.click(canvas.getByRole('button', { name: 'Send' }))
    const first = note.textContent
    expect(first).toContain('Form is valid.')

    fireEvent.click(canvas.getByRole('button', { name: 'Send' }))
    expect(note.textContent).toContain('Form is valid.')
    expect(note.textContent, 'an unchanged live region is never read out').not.toBe(first)
  })

  it('changes the action note when a field action repeats it, though the change clears it first', () => {
    open([
      {
        key: 'agree',
        type: 'Checkbox',
        props: { label: prop('Agree') },
        schema: { type: 'boolean', validations: [] },
        events: {
          onChange: [{ type: 'builtin', name: 'announce', params: { message: 'Saved.' } }],
        },
      },
    ])
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }))
    const canvas = within(screen.getByRole('main'))
    const note = canvas.getByRole('status')
    const agree = canvas.getByRole('checkbox', { name: 'Agree' })

    fireEvent.click(agree)
    const first = note.textContent
    expect(first).toContain('Saved.')

    fireEvent.click(agree)
    expect(note.textContent).toContain('Saved.')
    expect(note.textContent, 'an unchanged live region is never read out').not.toBe(first)
  })

  it('says what Validate found, and changes the note when it finds the same again', () => {
    open([required('Name'), required('City')])
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }))
    const canvas = within(screen.getByRole('main'))
    const note = canvas.getByRole('status')
    const validate = canvas.getByRole('button', { name: 'Validate' })

    for (const [answered, result] of [
      [undefined, 'Check 2 fields before submitting.'],
      ['Name', 'Check 1 field before submitting.'],
      ['City', 'All answers are valid.'],
    ] as const) {
      if (answered)
        fireEvent.change(canvas.getByRole('textbox', { name: answered }), {
          target: { value: 'Given' },
        })
      expect(note.textContent, 'the last result no longer holds').toBe('')

      fireEvent.click(validate)
      expect(note.textContent).toBe(result)

      fireEvent.click(validate)
      expect(note.textContent).toContain(result)
      expect(note.textContent, 'an unchanged live region is never read out').not.toBe(result)
    }
  })

  it('drops the note when the form is edited or Preview is left', () => {
    const view = open([required('Name')])
    fireEvent.click(view.container.querySelector('[data-fs-key="nameField"]')!)
    fireEvent.keyDown(view.container.querySelector('.fs-shell')!, { key: 'Delete' })
    expect(view.container.querySelector('[data-fs-key="nameField"]')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Preview' }))
    const canvas = within(screen.getByRole('main'))
    fireEvent.click(canvas.getByRole('button', { name: 'Validate' }))
    expect(canvas.getByRole('status').textContent).toBe('All answers are valid.')

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(canvas.getByRole('textbox', { name: 'Name' }).getAttribute('aria-invalid')).toBe('true')
    expect(canvas.getByRole('status').textContent).toBe('')

    fireEvent.click(canvas.getByRole('button', { name: 'Validate' }))
    expect(canvas.getByRole('status').textContent).toBe('Check 1 field before submitting.')
    fireEvent.click(canvas.getByRole('button', { name: 'Back to editing' }))
    fireEvent.click(canvas.getByRole('button', { name: 'Preview' }))
    expect(canvas.getByRole('status').textContent).toBe('')
  })

  it("checks a field's new value when the field's own action validates", () => {
    open([
      {
        ...required('Name'),
        events: { onChange: [{ type: 'builtin', name: 'validate', params: {} }] },
      },
    ])
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }))
    const canvas = within(screen.getByRole('main'))
    const name = canvas.getByRole('textbox', { name: 'Name' })

    fireEvent.change(name, { target: { value: 'Given' } })
    expect(canvas.getByRole('status').textContent).toBe('All answers are valid.')

    fireEvent.change(name, { target: { value: '' } })
    expect(canvas.getByRole('status').textContent).toBe('Check 1 field before submitting.')

    fireEvent.change(name, { target: { value: 'Given' } })
    fireEvent.click(canvas.getByRole('button', { name: 'Clear data' }))
    fireEvent.click(canvas.getByRole('button', { name: 'Validate' }))
    expect(canvas.getByRole('status').textContent).toBe('Check 1 field before submitting.')
  })

  it('shows guidance for an empty document only while editing', () => {
    open([])
    const canvas = within(screen.getByRole('main'))
    expect(canvas.getByText('Start building your form')).toBeTruthy()
    fireEvent.click(canvas.getByRole('button', { name: 'Preview' }))
    expect(canvas.queryByText('Start building your form')).toBeNull()
  })
})
