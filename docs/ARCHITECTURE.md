# Architecture

## The kit seam

This is the one decision everything else hangs off, and the one that cannot be retrofitted.

A kit has two halves that live in different packages:

```
metadata half  ->  Kit          from @willowforms/core      pure data, no React
rendering half ->  RendererKit  from @willowforms/renderer   React components
```

`@willowforms/kit-mui` exports both (`muiKit`, `muiRendererKit`), but the designer only ever imports the
metadata half. It builds the palette from `ComponentDef[]` and the properties panel from `PropSchema[]`.
It never imports a component library.

The rendering half carries one obligation. Every renderer spreads `nodeProps` onto its outermost DOM
element, which puts `data-fs-key`, `data-fs-type` and `data-fs-scope` in the output -- plus
`data-fs-row` inside a repeater and `data-fs-hidden` on a node the designer reveals. That is the only
thing tying a
rendered element back to a document node, and the canvas selection overlay is built on it: the designer
hit-tests with `closest('[data-fs-key]')` and measures the element it finds. A kit that drops
`nodeProps` still renders correctly, but its components cannot be selected on the canvas.

The alternative was for the renderer to wrap every node in a `display: contents` span it controls, which
needs no cooperation from the kit. Rejected because such a span generates no box, so the overlay would
have to infer geometry from a Range over the element's contents rather than read it from a real
`getBoundingClientRect`. One line per renderer buys exact frames. The attributes ship at runtime too,
not only in the designer, which gives anyone writing an end-to-end test against a live form a stable
selector for free.

Three things fall out of that:

- **Adding a kit is a new package.** `@willowforms/kit-shadcn` implements the same two exports. No change
  to core, renderer, or designer.
- **Core runs in Node.** No React import anywhere in `@willowforms/core`, so the same validation runs on a
  server. `apps/demo-server` exists to prove that, not because WillowForms needs a backend.
- **Runtime ships without the designer.** Most consumers embed a form and never embed a builder. They
  pay for `@willowforms/renderer` plus their kit, and nothing else.

The counter-argument was to hardcode MUI and move faster. Rejected because the designer would then be
written against concrete components, and every one of those call sites becomes a rewrite the day a
second kit is wanted. The abstraction is not speculative: the competitor this project studied ships
three kits, and the registry is where its extensibility lives.

`@willowforms/kit-html` is the evidence rather than the argument. Adding it changed nothing in `core`, `renderer` or `designer`. It did touch build configuration -- a project reference, a source alias, a stylesheet copy, the lockfile -- along with the playground, which had to offer the choice, and one bug in the other kit that the new contract test exposed. The playground switches between the two kits at runtime on the same document.

`test/kit-contract.test.tsx` turns the contract into an executable spec that runs against every kit in the repo: a renderer for every palette entry and no orphans, `nodeProps` reaching the DOM, containers rendering children inside themselves, data-bound components surviving an absent value, and errors actually being displayed. A third kit is added to that list and nothing else.

## The document model

A form is a recursive tree of `ComponentNode`. The tree is the source of truth. JSON Schema is an
**export** format, never storage, because JSON Schema cannot express layout or nesting, and layout is
half of what a visual builder produces. `toJsonSchema` in core is that one-way projection: it walks the
tree, keeps only data-bound components, and produces a flat object, because `FormData` is flat and keyed
by data key regardless of how deeply the components nest. **Nesting is layout and does not reach the
payload; repetition is cardinality and does.** So a `Repeater` is the one exception, and not an arbitrary
one: cardinality is the single structural thing JSON Schema expresses natively, as an `array` whose
`items` is the object its rows describe, with those rows' `required` inside `items` rather than on the
document. A `custom` rule is arbitrary JavaScript
and has no declarative equivalent, so `unexportableRules` names the fields whose rules the export drops
rather than letting the loss go unmentioned.

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
  | { kind: 'static'; value: JsonValue }
  | { kind: 'computed'; expression: string }
  | { kind: 'i18n'; key: string }
  | { kind: 'condition'; condition: Condition }
