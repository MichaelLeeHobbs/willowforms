# @willowforms/kit-mui

The Material UI kit for [WillowForms](https://github.com/MichaelLeeHobbs/willowforms), and the reference
implementation of the kit contract.

```bash
npm install @willowforms/kit-mui @mui/material@9 @emotion/react @emotion/styled
```

```tsx
import { muiKit, muiRendererKit } from '@willowforms/kit-mui'

export const kit = muiKit
export const renderers = muiRendererKit
```

A kit has two halves that live in different packages. `muiKit` is the metadata half, a `Kit` from
`@willowforms/core`, and it is all the designer ever sees. `muiRendererKit` is the rendering half, a
`RendererKit` from `@willowforms/renderer`, and it is all the runtime ever sees.

It ships 26 component types, the same set as `@willowforms/kit-html`, so a document authored against one
kit renders against the other. One property is not shared: `Button.variant` is `contained`, `outlined`
or `text` here and `solid`, `outline` or `plain` there, so a button crossing kits falls back to the
other kit's default variant. Every other property means the same thing in both.

Copy this package as the starting point for a kit of your own. The contract is two exports and one
obligation: every renderer spreads `nodeProps` onto its outermost DOM element.

MIT.
