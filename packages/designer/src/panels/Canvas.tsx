import { useCallback, useState } from 'react'
import type { ReactNode } from 'react'
import type { FormData, JsonValue } from '@formsmith/core'
import { validateForm } from '@formsmith/core'
import { FormRenderer } from '@formsmith/renderer'
import type { RendererKit } from '@formsmith/renderer'

import type { DesignerApi } from '../store.js'

export interface CanvasProps {
  api: DesignerApi
  rendererKit: RendererKit
}

/**
 * The canvas renders the real runtime renderer, not a design-time approximation.
 * What you see is literally what ships, which is the only way a WYSIWYG builder
 * stays honest as the kit evolves.
 */
export function Canvas({ api, rendererKit }: CanvasProps): ReactNode {
  const [preview, setPreview] = useState(false)
  const [data, setData] = useState<FormData>({})
  const [validated, setValidated] = useState(false)

  const errors = validated ? validateForm(api.document.root, data) : {}

  const onChange = useCallback((key: string, value: JsonValue) => {
    setData((d) => ({ ...d, [key]: value }))
  }, [])

  return (
    <div className="fs-canvas__inner">
      <div className="fs-canvas__bar">
        <button
          type="button"
          onClick={() => {
            setPreview((p) => !p)
            setValidated(false)
          }}
          aria-pressed={preview}
        >
          {preview ? 'Back to editing' : 'Preview'}
        </button>

        {preview && (
          <>
            <button type="button" onClick={() => setValidated(true)}>
              Validate
            </button>
            <button
              type="button"
              onClick={() => {
                setData({})
                setValidated(false)
              }}
            >
              Clear data
            </button>
          </>
        )}
      </div>

      <div
        className={'fs-canvas__surface' + (preview ? ' is-preview' : '')}
        onClick={preview ? undefined : () => api.select(undefined)}
      >
        <FormRenderer
          document={api.document}
          kit={rendererKit}
          data={data}
          errors={errors}
          onChange={onChange}
        />
      </div>

      {preview && (
        <div className="fs-canvas__data">
          <section>
            <h2 className="fs-panel__heading">Data</h2>
            <pre>{JSON.stringify(data, null, 2)}</pre>
          </section>
          <section>
            <h2 className="fs-panel__heading">Errors</h2>
            <pre>{JSON.stringify(errors, null, 2)}</pre>
          </section>
        </div>
      )}
    </div>
  )
}
