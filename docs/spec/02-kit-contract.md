# Kit contract

**Status: built.** Two kits ship, and `test/kit-contract.test.tsx` runs every rule below against every
kit in the repository. Adding a third kit means adding one line to a list and nothing else.

A kit is what makes Formsmith render as Material UI, as plain HTML, or as your own design system. It is
the one seam that cannot be retrofitted, so it is specified before anything that depends on it.

## Two halves, two packages

```
metadata half  ->  Kit          from @formsmith/core      pure data, no React
rendering half ->  RendererKit  from @formsmith/renderer   React components
```

A kit package exports both. `@formsmith/kit-mui` exports `muiKit` and `muiRendererKit`;
`@formsmith/kit-html` exports `htmlKit` and `htmlRendererKit`.

The split is the whole design. **The designer only ever imports the metadata half.** It builds the
palette from `ComponentDef[]` and the properties panel from `PropSchema[]`, and it never imports a
component library. A lint rule fails CI if anyone imports one of the named libraries into it.

Three things follow:

- **Adding a kit is a new package.** No change to core, the renderer, or the designer. That is the
  claim, and the commit adding `@formsmith/kit-html` holds it: nothing under those three packages
  changed. It did change build configuration, the playground that demonstrates switching kits, and one
  bug in `@formsmith/kit-mui` that the new contract test exposed.
- **Core runs in Node.** No React anywhere in `@formsmith/core`, so the same validation runs on a server.
- **The runtime ships without the designer.** Most consumers embed a form and never embed a builder.

## The one obligation

**Every renderer spreads `nodeProps` onto its outermost DOM element.**

```tsx
function TextFieldNode({ nodeProps, props, value, error, onChange }: NodeRendererProps): ReactNode {
  return (
    <input {...nodeProps} value={jsonToString(value)} onChange={(e) => onChange(e.target.value)} />
  )
}
```

That puts `data-fs-key`, `data-fs-type` and `data-fs-scope` in the output, which is the only thing tying
a rendered element back to a document node. The designer's canvas selection, hover, and drop targeting
are all built on `closest('[data-fs-key]')`; a kit that drops `nodeProps` still renders correctly but its
components cannot be selected, moved, or dropped near.

`data-fs-scope` says which rendered form the element belongs to, and it is per render rather than per
document because the same document rendered twice has the same problem. A key is unique inside a document
and nowhere else, so two forms on one page both have a `root` and usually an `email`. Per-component CSS
is selected by key, so a kit that drops it lets the first form's styling reach into the second.

The attributes ship at runtime too, not only in the designer, which gives anyone writing an end-to-end
test against a live form a stable selector for free.

**Rejected alternative:** having the renderer wrap every node in a `display: contents` span it controls,
which needs no cooperation from the kit. Such a span generates no box, so the overlay would have to infer
geometry from a `Range` over its contents instead of reading a real `getBoundingClientRect`. One line per
renderer buys exact frames.

## What a renderer receives

```ts
interface NodeRendererProps {
  node: ComponentNode
  props: Record<string, JsonValue> // bindings already resolved to plain JSON
  nodeProps: NodeAttributes // spread these
  value: JsonValue | undefined // data-bound components
  error: string | undefined
  onChange: (value: JsonValue) => void
  children?: ReactNode
}
```

`props` arrives resolved. A renderer never sees a `PropValue`, never resolves a translation, and never
evaluates an expression — that happens once, in the renderer, for every kit. A renderer that reached for
`node.props` directly would be reimplementing that badly.

## Rules every kit must satisfy

Each is a test in `test/kit-contract.test.tsx`, run against every registered kit. A failure names the
obligation missed.

