# @formsmith/renderer

The runtime renderer for [Formsmith](https://github.com/MichaelLeeHobbs/formsmith) documents.

Ships independently of the designer, because most consumers embed a form and never embed a builder.
It walks a document and resolves property bindings; it knows nothing about which component library draws
the result.

```bash
npm install @formsmith/renderer @formsmith/core @formsmith/kit-mui
```

```tsx
import { FormRenderer } from '@formsmith/renderer'
import { muiRendererKit } from '@formsmith/kit-mui'
import { applyChange } from '@formsmith/core'
import type { FormData, FormDocument, FormErrors } from '@formsmith/core'

declare const form: FormDocument
declare const data: FormData
declare const errors: FormErrors
declare const setData: (update: (current: FormData) => FormData) => void

export const view = (
  <FormRenderer
    document={form}
    kit={muiRendererKit}
    data={data}
    errors={errors}
    onChange={(address, value) => setData((current) => applyChange(current, address, value))}
  />
)
```

## Writing a kit

A renderer receives resolved props and must spread `nodeProps` onto its outermost DOM element:

```tsx
import type { NodeRendererProps } from '@formsmith/renderer'

export function TextFieldNode({ nodeProps, value, onChange }: NodeRendererProps) {
  return (
    <input {...nodeProps} value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} />
  )
}
```

That puts `data-fs-key` and `data-fs-type` in the output. The designer's canvas selection is built on it,
and it doubles as a stable selector for end-to-end tests against a live form. A kit that drops it still
renders correctly, but its components cannot be selected in the designer.

## Computed bindings

`computed` props need a JS evaluator, which is not bundled. Pass one via `evaluate` and own the sandbox.
Without it, computed props resolve to `null` and the form still renders.

MIT.
