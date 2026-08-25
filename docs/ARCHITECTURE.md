# Architecture

## The kit seam

This is the one decision everything else hangs off, and the one that cannot be retrofitted.

A kit has two halves that live in different packages:

```
metadata half  ->  Kit          from @formsmith/core      pure data, no React
rendering half ->  RendererKit  from @formsmith/renderer   React components
```

`@formsmith/kit-mui` exports both (`muiKit`, `muiRendererKit`), but the designer only ever imports the
metadata half. It builds the palette from `ComponentDef[]` and the properties panel from `PropSchema[]`.
It never imports a component library.

Three things fall out of that:

- **Adding a kit is a new package.** `@formsmith/kit-shadcn` implements the same two exports. No change
  to core, renderer, or designer.
- **Core runs in Node.** No React import anywhere in `@formsmith/core`, so the same validation runs on a
  server. `apps/demo-server` exists to prove that, not because Formsmith needs a backend.
- **Runtime ships without the designer.** Most consumers embed a form and never embed a builder. They
  pay for `@formsmith/renderer` plus their kit, and nothing else.

The counter-argument was to hardcode MUI and move faster. Rejected because the designer would then be
written against concrete components, and every one of those call sites becomes a rewrite the day a
second kit is wanted. The abstraction is not speculative: the competitor this project studied ships
three kits, and the registry is where its extensibility lives.

## The document model

A form is a recursive tree of `ComponentNode`. The tree is the source of truth. JSON Schema is an
**export** format, never storage, because JSON Schema cannot express layout or nesting, and layout is
half of what a visual builder produces.

```
FormDocument
  root: ComponentNode          always a container
  actions                      named JS actions, referenced by events
  languages / translations     per-language bundles keyed <componentKey>_<prop>
  settings
```

### Property values are a tagged union

```ts
type PropValue =
  | { kind: 'static';   value: JsonValue }
  | { kind: 'computed'; expression: string }
  | { kind: 'i18n';     key: string }
```

FormEngine's equivalent is a bag discriminated by the *presence* of an optional `computeType` field.
A tagged union means every consumer switches exhaustively, so adding a fourth binding mode is a compile
error at every call site rather than a silent fallthrough.

### Validation rules carry their parameters

```ts
type ValidationRule =
  | { key: 'required';  message?: string; when?: PropValue }
  | { key: 'minLength'; value: number; message?: string; when?: PropValue }
  | ...
```

The rule set studied for prior art was an untyped `{ key, message? }`, which cannot express `minLength`
without a side channel.

Two behavioural rules, both learned from that teardown:

1. **Every rule except `required` passes on an empty value.** Requiredness is one rule's job. A field
   declaring only `url` must not report "Required" when blank; that was a real bug in the demo we studied
   and there is a test named after it.
2. **Missing sandbox degrades permissively.** Expression-backed rules and `when` guards need a JS
   evaluator, which core does not provide. With no evaluator injected, guarded rules are skipped and
   `custom` rules pass. A missing sandbox must not throw and must not silently fail a user's form.

## Immutability and undo

Every operation in `core/tree.ts` returns a new tree and shares structure with the old one. Editing a
leaf allocates only that node's ancestors; untouched subtrees keep referential identity, which is what
`React.memo` needs to skip them.

The designer's history is a past/present/future triple over whole documents. Snapshots are cheap for the
reason above. The stack is capped at `MAX_HISTORY` (100), because an uncapped undo history is a slow leak
that only shows up in a long authoring session.

## CSS isolation

The designer's chrome CSS is scoped to `.fs-toolbar`, `.fs-panel`, and `.fs-canvas__bar`. It is never
scoped to `.fs-shell`.

This is not stylistic fussiness. The first build used `.fs-shell input { padding: 5px 8px; ... }`, which
reached straight into the MUI components on the canvas, overrode their padding, and broke the notched
outline so every field label sat on top of its own border. The canvas hosts the kit's components and
must inherit nothing from the builder.

Theming is custom properties on `.fs-shell`, so a host restyles the builder by overriding tokens rather
than fighting specificity. Light is the base; dark is a token swap under both `prefers-color-scheme` and
an explicit `[data-fs-theme]` attribute, so a host managing its own theme can force either.

## Code execution is a privilege boundary

Computed properties, custom validation rules, and code actions all execute author-supplied JavaScript.
In a single-user builder that is fine. In any multi-user deployment it is remote code execution by
design.

Core deliberately does not ship an evaluator. The host injects one and owns the sandbox (worker or
iframe with a restricted global). Nothing in this repo should ever add a convenience `eval`-backed
default, because the convenience would be indistinguishable from the vulnerability.
