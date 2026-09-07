# @willowforms/designer

The visual form designer. MIT licensed, which is the entire point.

Every comparable product opens its runtime and paywalls the builder.
[WillowForms](https://github.com/MichaelLeeHobbs/willowforms) opens both.

```bash
npm install @willowforms/designer @willowforms/core @willowforms/renderer @willowforms/kit-mui
```

```tsx
import { Designer } from '@willowforms/designer'
import '@willowforms/designer/styles.css'
import { muiKit, muiRendererKit } from '@willowforms/kit-mui'
import type { FormDocument } from '@willowforms/core'

declare const saved: FormDocument
declare const store: (next: FormDocument) => void

/*
 * `initialDocument` is read once, at mount, and ignored afterwards. `onChange`
 * is how the document leaves the designer; there is no way to drive it back in.
 */
export const builder = (
  <Designer initialDocument={saved} kit={muiKit} rendererKit={muiRendererKit} onChange={store} />
)
```

`initialDocument` is **not** a controlled prop. It is read once in a `useState` initializer and every
later value is ignored, which `docs/spec/12-api.md` states as the contract.

This example used to be written as a controlled component -- `initialDocument={form}` with
`onChange={setForm}`, where `form` is the state `onChange` sets. That reads as a two-way binding and is
not one: the document a host holds and the document the designer holds diverge on the first edit that
does not come from the host, and a reader concludes the designer can be driven from outside when it
cannot. `apps/playground/src/App.tsx` documents having been bitten by exactly that and keeps its live
document in a ref.

To replace the document a designer is editing, change its React `key` so a new one mounts.

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

`theme` controls the toolbar choice and designer chrome. `onThemeChange` reports changes so the host can
apply the same mode to the renderer kit's own theme provider:

```tsx
import { Designer } from '@willowforms/designer'
import type { DesignerProps, DesignerTheme } from '@willowforms/designer'

declare const mode: DesignerTheme
declare const setMode: (mode: DesignerTheme) => void
declare const props: Omit<DesignerProps, 'theme' | 'onThemeChange'>

;<Designer theme={mode} onThemeChange={setMode} {...props} />
```

The themes remain independently owned: this callback aligns them without making the designer depend on
the component library used by the kit.

MIT.
