# @willowforms/kit-html

A dependency-free HTML kit for [WillowForms](https://github.com/MichaelLeeHobbs/willowforms): semantic
elements and a stylesheet, no component library.

```bash
npm install @willowforms/kit-html
```

```tsx
import { htmlKit, htmlRendererKit } from '@willowforms/kit-html'
import '@willowforms/kit-html/styles.css'

export const kit = htmlKit
export const renderers = htmlRendererKit
```

## Why this exists

WillowForms claims that adding a kit is a new package rather than a rewrite of the designer. This package
is the evidence: it was added without touching `@willowforms/core`, `@willowforms/renderer`, or
`@willowforms/designer`, and the designer builds its palette and properties panel from the metadata here
without ever importing it directly.

It ships the same 26 component types as `@willowforms/kit-mui`, so a document authored against one kit
renders against the other. Nothing in the kit contract requires that; it is a courtesy this repo keeps
so swapping kits is a one-line change in the host.

One property is not shared. `Button.variant` is `solid`, `outline` or `plain` here and `contained`,
`outlined` or `text` in `@willowforms/kit-mui`, so a button authored in one kit falls back to the other
kit's default variant rather than carrying its appearance across. Every other property means the same
thing in both, and `test/kit-contract.test.tsx` fails if a second one diverges without being named.

## Accessibility is the kit's job

Each field owns a real `<label for>`, errors are announced through `aria-describedby` with
`role="alert"`, an invalid field carries `aria-invalid`, and every interactive element has a visible
focus ring. The renderer cannot supply any of that: it knows nothing about the markup a kit produces.

## Theming

Every token is a custom property on `.fsh-screen`:

```css
.fsh-screen {
  --fsh-accent: #6d28d9;
  --fsh-radius: 10px;
}
```

Light is the base. Dark is a token swap under both `prefers-color-scheme` and an explicit
`[data-fsh-theme="dark"]`. A `.fsh-screen` override that loads after the stylesheet applies in both; [the theming spec](https://github.com/MichaelLeeHobbs/willowforms/blob/main/docs/spec/11-theming.md#light-and-dark) shows how to set a value for dark only.

## Writing your own kit

Copy this package. The contract is two exports and one obligation: every renderer spreads `nodeProps`
onto its outermost DOM element, which is what the designer's canvas selection and drop targeting are
built on.

MIT.
