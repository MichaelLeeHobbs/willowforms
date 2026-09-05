/** @vitest-environment jsdom */

import { render, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { createDocument, instantiate, prop } from '@formsmith/core'
import { FormRenderer } from '@formsmith/renderer'
import { htmlKit, htmlRendererKit } from '@formsmith/kit-html'
import { muiKit, muiRendererKit } from '@formsmith/kit-mui'

for (const [kit, renderer] of [
  [htmlKit, htmlRendererKit],
  [muiKit, muiRendererKit],
] as const) {
  describe(kit.id + ' declared defaults', () => {
    it.each([
      { type: 'TextField', property: 'label', role: 'textbox', name: 'Label' },
      { type: 'Button', property: 'text', role: 'button', name: 'Submit' },
      { type: 'Heading', property: 'text', role: 'heading', name: 'Heading' },
    ])(
      'resetting $type.$property restores its declared default',
      ({ type, property, role, name }) => {
        const document = createDocument('Defaults', 'defaults')
        const definition = kit.components.find((def) => def.type === type)
        if (!definition) throw new Error('Missing ' + type)
        const node = instantiate(definition, document.root)
        if (!node) throw new Error('Could not create ' + type)
        delete node.props[property]
        document.root.children = [node]
        const { container } = render(
          <FormRenderer document={document} kit={renderer} data={{}} onChange={() => undefined} />,
        )
        expect(within(container).getByRole(role, { name })).toBeTruthy()
        expect(Object.hasOwn(node.props, property)).toBe(false)
      },
    )

    it('starts new headings at H2', () => {
      const definition = kit.components.find((def) => def.type === 'Heading')
      expect(definition?.defaultProps['level']).toBe('h2')
    })

    it.each(['', null])('preserves an explicit %j text override', (value) => {
      const document = createDocument('Defaults', 'defaults')
      document.root.children = [{ key: 'heading', type: 'Heading', props: { text: prop(value) } }]
      const { container } = render(
        <FormRenderer document={document} kit={renderer} data={{}} onChange={() => undefined} />,
      )
      expect(within(container).getByRole('heading').textContent).toBe('')
    })
  })
}
