// @vitest-environment jsdom
import { render } from '@testing-library/react'
import { expect, it } from 'vitest'
import { createDocument, prop } from '@willowforms/core'
import type { ReactNode } from 'react'
import { FormRenderer } from './index.js'
import type { NodeRendererProps } from './index.js'

function Inspect({ nodeProps, density, children }: NodeRendererProps): ReactNode {
  return (
    <div {...nodeProps} data-density-value={density ?? 'host'}>
      {children}
    </div>
  )
}

it('inherits density through groups and repeated rows without leaking between forms', () => {
  const doc = createDocument('Density', 'density')
  doc.root.props['density'] = prop('compact')
  doc.root.children = [
    {
      key: 'comfortable',
      type: 'Stack',
      props: { density: prop('comfortable') },
      children: [
        { key: 'inner', type: 'Stack', props: { density: prop('inherit') }, children: [] },
      ],
    },
    {
      key: 'rows',
      type: 'Repeater',
      props: {},
      schema: { type: 'array', validations: [] },
      children: [{ key: 'entry', type: 'Stack', props: {}, children: [] }],
    },
  ]
  const other = createDocument('Other', 'other')
  const kit = { id: 'inspect', renderers: { Screen: Inspect, Stack: Inspect, Repeater: Inspect } }
  const { container } = render(
    <>
      <FormRenderer document={doc} kit={kit} data={{ rows: [{}, {}] }} onChange={() => {}} />
      <FormRenderer document={other} kit={kit} data={{}} onChange={() => {}} />
    </>,
  )
  expect(container.querySelector('[data-fs-key="inner"]')?.getAttribute('data-density-value')).toBe(
    'comfortable',
  )
  const rows = [...container.querySelectorAll('[data-fs-key="entry"]')]
  expect(rows).toHaveLength(2)
  expect(rows.map((row) => row.getAttribute('data-density-value'))).toEqual(['compact', 'compact'])
  const roots = [...container.querySelectorAll('[data-fs-key="root"]')]
  expect(roots.map((root) => root.getAttribute('data-fs-density'))).toEqual(['compact', null])
})
