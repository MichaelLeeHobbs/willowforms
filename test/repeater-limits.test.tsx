/** @vitest-environment jsdom */

import { fireEvent, render, within } from '@testing-library/react'
import type { ReactElement } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { createDocument, prop } from '@willowforms/core'
import type { ComponentNode, ValidationRule } from '@willowforms/core'
import { FormRenderer } from '@willowforms/renderer'
import { htmlRendererKit } from '@willowforms/kit-html'
import { muiRendererKit } from '@willowforms/kit-mui'

function repeater(validations: ValidationRule[]): ComponentNode {
  return {
    key: 'itemList',
    dataKey: 'items',
    type: 'Repeater',
    props: { label: prop('Items') },
    children: [],
    schema: { type: 'array', validations },
  }
}

for (const kit of [htmlRendererKit, muiRendererKit]) {
  describe(kit.id + ' repeater limits', () => {
    it.each(['minItems', 'maxItems'] as const)('%s follows the current guard', (key) => {
      const document = createDocument('Items', 'items')
      document.root.children = [
        repeater([
          {
            key,
            value: 1,
            when: {
              kind: 'condition',
              condition: {
                op: 'truthy',
                value: { kind: 'context', path: 'limited' },
              },
            },
          },
        ]),
      ]
      const change = vi.fn()
      const draw = (limited: boolean): ReactElement => (
        <FormRenderer
          document={document}
          kit={kit}
          data={{ items: [{}] }}
          context={{ limited }}
          onChange={change}
        />
      )
      const { container, rerender } = render(draw(false))
      const button = within(container).getByRole('button', {
        name: key === 'minItems' ? 'Remove Items item 1' : 'Add Items',
      })
      expect(button.hasAttribute('disabled')).toBe(false)
      fireEvent.click(button)
      expect(change).toHaveBeenCalledWith('items', key === 'minItems' ? [] : [{}, {}])
      rerender(draw(true))
      expect(button.hasAttribute('disabled')).toBe(true)
      rerender(draw(false))
      expect(button.hasAttribute('disabled')).toBe(false)
    })

    it.each([
      { key: 'minItems' as const, values: [0, 1.5], count: 2, button: 'Remove Items item 1' },
      { key: 'maxItems' as const, values: [3, 1], count: 1, button: 'Add Items' },
    ])('$key honors every applicable bound', ({ key, values, count, button }) => {
      const document = createDocument('Items', 'items')
      document.root.children = [repeater(values.map((value) => ({ key, value })))]
      const { container } = render(
        <FormRenderer
          document={document}
          kit={kit}
          data={{ items: Array.from({ length: count }, () => ({})) }}
          onChange={() => undefined}
        />,
      )
      expect(within(container).getByRole('button', { name: button }).hasAttribute('disabled')).toBe(
        true,
      )
    })

    it('evaluates a nested repeater bound in its enclosing row', () => {
      const document = createDocument('Rows', 'rows')
      document.root.children = [
        {
          key: 'rowList',
          dataKey: 'rows',
          type: 'Repeater',
          props: { label: prop('Rows') },
          schema: { type: 'array' },
          children: [
            repeater([
              {
                key: 'maxItems',
                value: 1,
                when: {
                  kind: 'condition',
                  condition: {
                    op: 'truthy',
                    value: { kind: 'ref', scope: 'row', dataKey: 'limited' },
                  },
                },
              },
            ]),
          ],
        },
      ]
      const { container } = render(
        <FormRenderer
          document={document}
          kit={kit}
          data={{
            limited: true,
            rows: [
              { limited: false, items: [{}] },
              { limited: true, items: [{}] },
            ],
          }}
          onChange={() => undefined}
        />,
      )
      const buttons = within(container).getAllByRole('button', { name: 'Add Items' })
      expect(buttons).toHaveLength(2)
      expect(buttons[0]?.hasAttribute('disabled')).toBe(false)
      expect(buttons[1]?.hasAttribute('disabled')).toBe(true)
    })
  })
}
