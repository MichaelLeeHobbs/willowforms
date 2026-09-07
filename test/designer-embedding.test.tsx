// @vitest-environment jsdom
import { fireEvent, render, within } from '@testing-library/react'
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

describe('embedded designers', () => {
  it('keeps labels and disclosure controls scoped to each embedded designer', () => {
    const first = open([email])
    const second = open([email])
    for (const view of [first, second]) {
      const shell = within(view.container)
      fireEvent.click(view.container.querySelector('[data-fs-key="emailField"]')!)
      for (const tab of ['Properties', 'Style', 'Rules', 'Settings']) {
        fireEvent.click(shell.getByRole('tab', { name: tab }))
        for (const label of view.container.querySelectorAll<HTMLLabelElement>('label[for]')) {
          expect(label.control, label.htmlFor).not.toBeNull()
          expect(view.container.contains(label.control), label.htmlFor).toBe(true)
        }
      }
    }
    const ids = [...document.querySelectorAll('[id]')].map((element) => element.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
