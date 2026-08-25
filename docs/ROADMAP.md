# Roadmap

Honest status. The point of this file is that nobody, including future us, mistakes the scaffold for a
product.

## Works today, verified

- `@formsmith/core`: document model, immutable tree operations, structural document validation, the
  runtime rule engine. **45 tests.**
- `@formsmith/renderer`: walks a document, resolves static/computed/i18n bindings, renders through a
  kit, honours `renderWhen`, and shows a visible fallback for an unknown component type.
- `@formsmith/kit-mui`: 8 components (Screen, Stack, Heading, TextField, NumberField, Checkbox, Select,
  Button) with metadata and renderers.
- `@formsmith/kit-html`: the same 8 components with no dependencies at all, as semantic elements and a
  stylesheet. It exists to make the architecture's central claim checkable rather than asserted, and
  adding it changed nothing in core, the renderer, or the designer.
- A kit contract spec that runs against every kit in the repo: renderer coverage in both directions,
  `nodeProps` reaching the DOM, containers rendering children inside themselves, data-bound components
  surviving an absent value, and errors actually being shown. **40 tests.**
- `@formsmith/designer` history: undo/redo with a capped stack. **7 tests.**
- Designer shell: palette with search and grouping, structure tree, properties panel driven by per-type
  `PropSchema`, canvas rendering the real runtime renderer, preview mode with live data and errors,
  keyboard undo/redo/delete.
- Canvas selection: click a component on the canvas to select it, a solid frame with a type label on the
  selection, a dashed outline on hover, Escape to clear, and tree selection scrolling the canvas to
  match. Design-mode clicks are cancelled in the capture phase, so selecting a field never focuses it,
  toggles a checkbox, or opens a select. **9 tests.**
- Drag and drop: palette to canvas, palette to tree, moving a component on the canvas, and reordering or
  reparenting in the structure tree. Insertion bar between siblings, outline for an empty container,
  before/after/inside feedback on tree rows, Escape to abandon. Pointer events throughout, so it works
  on touch and adds no dependency. **24 tests on the drop arithmetic, 8 on the wiring.**
- The Rules tab: add, edit, and remove validation rules per field, with the parameter each rule's type
  demands, a custom message, and the field's data type. The inspector is a real tablist with a roving
  tabindex and arrow-key navigation. **15 tests.**
- Import, export, and raw JSON editing, in a native `<dialog>`: edit the document as JSON with the
  parse and structural errors reported rather than swallowed, import a file, copy or download the
  document, and copy or download a JSON Schema projection of it. **25 tests.**
- Binding editors: any property can be a literal, a computed expression, or a translation key, chosen
  with one control per property and offered only where the `PropSchema` allows it. Translations are
  edited per language inline, keyed by the documented `component_prop` convention. A Form tab manages
  the form's name, its languages, the default language, and each language's writing direction.
  **20 tests.**
- Accessibility: full keyboard operation of the structure tree, including moving components without a
  pointer; a polite live region for the changes that move no focus; a roving tabindex; and an audit
  recorded in `docs/accessibility.md`. Contrast is computed from the stylesheets and axe-core runs over
  the designer in six states, so both fail CI rather than a review. **59 tests.**
- `apps/demo-server`: 5 routes over a JSON file, sharing `validateForm` with the browser.
- Repo gates: eslint with the architectural invariants as lint errors, prettier, a typecheck pass that
  covers the test files, and CI running all of it on every PR. **278 tests.**

### What "verified" means here

jsdom has no layout engine, so anything positional is checked in a real browser instead.

Palette renders grouped, tree selection populates the properties panel with the correct per-type schema,
preview validates, and a `url`-only field correctly stays valid when blank while `required` fields fail.

Selection and hover frames sat on their targets to the pixel, held position after the canvas scrolled,
survived a disabled control, and clicking the Select field selected it without opening its dropdown.

Drag and drop: palette to canvas, moving a component, dropping into a row-laid-out container with the
horizontal axis inferred correctly, tree reordering, tree drop-inside, Escape leaving the document
untouched, and a plain click still selecting rather than being swallowed by the drag controller.

The Rules tab, end to end: a `minLength` rule authored in the panel with a custom message landed in the
document with the right shape, then failed a short value in preview with exactly that message, while the
`email` rule on the same field passed.

Keyboard operation was driven in a browser: one tab stop for the tree, arrows walking the flattened
order and stepping into containers, Alt with arrows moving a component into and back out of a container,
refusals announced rather than silently ignored, and the live region carrying each result.

The second kit was driven in a browser on the same document as the first: canvas selection, a palette
drag landing where aimed, and preview validation reporting the same errors through entirely different
markup. Its accessibility wiring was checked in the DOM rather than assumed, with `<label for>` matching
the input id, `aria-invalid` on the failing field, `aria-describedby` pointing at an element that exists,
and `role="alert"` on the message.

Localization end to end: a language added on the Form tab, the email field's label switched to a
translation binding and auto-keyed `email_label`, both translations stored, and the canvas rendering the
default-language text. A computed `helperText` stored its expression and resolved to nothing without an
evaluator injected, leaving the field rendering rather than throwing.

The JSON dialog is genuinely modal, confirmed with `:modal` and by focus landing inside it. A document
missing three required fields was refused with all three named and the form left alone. The schema view
listed only the data-bound components, lifted `required` onto the object, and carried the `minLength`
authored earlier through to the export.

## Not built yet

The gap between this and a product, roughly in the order it matters:

**Tests for anything React.** 118 of the 278 tests are pure functions. Component tests cover canvas
selection, the drag wiring, the rules editor, the inspector tabs, the JSON dialog, the binding editors,
and form settings. The palette and tree rendering are still untested, and there is no end-to-end setup. jsdom has no layout engine, so
geometry stays a browser check no matter how far the component tests grow.

## Sequence

1. ~~Canvas selection plus a selection overlay.~~ Done.
2. ~~Drag and drop from palette to canvas, and reordering in the tree.~~ Done.
3. ~~The Rules tab.~~ Done.
4. Component tests for the remaining panels. The setup landed with canvas selection; coverage is partial.
5. ~~Import, export, JSON editing, JSON Schema.~~ Done.
6. ~~Binding editors: expressions, then localization.~~ Done.
7. ~~Accessibility pass with an audit against the checklist in the prior-art teardown.~~ Done. Remaining
   gaps are listed honestly in `docs/accessibility.md`.
8. ~~A second kit, to prove the seam holds.~~ Done.

## Non-goals

- **A backend.** `apps/demo-server` is a demo. No auth, no database, no multi-user story. Formsmith is a
  frontend library and a hosted form service is somebody else's product.
- **An open-core split.** No enterprise tier, no paid designer.
- **A built-in JS sandbox.** The host injects an evaluator and owns that boundary. See ARCHITECTURE.md.
