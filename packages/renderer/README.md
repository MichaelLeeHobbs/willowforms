# @willowforms/renderer

The runtime renderer for [WillowForms](https://github.com/MichaelLeeHobbs/willowforms) documents.

Ships independently of the designer, because most consumers embed a form and never embed a builder.
It walks a document and resolves property bindings; it knows nothing about which component library draws
the result.

```bash
npm install @willowforms/renderer @willowforms/core @willowforms/kit-mui
```

```tsx
import { FormRenderer } from '@willowforms/renderer'
import { muiRendererKit } from '@willowforms/kit-mui'
import { applyChange } from '@willowforms/core'
import type { FormData, FormDocument, FormErrors } from '@willowforms/core'

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
import { jsonToString } from '@willowforms/core'
import type { NodeRendererProps } from '@willowforms/renderer'

export function TextFieldNode({ nodeProps, value, onChange }: NodeRendererProps) {
  return (
    <input {...nodeProps} value={jsonToString(value)} onChange={(e) => onChange(e.target.value)} />
  )
}
```

`jsonToString`, not `String(value ?? '')`. Both in-repo kits started with the latter and moved off it: a
value that is an object renders as `[object Object]` straight into the input, which is a form the user
cannot correct by typing.

That puts `data-fs-key`, `data-fs-type` and `data-fs-scope` in the output. The scope is what keeps two
forms on one page apart, `02-kit-contract.md` calls it load-bearing, and `test/kit-contract.test.tsx`
enforces it per kit. The designer's canvas selection is built on it,
and it doubles as a stable selector for end-to-end tests against a live form. A kit that drops it still
renders correctly, but its components cannot be selected in the designer.

## Computed bindings

`computed` props need a JS evaluator, which is not bundled. Pass one via `evaluate` and own the sandbox.
Without it, computed props resolve to `null` and the form still renders.

MIT.