```

FormEngine's equivalent is a bag discriminated by the _presence_ of an optional `computeType` field.
A tagged union means every consumer switches exhaustively, so adding a binding mode is a compile error
at every call site rather than a silent fallthrough. That is not hypothetical: `condition` is the fourth
member, added when `renderWhen` and rule guards needed a rule the engine can evaluate without a sandbox,
and the compiler named every place that had to learn about it.

### Validation rules carry their parameters

`ValidationRule` is a union discriminated by `key`, so `minLength` has a number and `required` has none. [08-validation.md](spec/08-validation.md#the-rule-catalogue) lists the members. The rule set studied for prior art was an untyped `{ key, message? }`, which cannot express `minLength` without a side channel.

Three behavioural rules, all learned from the prior-art study in `docs/prior-art`:

1. **Every rule except `required` passes on an empty value.** Requiredness is one rule's job. A field
   declaring only `url` must not report "Required" when blank; that was a real bug in the demo we studied
   and there is a test named after it.
2. **Validation and rendering agree about what is visible.** `isVisible` in core decides, and both the renderer and `validateForm` call it. Hiding a container hides everything under it.
3. **Missing sandbox degrades permissively.** `custom` rules and `computed` guards need a JS evaluator, which core does not provide. With no evaluator injected, a rule with a `computed` guard is skipped and `custom` rules pass. A missing sandbox must not throw and must not silently fail a user's form.

## Immutability and undo

Every operation in `core/tree.ts` returns a new tree and shares structure with the old one. Editing a
leaf allocates only that node's ancestors; untouched subtrees keep referential identity, which is what
`React.memo` needs to skip them. An operation that changes nothing returns the very same tree. `packages/core/src/tree.test.ts` asserts the identities directly.

The designer's history is a past/present/future triple over whole documents. Snapshots are cheap for the
reason above. The stack is capped at `MAX_HISTORY` (100), because an uncapped undo history is a slow leak
that only shows up in a long authoring session.

## CSS isolation

Every selector in the designer's stylesheet names a class the designer itself renders -- a hundred or so
of them, `.fs-toolbar`, `.fs-panel`, `.fs-tree__row` and the rest -- and no selector that descends from a
scope containing the form may end on anything else.

"About forty" is what this said, against 102 the day it was counted. A figure in prose is true when it is
written and never again, so this one is deliberately not a number:
`packages/designer/src/designer.css.test.ts` is what actually holds the rule, and it derives the class
list from the stylesheet rather than from a count anybody maintains.

`.fs-shell` is one of those scopes and is not forbidden: it carries the theme tokens and the shell's own
layout, which is what a scope is for. What is forbidden is reaching _through_ it. `.fs-shell input` is
the rule the invariant was written about: the first build used `.fs-shell input { padding: 5px 8px; ... }`,
which reached straight into the MUI components on the canvas, overrode their padding, and broke the
notched outline so every field label sat on top of its own border. The canvas hosts the kit's components
and must inherit nothing from the builder.

Three scopes under `.fs-canvas` are the designer's own chrome rather than the form -- `.fs-canvas__bar`,
`.fs-canvas__data` and what is inside them -- and `designer.css.test.ts` holds them as an allowlist. A
fourth cannot arrive without somebody adding it there, which is the direction that matters: a guard that
lists the scopes containing the form stops noticing when the form moves into a new wrapper, and that is
exactly how `.fs-canvas__frame input` once passed every assertion in the file.

There are two deliberate exceptions, and neither sets a visual property. Both are allowlisted in
`designer.css.test.ts`, pinned to the exact declarations they may carry, so a third one cannot arrive
without somebody saying so:

```css
.fs-canvas__surface:not(.is-preview) [data-fs-key] {
  pointer-events: auto;
}

.fs-canvas__surface [data-fs-key] {
  scrollbar-color: ...;
  scrollbar-width: ...;
}
```

The first gives a kit component back the hit-testing the surface took from it. The second undoes the
scrollbar styling the surface would otherwise push inward.

MUI sets `pointer-events: none` on a disabled Button, and a kit is free to do the same on any disabled
control. Without this rule that component cannot be clicked on the canvas, and the click silently
selects its parent instead, which is worse than doing nothing. Restoring hit-testing cannot make the
control interactive, because the canvas cancels every pointer event in the capture phase while editing.
Any future exception has to clear the same bar: interaction only, never appearance.

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
