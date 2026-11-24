/**
 * @vitest-environment jsdom
 */

import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { ReactNode } from 'react'
import { createDocument } from '@willowforms/core'
import type { Kit } from '@willowforms/core'
import type { NodeRendererProps, RendererKit } from '@willowforms/renderer'

import { Designer } from '../Designer.js'

function Screen_({ nodeProps, children }: NodeRendererProps): ReactNode {
  return <div {...nodeProps}>{children}</div>
}

const kit: Kit = { id: 'fake', label: 'Fake', components: [] }
const rendererKit: RendererKit = { id: 'fake', renderers: { Screen: Screen_ } }

function open(): void {
  const document = createDocument('Settings', 'settings')
  document.actions = { prepare: { name: 'prepare', body: '', params: {} } }
  render(<Designer initialDocument={document} kit={kit} rendererKit={rendererKit} />)
  fireEvent.click(screen.getByRole('tab', { name: 'Settings' }))
}

const refuseAction = (): void => {
  fireEvent.click(screen.getByRole('button', { name: 'Add action' }))
}

const refuseParams = (): void => {
  const field = screen.getByLabelText('Default parameters')
  fireEvent.change(field, { target: { value: '{ not json' } })
  fireEvent.blur(field)
}

const refuseLanguage = (): void => {
  fireEvent.click(screen.getByRole('button', { name: 'Add language' }))
}

describe('an error in Settings', () => {
  it.each([
    ['New code action name', refuseAction],
    ['Default parameters', refuseParams],
    ['Code', refuseLanguage],
  ])('is an alert that describes the %s field', (label, refuse) => {
    open()
    const field = screen.getByLabelText(label)
    expect(field.getAttribute('aria-describedby')).toBeNull()

    refuse()

    const alert = screen.getByRole('alert')
    expect(alert.textContent).not.toBe('')
    expect(alert.id).not.toBe('')
    expect(field.getAttribute('aria-describedby')).toBe(alert.id)
    expect(field.getAttribute('aria-invalid')).toBe('true')
  })

  it.each([
    ['New code action name', refuseAction],
    ['Code', refuseLanguage],
  ])('changes when the %s field is refused for the same reason again', (_label, refuse) => {
    open()

    refuse()
    const first = screen.getByRole('alert').textContent
    refuse()

    expect(screen.getByRole('alert').textContent).not.toBe(first)
    expect(screen.getByRole('alert').textContent).toContain(first)
  })

  it('stays as it is when an invalid field is left without an edit', () => {
    open()
    refuseParams()
    const first = screen.getByRole('alert').textContent

    fireEvent.blur(screen.getByLabelText('Default parameters'))

    expect(screen.getByRole('alert').textContent).toBe(first)
  })
})
