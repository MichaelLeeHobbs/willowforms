# Form Builder Demo — Build-Ready UI/Feature Specification

> **Scope note:** Per instruction, the site-level top bar (row containing the `formbuilder` logo, the UI-kit `<select>`, `Copy form's JSON`, `Paste`, and `Documentation`) is **excluded** from this spec. Everything below that row — the builder workspace — is documented. Where the excluded bar affects documented behavior, it is called out as an external dependency only.

---

## 0. Spec Metadata

| Field                     | Value                                                                                                                                                                                            |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Page name / `<title>`** | `Form Builder Demo`                                                                                                                                                                              |
| **URL pattern**           | `https://formbuilder.formengine.io/` (single route; no path params, no query string, no hash routing observed)                                                                                   |
| **`<html lang>`**         | `en`                                                                                                                                                                                             |
| **Product version**       | `v10.2.0` (shown as a disabled item at the bottom of the workspace main menu)                                                                                                                    |
| **One-line purpose**      | A browser-based WYSIWYG form designer: drag components onto a canvas, configure their properties/styles/events/validation, then preview, test, and export the resulting form definition as JSON. |
| **Page type**             | Full-viewport, three-pane **application shell / visual editor** (not a document page). Contains embedded form-preview, modals, and a dockable bottom code panel.                                 |

### Primary user goals

1. Compose a form visually by placing and nesting UI components on a canvas.
2. Configure a selected component's data binding, presentation, responsive style, lifecycle actions, and validation rules.
3. Attach imperative logic — reusable "code actions" and per-property "calculable value" expressions.
4. Localize labels/strings into other languages.
5. Test the form against live data (fill it, validate it, inspect the resulting data + errors object).
6. Export / import the form definition (JSON, form bundle, or JSON Schema) for use in a host application.

---

## 1. Overview & Context

The page is a single-screen low-code form builder. The centre pane renders the form being edited exactly as it will appear at runtime; the left pane supplies the raw material (component palette, structural tree, global settings, list of forms in the project) and the right pane edits whatever is currently selected on the canvas. A toolbar above the canvas switches between **edit** and **preview/testing** mode, switches simulated viewport, opens the raw JSON editor, and toggles the rendered form's colour theme.

It exists as the **public demo** of the FormEngine form builder: it boots with a prepopulated sample form named `MuiForm` whose root screen is titled `Complex Master Form`, so a visitor can immediately manipulate a non-trivial form rather than starting from an empty canvas.

**Who uses it:** (a) developer/technical evaluator assessing the product, (b) a form author / business analyst assembling a form, (c) a localization contributor translating strings. All three are anonymous — the page performs **no authentication**, and every state change is local.

**Dependencies / prerequisites**

- **No auth, no accounts, no server session.** All editor state persists to `localStorage` (see §7).
- Modern browser with `localStorage`, drag-and-drop, and clipboard access.
- Outbound network access to `https://gist.githubusercontent.com` — the demo form's `loadCountries` action fetches its country list from there on mount.
- The sample form's `Uploader` posts to `http://localhost:3001/upload`, which does **not** exist for a visitor; uploads therefore fail in the demo.
- The **UI kit** chosen in the excluded top bar (`RSuite UI` / `Material UI` / `Mantine UI`) determines the entire component palette, the renderer used on the canvas, and which sample form loads. This spec documents the **Material UI** kit.

---

## 2. User Stories & Acceptance Criteria

### Story 1 — Add a component to the form

> As a **form author**, I want to drag a component from the palette onto the canvas, so that I can build my form visually.

- [ ] **Given** the `Components` tab is active **When** I drag `Checkbox` from the `Inputs` group and drop it between two existing elements **Then** a new component of type `MuiCheckbox` is inserted at the drop position, is auto-assigned the key `muiCheckbox1`, renders with its default label `Checkbox label`, becomes the selected component, and the right panel switches to its properties.
- [ ] **Given** a component was just added **When** I press `Ctrl+Z` (or click the undo toolbar button) **Then** the component is removed and the redo button becomes enabled.
- [ ] **Given** I type `zzz` into the palette `Search...` box **When** no component name matches **Then** the palette body is replaced by the text `Not found`.
- [ ] **Given** the palette search box contains text **When** I click the `✕` inside the field **Then** the query clears and the full grouped palette returns.

### Story 2 — Edit a component's properties

> As a **form author**, I want to select an element and change its label, requiredness and type, so that the field collects the right data.

- [ ] **Given** nothing is selected **Then** the right panel shows only its four tabs and the message `Select element on form for edit properties`.
- [ ] **Given** I click `Last name` on the canvas **Then** a selection frame is drawn around it, a badge reading `Last name (MuiTextField)` appears at its top-right with four action icons, the matching node highlights in the `Tree` tab, and the right panel populates.
- [ ] **Given** the `Main` tab is open **When** I change `Label` **Then** the canvas re-renders live with the new label and the property row's label turns to the "modified" accent colour.
- [ ] **Given** a property row has a value **When** I click its `✕` **Then** the property resets to unset and the canvas reverts to the component default.
- [ ] **Given** a component is selected **When** I press `Delete` **Then** the component is removed from the tree and selection moves to a sibling.

### Story 3 — Bind a property to computed logic or a translation

> As a **developer**, I want a property to be computed at runtime instead of a constant, so that the form reacts to its own data.

- [ ] **Given** the `Main` tab **When** I click the ✏️ icon on a property row (tooltip: `Make this property calculable or localize`) **Then** a dockable bottom panel opens titled `Edit property: <Key>.<Property>` with the segmented control `Calculable value | Localization | Simple value`.
- [ ] **Given** `Simple value` is active **Then** the panel body shows `Edit the property in the right panel` and editing continues in the right panel.
- [ ] **Given** `Calculable value` is active **Then** a JavaScript editor is seeded with a `function Calculation (form) { … }` template, a `Test form data` JSON editor sits beside it, and `Run` / `Autorun` controls sit at the bottom.
- [ ] **Given** `Localization` is active **Then** a key/value editor shows `<Key>_<property> = <current value>`, with `Save`, `Close`, a language `EN` selector and `Clear` in the footer.
- [ ] **Given** I click `Close` **Then** the bottom panel collapses with no change applied.

### Story 4 — Attach validation

> As a **form author**, I want to require a field and validate its format, so that bad data is rejected before submit.

- [ ] **Given** a text field is selected and the `Rules` tab is open **Then** `Auto Validate` is shown as a checkbox and `Add a validation rule` as a full-width button.
- [ ] **Given** I click `Add a validation rule` **Then** a menu lists `Non empty, Length, Min, Max, Regex, Email, Url, Uuid, Ip, Datetime, Includes, Starts with, Ends with, Code`.
- [ ] **Given** a rule exists **Then** it renders as a card titled with the rule name, a `✕` to remove it, and the sub-properties `Message` and `Validate when`.

### Story 5 — Test the form with live data

> As a **form author**, I want to fill in the form and see the resulting data and errors, so that I can confirm the form behaves correctly.

- [ ] **Given** edit mode **When** I click `Preview` **Then** the palette/tree panel is replaced by a `Data` panel, the right properties panel empties, the canvas becomes interactive, and the toolbar button turns green and reads `Edit`.
- [ ] **Given** preview mode with an empty form **When** I click `Validate` **Then** every failing field turns red with the helper text `Required`, and the `Errors` box shows `{ "First name": "Required", "Last name": "Required", "Email": "Required", "Website": "Required" }`.
- [ ] **Given** preview mode **When** I type into any field **Then** the `Data` box updates on every keystroke.
- [ ] **Given** required fields are still empty **When** I click `SAVE` **Then** the red message `Not all fields of the form are filled in correctly. Correct the values of the form fields and try again.` appears below the button and the success message stays hidden.
- [ ] **Given** all validations pass **When** I click `SAVE` **Then** the green message `The form has been sent, thank you!` appears and the error message is hidden.
- [ ] **Given** preview mode **When** I click `Clear` **Then** the data object is emptied; **when** I click `Reset to default` **then** the data object returns to the form's declared defaults.

### Story 6 — Inspect / hand-edit the definition

> As a **developer**, I want to read and edit the raw form JSON, so that I can copy it into my application.

- [ ] **Given** the toolbar **When** I click the `</>` button (tooltip `Edit JSON`) **Then** a near-full-viewport modal titled `Edit JSON` opens containing a syntax-highlighted, line-numbered JSON editor with a minimap.
- [ ] **Given** the modal **When** I click `✕` **Then** it closes and the canvas is unchanged unless the JSON was edited.

### Story 7 — Manage forms and export

> As a **form author**, I want more than one form in the project and a way to get them out.

- [ ] **Given** the `Forms` tab **When** I click `Add a new form` **Then** the modal `Please enter form name` opens with a single text input, `OK` and `Cancel`.
- [ ] **Given** that modal **When** I click `OK` with an empty name **Then** nothing happens and the modal stays open — **no error message is displayed** (see §6 gap).
- [ ] **Given** the workspace main menu (☰) **Then** it offers `Add a new form, Download, Upload, Translation ▸, Save, Save as…, Export forms, Import forms, Clear, Export JSON form schema` plus the disabled version label `v10.2.0`.

### Story 8 — Responsive + theme checking

> As a **form author**, I want to see the form at phone/tablet size and in both colour themes.

- [ ] **Given** the desktop viewport button is active **When** I click the phone button **Then** the canvas is constrained to a phone-width frame, centred, and an extra `Orientation` button appears to the left of the viewport group.
- [ ] **Given** a phone/tablet viewport **When** I click `Orientation` **Then** the frame swaps to landscape proportions.
- [ ] **Given** any viewport **When** I click the moon button (tooltip `Toggle theme`) **Then** **only the rendered form canvas** switches between the MUI dark (`#121212`) and light surfaces; the builder chrome stays dark.

### Permission / role variations

