# @formsmith/kit-mui

The Material UI kit for [FormSmith](https://github.com/MichaelLeeHobbs/formsmith), and the reference
implementation of the kit contract.

```bash
npm install @formsmith/kit-mui @mui/material @emotion/react @emotion/styled
```

```tsx
import { muiKit, muiRendererKit } from '@formsmith/kit-mui'

export const kit = muiKit
export const renderers = muiRendererKit
```

A kit has two halves that live in different packages. `muiKit` is the metadata half, a `Kit` from
`@formsmith/core`, and it is all the designer ever sees. `muiRendererKit` is the rendering half, a
`RendererKit` from `@formsmith/renderer`, and it is all the runtime ever sees.

It ships 26 component types, the same set as `@formsmith/kit-html`, so a document authored against one
kit renders against the other. One property is not shared: `Button.variant` is `contained`, `outlined`
or `text` here and `solid`, `outline` or `plain` there, so a button crossing kits falls back to the
other kit's default variant. Every other property means the same thing in both.

Copy this package as the starting point for a kit of your own. The contract is two exports and one
obligation: every renderer spreads `nodeProps` onto its outermost DOM element.

MIT.
