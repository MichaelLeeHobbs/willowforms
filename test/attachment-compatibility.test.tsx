/** @vitest-environment jsdom */

import { fireEvent, render, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { expect, it, vi } from 'vitest'
import { createDocument, loadDocument, prop, submittedData } from '@willowforms/core'
import { FormRenderer } from '@willowforms/renderer'
import type { NodeRendererProps } from '@willowforms/renderer'
import { htmlKit, htmlRendererKit } from '@willowforms/kit-html'
import { muiKit, muiRendererKit } from '@willowforms/kit-mui'

function Attachment({ nodeProps, value, onChange }: NodeRendererProps): ReactNode {
  return (
    <div {...nodeProps}>
      <output>{typeof value === 'string' ? value : ''}</output>
      <button type="button" onClick={() => onChange('attachment_123')}>
        Use uploaded attachment
      </button>
    </div>
  )
}

for (const [kit, renderer] of [
  [htmlKit, htmlRendererKit],
  [muiKit, muiRendererKit],
] as const) {
  it(kit.id + ' keeps legacy definitions readable and delegates attachments to the host', () => {
    const document = createDocument('Legacy attachment', 'legacy')
    document.root.children = [
      {
        key: 'attachment',
        dataKey: 'evidence',
        type: 'FileUpload',
        props: { label: prop('Evidence') },
        schema: { type: 'file' },
      },
    ]
    const loaded = loadDocument(document)
    expect(loaded.ok).toBe(true)
    if (!loaded.ok) throw new Error('Legacy file document was rejected')
    expect(loaded.document).toEqual(document)
    expect(kit.components.some((def) => def.type === 'FileUpload')).toBe(false)
    const data = { evidence: 'previous-name.pdf' }
    expect(submittedData(loaded.document.root, data)).toEqual(data)
    const change = vi.fn()
    const { container, rerender } = render(
      <FormRenderer
        document={loaded.document}
        kit={renderer}
        data={data}
        errors={{ attachment: 'Choose a replacement attachment.' }}
        onChange={change}
      />,
    )
    expect(within(container).getByRole('alert').textContent).toContain('FileUpload')
    expect(within(container).getByRole('alert').textContent).toContain(
      'Choose a replacement attachment.',
    )
    expect(container.querySelector('input[type="file"]')).toBeNull()
    expect(container.querySelector('[data-fs-key="attachment"]')).not.toBeNull()

    rerender(
      <FormRenderer
        document={loaded.document}
        kit={{ ...renderer, renderers: { ...renderer.renderers, FileUpload: Attachment } }}
        data={data}
        onChange={change}
      />,
    )
    expect(within(container).queryByRole('alert')).toBeNull()
    expect(within(container).getByRole('status').textContent).toBe('previous-name.pdf')
    fireEvent.click(within(container).getByRole('button', { name: 'Use uploaded attachment' }))
    expect(change).toHaveBeenCalledWith('evidence', 'attachment_123')
  })
}