**Not applicable.** The page has no authentication, no roles, and no permission-gated UI. Every control is available to every visitor.

---

## 3. Page Layout & Structure

### Layout pattern

Full-viewport (`100vw × 100vh`), no page scroll. A fixed **top strip** (excluded from this spec, 58 px tall) sits above a three-column flex row that fills the remaining height. Columns: fixed-width left panel — fluid centre — fixed-width right panel. A **bottom drawer** can slide up over the columns. The centre column contains its own toolbar row and a vertically scrolling canvas.

### Measured metrics (desktop, 1335 × 893 viewport)

| Region                 | Metric                                                                         |
| ---------------------- | ------------------------------------------------------------------------------ |
| Excluded top bar       | full width × **58 px**                                                         |
| Workspace row          | full width × remaining height (`835 px`)                                       |
| Left panel             | **≈290 px** fixed (inner nav 280 px, offset 5 px)                              |
| Right panel            | **≈290 px** fixed (starts at x ≈ 1045)                                         |
| Centre canvas viewport | fluid; measured `721 px` wide × `766 px` tall at this viewport                 |
| Bottom property panel  | full width, **380 px** default height (persisted, user-resizable via top edge) |
| Toolbar row (centre)   | ~48 px, vertically centred at y ≈ 83                                           |

### Region breakdown (DOM/visual order)

1. **Left panel** — tab bar (`Components`, `Tree`, `Settings`, `Forms`) + tab body.
2. **Left collapse handle** — a `‹` chevron vertically centred on the panel's right edge.
3. **Centre column** — toolbar row, then canvas viewport.
4. **Right collapse handle** — a `›` chevron vertically centred on the canvas's right edge.
5. **Right panel** — tab bar (`Main`, `Style`, `Actions`, `Rules`) + tab body.
6. **Bottom property panel** — overlays 1–5, hidden by default.
7. **Modals** — `Edit JSON`, `Please enter a preset name`, `Please enter form name`.

### Wireframe

```
┌──────────────────────────────────────────────────────────────────────────┐
│  [ excluded site top bar — not in scope ]                          58px  │
├────────────────┬───────────────────────────────────┬─────────────────────┤
│ LEFT PANEL     │ ┌── CENTRE TOOLBAR ─────────────┐ │ RIGHT PANEL         │
│  ~290px        │ │ ☰  💾  ↺  ↻                   │ │  ~290px             │
│                │ │        ▶ Preview / ✎ Edit     │ │ ┌─────────────────┐ │
│ ┌────────────┐ │ │        ⟳ 🖥 📱 ▭ </> [EN▾] 🌙 │ │ │Main Style Act. R│ │
│ │Comp Tree   │ │ └───────────────────────────────┘ │ └─────────────────┘ │
│ │Sett Forms  │ │                                   │                     │
│ └────────────┘ │ ┌── CANVAS (scrolls) ───────────┐ │  property rows      │
│                │ │  Complex Master Form          │ │  ✏ Key*    [____] ✕ │
│  [ Search... ]‹│ │  hint text                    │›│  ✏ Label   [____] ✕ │
│                │ │  ┌─ selection frame ────────┐ │ │  ✏ Requi.  [x]    ✕ │
│  Inputs        │ │  │Key (Type) + ⧉ ⚑ 🗑       │ │ │                     │
│   [Button]     │ │  │ [First name*][Last name*]│ │ │  Tooltip   [ ]      │
│   [Checkbox]   │ │  │ [Email address*        ] │ │ │  Additional props   │
│   …            │ │  └──────────────────────────┘ │ │  Render When [____] │
│                │ └───────────────────────────────┘ │  HTML attributes    │
├────────────────┴───────────────────────────────────┴─────────────────────┤
│ BOTTOM PANEL (hidden until ✏ clicked)                                    │
│ Edit property: Last name.Label   Use [Calculable|Localization|Simple]     │
│ ┌── code editor ─────────────┐ ┌── Test form data ──────────────────────┐│
│ └────────────────────────────┘ └────────────────────────────────────────┘│
│ [Save][Close]                            [▶ Run]              [ ] Autorun│
└──────────────────────────────────────────────────────────────────────────┘
```

### Responsive behaviour

**[ASSUMPTION — VERIFY]** The builder shell itself was only observed at desktop width and appears to be a **fixed desktop-only layout**: side panels are fixed-pixel, the shell fills the viewport with no page scroll, and no breakpoint-driven reflow was observed. There is no hamburger/off-canvas fallback for the side panels other than the manual collapse chevrons. Treat mobile/tablet support for the _builder chrome_ as an open product question.

What **is** responsive is the **canvas content**, deliberately, via the viewport simulator:

| Toolbar button                               | Canvas result                                                                                                                                     |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Desktop (default)                            | Canvas fills the centre column full-bleed.                                                                                                        |
| Mobile                                       | Canvas constrained to a centred phone-width frame; `Orientation` button appears.                                                                  |
| Tablet                                       | Canvas constrained to a centred tablet-width frame; `Orientation` button appears.                                                                 |
| Orientation (only when Mobile/Tablet active) | Swaps the frame between portrait and landscape. In landscape the frame can be wider than the centre column and visually overlaps the side panels. |

Per-component responsive styling is authored in the right panel's `Style` tab via the `For device` selector (`Any / Desktop / Mobile / Tablet`), which scopes every style value below it to that breakpoint.

---

## 4. Component Inventory

Listed in reading order: left panel → centre toolbar → canvas → right panel → bottom panel → modals. All quoted strings are verbatim.

### 4.1 Left panel

#### `LP-TABS` — Left panel tab bar

- **Type:** Icon+label tab bar (4 tabs, `role="tab"` buttons).
- **Copy:** `Components`, `Tree`, `Settings`, `Forms`.
- **Default:** `Components` on first load; afterwards restored from `localStorage.leftPanelActiveTab`.
- **States:** _default_ — icon and label in secondary grey `#A4A9B3`. _selected_ — icon and label take a per-tab accent colour and a matching 2 px underline appears. Accent tokens read from CSS: `Components → var(--rs-green-600)`, `Tree → var(--rs-navs-selected)`, `Settings → violet`, `Forms → #f67f1f`.
- **Behaviour:** Swaps the panel body. Selection persists across reloads.

#### `LP-SEARCH` — Palette search

- **Type:** Single-line text input with trailing magnifier icon.
- **Placeholder:** `Search...`
- **States:** _default_ — magnifier icon at right. _focus_ — blue focus ring. _filled_ — magnifier is replaced by a clear `✕`.
- **Behaviour:** Filters the palette live on every keystroke; empty groups are hidden.
- **Empty result:** the entire palette body is replaced by `Not found`.
- **Constraints:** none observed (no min length, no debounce visible).

#### `LP-PALETTE` — Component palette (Components tab)

- **Type:** Grouped grid of draggable component chips, two per row (single full-width row when a group has an odd trailing item). Vertically scrolling.
- **Data-driven:** **Yes — entirely.** The list is supplied by the active UI kit and changes completely when the kit changes (see §7).
- **Items (Material UI kit), verbatim, by group:**

| Group          | Items                                                                                                                          |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `Inputs`       | `Button`, `Button group`, `Checkbox`, `Date picker`, `Radio group`, `Radio item`, `Select`, `Switch`, `Text field`, `Uploader` |
| `Data display` | `List`, `List item`, `Tooltip`, `Typography`                                                                                   |
| `Feedback`     | `Circular progress`, `Linear progress`                                                                                         |
| `Layout`       | `Box`, `Container`, `Dialog layout`, `Stack`                                                                                   |
| `Surfaces`     | `Card`                                                                                                                         |
| `Navigation`   | `Breadcrumbs`, `Link`                                                                                                          |
| `Form`         | `Form control label`, `Form label`                                                                                             |
| `Templates`    | `Embedded form`, `Slot`                                                                                                        |
| `Structure`    | `Repeater`                                                                                                                     |
| `Modal`        | `Modal`                                                                                                                        |

- **States:** _default_ — dark chip with 1 px border, monochrome glyph + label. _hover_ — chip lightens. _dragging_ — chip follows cursor; the canvas shows an insertion indicator at the valid drop position.
- **Behaviour:** Drag onto the canvas to insert. On drop the new node is created, auto-keyed `<typeCamelCase><n>` (e.g. `muiCheckbox1`), auto-selected, and the right panel loads it.

> **[INFERRED]** For comparison, switching to the Mantine kit replaces the palette with ~60 items under groups `Inputs, Other extensions, Combobox, Dates, Buttons, Miscellaneous, Overlays, Typography …`. The palette is therefore a per-kit registry, not a hard-coded list.

#### `LP-TREE` — Structure tree (Tree tab)

- **Type:** Collapsible tree, plus two text/icon commands.
- **Copy:** `Expand all`, `Collapse all`.
- **Row format:** `<component key>` in primary text weight followed by `<component type>` in muted grey.
- **Root:** `screen 1` / `Screen`.
- **Full tree of the demo form** (indentation = nesting):

