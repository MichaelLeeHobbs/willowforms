# @formsmith/renderer

The runtime renderer for [Formsmith](https://github.com/MichaelLeeHobbs/formsmith) documents.

Ships independently of the designer, because most consumers embed a form and never embed a builder.
It walks a document and resolves property bindings; it knows nothing about which component library draws
the result.

```bash
npm install @formsmith/renderer @formsmith/core
```

```tsx
import { FormRenderer } from '@formsmith/renderer'
import { muiRendererKit } from '@formsmith/kit-mui'

;<FormRenderer
  document={document}
  kit={muiRendererKit}
  data={data}
  errors={errors}
  onChange={(key, value) => setData((d) => ({ ...d, [key]: value }))}
/>
```

## Writing a kit

A renderer receives resolved props and must spread `nodeProps` onto its outermost DOM element:

```tsx
function TextFieldNode({ nodeProps, props, value, error, onChange }: NodeRendererProps) {
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
