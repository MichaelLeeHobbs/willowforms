import { useCallback, useRef, useState } from 'react'
import type { MouseEvent, ReactNode } from 'react'
import type { FormData, JsonValue } from '@formsmith/core'
import { validateForm } from '@formsmith/core'
import { FormRenderer } from '@formsmith/renderer'
import type { RendererKit } from '@formsmith/renderer'

import type { DesignerApi } from '../store.js'
import { SelectionLayer, keyFromEventTarget } from './SelectionLayer.js'

export interface CanvasProps {
  api: DesignerApi
  rendererKit: RendererKit
}

/**
 * The canvas renders the real runtime renderer, not a design-time approximation.
 * What you see is literally what ships, which is the only way a WYSIWYG builder
 * stays honest as the kit evolves.
 *
 * While editing, a click is a selection gesture rather than an interaction, so
 * pointer events are swallowed in the capture phase before the kit's components
 * see them. Preview mode hands the form back its own events untouched.
 */
export function Canvas({ api, rendererKit }: CanvasProps): ReactNode {
  const [preview, setPreview] = useState(false)
  const [data, setData] = useState<FormData>({})
  const [validated, setValidated] = useState(false)
  const [hoverKey, setHoverKey] = useState<string | undefined>(undefined)

  const surfaceRef = useRef<HTMLDivElement>(null)
  const errors = validated ? validateForm(api.document.root, data) : {}

  const onChange = useCallback((key: string, value: JsonValue) => {
    setData((d) => ({ ...d, [key]: value }))
  }, [])

  const { select } = api

  // Capture-phase mousedown is what actually stops a click from focusing a text
  // field, toggling a checkbox, or opening a select. Cancelling only the click
  // is too late for all three.
  const onMouseDownCapture = useCallback((event: MouseEvent) => {
    event.preventDefault()
  }, [])

  const onClickCapture = useCallback(
    (event: MouseEvent) => {
      event.stopPropagation()
      select(keyFromEventTarget(event.target))
    },
    [select],
  )

  return (
    <div className="fs-canvas__inner">
      <div className="fs-canvas__bar">
        <button
          type="button"
          onClick={() => {
            setPreview((p) => !p)
            setValidated(false)
            setHoverKey(undefined)
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
        ref={surfaceRef}
        className={'fs-canvas__surface' + (preview ? ' is-preview' : '')}
        {...(preview
          ? {}
          : {
              onMouseDownCapture,
              onClickCapture,
              onPointerOver: (event: MouseEvent) => setHoverKey(keyFromEventTarget(event.target)),
              onPointerLeave: () => setHoverKey(undefined),
            })}
      >
        <FormRenderer
          document={api.document}
          kit={rendererKit}
          data={data}
          errors={errors}
          onChange={onChange}
        />

        {!preview && (
          <SelectionLayer
            surfaceRef={surfaceRef}
            document={api.document}
            selectedKey={api.selectedKey}
            selectedType={api.selectedNode?.type}
            hoverKey={hoverKey}
          />
        )}
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