```
screen 1 (Screen)
├─ Header               MuiTypography
├─ Email hint           MuiTypography
├─ Main container       MuiStack
│  ├─ Name container    MuiStack
│  │  ├─ First name     MuiTextField
│  │  └─ Last name      MuiTextField
│  ├─ Email             MuiTextField
│  ├─ Country 1         MuiSelect
│  ├─ Subheader         MuiTypography
│  ├─ Email hint 2      MuiTypography
│  ├─ Street address    MuiTextField
│  ├─ Adress container  MuiStack        (sic — single "d")
│  │  ├─ City           MuiTextField
│  │  ├─ State          MuiTextField
│  │  └─ ZIP            MuiTextField
│  ├─ Country container MuiStack
│  │  ├─ Country 2      MuiSelect
│  │  ├─ Country 3      MuiSelect
│  │  └─ Country 4      MuiSelect
│  ├─ Website           MuiTextField
│  ├─ About             MuiTextField
│  ├─ About hint        MuiTypography
│  ├─ muiContainer1     MuiContainer
│  │  ├─ Photo label    MuiTypography
│  │  └─ uploader1      Uploader
│  │     └─ muiButton1  MuiButton
│  ├─ muiList1          MuiList
│  │  └─ repeater1      Repeater
│  │     └─ muiListItem1   MuiListItem
│  │        └─ muiTypography1  MuiTypography
│  ├─ Notifications header  MuiTypography
│  ├─ Notifications hint    MuiTypography
│  ├─ Email header          MuiTypography
│  ├─ Checkbox container 1  MuiStack
│  │  ├─ Comments checkbox  MuiFormControlLabel
│  │  └─ Comments label     MuiTypography
│  ├─ Checkbox container 2  MuiStack
│  │  ├─ Candidates checkbox MuiFormControlLabel
│  │  └─ Candidates label    MuiTypography
│  ├─ Checkbox container 3  MuiStack
│  │  ├─ Offers checkbox    MuiFormControlLabel
│  │  └─ Offers label       MuiTypography
│  ├─ Push header       MuiTypography
│  ├─ Push hint         MuiTypography
│  ├─ Push select       MuiRadioGroup
│  │  ├─ Push everything      MuiRadioItem
│  │  ├─ Push same as email   MuiRadioItem
│  │  └─ Push none            MuiRadioItem
│  ├─ Save button       MuiButton
│  ├─ errorMessage      MuiTypography
│  └─ successMessage    MuiTypography
```

- **States:** _default_, _hover_ (row background lightens), _selected_ (row filled with a blue-tinted background), _expanded/collapsed_ (chevron rotates).
- **Behaviour:** Clicking a row selects that component on the canvas and loads it in the right panel; canvas selection highlights the matching row. **[ASSUMPTION — VERIFY]** drag-to-reorder within the tree was not exercised.

#### `LP-SETTINGS` — Form-level settings (Settings tab)

| Section             | Control                | Type                  | Value / options observed                       |
| ------------------- | ---------------------- | --------------------- | ---------------------------------------------- |
| `Actions`           | `Add a code action`    | full-width button     | opens a code-action editor                     |
| `Actions`           | `showValidationResult` | list row              | trailing ✏️ edit, ⧉ duplicate, ✕ delete icons  |
| `Actions`           | `loadCountries`        | list row              | same three icons                               |
| `Form validator`    | `Code` → `Edit code`   | dashed-outline button | opens a code editor for a whole-form validator |
| `Error settings`    | `Show`                 | checkbox              | unchecked                                      |
| `Error settings`    | `Error Type`           | token/select with ✕   | `Mui Error Wrapper`                            |
| `Tooltip`           | `Tooltip Type`         | token/select with ✕   | `Mui Tooltip`                                  |
| `Modal`             | `Modal Type`           | token/select with ✕   | `Mui Dialog`                                   |
| `Language settings` | `Default Language`     | token/select with ✕   | `English`                                      |

Labels rendered in the link/accent blue (`Error Type`, `Tooltip Type`, `Modal Type`) indicate a value is set; `Show` and `Default Language` render in normal text.

#### `LP-FORMS` — Forms list (Forms tab)

- **Controls:** `Search...` input (same component as `LP-SEARCH`); `Add a new form` full-width button; a list of form rows.
- **Row:** form name in accent blue + ✏️ (rename) + ✕ (delete). Demo contains exactly one: `MuiForm`.
- **Data-driven:** Yes — the list is the project's form collection.
- **States:** _selected_ row has a filled background; _hover_ reveals/highlights the row icons.

#### `LP-COLLAPSE` / `RP-COLLAPSE` — Panel collapse handles

- **Type:** Thin chevron affordance, vertically centred on the panel edge.
- **Copy:** none (glyph only: `‹` / `›`).
- **Behaviour:** Collapses its panel to zero width; the canvas expands to fill. The glyph flips direction and moves to the viewport edge to restore. Left and right are independent.
- **Persistence:** `localStorage.formbuilder-mui-openedPanels` = `["left","right"]`.

### 4.2 Centre toolbar

Reading order, left to right.

| ID           | Type                         | Glyph / copy                        | Behaviour                                                     | States                                                                                                                                |
| ------------ | ---------------------------- | ----------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `TB-MENU`    | icon button (primary-filled) | hamburger                           | Opens the workspace main menu (below)                         | always filled blue `#169DE0`                                                                                                          |
| `TB-SAVE`    | icon button                  | floppy disk                         | Saves the project **[ASSUMPTION — VERIFY]** to `localStorage` | enabled                                                                                                                               |
| `TB-UNDO`    | icon button                  | ↺                                   | Undo last edit                                                | _disabled_ (dimmed) when the undo stack is empty                                                                                      |
| `TB-REDO`    | icon button                  | ↻                                   | Redo                                                          | _disabled_ (dimmed) when the redo stack is empty                                                                                      |
| `TB-MODE`    | primary pill button          | `▶ Preview` / `✎ Edit`              | Toggles edit ⇄ preview(testing) mode                          | edit-mode: blue `#169DE0`, label `Preview`; preview-mode: green, label `Edit`. Has an animated transition class (`_animatedButton_…`) |
| `TB-ORIENT`  | icon button                  | rotate glyph, tooltip `Orientation` | Portrait ⇄ landscape                                          | **only rendered when Mobile or Tablet is active**                                                                                     |
| `TB-DESKTOP` | icon toggle                  | monitor, tooltip `Desktop`          | Full-width canvas                                             | _active_ = filled blue                                                                                                                |
| `TB-MOBILE`  | icon toggle                  | phone                               | Phone-width canvas frame                                      | _active_ = filled blue                                                                                                                |
| `TB-TABLET`  | icon toggle                  | tablet                              | Tablet-width canvas frame                                     | _active_ = filled blue                                                                                                                |
| `TB-JSON`    | icon button                  | `</>`, tooltip `Edit JSON`          | Opens the Edit JSON modal                                     | —                                                                                                                                     |
| `TB-LANG`    | select                       | `EN` + chevron                      | Switches the language the canvas renders strings in           | scrollable list, same 12 languages as the Translation submenu                                                                         |
| `TB-THEME`   | icon button                  | moon / sun, tooltip `Toggle theme`  | Toggles the **rendered form's** light/dark theme only         | persisted at `localStorage.formbuilder-mui-theme`                                                                                     |

#### `TB-MENU-ITEMS` — Workspace main menu

Vertical menu, each item icon + label:

`Add a new form` · `Download` · `Upload` · `Translation ▸` · `Save` · `Save as...` · `Export forms` · `Import forms` · `Clear` · `Export JSON form schema` · `v10.2.0` _(disabled, informational)_

**`Translation ▸` submenu** — 12 rows, each `<CODE>` + native name; every non-English row carries a trailing "AI translate" glyph:

`EN English` _(highlighted/current)_ · `DE Deutsch` · `AR عربى` · `IT Italiano` · `FA فارسی` · `FR Français` · `HI हिन्दी` · `ES Español` · `JA 日本語` · `KO 한국어` · `SR Српски` · `ZH 中文`

### 4.3 Canvas

#### `CV-VIEWPORT`

- **Type:** Scrolling, bordered surface that renders the form with the real runtime renderer.
- **States:** _edit_ — components are inert (clicks select rather than activate) and hovering any component draws a **dashed blue outline**; _preview_ — components are fully interactive.

#### `CV-SELECTION` — Selection frame + action badge

- **Type:** Solid blue frame around the selected node plus a badge anchored top-right.
- **Badge copy:** `<component key> (<component type>)` — e.g. `Last name (MuiTextField)`.
- **Actions (icons, left→right), tooltips verbatim:**

| Icon | Tooltip                     | Behaviour                                                                           |
| ---- | --------------------------- | ----------------------------------------------------------------------------------- |
| `+`  | `Add new element`           | Opens a two-row flyout: `↑ Before` / `↓ After` — inserts a sibling at that position |
| ⧉    | `Clone component`           | Duplicates the node in place                                                        |
| ⚑    | `Create a preset component` | Opens the _Please enter a preset name_ modal                                        |
| 🗑    | `Remove component`          | Deletes the node                                                                    |

#### `CV-FORM` — The demo form's own content

Rendered content in order, with verbatim copy. All of it is data-driven from the form definition (§7), **not** hard-coded page content.

