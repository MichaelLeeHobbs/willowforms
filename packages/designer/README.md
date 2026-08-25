# @formsmith/designer

The visual form designer. MIT licensed, which is the entire point.

Every comparable product opens its runtime and paywalls the builder.
[Formsmith](https://github.com/MichaelLeeHobbs/formsmith) opens both.

```bash
npm install @formsmith/designer @formsmith/core @formsmith/renderer
```

```tsx
import { Designer } from '@formsmith/designer'
import '@formsmith/designer/styles.css'
import { muiKit, muiRendererKit } from '@formsmith/kit-mui'

;<Designer
  initialDocument={document}
  kit={muiKit}
  rendererKit={muiRendererKit}
  onChange={setDocument}
/>
```

## No component library

The designer has no UI-library dependency. Its chrome is plain CSS, and it builds the palette from
`ComponentDef[]` and the properties panel from `PropSchema[]`, never from concrete components. Adding a
second kit is a new package, not a rewrite of the builder.

## Theming

Every value is a custom property on `.fs-shell`, so a host restyles the builder by overriding tokens
rather than fighting specificity:

```css
.fs-shell {
  --fs-primary: #6d28d9;
  --fs-radius: 10px;
}
```

Light is the base. Dark is a token swap under both `prefers-color-scheme` and an explicit
`[data-fs-theme="dark"]`, so a host that manages its own theme can force either.

MIT.
