import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { FormDocument, FormData } from '@formsmith/core'
import { applyChange, validateForm } from '@formsmith/core'
import { Designer } from '@formsmith/designer'
import { muiKit, muiRendererKit } from '@formsmith/kit-mui'
import { FormRenderer } from '@formsmith/renderer'

import '@formsmith/designer/styles.css'

export function DesignerExample({
  document,
  save,
}: {
  document: FormDocument
  save: (document: FormDocument) => void
}): ReactNode {
  return (
    <Designer
      initialDocument={document}
      kit={muiKit}
      rendererKit={muiRendererKit}
      onChange={save}
    />
  )
}

export function RuntimeExample({ document }: { document: FormDocument }): ReactNode {
  const [data, setData] = useState<FormData>({})
  const errors = useMemo(() => validateForm(document.root, data), [document.root, data])

  return (
    <FormRenderer
      document={document}
      kit={muiRendererKit}
      data={data}
      errors={errors}
      onChange={(address, value) => setData((current) => applyChange(current, address, value))}
    />
  )
}
