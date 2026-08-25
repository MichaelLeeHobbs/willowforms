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
- `apps/demo-server`: 5 routes over a JSON file, sharing `validateForm` with the browser.
- Repo gates: eslint with the architectural invariants as lint errors, prettier, a typecheck pass that
  covers the test files, and CI running all of it on every PR. **137 tests.**

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

The JSON dialog is genuinely modal, confirmed with `:modal` and by focus landing inside it. A document
missing three required fields was refused with all three named and the form left alone. The schema view
listed only the data-bound components, lifted `required` onto the object, and carried the `minLength`
authored earlier through to the export.

## Not built yet

The gap between this and a product, roughly in the order it matters:

**Property binding UI.** `computed` and `i18n` bindings render correctly and the properties panel
displays them read-only, but there is no editor to create one. That means no expression editor and no
localization panel.

**Accessibility work.** The tree has `role="tree"` and `aria-level`, chrome controls have accessible
names and focus rings, and the inspector is a real tablist with a roving tabindex and arrow keys. Not
done: the same keyboard treatment for the tree, focus trapping, `aria-live` announcements for selection
and mode changes, a keyboard path for drag and drop, and a real audit.

**Tests for anything React.** 93 of the 137 tests are pure functions. Component tests cover canvas
selection, the drag wiring, the rules editor, the inspector tabs, and the JSON dialog; the palette, the
properties panel, and tree rendering are untested, and there is no end-to-end setup. jsdom has no layout engine, so
geometry stays a browser check no matter how far the component tests grow.

## Sequence

1. ~~Canvas selection plus a selection overlay.~~ Done.
2. ~~Drag and drop from palette to canvas, and reordering in the tree.~~ Done.
3. ~~The Rules tab.~~ Done.
4. Component tests for the remaining panels. The setup landed with canvas selection; coverage is partial.
5. ~~Import, export, JSON editing, JSON Schema.~~ Done.
6. Binding editors: expressions, then localization.
7. Accessibility pass with an audit against the checklist in the prior-art teardown.
8. A second kit, to prove the seam holds. Until a second kit exists, the abstraction is a claim.

## Non-goals

- **A backend.** `apps/demo-server` is a demo. No auth, no database, no multi-user story. Formsmith is a
  frontend library and a hosted form service is somebody else's product.
- **An open-core split.** No enterprise tier, no paid designer.
- **A built-in JS sandbox.** The host injects an evaluator and owns that boundary. See ARCHITECTURE.md.