| Rule                                                             | Why                                                                          |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Both halves declare the same `id`                                | A mismatched pairing is otherwise impossible to spot                         |
| Every palette entry has a renderer                               | A component that cannot render should not be offered                         |
| Every renderer has a palette entry                               | An orphan renderer is dead code or a missing entry                           |
| At least one component is a container                            | Nothing can be composed otherwise                                            |
| Component types are unique                                       | The type is the lookup key                                                   |
| Every data-bound component declares a `dataType`                 | The Rules tab has nothing to validate against otherwise                      |
| Every prop schema has a name and a label                         | An unlabelled row in the panel is unusable                                   |
| Every `select` editor supplies options                           | An empty picker is a dead end                                                |
| Every renderer puts `data-fs-key` in the DOM                     | The designer cannot select it otherwise                                      |
| Every renderer puts `data-fs-scope` in the DOM                   | Two forms on one page otherwise share a key namespace, and each other's CSS  |
| A Step's gap default matches the Stack it renders as             | A spacing-scale value and a pixel value look alike; 16 is 128px in MUI       |
| Containers render children inside themselves                     | Rendering them outside breaks drop targeting                                 |
| Data-bound components survive an absent value                    | A freshly dropped field has no data yet                                      |
| Every data-bound component displays its error                    | A failed submit that says nothing is the worst outcome                       |
| The message carries `role="alert"` when it errors                | A silent failure is announced to nobody                                      |
| Every control describes itself by an element that already exists | A description added with the error is announced late or not at all           |
| Exactly one component is the root, and it is not in the palette  | The root exists already; a second one nests a screen in a screen             |
| Every palette entry declares an icon                             | Half a palette with icons reads as a bug rather than a choice                |
| A RadioItem child can be selected in its group                   | A child that looks like an option and answers nothing is worse than no child |
| The palette index has no colliding types                         | The type is how a node finds its renderer                                    |

Two of those found real bugs the day they first ran. The error-display rule caught an MUI checkbox that
had never destructured `error`, so a required checkbox failed a submit while displaying nothing. The two
accessibility rules caught `@formsmith/kit-mui` failing both: no renderer in it set `role="alert"`, and
its checkbox built the message element only once there was an error. Those two obligations had been
written down here, as things a kit must do, for as long as this file has existed. Nothing ran them.

## Accessibility is the kit's job

The renderer knows nothing about the markup a kit produces, so it cannot supply labels or error wiring.
A kit must:

- give every field a real `<label for>` pointing at its control
- set `aria-invalid` on a control whose `error` is set
- point `aria-describedby` at a message element **that always exists**, so an error appearing later is
  picked up rather than referring to a node that was not there when the description was read
- put `role="alert"` on that message when it holds an error
- leave a visible focus indicator on everything interactive

`@formsmith/kit-html` is the reference implementation of all five and is deliberately dependency-free, so
it can be read and copied without also reading a component library.

The third and fourth bullets are executed by the contract test. The other three are not: no test checks
that a label points at its control, that `aria-invalid` is set, or that a focus indicator survives. They
are obligations a kit author is trusted with, and saying so is better than implying a test is watching.

## Writing your own kit

Copy `packages/kit-html`. It is semantic elements and a stylesheet, around 620 lines across renderers,
definitions and CSS, with no dependencies beyond React.

1. Export a `Kit` from `@formsmith/core` and a `RendererKit` from `@formsmith/renderer`, sharing an `id`.
2. Spread `nodeProps` in every renderer.
3. Add the kit to the list in `test/kit-contract.test.tsx` and make it pass.

Matching another kit's component `type` strings is optional. This repository does it so a document
authored against one kit renders against the other, and the playground can switch between them at
runtime on the same document. Nothing in the contract requires it; a kit with entirely its own component
vocabulary is legitimate, it just will not be a drop-in replacement.

## What a kit does not do

- **Persistence.** The host owns it. See [10-interchange.md](10-interchange.md).
- **Expression evaluation.** The host injects an evaluator and owns the sandbox. See
  [09-actions.md](09-actions.md).
- **Validation.** Core owns the rules so the same ones run on a server. A kit displays the result.