| #   | Key                                                          | Type                                             | Verbatim copy / config                                                                                                                                                                                                                                                                                         |
| --- | ------------------------------------------------------------ | ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `Header`                                                     | MuiTypography `h4`                               | `Complex Master Form`                                                                                                                                                                                                                                                                                          |
| 2   | `Email hint`                                                 | MuiTypography                                    | `Use a permanent address where you can receive mail.`                                                                                                                                                                                                                                                          |
| 3   | `Main container`                                             | MuiStack                                         | `spacing: 10px`; wrapper CSS `padding: 10px; border: 1px solid lightgray; border-radius: 6px;`                                                                                                                                                                                                                 |
| 4   | `First name`                                                 | MuiTextField                                     | label `First name`; required; validations `[required]`; `autoValidate: true`                                                                                                                                                                                                                                   |
| 5   | `Last name`                                                  | MuiTextField                                     | label `Last name`; required; validations `[required]`                                                                                                                                                                                                                                                          |
| 6   | `Email`                                                      | MuiTextField                                     | label `Email address`; validations `[email, required]`                                                                                                                                                                                                                                                         |
| 7   | `Country 1`                                                  | MuiSelect                                        | label `Country / Region`; items computed: `return form.state.countries`                                                                                                                                                                                                                                        |
| 8   | `Subheader`                                                  | MuiTypography `h5`                               | `Subheader inside the form`                                                                                                                                                                                                                                                                                    |
| 9   | `Email hint 2`                                               | MuiTypography                                    | `Use a permanent address where you can receive mail.`                                                                                                                                                                                                                                                          |
| 10  | `Street address`                                             | MuiTextField                                     | label `Street address`                                                                                                                                                                                                                                                                                         |
| 11  | `City` / `State` / `ZIP`                                     | MuiTextField ×3 in a MuiStack                    | labels `City`, `State / Province`, `ZIP / Postal`                                                                                                                                                                                                                                                              |
| 12  | `Country 2/3/4`                                              | MuiSelect ×3 in a MuiStack                       | label `Country / Region`; same computed items; `Country 2` has `onDidMount → loadCountries`                                                                                                                                                                                                                    |
| 13  | `Website`                                                    | MuiTextField                                     | label `Website`; placeholder `https://www.example.com`; validations `[url]`                                                                                                                                                                                                                                    |
| 14  | `About`                                                      | MuiTextField                                     | label `About`; `multiline: true`; `rows: 4`; placeholder `you@example.com` _(see §12)_                                                                                                                                                                                                                         |
| 15  | `About hint`                                                 | MuiTypography                                    | `Brief description for your profile. URLs are hyperlinked. ` _(trailing space in source)_                                                                                                                                                                                                                      |
| 16  | `Photo label`                                                | MuiTypography                                    | `Photo`                                                                                                                                                                                                                                                                                                        |
| 17  | `uploader1`                                                  | Uploader                                         | `action: http://localhost:3001/upload`; `dropzone: false`; child button `muiButton1` (MuiButton, `variant: contained`) labelled `Upload` — rendered uppercase as `UPLOAD` by MUI                                                                                                                               |
| 18  | `muiList1` → `repeater1` → `muiListItem1` → `muiTypography1` | MuiList / Repeater / MuiListItem / MuiTypography | Repeater value: `return form.data.uploader1?.map(item => item)`. Row text computed: `` return url ?? `${name ?? 'File name'} - ${error ?? status ?? 'status'}` ``; row `className` computed `form.data.status === 'error' ? 'error' : 'success'`. **Empty state:** placeholder row reads `File name - status`. |
| 19  | `Notifications header`                                       | MuiTypography                                    | `Notifications`                                                                                                                                                                                                                                                                                                |
| 20  | `Notifications hint`                                         | MuiTypography                                    | `Use a permanent address where you can receive mail.`                                                                                                                                                                                                                                                          |
| 21  | `Email header`                                               | MuiTypography (bold)                             | `By Email`                                                                                                                                                                                                                                                                                                     |
| 22  | `Comments checkbox`                                          | MuiFormControlLabel (`control: Checkbox`)        | label `Comments`; `checked: false`                                                                                                                                                                                                                                                                             |
| 23  | `Comments label`                                             | MuiTypography                                    | `Get notified when someones posts a comment on a posting.` _(typo in source)_                                                                                                                                                                                                                                  |
| 24  | `Candidates checkbox`                                        | MuiFormControlLabel                              | label `Candidates`; `checked: false`                                                                                                                                                                                                                                                                           |
| 25  | `Candidates label`                                           | MuiTypography                                    | `Get notified when a candidate applies for a job.`                                                                                                                                                                                                                                                             |
| 26  | `Offers checkbox`                                            | MuiFormControlLabel                              | label `Offers`; `checked: false`                                                                                                                                                                                                                                                                               |
| 27  | `Offers label`                                               | MuiTypography                                    | `Get notified when a candidate accepts or rejects an offer.`                                                                                                                                                                                                                                                   |
| 28  | `Push header`                                                | MuiTypography (bold)                             | `Push Notifications`                                                                                                                                                                                                                                                                                           |
| 29  | `Push hint`                                                  | MuiTypography                                    | `These are delivered via SMS to your mobile phone.`                                                                                                                                                                                                                                                            |
| 30  | `Push select`                                                | MuiRadioGroup                                    | `name: Push notifications`; renders MUI's default group label `Label`                                                                                                                                                                                                                                          |
| 31  | `Push everything` / `Push same as email` / `Push none`       | MuiRadioItem ×3                                  | values & labels `Everything`, `Same as email`, `No push notifications`                                                                                                                                                                                                                                         |
| 32  | `Save button`                                                | MuiButton                                        | `variant: contained`, `size: small`, text `Save` (rendered `SAVE`); `onClick: [validate (common), showValidationResult (code)]`                                                                                                                                                                                |
| 33  | `errorMessage`                                               | MuiTypography                                    | `Not all fields of the form are filled in correctly. Correct the values of the form fields and try again.`; `sx.color: red`; `renderWhen: false` (hidden until toggled by `showValidationResult`)                                                                                                              |
| 34  | `successMessage`                                             | MuiTypography                                    | `The form has been sent, thank you!`; `sx.color: green`; `renderWhen: false`                                                                                                                                                                                                                                   |

### 4.4 Right panel (properties)

#### `RP-TABS`

- **Type:** Icon+label tab bar: `Main`, `Style`, `Actions`, `Rules`.
- **Default:** restored from `localStorage.propertiesActiveTab`.
- **Accents (CSS vars):** `Main → var(--rs-navs-selected)` (blue), `Style → #f67f1f` (orange), `Actions → violet`, `Rules → var(--rs-green-600)` (green).
- **Empty state (nothing selected):** body shows only `Select element on form for edit properties`.

#### `RP-PROPROW` — Generic property row

Every property in `Main` and most in `Style` share one row anatomy:

`[✏️ calculable/localize toggle] [Label] [editor control] [✕ clear]`

- **✏️ tooltip:** `Make this property calculable or localize` → opens the bottom property panel.
- **✕:** clears the property back to unset; the row's label returns from accent colour to plain text.
- **Label colour = state indicator:** accent-coloured label ⇒ the property has an explicit value; plain grey/white ⇒ unset/default. Required properties are marked with a red `*` (e.g. `Key *`).

#### `RP-MAIN` — Main tab, `MuiTextField` (representative)

| Property                    | Control                      | Default     | Options / constraints                                                                                                 |
| --------------------------- | ---------------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------- |
| `Key *`                     | text + ✓ confirm             | `Last name` | **Required.** Unique component identifier.                                                                            |
| `Data key`                  | text                         | empty       | Overrides the data-object key                                                                                         |
| `Value`                     | text                         | empty       | Initial value                                                                                                         |
| `Type`                      | select                       | `Text`      | `Text, Number, Password, Date, Time, Datetime Local, Month, Week, Range, Color`                                       |
| `Multiline`                 | checkbox                     | unchecked   |                                                                                                                       |
| `Max rows`                  | number spinner               | empty       |                                                                                                                       |
| `Variant`                   | select, placeholder `Select` | unset       | `Standard, Outlined, Filled`                                                                                          |
| `Label`                     | text                         | `Last name` |                                                                                                                       |
| `Required`                  | checkbox                     | checked     |                                                                                                                       |
| `Disabled`                  | checkbox                     | unchecked   |                                                                                                                       |
| `Error`                     | checkbox                     | unchecked   |                                                                                                                       |
| `Helper text`               | text                         | empty       |                                                                                                                       |
| `Read only`                 | checkbox                     | unchecked   |                                                                                                                       |
| `Size`                      | select, placeholder `Select` | unset       | `Small, Medium`                                                                                                       |
| `Margin`                    | select, placeholder `Select` | unset       | `Dense, Normal, None`                                                                                                 |
| `Tooltip`                   | checkbox (section header)    | unchecked   | see below                                                                                                             |
| **`Additional properties`** | section header               |             |                                                                                                                       |
| `Render When`               | text/expression              | empty       | Conditional visibility                                                                                                |
| `HTML attributes`           | key/value table + `+` button | empty       | Columns `Name`, `Value`; **empty state** `No data found`; a `Loading...` string exists in the DOM for the async state |

**`Tooltip` sub-properties** (revealed only when the `Tooltip` checkbox is checked):
`Arrow`, `Disable Focus Listener`, `Disable Interactive`, `Disable Hover Listener`, `Disable Touch Listener`, `Follow Cursor`, `Enter Delay`, `Leave Delay`, `Placement` (select), `Title`.

#### `RP-MAIN` — Main tab, `MuiSelect` (to show the schema is per-type)

`Key`, `Data key`, `Value`, `Items`, `Variant`, `Size`, `Label`, `Required`, `Disabled`, `Error`, `Helper text`, `Read only`, `Tooltip`, `Additional properties → Render When`, `HTML attributes`.

> The Main tab is **fully schema-driven per component type**. A developer must not hard-code these rows; they come from the component's declared property metadata.

#### `RP-STYLE` — Style tab

| Group                  | Control                                                                                | Notes                                                                                        |
| ---------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| —                      | `For device` (select, right-aligned)                                                   | `Any` (default), `Desktop`, `Mobile`, `Tablet`. Scopes every value below to that breakpoint. |
| `Component`            | `Class Name` (text + ✕)                                                                |                                                                                              |
| `Wrapper`              | `Width`                                                                                | number spinner + unit select; demo value `100` `%`                                           |
| `Wrapper`              | `Height`                                                                               | number spinner + unit select                                                                 |
| `Wrapper`              | `Margin Top` / `Margin Right` / `Margin Bottom` / `Margin Left`                        | number spinner + unit select                                                                 |
| `Wrapper`              | `Color`, `Background Color`                                                            | colour swatch pickers (checkerboard = transparent/unset) + ✕                                 |
| `Styles for className` | section header with tooltip `CSS styles that are applied via the 'className' property` |                                                                                              |
| `Styles for className` | tabs `Component` \| `Wrapper`                                                          |                                                                                              |
| `Styles for className` | CSS code editor                                                                        | seeded with `element.style {` / `}`                                                          |

**Unit select options (all dimension fields):** `px`, `%`, `em`, `vw`, `vh`, `max-content`, `min-content`, `fit-content`, `auto`.

