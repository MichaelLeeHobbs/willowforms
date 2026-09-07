import { useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { FormDocument, FormData, FormErrors, JsonValue } from '@willowforms/core'
import {
  applyChange,
  contextValues,
  submittedAcross,
  validateAcross,
  validateForm,
} from '@willowforms/core'
import { Designer } from '@willowforms/designer'
import { muiKit, muiRendererKit } from '@willowforms/kit-mui'
import { FormRenderer } from '@willowforms/renderer'

import '@willowforms/designer/styles.css'

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

/** Mount with key={document.id} when changing forms. The host supplies its API call. */
export function SubmissionExample({
  document,
  save,
}: {
  document: FormDocument
  save: (answers: FormData) => Promise<void>
}): ReactNode {
  const [data, setData] = useState<FormData>({})
  const [errors, setErrors] = useState<FormErrors>({})
  const [status, setStatus] = useState('')
  const [saving, setSaving] = useState(false)
  const pending = useRef(false)
  const steps = useMemo(() => contextValues(document.root, 'step'), [document.root])
  const [step, setStep] = useState<JsonValue>(steps[0] ?? null)
  const scopes = steps.length ? steps.map((value) => ({ context: { step: value } })) : [{}]

  const check = (): boolean => {
    const next = validateAcross(document.root, data, scopes)
    setErrors(next)
    if (!Object.keys(next).length) return true
    const first = scopes.findIndex(
      (scope) => Object.keys(validateForm(document.root, data, scope)).length > 0,
    )
    const invalidStep = steps[first]
    if (invalidStep !== undefined) setStep(invalidStep)
    setStatus('Please correct the highlighted fields.')
    return false
  }

  const submit = async (): Promise<void> => {
    if (pending.current || !check()) return
    pending.current = true
    setSaving(true)
    setStatus('Sending…')
    try {
      await save(submittedAcross(document.root, data, scopes))
      setStatus('Submitted successfully.')
    } catch {
      setStatus('Could not submit. Your answers are still here; please try again.')
    } finally {
      pending.current = false
      setSaving(false)
    }
  }

  return (
    <section aria-label="Complete form" aria-busy={saving}>
      <fieldset disabled={saving} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
        <FormRenderer
          document={document}
          kit={muiRendererKit}
          data={data}
          errors={errors}
          context={{ step }}
          navigation={{ path: 'step', onNavigate: setStep }}
          onChange={(address, value) => {
            setData((current) => applyChange(current, address, value))
            setErrors({})
            setStatus('')
          }}
          onEffects={(effects) => {
            if (effects.some((effect) => effect.kind === 'emit' && effect.event === 'submit'))
              void submit()
            else if (effects.some((effect) => effect.kind === 'validate') && check())
              setStatus('All answers are valid.')
          }}
          onActionError={(message) => setStatus('Action could not run: ' + message)}
        />
      </fieldset>
      <p role="status">{status}</p>
    </section>
  )
}
