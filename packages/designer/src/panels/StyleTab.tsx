import { useId, useState } from 'react'
import type { ReactNode } from 'react'
import {
  indexKit,
  backgroundImageProps,
  keyScopesFor,
  readDeclaration,
  safeDeclarations,
  setDeclaration,
} from '@willowforms/core'
import type { Device, Kit } from '@willowforms/core'

import type { DesignerApi } from '../store.js'
import { PropRows } from './Properties.js'
import { FriendlyStyle } from './FriendlyStyle.js'

const CONTROLS: { name: string; label: string; placeholder: string }[] = [
  { name: 'padding', label: 'Padding', placeholder: '8px, or 8px 16px' },
  { name: 'margin', label: 'Margin', placeholder: '0, or 8px auto' },
  { name: 'text-align', label: 'Align', placeholder: 'start, center, end' },
  { name: 'width', label: 'Width', placeholder: '100%, 320px' },
  { name: 'background', label: 'Background', placeholder: 'var(--brand), #eee' },
  { name: 'border', label: 'Border', placeholder: '1px solid #ccc' },
  { name: 'border-radius', label: 'Radius', placeholder: '6px' },
]

const DEVICE_LABEL: Record<Device, string> = {
  any: 'Every width',
  desktop: 'Desktop only',
  tablet: 'Tablet only',
  mobile: 'Mobile only',
}

export interface StyleTabProps {
  api: DesignerApi
  kit: Kit

  device: Device
  onDevice: (next: Device) => void
}

export function StyleTab({ api, kit, device, onDevice }: StyleTabProps): ReactNode {
  const idBase = useId()
  const node = api.selectedNode

  if (!node) {
    return (
      <section className="fs-style">
        <p className="fs-empty">Select a component to style it.</p>
      </section>
    )
  }

  const def = indexKit(kit).get(node.type)
  const styleProps = (def?.props ?? []).filter((prop) => prop.section === 'style')

  const backgroundProps = styleProps.filter((prop) =>
    backgroundImageProps.some((imageProp) => imageProp.name === prop.name),
  )
  const componentProps = styleProps.filter((prop) => !backgroundProps.includes(prop))

  const stored = node.css?.[device]
  const text = typeof stored === 'string' ? stored : ''
  const scopes = keyScopesFor(api.document.root, node.key)

  return (
    <section className="fs-style">
      {componentProps.length > 0 && (
        <>
          <h2 className="fs-style__heading">From this component</h2>
          <PropRows
            api={api}
            node={node}
            schemas={componentProps}
            scopes={scopes}
            defaults={def?.defaultProps}
          />
        </>
      )}

      {backgroundProps.length > 0 && (
        <details className="fs-style-tools__section">
          <summary>Background image</summary>
          <PropRows
            api={api}
            node={node}
            schemas={backgroundProps}
            scopes={scopes}
            defaults={def?.defaultProps}
          />
        </details>
      )}
      <h2 className="fs-style__heading">Appearance</h2>

      <div className="fs-prop-row">
        <label htmlFor={idBase + '-fs-style-device'}>Applies to</label>
        <div className="fs-prop-row__control">
          <select
            id={idBase + '-fs-style-device'}
            value={device}
            onChange={(e) => onDevice(e.target.value as Device)}
          >
            {(['any', 'desktop', 'tablet', 'mobile'] as const).map((name) => (
              <option key={name} value={name}>
                {DEVICE_LABEL[name]}
              </option>
            ))}
          </select>
        </div>
        <p className="fs-prop-row__hint">
          {device === 'any'
            ? 'The base layer, applied at every width. A device overrides it at its own.'
            : 'Overrides the base layer at this width. The canvas is showing it.'}
        </p>
      </div>

      <FriendlyStyle
        key={node.key + ':friendly:' + device}
        text={text}
        base={device === 'any' ? '' : typeof node.css?.any === 'string' ? node.css.any : ''}
        onChange={(next) => api.setNodeCss(node.key, device, next)}
      />
      <details className="fs-style-tools__section">
        <summary>Advanced CSS</summary>
        {CONTROLS.map((control) => (
          <DeclarationField
            key={node.key + ':' + device + ':' + control.name}
            control={control}
            value={readDeclaration(text, control.name)}
            onCommit={(next) => {
              const written = setDeclaration(text, control.name, next)
              if (written && !safeDeclarations(written)) return false
              api.setNodeCss(node.key, device, written)
              return true
            }}
          />
        ))}

        <RawCss
          key={node.key + ':' + device}
          value={text}
          onCommit={(next) => api.setNodeCss(node.key, device, next)}
        />
      </details>
    </section>
  )
}

function DeclarationField({
  control,
  value,
  onCommit,
}: {
  control: { name: string; label: string; placeholder: string }
  value: string

  onCommit: (next: string) => boolean
}): ReactNode {
  const idBase = useId()
  const [draft, setDraft] = useState(value)
  const [committed, setCommitted] = useState(value)

  const [refused, setRefused] = useState('')

  if (value !== committed) {
    setCommitted(value)
    setDraft(value)

    setRefused('')
  }

  const commit = (): void => {
    if (draft === committed) {
      setRefused('')
      return
    }

    const ok = onCommit(draft)
    if (!ok) {
      setRefused(
        'That value cannot be written as CSS. Braces, angle brackets, at-signs, comments and ' +
          'backslashes are refused, and quotes have to be closed.',
      )
      return
    }

    setRefused('')
    setCommitted(draft)
  }

  return (
    <div className="fs-prop-row">
      <label htmlFor={idBase + '-fs-style-' + control.name}>{control.label}</label>
      <div className="fs-prop-row__control">
        <input
          id={idBase + '-fs-style-' + control.name}
          type="text"
          placeholder={control.placeholder}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          aria-invalid={refused ? true : undefined}
          aria-describedby={refused ? idBase + '-fs-style-' + control.name + '-error' : undefined}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              commit()
            }
            if (e.key === 'Escape') {
              setDraft(value)
              setRefused('')
            }
          }}
        />

        {refused && (
          <p
            id={idBase + '-fs-style-' + control.name + '-error'}
            className="fs-prop-row__error"
            role="alert"
          >
            {refused}
          </p>
        )}
      </div>
    </div>
  )
}

function RawCss({
  value,
  onCommit,
}: {
  value: string
  onCommit: (next: string) => void
}): ReactNode {
  const idBase = useId()
  const [draft, setDraft] = useState(value)
  const [committed, setCommitted] = useState(value)
  if (value !== committed) {
    setCommitted(value)
    setDraft(value)
  }

  const refused = draft.trim() !== '' && safeDeclarations(draft) === undefined

  return (
    <div className="fs-prop-row">
      <label htmlFor={idBase + '-fs-style-raw'}>CSS</label>
      <div className="fs-prop-row__control">
        <textarea
          id={idBase + '-fs-style-raw'}
          className="fs-code__area"
          rows={5}
          spellCheck={false}
          placeholder="padding: 8px;&#10;color: var(--brand);"
          aria-invalid={refused ? true : undefined}
          aria-describedby={idBase + '-fs-style-raw-hint'}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            if (refused) return
            setCommitted(draft)
            onCommit(draft)
          }}
        />
      </div>
      <p
        id={idBase + '-fs-style-raw-hint'}
        className={'fs-prop-row__hint' + (refused ? ' is-error' : '')}
        {...(refused ? { role: 'alert' as const } : {})}
      >
        {refused
          ? 'Declarations only. A brace, an at-rule or a < would let this styling leave the component, so it will not be applied.'
          : 'Declarations only, applied to this component. Selectors cannot reach inside it.'}
      </p>
    </div>
  )
}
