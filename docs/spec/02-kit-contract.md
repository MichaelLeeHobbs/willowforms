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

There are two tables. This one is the obligations checked inside the per-kit block; the one after it is
the rules that are driven per kit from outside that block, which for a long time were written down
nowhere -- so a third-party kit author budgeted against this table, added their kit as instructed, and
met a suite naming rules that did not exist on paper. Both counts are checked against the suite by
`test/docs.test.ts`.

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
| Containers render children inside themselves                     | Rendering them outside breaks drop targeting                                 |
| Data-bound components survive an absent value                    | A freshly dropped field has no data yet                                      |
| Every data-bound component displays its error                    | A failed submit that says nothing is the worst outcome                       |
| The message carries `role="alert"` when it errors                | A silent failure is announced to nobody                                      |
| Every control describes itself by an element that already exists | A description added with the error is announced late or not at all           |
| Exactly one component is the root, and it is not in the palette  | The root exists already; a second one nests a screen in a screen             |
| Every palette entry declares an icon                             | Half a palette with icons reads as a bug rather than a choice                |
| A RadioItem child can be selected in its group                   | A child that looks like an option and answers nothing is worse than no child |
| The palette index has no colliding types                         | The type is how a node finds its renderer                                    |
| A length-valued prop is CSS pixels                               | A number that means two things is a document that renders two ways           |
| Two different lengths render differently                         | A kit hard-coding the tested value would satisfy the rule above              |
| A radio group carries `role="radiogroup"`                        | A `<fieldset>` maps to `group`, which has no invalid or required state       |
| A required control is marked where a screen reader reads it      | A marking inside `aria-hidden` reaches nobody                                |
| A progress value that is not a number is not reported            | `NaN` is a number, and `aria-valuenow="NaN"` is worse than none              |
| A progress value that is one still is                            | A bar that reported nothing would satisfy the rule above                     |

### And the rules driven per kit from outside that block

Same suite, same kits, same consequence for a kit that fails one. They sit outside the per-kit block
because each drives its own fixture rather than sweeping every component.

| Rule                                                                         | Why                                                                              |
| ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| A failing control is marked invalid                                          | A control that looks wrong and does not say so is announced as fine              |
| A required control is marked required                                        | WCAG 3.3.2, and the first anybody heard of it was a rejected submit              |
| An unrequired control is left unmarked                                       | Marking everything required would satisfy the rule above                         |
| A `Text` variant adds no classes of its own                                  | A document's string interpolated into a class name is a document styling the app |
| Two declared variants still render differently                               | Narrowing to nothing would satisfy the rule above                                |
| An unrecognised `Alert` severity still carries a role                        | A typo in a severity drew the banner and announced nothing                       |
| An `Alert` that really is an error still announces itself                    | A kit that announced nothing would satisfy the rule above                        |
| An `Image` src carries no arbitrary scheme                                   | `javascript:` in a document is a document that runs code                         |
| An image with an ordinary address still renders                              | Refusing every address would satisfy the rule above                              |
| A text prop cleared to empty falls back to the default                       | An empty string is a value; a cleared prop is an absence                         |
| A component whose options a document got wrong still renders                 | An option list is a document's list, and a document is data                      |
| A heading whose document names no rank renders at the same rank in both kits | The rank is the outline a screen reader navigates by, not a size                 |
| A control holding a value that is not a string still shows it                | `String(value)` answered `''` for a number, so a stored answer rendered as blank |
| A select still shows an option it can read                                   | Dropping every entry would satisfy the rule above                                |
| A select holding a number shows the option the data names                    | `str` answers `''` for a number, so a stored answer rendered as nothing          |
| A select shows nothing when the data names no option                         | Showing the first option would satisfy the rule above                            |

Two of those found real bugs the day they first ran. The error-display rule caught an MUI checkbox that
had never destructured `error`, so a required checkbox failed a submit while displaying nothing. The two
accessibility rules caught `@formsmith/kit-mui` failing both: no renderer in it set `role="alert"`, and
its checkbox built the message element only once there was an error. Those two obligations had been
written down here, as things a kit must do, for as long as this file has existed. Nothing ran them.

### What a length means

**A length-valued prop is a number of CSS pixels.** `gap`, `padding`, `radius`, `maxWidth` and `width`
all mean the same thing in every kit: `gap: 16` is sixteen pixels, wherever the document is rendered.

This had never been decided, and the contract's one obligation is that a document authored against one
kit renders against the other. `@formsmith/kit-html` read `gap` as pixels; `@formsmith/kit-mui` passed it
to MUI's `gap` prop, which is a multiple of `theme.spacing` and defaults to 8 -- so an authored `gap: 2`
was 16px in one kit and 2px in the other. `kit-mui`'s own `Grid` used pixels, so that kit disagreed with
itself as well. Neither kit was wrong, because nothing had said.

A kit built on a design system with its own spacing scale converts at its edge, the way `kit-mui` does
now. That is the kit's job precisely because the scale is the kit's, and the document belongs to nobody.

**What changed:** `@formsmith/kit-mui` reflows. A document that authored `gap: 2` against it rendered
16px and now renders 2px. Its _defaults_ are unchanged -- the default was `gap: 2` through MUI's scale,
which was 16px, and it is 16 pixels now -- so a form that never set a gap looks identical. Only an
authored value moves, and it moves onto the meaning `kit-html`, `Grid`, `padding`, `radius`, `maxWidth`
and `width` already had.

## Accessibility is the kit's job

The renderer knows nothing about the markup a kit produces, so it cannot supply labels or error wiring.
A kit must:

| Obligation                                                                | Attribute          | Enforced |
| ------------------------------------------------------------------------- | ------------------ | -------- |
| Give every field a real `<label for>` pointing at its control             | —                  | no       |
| Set `aria-invalid` on a control whose `error` is set                      | `aria-invalid`     | yes      |
| Mark a control the document requires, so it says so before a submit fails | `aria-required`    | yes      |
| Point the description at a message element **that always exists**         | `aria-describedby` | yes      |
| Put `role="alert"` on that message when it holds an error                 | `role="alert"`     | yes      |
| Leave a visible focus indicator on everything interactive                 | —                  | no       |

The description has to point at an element that is always in the DOM, so an error appearing later is
picked up rather than referring to a node that was not there when the description was read.

`@formsmith/kit-html` is the reference implementation of all six and is deliberately dependency-free, so
it can be read and copied without also reading a component library.

**The Enforced column is checked.** `test/docs.test.ts` reads this table and asserts that every attribute
marked `yes` is asserted in `test/kit-contract.test.tsx`, and that every one marked `no` is not -- so the
column cannot drift in either direction. It said four bullets and enforcement of two, and both halves
were wrong: `aria-invalid` is checked against every kit and this said it was not, and `aria-required` is
checked and was not listed at all. Understating what is enforced is the dangerous direction, because a
kit author budgets against this table and meets a red build.

The two rows with no attribute are genuinely not checked. A label pointing at its control and a focus
indicator surviving both need a browser, and they are named in
[../accessibility.md](../accessibility.md) as what a Playwright pass would cover.

## Writing your own kit

Copy `packages/kit-html`. It is semantic elements and a stylesheet, about 2,000 lines across renderers,
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
