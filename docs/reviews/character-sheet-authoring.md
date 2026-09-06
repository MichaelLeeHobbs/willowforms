# Form authoring improvements from the character sheet redesign

These four recommendations were approved and implemented as focused changes. The original rationale and acceptance criteria below record why they were needed. The redesigned demo preserves all eight pages and answer keys using the existing document model.

The subsequent [visual direction](design-direction.md) makes the D&D example desktop-first. The narrow-layout criteria below concern the authoring shell and responsive forms; they do not require the character folio to fit a phone. Its desktop minimum width is an intentional document design choice.

- Preview now hides authoring panels and optional diagnostics, with modal drawers for narrow authoring layouts. See [the shell contract](../spec/04-shell.md#narrow-layouts-and-preview).
- New Grids fill their parent; saved Grids without the new property retain their previous geometry. The D&D example uses the standard Grid. See [the component contract](../spec/03-components.md).
- Form and section density are stored in ordinary document properties and supported by both kits. The D&D host theme now supplies its palette, while compact sizing travels with its JSON. See [the theming contract](../spec/11-theming.md#form-density).
- The Components palette offers three editable starting layouts built from existing nodes. See [the authoring contract](../spec/04-shell.md#starting-layouts).

## 1. Make Preview focus on the form

Entering Preview should collapse the authoring panels, put data and errors behind an optional diagnostics control, and restore the author's panel arrangement when returning to editing. On phone widths, authoring panels should open as drawers instead of consuming the canvas width. The current playground can display almost no form until both panels are manually collapsed. This is the highest-priority usability improvement because it affects every example.

Acceptance: Preview is usable at 390px without manually arranging panels; every form control remains reachable by keyboard; returning to editing restores panel state and focus. Diagnostics stay available for developers.

## 2. Give Grid an explicit fill-width layout

Both kits currently derive Grid's maximum width from its column count and minimum column width. Two columns therefore stop growing while their parent still has unused space. The redesigned sheet uses a Box with a CSS grid expression to cap column count independently of available width. This is too much CSS for a routine authoring choice.

Recommend a simple fill-width option with a maximum column count and minimum usable column width. Keep existing saved documents stable; decide explicitly whether new grids default to filling their parent. This can ship as an additive improvement without changing old layouts.

Acceptance: a two-column grid fills its parent, never exceeds two columns, and collapses to one before its controls become cramped. Both kits produce the same geometry. Nested grids and long content do not introduce horizontal scrolling.

## 3. Add a small, consistent density setting

Offer comfortable and compact density at form level, with an optional section override. Compact density should coordinate field height, label treatment, helper spacing, and group gaps in both kits. The demo currently requires a host-owned Material UI theme to do this; exporting its JSON preserves the layout but does not export that host theme.

Acceptance: labels remain visible with empty and populated fields, errors remain associated with their controls, focus indicators remain clear, and compact controls meet the accessibility target-size requirement. Density must not depend on authors overriding internal kit selectors.

## 4. Offer a few useful authoring presets

Provide a ruled section, a row of related statistics, and a compact repeatable entry as compositions of existing controls. The previous sheet overused nested cards because cards were the easiest way to group content. Presets would improve the default result without introducing another document format or a large layout system.

Acceptance: presets remain ordinary editable nodes and survive normal JSON import/export. Authors can rearrange or remove their parts. Start with composition; add new primitives only when semantics or behavior cannot be expressed adequately by existing nodes.

## Keep the scope focused

None of these improvements needs a D&D rules engine, calculated character builder, arbitrary expression editor, workflow routing, file storage, or a spreadsheet-style table editor. Specialized behavior belongs in host integrations and custom components. The library should make ordinary forms easier to compose and consume.
