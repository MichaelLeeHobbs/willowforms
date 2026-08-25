# @formsmith/kit-mui

The Material UI kit for [Formsmith](https://github.com/MichaelLeeHobbs/formsmith), and the reference
implementation of the kit contract.

```bash
npm install @formsmith/kit-mui @mui/material @emotion/react @emotion/styled
```

```tsx
import { muiKit, muiRendererKit } from '@formsmith/kit-mui'
```

A kit has two halves that live in different packages. `muiKit` is the metadata half, a `Kit` from
`@formsmith/core`, and it is all the designer ever sees. `muiRendererKit` is the rendering half, a
`RendererKit` from `@formsmith/renderer`, and it is all the runtime ever sees.

Components: Screen, Stack, Heading, TextField, NumberField, Checkbox, Select, Button.

Copy this package as the starting point for a kit of your own. The contract is two exports and one
obligation: every renderer spreads `nodeProps` onto its outermost DOM element.

MIT.