#### `RP-ACTIONS` — Actions tab

- **Type:** One section per lifecycle/DOM event supported by the selected component type, each with a full-width `+  Add an action` button.
- **Observed event sets:** `MuiTextField` → `onChange`, `onDidMount`, `onWillUnmount`. `MuiStack` → `onDidMount`, `onWillUnmount`. `MuiButton` (`Save button`) → `onClick` (+ mount hooks). **The set is type-dependent.**
- **`Add an action` menu:** two submenus.
  - `Common ▸` → `log`, `validate`, `clear`, `reset`, `addRow`, `removeRow`, `openModal`, `closeModal`
  - `Code ▸` → the project's code actions (`showValidationResult`, `loadCountries`) plus `+ Add a code action`

#### `RP-RULES` — Rules tab

- `Auto Validate` — checkbox with ✕ (checked for `First name`).
- `Add a validation rule` — full-width button. Menu: `Non empty`, `Length`, `Min`, `Max`, `Regex`, `Email`, `Url`, `Uuid`, `Ip`, `Datetime`, `Includes`, `Starts with`, `Ends with`, `Code`.
- **Rule card** — header = rule name (e.g. `Required`) + ✕ remove; body = property rows `Message` and `Validate when`, each with the ✏️ calculable toggle and ✕ clear.
- **Empty state:** for a non-input component (e.g. `MuiStack`) the Rules tab body is **completely empty** — no message. _(See §12.)_

### 4.5 Bottom property panel

#### `BP-PANEL`

- **Header:** `Edit property: <Key>.<Property>` (e.g. `Edit property: Last name.Label`), then the word `Use`, then a segmented control.
- **Segmented control:** `Calculable value` | `Localization` | `Simple value` (active item underlined in accent blue). Default `Simple value`.
- **Footer (always):** `Save` (primary) and `Close` (ghost).
- **Height:** 380 px default, persisted at `localStorage.formbuilder-mui-bottomPanelHeight`; resizable by dragging the panel's top edge **[ASSUMPTION — VERIFY]**.

