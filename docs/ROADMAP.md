# Roadmap

Honest status. The point of this file is that nobody, including future us, mistakes the scaffold for a
product.

## Works today, verified

- `@formsmith/core`: document model, immutable tree operations, structural document validation, the
  runtime rule engine. **45 tests.**
- `@formsmith/designer` history: undo/redo with a capped stack. **7 tests.**
- Canvas selection: click a component on the canvas to select it, a solid frame with a type label on the
  selection, a dashed outline on hover, Escape to clear, and tree selection scrolling the canvas to
  match. Design-mode clicks are cancelled in the capture phase, so selecting a field never focuses it,
  toggles a checkbox, or opens a select. **9 component tests.**
- `@formsmith/renderer`: walks a document, resolves static/computed/i18n bindings, renders through a
  kit, honours `renderWhen`, and shows a visible fallback for an unknown component type.
- `@formsmith/kit-mui`: 8 components (Screen, Stack, Heading, TextField, NumberField, Checkbox, Select,
  Button) with metadata and renderers.
- Designer shell: palette with search and grouping, structure tree, properties panel driven by per-type
  `PropSchema`, canvas rendering the real runtime renderer, preview mode with live data and errors,
  keyboard undo/redo/delete.
- `apps/demo-server`: 5 routes over a JSON file, sharing `validateForm` with the browser.

Confirmed by driving the playground in a browser: palette renders grouped, tree selection populates the
properties panel with the correct per-type schema, preview validates, and a `url`-only field correctly
stays valid when blank while `required` fields fail.

Canvas selection was confirmed the same way, because jsdom cannot check it. Selection and hover frames
sat on their targets to the pixel, held position after the canvas scrolled, survived a disabled control,
and clicking the Select field selected it without opening its dropdown. Preview mode still focuses
fields and records typed values.

## Not built yet

The gap between this and a product, roughly in the order it matters:

**Drag and drop.** The palette adds to the current selection via click. No dragging, no drop indicators,
no reordering in the tree. `moveNode` exists and is tested; nothing calls it yet. Canvas selection is in
place now, so the drop target and the selection can share the same hit-testing.

**The Rules tab.** Validation rules exist in the model and run correctly, but there is no UI to add or
edit them. Right now you author them in the document by hand.

**Property binding UI.** `computed` and `i18n` bindings render correctly and the properties panel
displays them read-only, but there is no editor to create one. That means no expression editor and no
localization panel.

**Persistence in the designer.** The playground writes to `localStorage`; the designer itself has no
save, load, import, or export.

**JSON editing and JSON Schema export.** Both are in the model's remit, neither is written.

**Accessibility work.** The tree has `role="tree"` and `aria-level`, and chrome controls have accessible
names and focus rings. Not done: roving tabindex on the tree, arrow-key navigation, focus trapping,
`aria-live` announcements for selection and mode changes, and a real audit.

**Tests for anything React.** 52 of the 61 tests are pure functions. Component tests now exist for canvas
selection only; every other panel is untested, and there is no end-to-end setup. jsdom has no layout
engine, so geometry stays a browser check no matter how far the component tests grow. Closing this gap
matters more than any feature below it.

## Sequence

1. ~~Canvas selection plus a selection overlay.~~ Done.
2. Drag and drop from palette to canvas, and reordering in the tree.
3. Component tests for the remaining panels. The setup landed with canvas selection; the coverage did not.
4. The Rules tab.
5. Save/load/export, JSON editing.
6. Binding editors: expressions, then localization.
7. Accessibility pass with an audit against the checklist in the prior-art teardown.
8. A second kit, to prove the seam holds. Until a second kit exists, the abstraction is a claim.

## Non-goals

- **A backend.** `apps/demo-server` is a demo. No auth, no database, no multi-user story. Formsmith is a
  frontend library and a hosted form service is somebody else's product.
- **An open-core split.** No enterprise tier, no paid designer.
- **A built-in JS sandbox.** The host injects an evaluator and owns that boundary. See ARCHITECTURE.md.