| Tab                | Body                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Simple value`     | Single centred message: `Edit the property in the right panel`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `Calculable value` | **Left:** JS code editor (Monaco, line numbers, minimap) seeded with:<br>`/**`<br>` * @param {IFormData} form`<br>` * @return {string}`<br>` */`<br>`function Calculation (form) {`<br>`// enter your code here`<br>`}`<br>**Right:** pane titled `Test form data` containing an editable JSON object `{ "data": { … }, "errors": {} }` prefilled with the form's current data.<br>**Bottom bar:** `▶ Run` primary button (left of centre-right) and `Autorun` checkbox (far right, persisted at `localStorage.formbuilder-mui-testingAutorun`). |
| `Localization`     | Properties-file editor showing `<Key>_<property> = <value>` (e.g. `Last_name_label = Last name`). Footer gains a language select (`EN`) and a `Clear` button beside `Save` / `Close`. `Test form data` pane remains on the right.                                                                                                                                                                                                                                                                                                                |

### 4.6 Preview / testing mode (left panel replacement)

| ID            | Type                  | Copy                                                                                                               | Behaviour                                                                                                                      |
| ------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| `PV-DATA-HDR` | section heading       | `Data`                                                                                                             |                                                                                                                                |
| `PV-VALIDATE` | ghost button w/ icon  | `Validate`                                                                                                         | Runs all validations; paints failing fields and fills `Errors`                                                                 |
| `PV-RESET`    | ghost button          | `Reset to default`                                                                                                 | Restores declared default data                                                                                                 |
| `PV-CLEAR`    | ghost button          | `Clear`                                                                                                            | Empties the data object                                                                                                        |
| `PV-DATA`     | read-only JSON viewer | initial: `{ "repeater1": [], "Comments checkbox": false, "Candidates checkbox": false, "Offers checkbox": false }` | Updates live on every keystroke/selection in the canvas                                                                        |
| `PV-ERR-HDR`  | section heading       | `Errors`                                                                                                           |                                                                                                                                |
| `PV-ERRORS`   | read-only JSON viewer | `{}` when valid                                                                                                    | After a failed `Validate`: `{ "First name": "Required", "Last name": "Required", "Email": "Required", "Website": "Required" }` |

The right properties panel is emptied in this mode; the left tab bar is hidden.

### 4.7 Modals

#### `MD-JSON` — Edit JSON

- **Title:** `Edit JSON`; close `✕` top-right. Fills ~100 % of the viewport.
- **Body:** Monaco JSON editor, line numbers, syntax highlighting, code minimap, word-wrap on. Demo document is **803 lines**.
- **Footer:** none observed — edits appear to apply live/on close. **[ASSUMPTION — VERIFY]**

#### `MD-PRESET` — Create a preset component

- **Title:** `Please enter a preset name`; close `✕`.
- **Fields:** `Name` (text, placeholder `Enter a preset name`), `Category` (select, placeholder `Select`).
- **Category options:** `inputs`, `dataDisplay`, `feedback`, `layout`, `surfaces`, `navigation`, `form`, `templates`, `structure`, `modal` — i.e. the palette group ids.
- **Buttons:** `OK` (primary), `Cancel` (ghost).

#### `MD-NEWFORM` — Add a new form

- **Title:** `Please enter form name`; close `✕`.
- **Fields:** one unlabeled text input (autofocused, no placeholder).
- **Buttons:** `OK` (primary), `Cancel` (ghost).

---

## 5. Interactions & Behaviour

### Selection & editing loop

1. Click a component on the canvas **or** a row in the `Tree` tab → both views highlight it, and the right panel loads its schema on whichever of `Main/Style/Actions/Rules` was last active.
2. Change any property → the canvas re-renders **immediately** (no apply/commit step). Verified: setting `Style → Height = 10px` visibly shrank the field; clicking that row's `✕` restored it.
3. All edits push onto a single undo stack shared by canvas, tree, and property edits.

### Conditional / dependent UI

| Trigger                            | Dependent result                                                                            |
| ---------------------------------- | ------------------------------------------------------------------------------------------- |
| `Tooltip` checkbox → checked       | Reveals 10 tooltip sub-property rows                                                        |
| Viewport = Mobile or Tablet        | Reveals the `Orientation` toolbar button                                                    |
| Component type                     | Determines which `Main` rows, which `Actions` event groups, and whether `Rules` has content |
| ✏️ on a property row               | Opens/reroutes the bottom panel to that property                                            |
| Selection = none                   | Right panel shows its empty-state message                                                   |
| UI kit change (external top bar)   | Replaces palette, renderer, sample form, and resets form data                               |
| `renderWhen: false` on a component | Component is hidden at runtime (used by `errorMessage` / `successMessage`)                  |

### Event flows

- **Drag from palette → drop on canvas:** insert node → assign key → select → focus right panel.
- **Overlay `+` → `Before` / `After`:** insert sibling relative to the selected node.
- **`Save button` `onClick`:** `validate` (common) → `showValidationResult` (code). The code action finds `errorMessage` / `successMessage` by key, sets each one's `renderWhen` from `componentTree.hasErrors`, so exactly one message becomes visible.
- **Form mount:** `screen 1.onDidMount → loadCountries` (code) fetches a countries JSON and writes `form.state.countries`; all four `MuiSelect`s read it through the computed expression `return form.state.countries`.

### Navigation & post-action results

- **No route changes anywhere.** The app never navigates; no redirects, no history entries observed.
- `Preview` / `Edit` swaps mode in place and **preserves entered form data** across the toggle.
- `Download` / `Export forms` / `Export JSON form schema` produce file downloads **[INFERRED]**; `Upload` / `Import forms` open a file picker **[INFERRED]**.

### Client-side feedback

| Mechanism                                                          | Where                                                                                                                                                                                                                                                       |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Tooltips** (dark rounded, ~500 ms delay, below/right of trigger) | `Edit JSON`, `Desktop`, `Orientation`, `Toggle theme`, all four canvas-overlay icons, `Make this property calculable or localize`, `CSS styles that are applied via the 'className' property`. **Not** present on the ☰ menu, save, undo, or redo buttons. |
| **Flyout menus**                                                   | ☰ main menu (with `Translation ▸` submenu), `Add an action` (`Common ▸` / `Code ▸`), `Add a validation rule`, overlay `+` (`Before` / `After`)                                                                                                             |
| **Modals**                                                         | `Edit JSON`, `Please enter a preset name`, `Please enter form name`                                                                                                                                                                                         |
| **Inline messages**                                                | Field-level `Required` helper text; form-level red/green messages; `Not found`; `No data found`; `Select element on form for edit properties`; `Edit the property in the right panel`                                                                       |
| **Toasts / snackbars**                                             | **None observed.**                                                                                                                                                                                                                                          |
| **Loading spinners**                                               | None observed on the shell; the string `Loading...` exists in the HTML-attributes table markup.                                                                                                                                                             |

### Animations / transitions

- Modals fade + scale in/out (~300 ms) over a dimming backdrop.
- Panel collapse/expand animates width.
- The mode button carries a dedicated animation class (`_animatedButton_…`) for its blue→green transition.
- Hover highlight on canvas components is an instant dashed-outline swap.

### Keyboard

| Key                       | Effect                                                                                              | Confidence                |
| ------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------- |
| `Delete`                  | Removes the selected canvas component; selection moves to a sibling                                 | **Verified**              |
| `Ctrl+Z`                  | Undo                                                                                                | **Verified**              |
| `Ctrl+Y` / `Ctrl+Shift+Z` | Redo                                                                                                | **[ASSUMPTION — VERIFY]** |
| `Escape`                  | Closed the flyout menus and modals inconsistently in testing — some menus required an outside click | **[ASSUMPTION — VERIFY]** |
| `Tab`                     | Standard browser focus order; no custom roving-tabindex observed                                    | **[INFERRED]**            |

No shortcut cheatsheet or help affordance exists on the page.

---

## 6. Validation & Error Handling

### Builder-level (authoring UI)

| Field                                                 | Rule                                                       | Message                                 |
| ----------------------------------------------------- | ---------------------------------------------------------- | --------------------------------------- |
| Right panel `Key`                                     | Marked required with a red `*`; has a ✓ confirm affordance | **No error text observed** when cleared |
| `Please enter form name` → `OK` with empty input      | Submission is silently blocked; modal stays open           | **None — no message rendered.**         |
| `Please enter a preset name` → `OK` with empty `Name` | **[ASSUMPTION — VERIFY]** presumed same silent block       | —                                       |

> **Gap:** the authoring UI blocks invalid submits **without telling the user why**. A rebuild should add inline error copy (e.g. `Form name is required.`).

### Form-level (the form being authored, exercised in preview mode)

Validation is declarative per component: `schema.validations: [{key: "<rule>"}]` plus an optional per-rule `Message` and `Validate when`. When no custom `Message` is set, the runtime supplies the rule's default text.

| Field        | Rules                             | Message shown (verbatim)            |
| ------------ | --------------------------------- | ----------------------------------- |
| `First name` | `required` (`autoValidate: true`) | `Required`                          |
| `Last name`  | `required`                        | `Required`                          |
| `Email`      | `email`, `required`               | `Required` (empty case)             |
| `Website`    | `url`                             | `Required` (empty case — see below) |
| all others   | none                              | —                                   |

**Error presentation:** the field's outline, label, and helper text all turn red (`MuiErrorWrapper`, configured in Settings → `Error Type`); the message renders as helper text directly below the control. The `Errors` box in preview mode mirrors this as a flat `{ "<key>": "<message>" }` object.

> **Observed inconsistency:** `Website` declares only a `url` validation, yet an empty `Website` reports `Required`. Either the `url` rule rejects empty strings with a `Required` message, or the demo relies on an implicit non-empty check. **[ASSUMPTION — VERIFY]** with product before mirroring this behaviour.

**Submit-blocking:** `SAVE` is never disabled. Clicking it always runs `validate`, then `showValidationResult` reveals exactly one of:

> `Not all fields of the form are filled in correctly. Correct the values of the form fields and try again.` _(red)_

> `The form has been sent, thank you!` _(green)_

### Server / network failures

- **No error surface exists.** The `loadCountries` fetch and the `Uploader` POST to `http://localhost:3001/upload` have **no failure UI**: a failed country fetch leaves every `Country / Region` select silently empty, and a failed upload surfaces only through the repeater row's computed `${error ?? status ?? 'status'}` text.
- A rebuild must add explicit network-error states (see §8).

---

## 7. Data Model & Backend Requirements

### 7.1 Entities

#### `Project` (the workspace)

| Field            | Type                                        | Notes                                                   |
| ---------------- | ------------------------------------------- | ------------------------------------------------------- |
| `forms`          | `Form[]`                                    | Rendered by the Forms tab; demo has one                 |
| `activeFormName` | `string`                                    | `MuiForm`                                               |
| `uiKit`          | `"rsuite-inject-css" \| "mui" \| "mantine"` | Set by the excluded top bar; namespaces all persistence |

#### `Form` (the JSON document edited by `Edit JSON`)

Top-level shape, verbatim key names:

```jsonc
{
  "version": "1",
  "actions": { "<actionName>": { "body": "<js source>", "params": {} } },
  "tooltipType": "MuiTooltip",
  "modalType": "MuiDialog",
  "errorType": "MuiErrorWrapper",
  "form": {/* root ComponentNode, type "Screen" */},
  "languages": [
    {
      "code": "en",
      "dialect": "US",
      "name": "English",
      "description": "American English",
      "bidi": "ltr",
    },
  ],
  "defaultLanguage": "en-US",
}
```

#### `ComponentNode` (recursive)

| Field        | Type                                                                         | Notes                                                                            |
| ------------ | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `key`        | `string`                                                                     | **Required, unique.** Doubles as the data key unless `dataKey` overrides it      |
| `type`       | `string`                                                                     | Kit-scoped component id, e.g. `MuiTextField`, `MuiStack`, `Repeater`, `Uploader` |
| `props`      | `Record<string, PropValue>`                                                  | Per-type; see below                                                              |
| `schema`     | `{ type: "string" \| …, validations: Validation[], autoValidate?: boolean }` | Present on data-bound components                                                 |
| `events`     | `Record<EventName, ActionRef[]>`                                             | `onChange`, `onClick`, `onDidMount`, `onWillUnmount`                             |
| `children`   | `ComponentNode[]`                                                            | Containers only                                                                  |
| `css`        | `{ [device]: { string: "<css text>" } }`                                     | `device` ∈ `any \| desktop \| mobile \| tablet`                                  |
| `wrapperCss` | `{ [device]: { object: {…} } }`                                              | Style-tab wrapper values                                                         |
| `renderWhen` | `PropValue`                                                                  | Conditional visibility                                                           |

#### `PropValue` (discriminated by presence of `computeType`)

```jsonc
{ "value": "First name" }                                      // simple
{ "value": "…", "editorType": "string" }                       // simple, typed editor
{ "computeType": "function", "fnSource": "return form.state.countries" }  // calculable
```

#### `Validation`

`{ "key": "required" | "email" | "url" | "nonEmpty" | "length" | "min" | "max" | "regex" | "uuid" | "ip" | "datetime" | "includes" | "startsWith" | "endsWith" | "code", "message"?: string, "validateWhen"?: PropValue }`

#### `CodeAction`

`{ name: string, body: string /* JS */, params: object }` — referenced from events as `{ "name": "loadCountries", "type": "code" }`. Common actions are referenced as `{ "name": "validate", "type": "common" }`.

#### `Preset`

`{ name: string, category: "inputs" | "dataDisplay" | "feedback" | "layout" | "surfaces" | "navigation" | "form" | "templates" | "structure" | "modal", node: ComponentNode }`

#### `Language`

`{ code, dialect, name, description, bidi }` + a translation bundle of `<Key>_<property> = <text>` pairs.

#### `FormData` (runtime, shown in preview)

Keyed by component `key`: `{ "First name": "", "Comments checkbox": false, "repeater1": [], … }`, with a sibling `errors: Record<key, message>`.

### 7.2 Static vs. dynamic

| Element                                                                      | Source                                                                                                                                                                          |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Panel tab labels, toolbar, menus, modal copy                                 | **Static** application chrome                                                                                                                                                   |
| Component palette + groups                                                   | **Dynamic** — supplied by the active UI-kit registry                                                                                                                            |
| Tree, canvas, right-panel property rows, Actions event groups, Rules content | **Dynamic** — derived from the `Form` document + per-type component metadata                                                                                                    |
| Forms list                                                                   | **Dynamic** — the project's form collection                                                                                                                                     |
| `Country / Region` options                                                   | **Dynamic at runtime** — `fetch('https://gist.githubusercontent.com/rogargon/5534902/raw/434445021e155240ca78e378f10f70391dd594ea/countries.json')`, mapped to `{value, label}` |
| Uploaded file list                                                           | **Dynamic at runtime** — `Repeater` over `form.data.uploader1`                                                                                                                  |
| Translation language list                                                    | **Dynamic** — the `languages` array                                                                                                                                             |

### 7.3 Persistence — the demo is client-only

There is **no application backend**. All editor state lives in `localStorage`, namespaced by UI kit:

| Key                                 | Observed value     | Purpose              |
| ----------------------------------- | ------------------ | -------------------- |
| `formbuilder-view-name`             | `mui`              | Active UI kit        |
| `formbuilder-mui-formName`          | `MuiForm`          | Active form          |
| `formbuilder-mui-theme`             | `dark`             | Canvas theme         |
| `formbuilder-mui-resolution`        | `desktop`          | Viewport simulator   |
| `formbuilder-mui-openedPanels`      | `["left","right"]` | Panel collapse state |
| `formbuilder-mui-bottomPanelHeight` | `380`              | Bottom panel height  |
| `formbuilder-mui-testingAutorun`    | `false`            | Autorun checkbox     |
| `leftPanelActiveTab`                | `forms`            | Left tab             |
| `propertiesActiveTab`               | `actions`          | Right tab            |

Third-party analytics keys were also present (`_gcl_ls`, `li_adsId`) — Google/LinkedIn tags, unrelated to the editor.

### 7.4 API endpoints a production rebuild would need

None of these exist in the demo; all are **inferred from the UI's affordances**.

| Method + path                                      | Purpose                     | Driven by                        |
| -------------------------------------------------- | --------------------------- | -------------------------------- |
| `GET /api/forms`                                   | List forms in the project   | Forms tab                        |
| `POST /api/forms`                                  | Create a form               | `Add a new form`                 |
| `GET /api/forms/{id}`                              | Load a form definition      | Form selection                   |
| `PUT /api/forms/{id}`                              | Save a form definition      | `Save`, toolbar 💾               |
| `POST /api/forms/{id}/copy`                        | Save under a new name       | `Save as...`                     |
| `PATCH /api/forms/{id}`                            | Rename                      | Forms-tab ✏️                     |
| `DELETE /api/forms/{id}`                           | Delete                      | Forms-tab ✕                      |
| `GET /api/forms/export` · `POST /api/forms/import` | Bundle export/import        | `Export forms` / `Import forms`  |
| `GET /api/forms/{id}/schema`                       | JSON Schema derivation      | `Export JSON form schema`        |
| `GET /api/presets` · `POST /api/presets`           | Preset library CRUD         | `Create a preset component`      |
| `POST /api/i18n/{formId}/{lang}/translate`         | Machine translation         | AI glyph on `Translation ▸` rows |
| `PUT /api/i18n/{formId}/{lang}`                    | Save a translation bundle   | Localization tab `Save`          |
| `GET /api/components?kit={kit}`                    | Palette + property metadata | Palette, Main tab                |
| `POST /upload` _(configurable per Uploader)_       | File upload target          | `uploader1.action`               |
| `GET {options-url}` _(author-supplied)_            | Select option sources       | `loadCountries` pattern          |

### 7.5 CRUD / admin needs

| Data-driven content       | Who manages it                              | Fields                                                                                |
| ------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------- |
| Component palette         | Product/engineering, per UI kit             | id, type, display name, group, icon, property schema, supported events, default props |
| Presets                   | End users (via `Create a preset component`) | name, category, serialized node                                                       |
| Code actions              | End users (Settings → `Add a code action`)  | name, JS body, params                                                                 |
| Validation rule catalogue | Product/engineering                         | key, label, parameters, default message                                               |
| Languages                 | Product (list) + end users (bundles)        | code, dialect, name, description, bidi                                                |
| Forms                     | End users                                   | name, definition JSON                                                                 |

### 7.6 Auth, roles, permissions

**None.** No sign-in, no user identity, no role checks, and no permission-gated controls anywhere on the page. A production deployment would need at minimum: authenticated sessions; per-project membership; and a distinction between _authors_ (full editor) and _viewers/translators_ (localization tab + preview only) — because the `Code` editors execute arbitrary JavaScript and are a privilege boundary.

---

## 8. Content States

| State                               | Behaviour on this page                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Loading**                         | **Not applicable / not implemented.** The shell renders synchronously with the demo form already present; no skeletons or spinners were observed on first paint or on tab switches. The only loading string in the DOM is `Loading...` in the HTML-attributes table. The `loadCountries` fetch has **no** loading indicator — selects simply have no options until it resolves.                                                                                    |
| **Empty / no data**                 | Several, all verbatim: palette search with no match → `Not found`. Right panel with no selection → `Select element on form for edit properties`. `HTML attributes` table → `No data found`. `Simple value` bottom-panel tab → `Edit the property in the right panel`. Preview `Errors` box when valid → `{}`. Repeater with no uploads → the placeholder row `File name - status`. `Rules` tab for a non-input component → **completely blank, no message** (gap). |
| **Error**                           | Form-level: the red `Not all fields of the form are filled in correctly…` message plus per-field red outlines and `Required` helper text. **Application/network errors have no UI at all** — a failed country fetch or a failed upload fails silently.                                                                                                                                                                                                             |
| **Success / confirmation**          | Form-level: green `The form has been sent, thank you!`. **No confirmation for builder actions** — `Save`, `Clear`, `Download`, `Import forms`, delete-a-form and delete-a-component all complete with no toast and **no destructive-action confirmation dialog**.                                                                                                                                                                                                  |
| **Partial / permission-restricted** | **Not applicable.** No auth, no roles, no gated content.                                                                                                                                                                                                                                                                                                                                                                                                           |

---

## 9. Accessibility (a11y)

### Observed structure (measured on the live DOM)

| Check                                      | Result                                                                                                  |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| `<html lang>`                              | `en` ✅                                                                                                 |
| `role="tablist"` wrappers                  | **0** ❌ (tab buttons carry `role="tab"` but have no owning tablist)                                    |
| `aria-selected`                            | Present (`true`) on the selected tab only; **absent (null) on unselected tabs** ❌                      |
| `h1` / `h2` / `h3`                         | **0 / 0 / 0** ❌ — the only heading in the document is the single `h4` **inside the form being edited** |
| `<main>` / `<header>` landmarks            | **0 / 0** ❌                                                                                            |
| `<nav>`                                    | 1 ✅                                                                                                    |
| Buttons with neither text nor `aria-label` | **30** ❌                                                                                               |
| Accessible names for tab buttons           | Missing in the accessibility tree despite visible text ❌                                               |
| Focus indicators                           | Present on text inputs and selects (blue ring); **not observed** on icon buttons                        |

### Requirements for a rebuild

**Semantics & landmarks**

- Wrap the shell in `<header>` (toolbar), `<nav aria-label="Component palette">`, `<main aria-label="Form canvas">`, and `<aside aria-label="Component properties">`.
- Give the page a visually-hidden `<h1>` (e.g. the active form name) and use `h2` for each panel section (`Inputs`, `Actions`, `Wrapper`, `Additional properties`, `Data`, `Errors`).

**Tabs**

- Wrap each tab group in `role="tablist"` with `aria-label`; set `aria-selected` explicitly to `true`/`false` on **every** tab; link each tab to its panel via `aria-controls` / `role="tabpanel"` / `aria-labelledby`.
- Implement the roving-tabindex pattern: `←`/`→` moves between tabs, `Home`/`End` jump to first/last.

**Names for icon-only controls**
Every one of the 30 unnamed buttons needs an `aria-label`. Reuse the existing tooltip copy where it exists (`Edit JSON`, `Desktop`, `Orientation`, `Toggle theme`, `Add new element`, `Clone component`, `Create a preset component`, `Remove component`, `Make this property calculable or localize`) and author copy for the rest (`Open workspace menu`, `Save form`, `Undo`, `Redo`, `Mobile viewport`, `Tablet viewport`, `Clear property value`, `Collapse left panel`, `Collapse properties panel`, `Rename form`, `Delete form`, `Edit code action`, `Duplicate code action`, `Delete code action`, `Add HTML attribute`).

**Keyboard**

- Every drag-and-drop insertion must have a keyboard equivalent — the overlay `+ → Before / After` flyout provides one; expose it in the palette too (e.g. `Enter` on a palette chip inserts after the current selection).
- Tree: `↑`/`↓` move, `←`/`→` collapse/expand, `Enter` select, `Delete` remove; expose as `role="tree"` / `role="treeitem"` with `aria-expanded` and `aria-level`.
- Focus order: toolbar → left panel → canvas → right panel → bottom panel. Trap focus inside modals and the bottom panel; return focus to the ✏️ trigger when the bottom panel closes.
- Announce mode changes (`Preview` ⇄ `Edit`) and selection changes via an `aria-live="polite"` region.

**Colour & non-colour indicators**

- The property-row "has a value" state is communicated **by label colour alone** — add a non-colour cue (e.g. a filled dot, a bold weight, or "modified" text).
- Validation state on a field is red outline + red text + the word `Required` — the text carries the meaning, so this passes, but wire `aria-invalid="true"` and `aria-describedby` to the helper text.
- Measured contrast ratios (computed from the sampled hex values):

| Foreground                                  | Background      | Ratio       | WCAG AA (normal text, 4.5:1)                                     |
| ------------------------------------------- | --------------- | ----------- | ---------------------------------------------------------------- |
| Text `#E9EBF0`                              | Panel `#303336` | **10.65:1** | ✅                                                               |
| Link/nav `#34C3FF`                          | Panel `#303336` | **6.29:1**  | ✅                                                               |
| Muted `#A4A9B3`                             | Panel `#303336` | **5.39:1**  | ✅ (fails AAA)                                                   |
| Violet accent `#EE82EE`                     | Panel `#303336` | **5.48:1**  | ✅                                                               |
| Orange accent `#F67F1F`                     | Panel `#303336` | **4.83:1**  | ✅                                                               |
| Green accent `#3FAB45`                      | Panel `#303336` | **4.31:1**  | ❌ (passes 3:1 for large text / UI only)                         |
| Primary `#169DE0`                           | Panel `#303336` | **4.20:1**  | ❌ (passes 3:1 for UI components)                                |
| **White label on primary button `#169DE0`** | —               | **3.03:1**  | ❌ **Fails** — the `Preview` button's 14 px label is below 4.5:1 |

- **Action:** darken the primary fill (≈`#0B6FA4` reaches 4.5:1 with white) or increase the button label to 18.66 px bold. The green Rules/Components accent should not be used for small text on the panel background.
- The **disabled** undo/redo glyphs and the dimmed `v10.2.0` menu row are well below 3:1 and need a non-colour disabled cue (`aria-disabled` plus a shape/opacity change that is not the sole indicator).

---

## 10. Visual Design & Theme Tokens

The builder chrome is **RSuite** (dark theme, customised); the canvas renders in whichever kit is selected — here **Material UI** with MUI's own dark palette. The two theme systems are independent: `Toggle theme` flips only the canvas.

### Colour — builder chrome (dark, as shipped)

| Role                                                                  | Value                             |
| --------------------------------------------------------------------- | --------------------------------- |
| Excluded top bar surface                                              | `#2B2B2B`                         |
| App shell background                                                  | `#2B2B2B`                         |
| Panel + workspace surface                                             | `#303336`                         |
| Elevated card / popover surface (`--rs-bg-card`)                      | `#1A1D24`                         |
| Well / inset surface (`--rs-bg-well`)                                 | `#0F131A`                         |
| Overlay / menu surface (`--rs-bg-overlay`)                            | `#292D33`                         |
| Border (`--rs-border-primary`)                                        | `#3C3F43`                         |
| Text primary (`--rs-text-primary`)                                    | `#E9EBF0`                         |
| Text secondary / inactive icons (`--rs-text-secondary`)               | `#A4A9B3`                         |
| Primary action / active toggle                                        | `#169DE0`                         |
| Link + selected-nav accent (`--rs-primary-500`, `--rs-navs-selected`) | `#34C3FF`                         |
| Success / Rules + Components accent (`--rs-green-600`)                | `#3FAB45`                         |
| Warning / Style + Forms accent                                        | `#F67F1F`                         |
| Settings + Actions accent                                             | `violet` (CSS keyword, `#EE82EE`) |
| Danger / error (`--rs-red-500`)                                       | `#F44336`                         |

### Colour — canvas (Material UI dark)

| Role                   | Value                                       |
| ---------------------- | ------------------------------------------- |
| Paper / form surface   | `#121212`                                   |
| Body text              | `#FFFFFF`                                   |
| Field border (default) | MUI `rgba(255,255,255,0.23)` **[INFERRED]** |
| Error text + outline   | MUI `error.main` (red)                      |
| Form error message     | `sx.color: "red"` (CSS keyword)             |
| Form success message   | `sx.color: "green"` (CSS keyword)           |
| Demo container border  | `1px solid lightgray`                       |

### Typography

| Context                                                   | Family                                                                                                      | Size / weight / line-height                   |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| Builder chrome                                            | `Apple-System, Arial, Helvetica, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", STXihei, sans-serif` | base **14 px / 400 / 20 px**                  |
| Panel tab labels                                          | same                                                                                                        | 14 px / 400                                   |
| Section headings (`Inputs`, `Actions`, `Wrapper`, `Data`) | same                                                                                                        | ~14 px, bold, secondary colour                |
| `Documentation` link _(excluded bar)_                     | same                                                                                                        | 16 px / 600 / 24 px                           |
| Code editors                                              | monospace (Monaco default)                                                                                  | ~13 px                                        |
| Canvas                                                    | `Roboto, Helvetica, Arial, sans-serif` (MUI)                                                                | body 16 px; `h4` **34 px / 400**; `h5` ~24 px |

### Spacing, radius, elevation, density

- **Density:** compact. Property-row pitch **34 px** (label cell 24 px tall + ~10 px gap); palette chips ~30 px; tab bar 58 px.
- **Grid:** 4/5 px base; palette chips laid out in a 2-column grid with ~8 px gutters; property rows use a two-column `label | control` grid with the **label column ≈108 px** (measured) and the control column filling the rest of the 290 px panel.
- **Radius:** ~6 px on buttons, chips, inputs, cards, and modals. The demo form's container uses `border-radius: 6px`.
- **Borders:** 1 px, `#3C3F43`.
- **Shadows:** subtle drop shadows on popovers/menus and modals only; panels are flat and separated by borders, not elevation.
- **Focus:** 1–2 px accent-blue ring on inputs/selects.

### Iconography

Monoline outline icons at 16–18 px, single-colour, inheriting `currentColor` — consistent with **RSuite Icons / react-icons**. The canvas overlay and tree use the same family. No filled/duotone icons anywhere.

### Reusable tokens a developer should centralize

```css
/* surfaces */
--fb-bg-app: #2b2b2b;
--fb-bg-panel: #303336;
--fb-bg-card: #1a1d24;
--fb-bg-well: #0f131a;
--fb-bg-overlay: #292d33;
--fb-border: #3c3f43;

/* text */
--fb-text: #e9ebf0;
--fb-text-muted: #a4a9b3;

/* accents */
--fb-primary: #169de0; /* filled actions, active toggles */
--fb-link: #34c3ff; /* links, selected nav, Main tab */
--fb-accent-green: #3fab45; /* Components tab, Rules tab */
--fb-accent-orange: #f67f1f; /* Forms tab, Style tab */
--fb-accent-violet: #ee82ee; /* Settings tab, Actions tab */
--fb-danger: #f44336;

/* geometry */
--fb-radius: 6px;
--fb-border-width: 1px;
--fb-panel-width: 290px;
--fb-topbar-height: 58px;
--fb-bottom-panel-height: 380px;
--fb-row-height: 34px;

/* type */
--fb-font:
  Apple-System, Arial, Helvetica, 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', STXihei,
  sans-serif;
--fb-font-size: 14px;
--fb-line-height: 20px;
```

---

## 11. Non-Functional Notes

### Performance

- **Every keystroke in a property field re-renders the canvas.** With an 803-line / ~34-node demo form this is smooth, but the property→render path must be memoised per node; debounce text inputs (~150–250 ms) before committing to the document.
- **Three Monaco editor instances** can be live at once (Edit JSON modal, bottom-panel code editor, Test-form-data editor). Monaco is heavy — code-split it and lazy-load on first use rather than at boot.
- **The Edit JSON editor is virtualised** (only ~40 lines are in the DOM at a time), which is the right call and must be preserved for large documents.
- **The palette is not virtualised.** With ~26 items (MUI) that is fine; the Mantine kit already has ~60 and other kits will grow — virtualise or lazily render collapsed groups.
- **The tree is not virtualised** and renders every node; forms with hundreds of components will need windowing plus lazy expansion.
- **No pagination anywhere** — the forms list, presets, and translation bundles will all need it at scale.
- **Undo stack is unbounded** as far as could be observed; cap it (e.g. 100 entries) or store diffs rather than snapshots of the whole document.
- The canvas re-mounts on UI-kit switch (~1–2 s observed); show a loading state during that swap.

### Internationalization / localization

- The **authored form** is fully localizable: a `languages[]` array on the document, a per-property Localization editor producing `<Key>_<property> = <value>` pairs, a `defaultLanguage` (`en-US`), an `EN` toolbar selector that re-renders the canvas in the chosen language, and machine translation offered per language.
- **RTL is modelled** — each language carries `bidi` (`ltr` for English), and Arabic and Farsi are offered, so the renderer must honour `dir="rtl"`.
- **The builder chrome itself appears to be English-only.** No UI-language switch exists for panel labels, menus, or messages; all chrome copy is hard-coded English. If chrome localization is in scope, every string quoted in §4 needs extraction.
- Layout must tolerate string growth: German and the CJK/Arabic scripts will stress the ~110 px property-label column and the 2-up palette grid.
- Number/date formatting for `Type: Number / Date / Time / Datetime Local / Month / Week` fields must be locale-aware.

### Privacy, legal, compliance

- **No legal copy of any kind appears on the page** — no cookie banner, no consent prompt, no terms/privacy links, no imprint. (`Documentation` in the excluded top bar is the only outbound link.)
- Nonetheless the page **sets third-party marketing/analytics storage**: `_gcl_ls` (Google) and `li_adsId` (LinkedIn) were found in `localStorage`. For EU/UK visitors this is a **consent gap** — non-essential storage is written before any consent is obtained. A rebuild needs a consent gate.
- All form content the visitor types stays client-side; nothing is transmitted to a first-party server. That should be stated to users, since the sample form asks for name, email, postal address and a photo.
- The `Uploader` targets `http://localhost:3001/upload` over **plain HTTP** — fine as an unreachable demo default, but the default must never ship as a production template.
- **Security:** the Code-action, Form-validator, Calculable-value and Edit-JSON editors all execute author-supplied JavaScript in the page. In a multi-user product this is remote code execution by design and must be sandboxed (worker/iframe with a restricted global) and permission-gated.

---

## 12. Open Questions & Assumptions

### Must confirm with product/design before building

1. **Is the builder chrome desktop-only?** No responsive behaviour was observed for the shell. Confirm the minimum supported width and whether a tablet/mobile authoring experience is required.
2. **What does the 💾 toolbar button do vs. the menu's `Save`?** Are they the same action? Neither shows a confirmation, so the difference is invisible.
3. **`Website` reports `Required` but only declares a `url` validation.** Is that the intended semantics of the `url` rule, or a demo bug?
4. **Empty-name submission is silently blocked** in `Please enter form name` (and presumably `Please enter a preset name`). What error copy should be shown?
5. **No confirmation on destructive actions** — `Clear`, `Remove component`, delete-a-form. Which of these need a confirm step, and what copy?
6. **`Edit JSON` has no Apply/Cancel.** Do edits commit live, on close, or on blur? What happens on invalid JSON?
7. **The `Rules` tab is blank (no message) for non-input components.** Should it show an explanatory empty state?
8. **Undo scope and depth.** Does the stack survive a form switch? A UI-kit switch? A reload? What is the maximum depth?
9. **Persistence model for production.** The demo is `localStorage`-only. Confirm the server model, the concurrency/locking story, and whether autosave replaces the explicit `Save`.
10. **Auth and roles.** Confirm the intended roles — at minimum author vs. translator vs. viewer — given that the code editors are an RCE surface.
11. **Consent/analytics.** Confirm whether the Google/LinkedIn tags ship in the product build and, if so, what consent gate is required.
12. **AI translation.** Which provider backs the AI glyph on the `Translation ▸` rows, what is its cost/rate limit, and what is the failure UX?

### Assumptions carried in this spec

- **[ASSUMPTION — VERIFY]** Undo redo shortcut is `Ctrl+Y` / `Ctrl+Shift+Z` (only `Ctrl+Z` was verified).
- **[ASSUMPTION — VERIFY]** The bottom panel is resizable by dragging its top edge (inferred from the persisted `bottomPanelHeight` value of `380`).
- **[ASSUMPTION — VERIFY]** Tree rows support drag-to-reorder; this was not exercised.
- **[ASSUMPTION — VERIFY]** `Download` / `Export forms` / `Export JSON form schema` trigger file downloads and `Upload` / `Import forms` open a file picker; none were executed.
- **[ASSUMPTION — VERIFY]** `Escape` closes all overlays. Behaviour was inconsistent in testing — some flyouts needed an outside click.
- **[ASSUMPTION — VERIFY]** The three unlabeled toolbar icons (☰, 💾, ↺, ↻) mean menu / save / undo / redo. They carry **no tooltips**; the reading is from glyph shape, disabled-state behaviour, and the verified `Ctrl+Z` equivalence.
- **[INFERRED]** All API endpoints in §7.4. The demo has no backend; the list is derived purely from the UI's affordances.
- **[INFERRED]** Palette contents are supplied by a per-kit registry rather than hard-coded — evidenced by the completely different Mantine palette.

### Explicitly out of scope / not part of the page

- The site top bar (logo, UI-kit `<select>`, `Copy form's JSON`, `Paste`, `Documentation`) — excluded by instruction. Note that the UI-kit `<select>` there is nonetheless the single biggest determinant of everything the workspace renders.
- **A red rounded badge containing three dots appears inside whichever text field has focus.** It is **not part of the page** — it is a **LastPass browser-extension icon** (`data-lastpass-icon-root`), confirmed by DOM inspection. Do not implement it.
